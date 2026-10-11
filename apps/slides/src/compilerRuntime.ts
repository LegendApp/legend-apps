import { observable } from "@legendapp/state";
import { spawn } from "@legendapp/spark/processes";
import { exists, getDirectory, mkdir, move, remove } from "@legendapp/spark/files";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { findRuntime, installPinnedBun, probeRuntime, runtimeArch, type BunArch, type BunInstallProgress, type CompilerRuntime, type RuntimeHost } from "./compilerRuntimeCore";
import { getCompilerRuntimePathSetting, setCompilerRuntimePathSetting } from "./slidesSettings";

export type CompilerRuntimeStatus = "unknown" | "checking" | "ready" | "missing" | "downloading" | "error";
export const compilerRuntime$ = observable({
  status: "unknown" as CompilerRuntimeStatus,
  runtime: null as CompilerRuntime | null,
  arch: null as BunArch | null,
  progress: null as BunInstallProgress | null,
  error: "",
  /** Deck to reload once a runtime becomes available. */
  retryDeck: null as string | null,
});

export class CompilerRuntimeMissingError extends Error {
  constructor() { super("Legend Slides needs Bun or Node 22+ to open decks. Download Bun or choose your own runtime in Settings › Compiler."); }
}

let hostPromise: Promise<RuntimeHost> | undefined;
function runtimeHost() {
  return hostPromise ??= (async () => {
    // Application Support/<app>; the user's home is the part before /Library/.
    const data = await getDirectory("data");
    const home = data.slice(0, data.indexOf("/Library/"));
    return {
      home,
      dataDirectory: data,
      exists,
      mkdir: path => mkdir(path, { recursive: true }),
      move: (from, to) => move(from, to),
      remove: path => remove(path, { recursive: true }),
      async run(executable, args, options = {}) {
        const handle = await spawn({ target: { type: "executable", path: executable }, args, timeoutMs: options.timeoutMs ?? 30_000,
          onOutput: options.onStderr ? output => { if (output.stream === "stderr") options.onStderr!(decodeProcessText(output.bytes)); } : undefined });
        const result = await handle.exited;
        return { code: result.exit.type === "exited" ? result.exit.code : -1, stdout: decodeProcessText(result.stdout), stderr: decodeProcessText(result.stderr), timedOut: result.timedOut };
      },
    } satisfies RuntimeHost;
  })();
}

let checkSequence = 0;
let resolving: Promise<CompilerRuntime | null> | undefined;
/** Find a runtime once per launch; `refresh` re-runs discovery (Settings, after install). */
export function resolveCompilerRuntime(options: { refresh?: boolean } = {}): Promise<CompilerRuntime | null> {
  if (compilerRuntime$.status.peek() === "downloading") return downloading!;
  if (options.refresh) resolving = undefined;
  return resolving ??= (async () => {
    const sequence = ++checkSequence;
    compilerRuntime$.assign({ status: "checking", error: "" });
    const host = await runtimeHost();
    const [runtime, arch] = await Promise.all([
      findRuntime(host, { customPath: getCompilerRuntimePathSetting() || undefined }).catch(() => null),
      runtimeArch(host).catch(() => null),
    ]);
    if (sequence === checkSequence) compilerRuntime$.assign({ status: runtime ? "ready" : "missing", runtime, arch });
    return sequence === checkSequence ? runtime : resolveCompilerRuntime();
  })();
}

export function compilerRuntimeGeneration() { return checkSequence; }

/** Only the discovery used by a failed command can be invalidated. */
export function invalidateCompilerRuntime(generation: number) {
  if (generation === checkSequence && compilerRuntime$.status.peek() !== "downloading") {
    compilerRuntime$.assign({ status: "missing", runtime: null });
    resolving = undefined;
    ++checkSequence;
  }
}

let downloading: Promise<CompilerRuntime | null> | undefined;
/** Install the pinned Bun with progress. Concurrent callers share one download. */
export function downloadCompilerRuntime(options: { force?: boolean } = {}) {
  if (downloading) return downloading;
  return resolving = downloading = (async () => {
    ++checkSequence; // Discovery started before this install cannot publish its result.
    compilerRuntime$.assign({ status: "downloading", progress: null, error: "" });
    try {
      await installPinnedBun(await runtimeHost(), { force: options.force, onProgress: progress => compilerRuntime$.progress.set(progress) });
      compilerRuntime$.status.set("checking");
      return await resolveCompilerRuntime({ refresh: true });
    } catch (error) {
      compilerRuntime$.assign({ status: "error", error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally { downloading = undefined; }
  })();
}

/** Use an explicit bun or node executable, or pass null to go back to automatic discovery. */
export async function setCustomCompilerRuntime(path: string | null) {
  if (path) {
    const runtime = await probeRuntime(await runtimeHost(), { path, source: "custom" });
    if (!runtime) throw new Error("That file isn't Bun 1.3+ or Node 22+.");
  }
  setCompilerRuntimePathSetting(path ?? "");
  return resolveCompilerRuntime({ refresh: true });
}

/** All runtime changes use this operation so a pending deck is retried exactly once. */
export async function changeCompilerRuntime(operation: () => Promise<CompilerRuntime | null | void>) {
  await operation();
  const { loadDeck } = await import("./deckLoader");
  const path = compilerRuntime$.retryDeck.peek();
  if (!path || compilerRuntime$.status.peek() !== "ready") return;
  compilerRuntime$.retryDeck.set(null);
  await loadDeck(path);
}

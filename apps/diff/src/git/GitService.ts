import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCommand, type ProcessExit, type ProcessOptions, type ProcessResult } from "@legendapp/spark/processes";
import { parseGitStatus } from "./gitStatus";

export type GitRunner = (options: ProcessOptions) => Promise<ProcessResult>;
export type GitReadOptions = { signal?: AbortSignal };
export type GitOperationLog = {
  command: string;
  args: readonly string[];
  startedAt: number;
  endedAt: number | null;
  exit: ProcessExit | null;
  stderrTail: string;
};
export type GitRepoState = {
  gitDir: string;
  branch: string | null;
  detachedCommit: string | null;
  detached: boolean;
  merging: boolean;
  rebasing: "apply" | "merge" | null;
  cherryPicking: boolean;
  reverting: boolean;
  bisecting: boolean;
};
export type GitErrorCode = "base-drift" | "aborted" | "index-locked" | "command-failed" | "timed-out" | "output-truncated";

export class GitServiceError extends Error {
  constructor(readonly code: GitErrorCode, message: string, readonly args: readonly string[] = []) {
    super(message);
    this.name = "GitServiceError";
  }
}

export class GitIndexLockedError extends GitServiceError {
  constructor(readonly lockPath: string) {
    super("index-locked", `Git index is locked at ${lockPath}. Wait for the other Git operation to finish, then retry.`);
    this.name = "GitIndexLockedError";
  }
}

const discoveryQueues = new Map<string, Promise<void>>();
const repoQueues = new Map<string, Promise<void>>();
const services = new Map<string, GitService>();
const stateProbe = `cat "$1/HEAD" || exit
printf '\\0'
for name in index.lock MERGE_HEAD rebase-apply rebase-merge CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
  if test -e "$1/$name"; then printf '%s\\0' "$name"; fi
done`;

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new GitServiceError("aborted", "Git operation was cancelled.");
}

function serialize<T>(queues: Map<string, Promise<void>>, key: string, operation: () => Promise<T>) {
  const pending = (queues.get(key) ?? Promise.resolve()).then(operation);
  const tail = pending.then(() => {}, () => {});
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return pending;
}

export function getGitService(repoRoot: string) {
  const root = repoRoot.replace(/\/+$/, "") || "/";
  let service = services.get(root);
  if (!service) {
    service = new GitService(root);
    services.set(root, service);
  }
  return service;
}

export class GitService {
  private gitDir: string | undefined;
  private readonly operations: GitOperationLog[] = [];
  readonly repoRoot: string;

  constructor(repoRoot: string, private readonly runner: GitRunner = runCommand) {
    this.repoRoot = repoRoot.replace(/\/+$/, "") || "/";
  }

  getOperationLog(): readonly GitOperationLog[] {
    return this.operations.map((entry) => ({ ...entry, args: [...entry.args] }));
  }

  private enqueue<T>(options: GitReadOptions, operation: (gitDir: string) => Promise<T>): Promise<T> {
    const { signal } = options;
    const pending = serialize(discoveryQueues, this.repoRoot, async () => {
      checkAborted(signal);
      const gitDir = this.gitDir ??= (await this.git(["rev-parse", "--absolute-git-dir"], options)).replace(/\n$/, "");
      return serialize(repoQueues, gitDir, () => {
        checkAborted(signal);
        return operation(gitDir);
      });
    });
    if (!signal) return pending;
    let onAbort: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new GitServiceError("aborted", "Git operation was cancelled."));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return Promise.race([pending, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
  }

  private async process(command: string, args: readonly string[], options: GitReadOptions, timeoutMs = 60_000, input?: string): Promise<string> {
    checkAborted(options.signal);
    const entry: GitOperationLog = { command, args: [...args], startedAt: Date.now(), endedAt: null, exit: null, stderrTail: "" };
    this.operations.push(entry);
    if (this.operations.length > 100) this.operations.shift();
    try {
      const result = await this.runner({
        target: { type: "command", name: command },
        args,
        cwd: this.repoRoot,
        input,
        env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
        signal: options.signal,
        timeoutMs,
      });
      entry.exit = result.exit;
      entry.stderrTail = decodeProcessText(result.stderr).slice(-4096);
      checkAborted(options.signal);
      if (result.aborted) throw new GitServiceError("aborted", "Git operation was cancelled.", args);
      if (result.timedOut) throw new GitServiceError("timed-out", `${command} timed out.`, args);
      if (result.outputTruncated) throw new GitServiceError("output-truncated", `${command} output exceeded the capture limit.`, args);
      if (result.exit.type !== "exited" || result.exit.code !== 0) {
        if (/index\.lock/.test(entry.stderrTail)) throw new GitIndexLockedError(`${this.gitDir ?? `${this.repoRoot}/.git`}/index.lock`);
        throw new GitServiceError("command-failed", entry.stderrTail || `${command} failed (${result.exit.type === "exited" ? result.exit.code : "terminated"}).`, args);
      }
      return decodeProcessText(result.stdout);
    } catch (error) {
      if (!entry.stderrTail) entry.stderrTail = (error instanceof Error ? error.message : String(error)).slice(-4096);
      checkAborted(options.signal);
      throw error;
    } finally {
      entry.endedAt = Date.now();
    }
  }

  private git(args: readonly string[], options: GitReadOptions, timeoutMs = 60_000, input?: string) {
    return this.process("git", ["-c", "core.quotepath=off", ...args], options, timeoutMs, input);
  }

  private async inspect(gitDir: string, options: GitReadOptions): Promise<GitRepoState> {
    const [head = "", ...markers] = (await this.process("sh", ["-c", stateProbe, "legend-diff-state", gitDir], options)).split("\0");
    if (markers.includes("index.lock")) throw new GitIndexLockedError(`${gitDir}/index.lock`);
    const branch = head.startsWith("ref: refs/heads/") ? head.slice(16).replace(/\n$/, "") : null;
    return {
      gitDir,
      branch,
      detachedCommit: head.startsWith("ref: ") ? null : head.trim(),
      detached: !head.startsWith("ref: "),
      merging: markers.includes("MERGE_HEAD"),
      rebasing: markers.includes("rebase-merge") ? "merge" : markers.includes("rebase-apply") ? "apply" : null,
      cherryPicking: markers.includes("CHERRY_PICK_HEAD"),
      reverting: markers.includes("REVERT_HEAD"),
      bisecting: markers.includes("BISECT_LOG"),
    };
  }

  private read(args: readonly string[], options: GitReadOptions, timeoutMs = 60_000, requiresIndex = false) {
    return this.enqueue(options, async (gitDir) => {
      if (requiresIndex) await this.inspect(gitDir, options);
      return this.git(args, options, timeoutMs);
    });
  }

  // The hash reader must reload the source without enqueueing another operation on this GitService.
  applyPatch(patch: string, options: GitReadOptions & { baseDiffHash: string; readCurrentDiffHash: (signal?: AbortSignal) => Promise<string> }) {
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      const verifyBase = async () => {
        const hash = await options.readCurrentDiffHash(options.signal);
        checkAborted(options.signal);
        if (hash !== options.baseDiffHash) throw new GitServiceError("base-drift", "The diff changed since this patch was generated. Generate a new patch before applying.");
      };
      await verifyBase();
      await this.git(["apply", "--check", "-"], options, 60_000, patch);
      await verifyBase();
      await this.git(["apply", "-"], options, 60_000, patch);
    });
  }

  status(options: GitReadOptions = {}) {
    return this.read(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignored=no"], options, 60_000, true).then(parseGitStatus);
  }

  repoState(options: GitReadOptions = {}) {
    return this.enqueue(options, (gitDir) => this.inspect(gitDir, options));
  }

  resolveRoot(options: GitReadOptions = {}) {
    return this.read(["rev-parse", "--show-toplevel"], options).then(value => value.replace(/\n$/, ""));
  }

  watchLocations(options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir) => {
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      return {
        root,
        gitDir,
        commonDir: (await this.git(["rev-parse", "--path-format=absolute", "--git-common-dir"], options)).replace(/\n$/, ""),
        ignoredPaths: (await this.git(["-C", root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], options)).split("\0").filter(Boolean),
      };
    });
  }

  revParse(ref: string, options: GitReadOptions = {}) {
    return this.read(["rev-parse", "--verify", "--end-of-options", ref], options).then((value) => value.trim());
  }

  diff(args: readonly string[], options: GitReadOptions & { requiresIndex?: boolean } = {}) {
    return this.read(["diff", "-z", ...args], options, 60_000, options.requiresIndex);
  }

  showCommit(sha: string, options: GitReadOptions & { ignoreWhitespaceChanges?: boolean } = {}) {
    return this.enqueue(options, async () => {
      const commit = (await this.git(["rev-parse", "--verify", "--end-of-options", `${sha}^{commit}`], options)).trim();
      return this.git(["show", "-z", "--format=", "--first-parent", "--root", "--patch", "--no-ext-diff", "--no-color", ...(options.ignoreWhitespaceChanges ? ["--ignore-all-space"] : []), commit, "--"], options);
    });
  }

  mergeBase(a: string, b: string, options: GitReadOptions = {}) {
    return this.read(["merge-base", "--", a, b], options).then((value) => value.trim());
  }

  refs(format: string, options: GitReadOptions = {}) {
    return this.read(["for-each-ref", `--format=${format}`, "refs/heads", "refs/remotes"], options, 5_000);
  }

  remotes(options: GitReadOptions = {}) {
    return this.read(["remote"], options, 5_000);
  }

  unmerged(options: GitReadOptions = {}) {
    return this.read(["ls-files", "-u", "-z"], options, 10_000);
  }
}

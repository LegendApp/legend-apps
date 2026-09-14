import catalog from "../../../grammars/catalog.json";

export type GrammarProgress = { phase: "idle" | "checking" | "downloading" | "ready" | "error"; language: string; completed: number; total: number; error?: string };
export type GrammarArtifact = { filename: string; url: string; sha256: string; bytes: number };
export type GrammarManifest = { schemaVersion: 1; packABI: 1; version: string; packs: Record<string, { dependencies: string[]; platforms: Record<string, GrammarArtifact> }> };
export type GrammarIO = {
  platform(): string;
  loaded(language: string): boolean;
  manifest(refresh?: boolean): Promise<unknown>;
  install(language: string, artifact: GrammarArtifact, progress: (completed: number, total: number) => void): Promise<unknown>;
};
const byName = new Map(catalog.grammars.flatMap((g) => [g.name, ...g.aliases].map((name) => [name, g] as const)));
export function canonicalGrammar(language: string) { return byName.get(language.toLowerCase())?.name ?? language.toLowerCase(); }
export function isKnownGrammar(language: string) { return byName.has(language.toLowerCase()); }
export const grammarLanguageOptions = catalog.grammars.filter((g) => g.name !== "markdown-inline")
  .map((g) => ({ label: g.name, value: g.name })).sort((a, b) => a.label.localeCompare(b.label));
export function detectGrammar(path: string, firstLine = "") {
  const filename = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const exact = catalog.grammars.find((g) => (g.filenames as string[]).includes(filename));
  if (exact) return exact.name;
  if (filename.startsWith("dockerfile.")) return "dockerfile";
  const extension = filename.includes(".") ? filename.split(".").pop()! : "";
  const match = catalog.grammars.find((g) => (g.extensions as string[]).includes(extension));
  if (match) return match.name;
  const shebang = firstLine.slice(0, 512).split(/[\r\n]/, 1)[0];
  if (shebang.startsWith("#!")) {
    // Inspect the interpreter, not arbitrary arguments containing language names.
    const words = shebang.slice(2).trim().split(/\s+/);
    let interpreter = words.shift()?.split("/").pop() ?? "";
    if (interpreter === "env") interpreter = words.find((word) => !word.startsWith("-") && !word.includes("=")) ?? "";
    if (/^python(?:\d+(?:\.\d+)*)?$/.test(interpreter)) return "python";
    if (["node", "nodejs", "bun", "deno"].includes(interpreter)) return "javascript";
    if (["bash", "sh", "zsh", "dash", "ksh"].includes(interpreter)) return "bash";
    const interpreters: Record<string, string> = { ruby: "ruby", perl: "perl", php: "php", lua: "lua", fish: "fish", pwsh: "powershell", Rscript: "r", julia: "julia", elixir: "elixir", escript: "erlang" };
    if (interpreters[interpreter]) return interpreters[interpreter];
  }
  return "";
}
export function validateGrammarManifest(value: unknown): GrammarManifest {
  const m = value as GrammarManifest;
  if (!m || m.schemaVersion !== 1 || m.packABI !== 1 || !/^[a-z0-9][a-z0-9.-]*$/.test(m.version)
    || !m.packs || typeof m.packs !== "object" || Array.isArray(m.packs)) throw Error("Incompatible grammar manifest");
  for (const [name, pack] of Object.entries(m.packs)) {
    if (!/^[a-z0-9_-]+$/.test(name) || !Array.isArray(pack.dependencies) || !pack.platforms) throw Error("Invalid grammar manifest entry");
    for (const dependency of pack.dependencies) if (typeof dependency !== "string" || !Object.hasOwn(m.packs, dependency)) throw Error("Missing grammar dependency");
    for (const [platform, artifact] of Object.entries(pack.platforms)) {
      if (!["macos-arm64", "macos-x86_64"].includes(platform) || !artifact
        || artifact.filename !== `${name}-${platform}.dylib`
        || artifact.url !== `https://github.com/LegendApp/legend-apps/releases/download/grammars-v${m.version}/${artifact.filename}`
        || !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.bytes)
        || artifact.bytes <= 0 || artifact.bytes > 64 * 1024 * 1024) throw Error("Invalid grammar artifact");
    }
  }
  if (Object.keys(m.packs).length > 1024) throw Error("Grammar catalog exceeds language limit");
  const visited = new Set<string>(), visiting = new Set<string>();
  const visit = (name: string) => {
    if (visiting.has(name)) throw Error("Cyclic grammar dependencies");
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of m.packs[name].dependencies) visit(dependency);
    visiting.delete(name); visited.add(name);
  };
  for (const name of Object.keys(m.packs)) visit(name);
  return m;
}
export function createGrammarManager(io: GrammarIO) {
  const states = new Map<string, GrammarProgress>();
  const listeners = new Map<string, Set<() => void>>();
  const pending = new Map<string, Promise<void>>();
  let manifest: Promise<GrammarManifest> | undefined;
  const state = (language: string) => {
    const name = canonicalGrammar(language);
    if (!states.has(name)) states.set(name, { phase: "idle", language: name, completed: 0, total: 0 });
    return states.get(name)!;
  };
  const emit = (name: string, patch: Partial<GrammarProgress>) => {
    states.set(name, { ...state(name), ...patch }); listeners.get(name)?.forEach((listener) => listener());
  };
  async function acquire(name: string) {
    emit(name, { phase: "checking", error: undefined, completed: 0, total: 0 });
    try {
      // A loaded grammar can still require separately installed inline parsers.
      const dependencies = byName.get(name)?.dependencies ?? [];
      if (io.loaded(name)) {
        for (const dependency of dependencies) await ensure(dependency);
      } else {
        manifest ??= io.manifest().then(validateGrammarManifest).catch((error) => { manifest = undefined; throw error; });
        let data = await manifest;
        if (!Object.hasOwn(data.packs, name)) {
          data = validateGrammarManifest(await io.manifest(true));
          manifest = Promise.resolve(data);
        }
        const pack = Object.hasOwn(data.packs, name) ? data.packs[name] : undefined;
        if (!pack) throw Error(`No grammar pack available for ${name}`);
        for (const dependency of pack.dependencies) await ensure(dependency);
        const artifact = pack.platforms[io.platform()];
        if (!artifact) throw Error(`No ${io.platform()} grammar for ${name}`);
        // Installation may only verify/load a disk-cached pack. Native progress
        // is emitted only for an actual network download.
        let installing = true;
        try {
          await io.install(name, artifact, (completed, total) => {
            if (installing) emit(name, { phase: "downloading", completed, total });
          });
        } finally { installing = false; }
        if (!io.loaded(name)) throw Error(`Grammar did not load: ${name}`);
      }
      emit(name, { phase: "ready" });
    } catch (error) {
      emit(name, { phase: "error", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  function ensure(language: string): Promise<void> {
    const name = canonicalGrammar(language);
    if (!name) return Promise.resolve();
    if (pending.has(name)) return pending.get(name)!;
    if (state(name).phase === "ready" && io.loaded(name)) return Promise.resolve();
    const promise = acquire(name).finally(() => pending.delete(name));
    pending.set(name, promise);
    return promise;
  }
  return { ensure, getSnapshot: state, subscribe(language: string, listener: () => void) {
    const name = canonicalGrammar(language);
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(listener);
    return () => { listeners.get(name)?.delete(listener); };
  } };
}

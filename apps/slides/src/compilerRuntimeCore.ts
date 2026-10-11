/**
 * Release builds ship the deck compiler as one JavaScript file without a runtime.
 * This module finds a compatible runtime (Bun or Node) or installs a pinned Bun.
 * It talks to the system only through `RuntimeHost`, so it can be tested without the app.
 */
export type RuntimeKind = "bun" | "node";
export type RuntimeSource = "custom" | "downloaded" | "system";
export type CompilerRuntime = { path: string; kind: RuntimeKind; version: string; source: RuntimeSource };
export type RunResult = { code: number; stdout: string; stderr: string; timedOut?: boolean };
export type RuntimeHost = {
  home: string;
  /** Application Support folder for Slides; runtimes install under `runtime/`. */
  dataDirectory: string;
  exists(path: string): Promise<boolean>;
  run(executable: string, args: string[], options?: { timeoutMs?: number; onStderr?(text: string): void }): Promise<RunResult>;
  mkdir(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
};

/** Pinned download. Checksums are from the release's SHASUMS256.txt and were verified against the zips. */
export const pinnedBun = {
  version: "1.3.14",
  bytes: { arm64: 23_586_433, x64: 26_509_109 },
  assets: {
    arm64: { name: "bun-darwin-aarch64", sha256: "d8b96221828ad6f97ac7ac0ab7e95872341af763001e8803e8267652c2652620" },
    x64: { name: "bun-darwin-x64", sha256: "4183df3374623e5bab315c547cfa0974533cd457d86b73b639f7a87974cd6633" },
  },
} as const;
export const minimumRuntimeVersion: Record<RuntimeKind, string> = { bun: "1.3.0", node: "22.0.0" };
export type BunArch = keyof typeof pinnedBun.assets;

export function bunDownloadUrl(arch: BunArch) {
  return `https://github.com/oven-sh/bun/releases/download/bun-v${pinnedBun.version}/${pinnedBun.assets[arch].name}.zip`;
}
export function downloadedBunPath(dataDirectory: string) {
  return `${dataDirectory}/runtime/bun-${pinnedBun.version}/bun`;
}

export function parseRuntimeVersion(output: string) {
  return /^v?(\d+\.\d+\.\d+)/.exec(output.trim())?.[1] ?? null;
}
export function compareVersions(a: string, b: string) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
type Candidate = { path: string; source: RuntimeSource };
/** Discovery order: explicit choice, app-downloaded Bun, well-known Bun installs, then well-known Node installs. */
export function staticCandidates(host: Pick<RuntimeHost, "home" | "dataDirectory">, customPath?: string): Candidate[] {
  const list: Candidate[] = [];
  if (customPath) list.push({ path: customPath, source: "custom" });
  list.push({ path: downloadedBunPath(host.dataDirectory), source: "downloaded" });
  for (const path of [`${host.home}/.bun/bin/bun`, "/opt/homebrew/bin/bun", "/usr/local/bin/bun"]) list.push({ path, source: "system" });
  for (const path of ["/opt/homebrew/bin/node", "/usr/local/bin/node", `${host.home}/.volta/bin/node`]) list.push({ path, source: "system" });
  return list;
}

/** GUI apps get a minimal PATH; ask the user's login shell where version managers put bun and node. */
export async function loginShellCandidates(host: RuntimeHost, shell?: string): Promise<Candidate[]> {
  if (!shell) {
    const user = host.home.split("/").pop()!;
    const configured = await host.run("/usr/bin/dscl", [".", "-read", `/Users/${user}`, "UserShell"], { timeoutMs: 5000 }).catch(() => null);
    shell = configured?.code === 0 ? /^UserShell:\s*(\/\S+)\s*$/m.exec(configured.stdout)?.[1] : undefined;
  }
  // Both POSIX shells and fish support command -v and these login/interactive flags.
  const result = await host.run(shell ?? "/bin/zsh", ["-ilc", "command -v bun; command -v node"], { timeoutMs: 5000 }).catch(() => null);
  if (!result || result.timedOut) return [];
  return result.stdout.split("\n").map(line => line.trim()).filter(line => line.startsWith("/") && /\/(bun|node)$/.test(line))
    .map(path => ({ path, source: "system" as const }));
}

export async function probeRuntime(host: RuntimeHost, candidate: Candidate): Promise<CompilerRuntime | null> {
  if (!(await host.exists(candidate.path))) return null;
  const result = await host.run(candidate.path, ["--version"], { timeoutMs: 5000 }).catch(() => null);
  const version = result && result.code === 0 ? parseRuntimeVersion(result.stdout) : null;
  const kind: RuntimeKind = result?.stdout.trim().startsWith("v") ? "node" : "bun";
  if (!version || compareVersions(version, minimumRuntimeVersion[kind]) < 0) return null;
  return { ...candidate, kind, version };
}

export async function findRuntime(host: RuntimeHost, options: { customPath?: string; shell?: string } = {}): Promise<CompilerRuntime | null> {
  const seen = new Set<string>();
  const tryAll = async (candidates: Candidate[]) => {
    for (const candidate of candidates) {
      if (seen.has(candidate.path)) continue;
      seen.add(candidate.path);
      const runtime = await probeRuntime(host, candidate);
      if (runtime) return runtime;
    }
    return null;
  };
  const found = await tryAll(staticCandidates(host, options.customPath));
  if (found) return found;
  const fromShell = await loginShellCandidates(host, options.shell);
  // Prefer Bun from the shell over Node from the shell.
  return tryAll([...fromShell.filter(c => c.path.endsWith("/bun")), ...fromShell.filter(c => c.path.endsWith("/node"))]);
}

/** Last percentage in curl's `--progress-bar` output. */
export function parseCurlProgress(text: string) {
  const matches = [...text.matchAll(/(\d{1,3}(?:\.\d)?)%/g)];
  if (!matches.length) return null;
  return Math.max(0, Math.min(1, Number(matches[matches.length - 1][1]) / 100));
}

export class RuntimeInstallError extends Error {}

export async function runtimeArch(host: RuntimeHost): Promise<BunArch> {
  return (await host.run("/usr/bin/uname", ["-m"])).stdout.trim() === "arm64" ? "arm64" : "x64";
}

/**
 * Download the pinned Bun zip, check its SHA-256 against the value compiled into the app,
 * unpack it in a scratch folder, and rename it into place so a partial install is never visible.
 */
export async function installPinnedBun(host: RuntimeHost, options: { arch?: BunArch; force?: boolean; onProgress?(fraction: number): void } = {}): Promise<CompilerRuntime> {
  const arch = options.arch ?? await runtimeArch(host);
  const asset = pinnedBun.assets[arch];
  const root = `${host.dataDirectory}/runtime`;
  const final = `${root}/bun-${pinnedBun.version}`;
  const existing = await probeRuntime(host, { path: `${final}/bun`, source: "downloaded" });
  if (!options.force && existing?.version === pinnedBun.version) return existing;
  const scratch = `${root}/.install-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await host.mkdir(scratch);
  try {
    const zip = `${scratch}/bun.zip`;
    const download = await host.run("/usr/bin/curl", ["-fL", "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2", "--retry", "2", "--connect-timeout", "20", "--progress-bar", "-o", zip, bunDownloadUrl(arch)], {
      timeoutMs: 15 * 60_000,
      onStderr: text => { const fraction = parseCurlProgress(text); if (fraction !== null) options.onProgress?.(fraction); },
    });
    if (download.code !== 0 || download.timedOut) {
      throw new RuntimeInstallError("Couldn't download Bun. Check your connection and try again.");
    }
    const sum = await host.run("/usr/bin/shasum", ["-a", "256", zip]);
    if (sum.code !== 0 || sum.stdout.split(/\s+/)[0] !== asset.sha256) {
      throw new RuntimeInstallError("The Bun download didn't match its expected checksum, so it wasn't installed.");
    }
    const unpack = await host.run("/usr/bin/ditto", ["-x", "-k", zip, `${scratch}/unpacked`]);
    if (unpack.code !== 0) throw new RuntimeInstallError("Couldn't unpack the Bun download.");
    const unpacked = `${scratch}/unpacked/${asset.name}`;
    const probed = await probeRuntime(host, { path: `${unpacked}/bun`, source: "downloaded" });
    if (probed?.version !== pinnedBun.version) throw new RuntimeInstallError("The downloaded Bun didn't start on this Mac.");
    if (await host.exists(final)) await host.remove(final);
    await host.move(unpacked, final);
    options.onProgress?.(1);
    return { path: `${final}/bun`, kind: "bun", version: pinnedBun.version, source: "downloaded" };
  } finally {
    await host.remove(scratch).catch(() => {});
  }
}

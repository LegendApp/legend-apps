import type { RuntimeHost } from "./compilerRuntimeCore";

export type CompilerArtifact = { url: string; sha256: string; bytes: number; arch: string };
export class CompilerDownloadError extends Error {}

/** Verify even a cached archive before extracting executable code. Never execute a partial install. */
export async function installCompilerHelper(host: RuntimeHost, asset: CompilerArtifact, report: (message: string) => void) {
  const url = new URL(asset.url);
  if (url.origin !== "https://legend.so" || !url.pathname.startsWith("/slides/compiler/")
      || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
    throw new CompilerDownloadError("This app has invalid compiler download information. Install a newer Legend Slides.");
  }
  const arch = (await host.run("/usr/bin/uname", ["-m"])).stdout.trim();
  if (arch !== (asset.arch === "x64" ? "x86_64" : asset.arch)) throw new CompilerDownloadError("This compiler download doesn't support this Mac. Install the matching Legend Slides app.");
  const root = `${host.dataDirectory}/compiler`;
  const archive = `${root}/${asset.sha256}.zip`;
  const final = `${root}/${asset.sha256}`;
  const scratch = `${root}/.install-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const valid = async (file: string) => {
    const sum = await host.run("/usr/bin/shasum", ["-a", "256", file]);
    return sum.code === 0 && !sum.timedOut && sum.stdout.split(/\s+/)[0] === asset.sha256;
  };
  await host.mkdir(scratch);
  try {
    report("Checking cached deck compiler…");
    if (!(await host.exists(archive)) || !(await valid(archive))) {
      report(`Downloading deck compiler (${Math.ceil(asset.bytes / 1_000_000)} MB, once)…`);
      const download = await host.run("/usr/bin/curl", ["--fail", "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2", "--retry", "2", "--connect-timeout", "20", "--max-time", "600", "--max-filesize", String(asset.bytes), "-o", `${scratch}/compiler.zip`, asset.url], { timeoutMs: 11 * 60_000 });
      if (download.code !== 0 || download.timedOut) throw new CompilerDownloadError("Couldn't download the deck compiler. Connect to the internet and retry this action. Once downloaded, it works offline.");
      report("Verifying deck compiler…");
      if (!(await valid(`${scratch}/compiler.zip`))) throw new CompilerDownloadError("The deck compiler download failed its integrity check. Retry this action; if this continues, update Legend Slides.");
      if (await host.exists(archive)) await host.remove(archive);
      await host.move(`${scratch}/compiler.zip`, archive);
    }
    // Re-extract the verified cache once per app launch: changed/partial extracted files are repaired offline.
    report("Preparing deck compiler…");
    const unpack = await host.run("/usr/bin/ditto", ["-x", "-k", archive, `${scratch}/payload`], { timeoutMs: 120_000 });
    if (unpack.code !== 0 || unpack.timedOut || !(await host.exists(`${scratch}/payload/slides-compiler.helper/run`))) {
      throw new CompilerDownloadError("Couldn't prepare the deck compiler. Check free disk space and retry this action.");
    }
    if (await host.exists(final)) await host.remove(final);
    await host.move(`${scratch}/payload/slides-compiler.helper`, final);
    return `${final}/run`;
  } finally {
    await host.remove(scratch).catch(() => {});
  }
}

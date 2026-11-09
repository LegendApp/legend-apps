import type { RunResult, RuntimeHost } from "./compilerRuntimeCore";

export class CompilerPreparationError extends Error {}

/** The signed app owns the compiler archive; preparation never consults a download URL. */
export async function prepareCompilerHelper(host: Pick<RuntimeHost, "dataDirectory" | "exists">, prepare: (cache: string) => Promise<RunResult>, report: (message: string) => void) {
  const cache = `${host.dataDirectory}/compiler`;
  report("Preparing built-in deck compiler…");
  const result = await prepare(cache);
  if (result.code !== 0 || result.timedOut) throw new CompilerPreparationError(result.stderr.trim()
    || "Couldn't prepare the built-in deck compiler. Check free disk space, or rebuild or reinstall Legend Slides.");
  const entry = result.stdout.trim();
  if (!entry.startsWith(`${cache}/`) || !/^[a-f0-9]{64}\/run$/.test(entry.slice(cache.length + 1)) || !await host.exists(entry)) {
    throw new CompilerPreparationError("The built-in deck compiler is incomplete. Rebuild or reinstall Legend Slides.");
  }
  return entry;
}

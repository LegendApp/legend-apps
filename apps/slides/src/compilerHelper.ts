import { observable } from "@legendapp/state";
import { runtimeHost } from "./compilerRuntime";
import { CompilerPreparationError, prepareCompilerHelper } from "./compilerHelperCore";
import { runCommand } from "@legendapp/spark/processes";
import { decodeProcessText } from "@legend-apps/runtime-utils";
export { CompilerPreparationError } from "./compilerHelperCore";

export const compilerHelper$ = observable({ busy: false, message: "", error: "", retryDeck: null as string | null });
let resolving: Promise<string> | undefined;

/** All compiler commands share one preparation. Failures clear it so the next explicit action can retry. */
export function resolveCompilerHelper(): Promise<string> {
  return resolving ??= (async () => {
    compilerHelper$.assign({ busy: true, error: "", message: "Preparing deck compiler…" });
    try {
      return await prepareCompilerHelper(await runtimeHost(), async cache => {
        const result = await runCommand({ target: { type: "helper", name: "slides-compiler" },
          env: { LEGEND_SLIDES_COMPILER_CACHE: cache }, timeoutMs: 120_000 });
        return { code: result.exit.type === "exited" ? result.exit.code : -1,
          stdout: decodeProcessText(result.stdout), stderr: decodeProcessText(result.stderr), timedOut: result.timedOut };
      }, message => compilerHelper$.message.set(message));
    } catch (error) {
      const message = error instanceof CompilerPreparationError ? error.message : "Couldn't prepare the built-in deck compiler. Check free disk space, or rebuild or reinstall Legend Slides.";
      compilerHelper$.error.set(message);
      throw new CompilerPreparationError(message);
    } finally { compilerHelper$.busy.set(false); }
  })().catch(error => { resolving = undefined; throw error; });
}

import { observable } from "@legendapp/state";
import { runtimeHost } from "./compilerRuntime";
import { CompilerDownloadError, installCompilerHelper, type CompilerArtifact } from "./compilerHelperCore";
export { CompilerDownloadError } from "./compilerHelperCore";

export const compilerHelper$ = observable({ busy: false, message: "", error: "", retryDeck: null as string | null });
let resolving: Promise<string> | undefined;

/** All compiler commands share one install. Failures clear it so the next explicit action can retry. */
export function resolveCompilerHelper(): Promise<string> {
  return resolving ??= (async () => {
    compilerHelper$.assign({ busy: true, error: "", message: "Preparing deck compiler…" });
    try {
      // Babel embeds these exact bytes before bundling; no mutable remote manifest is trusted.
      const pin = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_ARTIFACT;
      if (!pin) throw new CompilerDownloadError("This app has no compiler download information. Install a newer Legend Slides.");
      return await installCompilerHelper(await runtimeHost(), JSON.parse(pin) as CompilerArtifact, message => compilerHelper$.message.set(message));
    } catch (error) {
      const message = error instanceof CompilerDownloadError ? error.message : "Couldn't prepare the deck compiler. Check your connection and free disk space, then retry this action.";
      compilerHelper$.error.set(message);
      throw new CompilerDownloadError(message);
    } finally { compilerHelper$.busy.set(false); }
  })().catch(error => { resolving = undefined; throw error; });
}

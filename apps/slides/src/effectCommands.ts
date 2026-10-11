import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCompilerCommand } from "./compilerCommand";
import { parseCompilerResult } from "./deckLoader";
import { effectRequests$ } from "./effectRequests";
import { getSlidesState } from "./slidesStore";
/** Collect complete stderr lines and publish the compiler's download progress. */
function effectProgressReader() {
  let pending = "";
  return (text: string) => {
    const lines = (pending + text).split("\n");
    pending = lines.pop()!;
    for (const line of lines) {
      try { const progress = JSON.parse(line).effectProgress; if (progress) effectRequests$.progress.set(progress); }
      catch { /* Other stderr output is diagnostics. */ }
    }
  };
}
export async function runEffectCommand(args: string[], message: string, done = "Effects installed and available offline.") {
  if (effectRequests$.busy.peek()) throw new Error("An effect installation is already running.");
  const state = getSlidesState();
  if (state.deckLocked || state.audienceOpen) throw new Error("Finish presenting before installing effects.");
  effectRequests$.assign({ busy: true, message, error: "", progress: null });
  const readProgress = effectProgressReader();
  try {
    const output = await runCompilerCommand(args, { timeoutMs: 120_000,
      onOutput: output => { if (output.stream === "stderr") readProgress(decodeProcessText(output.bytes)); } });
    if (output.timedOut) throw new Error("Effect installation timed out. Retry when your connection is available.");
    const result = parseCompilerResult(decodeProcessText(output.stdout)) as unknown as { success: boolean; errors?: string[]; path?: string };
    if (!result.success) throw new Error(result.errors?.join("\n") || decodeProcessText(output.stderr) || "Effect installation failed.");
    effectRequests$.message.set(done);
    return result;
  } catch (error) {
    effectRequests$.assign({ message: "", error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally { effectRequests$.assign({ busy: false, progress: null }); }
}

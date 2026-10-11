import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCompilerCommand } from "./compilerCommand";
import { parseCompilerResult } from "./deckLoader";
import { effectRequests$ } from "./effectRequests";
import { getSlidesState } from "./slidesStore";
export async function runEffectCommand(args: string[], message: string) {
  if (effectRequests$.busy.peek()) throw new Error("An effect installation is already running.");
  const state = getSlidesState();
  if (state.deckLocked || state.audienceOpen) throw new Error("Finish presenting before installing effects.");
  effectRequests$.assign({ busy: true, message, error: "" });
  try {
    const output = await runCompilerCommand(args, { timeoutMs: 120_000 });
    if (output.timedOut) throw new Error("Effect installation timed out. Retry when your connection is available.");
    const result = parseCompilerResult(decodeProcessText(output.stdout)) as unknown as { success: boolean; errors?: string[]; path?: string };
    if (!result.success) throw new Error(result.errors?.join("\n") || decodeProcessText(output.stderr) || "Effect installation failed.");
    effectRequests$.message.set("Effects installed and available offline.");
    return result;
  } catch (error) {
    effectRequests$.assign({ message: "", error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally { effectRequests$.busy.set(false); }
}

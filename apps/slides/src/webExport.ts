import { observable } from "@legendapp/state";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { revealInFileManager } from "@legendapp/spark/files";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCompilerCommand } from "./compilerCommand";
import { parseCompilerResult } from "./deckLoader";
import { reportMissingEffects } from "./effectRequests";
import { prepareSlidesExit } from "./slidesExit";
import { getSlidesState } from "./slidesStore";
import { transitionDirectoryPath } from "./transitionLibrary";

export const webExport$ = observable({
  status: "idle" as "idle" | "choosing" | "exporting" | "done" | "error",
  step: 0,
  steps: 0,
  label: "",
  message: "",
  warnings: [] as string[],
});

type ExportResult = { success: true; path: string; warnings: string[] } | { success: false; errors: string[]; missingEffectPacks?: string[] };
let controller: AbortController | undefined;

/** Save pending edits, then export the open deck to a chosen folder. */
export async function exportDeckToHTML() {
  if (!getSlidesState().deckPath || controller) return;
  const abort = controller = new AbortController();
  webExport$.status.set("choosing");
  try {
    if (!await prepareSlidesExit()) throw new Error("Export stopped. Save your changes and try again.");
    const deckPath = getSlidesState().deckPath;
    if (!deckPath) { webExport$.status.set("idle"); return; }
    const picked = await openFileDialog({ selection: "directories", multiple: false, prompt: "Export",
      message: "Choose an empty folder for the HTML export, or a previous export to replace. Open its index.html to present." });
    if (picked.canceled || !picked.paths[0]) { webExport$.status.set("idle"); return; }
    webExport$.assign({ status: "exporting", step: 0, steps: 0, label: "Starting", message: "", warnings: [] });
    let pending = "";
    const output = await runCompilerCommand([deckPath, "--export-html", picked.paths[0], "--transitions", transitionDirectoryPath()], {
      signal: abort.signal, timeoutMs: 10 * 60_000,
      onOutput: ({ stream, bytes }) => {
        if (stream !== "stderr") return;
        const lines = (pending + decodeProcessText(bytes)).split("\n");
        pending = lines.pop()!;
        for (const line of lines) {
          try { const progress = JSON.parse(line).exportProgress; if (progress) webExport$.assign(progress); }
          catch { /* Other diagnostics are preserved in the process result. */ }
        }
      },
    });
    if (abort.signal.aborted || output.aborted) { webExport$.status.set("idle"); return; }
    if (output.timedOut) throw new Error("The export took longer than 10 minutes and was stopped. Try a smaller deck or export again.");
    let result: ExportResult;
    try { result = parseCompilerResult(decodeProcessText(output.stdout)) as unknown as ExportResult; }
    catch { throw new Error(decodeProcessText(output.stderr).trim() || "The HTML exporter stopped unexpectedly."); }
    if (!result.success) {
      if (result.missingEffectPacks?.length) {
        reportMissingEffects(deckPath, result.missingEffectPacks);
        throw new Error([`This deck needs effects: ${result.missingEffectPacks.join(", ")}. Choose Install Required Effects below, then export again.`, ...result.errors].join("\n"));
      }
      throw new Error(result.errors.join("\n"));
    }
    webExport$.assign({ status: "done", message: `Exported to ${result.path}`, warnings: result.warnings });
    try { await revealInFileManager(result.path); }
    catch { webExport$.message.set(`Exported to ${result.path}. Finder couldn't reveal it; open this folder manually.`); }
  } catch (error) {
    if (abort.signal.aborted) webExport$.status.set("idle");
    else webExport$.assign({ status: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    controller = undefined;
  }
}

export function cancelWebExport() {
  controller?.abort();
}

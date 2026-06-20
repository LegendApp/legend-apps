import type { MarkdownSaveState } from "@legend-desktop/markdown-document";

export function markdownSaveStatusText({
  autosaveEnabled,
  isDirty,
  isUntitledDocument,
  saveState,
}: {
  autosaveEnabled: boolean;
  isDirty: boolean;
  isUntitledDocument: boolean;
  saveState: MarkdownSaveState;
}) {
  if (saveState === "saving") {
    return autosaveEnabled && !isUntitledDocument ? "Autosaving..." : "Saving...";
  }

  if (saveState === "error") {
    return "Save failed";
  }

  if (isDirty) {
    return "Unsaved changes";
  }

  return isUntitledDocument ? null : "Saved";
}

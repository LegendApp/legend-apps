import type { MarkdownSaveState } from "@legend-apps/markdown-document";
import { getMarkdownFileTitle } from "./appMetadata";

const dirtyTitleIndicator = "•";
const cleanFileTitlePadding = "  ";

export function markdownEditorWindowTitle({
  filename,
  isDirty,
  isUntitledDocument,
  saveState,
}: {
  filename: string;
  isDirty: boolean;
  isUntitledDocument: boolean;
  saveState: MarkdownSaveState;
}) {
  const title = isUntitledDocument ? "Untitled" : getMarkdownFileTitle(filename);

  if (isDirty || saveState !== "idle") {
    return `${title} ${dirtyTitleIndicator}`;
  }

  if (!isUntitledDocument) {
    return `${title}${cleanFileTitlePadding}`;
  }

  return title;
}

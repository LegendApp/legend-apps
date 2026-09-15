import {
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentAdapter,
} from "@legend-apps/markdown-document";

const untitledFilename = "Untitled.md";

export const untitledMarkdownAdapter: MarkdownDocumentAdapter = {
  // Keep native indexed lookups and synchronous block reads for newly inserted rows.
  ...nativeMarkdownDocumentAdapter,
  async load() {
    return nativeMarkdownDocumentAdapter.loadMarkdown(untitledFilename, "");
  },
  async save() {
    // Untitled documents remain save-as only at the app command layer.
  },
};

export { untitledFilename };

import {
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentAdapter,
} from "@legend-apps/markdown-document";

const untitledFilename = "Untitled.md";

export const untitledMarkdownAdapter: MarkdownDocumentAdapter = {
  // Keep native indexed lookups and synchronous block reads for newly inserted rows.
  ...nativeMarkdownDocumentAdapter,
  async load(filename) {
    return filename === untitledFilename
      ? nativeMarkdownDocumentAdapter.loadMarkdown(untitledFilename, "")
      : nativeMarkdownDocumentAdapter.load(filename);
  },
};

export { untitledFilename };

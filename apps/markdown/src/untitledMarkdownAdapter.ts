import type {
  MarkdownDocumentAdapter,
} from "@legend-desktop/markdown-document";
import { nativeMarkdownDocumentAdapter } from "@legend-desktop/markdown-document";

const untitledFilename = "Untitled.md";

export const untitledMarkdownAdapter: MarkdownDocumentAdapter = {
  async load() {
    return nativeMarkdownDocumentAdapter.loadMarkdown(untitledFilename, "");
  },
  getBlock(documentId, blockId) {
    return nativeMarkdownDocumentAdapter.getBlock(documentId, blockId);
  },
  getBlockAtIndexSync(documentId, index) {
    return nativeMarkdownDocumentAdapter.getBlockAtIndexSync?.(documentId, index);
  },
  getBlockIds(documentId, startIndex, count) {
    if (!nativeMarkdownDocumentAdapter.getBlockIds) {
      return Promise.resolve([]);
    }
    return nativeMarkdownDocumentAdapter.getBlockIds(documentId, startIndex, count);
  },
  getBlockMetadata(documentId, startIndex, count) {
    if (!nativeMarkdownDocumentAdapter.getBlockMetadata) {
      return Promise.resolve([]);
    }
    return nativeMarkdownDocumentAdapter.getBlockMetadata(documentId, startIndex, count);
  },
  getBlocks(documentId, startIndex, count) {
    return nativeMarkdownDocumentAdapter.getBlocks(documentId, startIndex, count);
  },
  async save() {
    // Untitled documents remain save-as only at the app command layer.
  },
  saveAs(documentId, filename) {
    return nativeMarkdownDocumentAdapter.saveAs(documentId, filename);
  },
  close(documentId) {
    return nativeMarkdownDocumentAdapter.close(documentId);
  },
  applyTransaction(documentId, transaction) {
    if (!nativeMarkdownDocumentAdapter.applyTransaction) {
      throw new Error("Native markdown transactions are unavailable.");
    }

    return nativeMarkdownDocumentAdapter.applyTransaction(documentId, transaction);
  },
};

export { untitledFilename };

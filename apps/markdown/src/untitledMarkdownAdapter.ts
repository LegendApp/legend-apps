import type {
  MarkdownDocumentAdapter,
} from "@legend-desktop/markdown-document";
import { nativeMarkdownDocumentAdapter } from "@legend-desktop/markdown-document";
import { createTemporaryTextFile, removeFile } from "@legend-desktop/file-dialog";

const untitledFilename = "Untitled.md";

type UntitledState = {
  temporaryPath: string;
};

const untitledSessions = new Map<string, UntitledState>();

export const untitledMarkdownAdapter: MarkdownDocumentAdapter = {
  async load() {
    const temporaryPath = await createTemporaryTextFile({
      prefix: "legend-markdown-untitled",
      extension: "md",
      contents: "",
    });

    try {
      const snapshot = await nativeMarkdownDocumentAdapter.load(temporaryPath);
      untitledSessions.set(snapshot.documentId, { temporaryPath });

      return {
        ...snapshot,
        filename: untitledFilename,
      };
    } catch (error) {
      try {
        await removeFile(temporaryPath);
      } catch {
        // Temporary file cleanup should not hide the original load failure.
      }
      throw error;
    }
  },
  getBlock(documentId, blockId) {
    return nativeMarkdownDocumentAdapter.getBlock(documentId, blockId);
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
  async close(documentId) {
    const session = untitledSessions.get(documentId);

    try {
      await nativeMarkdownDocumentAdapter.close(documentId);
    } finally {
      if (session) {
        untitledSessions.delete(documentId);
        try {
          await removeFile(session.temporaryPath);
        } catch {
          // Temporary file cleanup should not block closing the document.
        }
      }
    }
  },
  applyTransaction(documentId, transaction) {
    if (!nativeMarkdownDocumentAdapter.applyTransaction) {
      throw new Error("Native markdown transactions are unavailable.");
    }

    return nativeMarkdownDocumentAdapter.applyTransaction(documentId, transaction);
  },
};

export { untitledFilename };

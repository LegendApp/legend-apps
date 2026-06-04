import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import {
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentCommands,
  type MarkdownSaveState,
} from "@legend-desktop/markdown-document";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import { useCallback, useRef, useState } from "react";
import { markdownFileTypes } from "./appConstants";
import { addRecentMarkdownFile, removeRecentMarkdownFile } from "./appMetadata";
import { confirmDirtyDocumentTransition } from "./confirmDirtyDocumentTransition";
import { getDirectory, getFilename, isMarkdownPath } from "./markdownFiles";
import { clearLastMarkdownDocumentPath, setLastMarkdownDocumentPath } from "./markdownSettings";
import { untitledFilename, untitledMarkdownAdapter } from "./untitledMarkdownAdapter";

export type DocumentSource = "file" | "untitled";

type OpenUntitledDocumentOptions = {
  preserveError?: boolean;
};

export function useMarkdownDocumentSession() {
  const [filename, setFilename] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
  const [documentSource, setDocumentSource] = useState<DocumentSource>("untitled");
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);
  const preserveNextLoadedError = useRef(false);

  const hasDocument = filename !== null;
  const isUntitledDocument = documentSource === "untitled";
  const activeAdapter = isUntitledDocument ? untitledMarkdownAdapter : nativeMarkdownDocumentAdapter;

  const clearDocumentError = useCallback(() => {
    setLastError(null);
  }, []);

  const handleDocumentLoaded = useCallback(() => {
    if (preserveNextLoadedError.current) {
      preserveNextLoadedError.current = false;
    } else {
      setLastError(null);
    }
  }, []);

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setLastError(message);
  }, []);

  const markOpenedFile = useCallback((path: string) => {
    addRecentMarkdownFile(path);
    setLastMarkdownDocumentPath(path);
    noteRecentDocument(path);
  }, []);

  const openSelectedFile = useCallback((path: string) => {
    setDocumentSource("file");
    setFilename(path);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    markOpenedFile(path);
  }, [markOpenedFile]);

  const openUntitledDocument = useCallback((options: OpenUntitledDocumentOptions = {}) => {
    setDocumentSource("untitled");
    setFilename(untitledFilename);
    setIsDirty(false);
    setSaveState("idle");
    if (!options.preserveError) {
      setLastError(null);
    }
  }, []);

  const handleDocumentLoadError = useCallback((error: Error) => {
    handleError(error);

    if (documentSource === "file" && filename) {
      removeRecentMarkdownFile(filename);
      clearLastMarkdownDocumentPath(filename);
      preserveNextLoadedError.current = true;
      openUntitledDocument({ preserveError: true });
    }
  }, [documentSource, filename, handleError, openUntitledDocument]);

  const completeSaveAs = useCallback((path: string) => {
    setDocumentSource("file");
    setFilename(path);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    markOpenedFile(path);
  }, [markOpenedFile]);

  const saveCurrentDocumentAs = useCallback(async () => {
    if (!filename || !documentCommandsRef.current) {
      return false;
    }

    try {
      const path = await saveFileDialog({
        allowedFileTypes: markdownFileTypes,
        defaultName: isUntitledDocument ? untitledFilename : getFilename(filename),
        directory: isUntitledDocument ? undefined : getDirectory(filename),
      });

      if (!path) {
        return false;
      }

      await documentCommandsRef.current.saveAs(path);
      completeSaveAs(path);
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }, [completeSaveAs, filename, handleError, isUntitledDocument]);

  const saveCurrentDocument = useCallback(async () => {
    if (!documentCommandsRef.current) {
      return false;
    }

    if (isUntitledDocument) {
      return saveCurrentDocumentAs();
    }

    try {
      await documentCommandsRef.current.save();
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }, [handleError, isUntitledDocument, saveCurrentDocumentAs]);

  const flushCurrentDocumentBeforeTransition = useCallback(async (reason: "new" | "open" | "quit" = "open") => {
    if (!hasDocument || !isDirty) {
      return true;
    }

    const action = await confirmDirtyDocumentTransition({
      filename: filename ? getFilename(filename) : untitledFilename,
      reason,
    });

    if (action === "discard") {
      return true;
    }

    if (action === "save") {
      return saveCurrentDocument();
    }

    return false;
  }, [filename, hasDocument, isDirty, saveCurrentDocument]);

  const newMarkdownDocument = useCallback(async () => {
    const didFlush = await flushCurrentDocumentBeforeTransition("new");
    if (didFlush) {
      openUntitledDocument();
    }
  }, [flushCurrentDocumentBeforeTransition, openUntitledDocument]);

  const openMarkdownDialog = useCallback(async () => {
    if (openDialogInFlight.current) {
      return;
    }

    openDialogInFlight.current = true;

    try {
      const paths = await openFileDialog();
      const path = paths?.find(isMarkdownPath) ?? null;

      if (path) {
        const didFlush = await flushCurrentDocumentBeforeTransition("open");
        if (didFlush) {
          openSelectedFile(path);
        }
      }
    } catch (error) {
      handleError(error);
    } finally {
      openDialogInFlight.current = false;
    }
  }, [flushCurrentDocumentBeforeTransition, handleError, openSelectedFile]);

  return {
    activeAdapter,
    clearDocumentError,
    documentCommandsRef,
    filename,
    flushCurrentDocumentBeforeTransition,
    handleError,
    handleDocumentLoaded,
    hasDocument,
    handleDocumentLoadError,
    isDirty,
    isUntitledDocument,
    lastError,
    newMarkdownDocument,
    openMarkdownDialog,
    openSelectedFile,
    openUntitledDocument,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    saveState,
    setIsDirty,
    setSaveState,
  };
}

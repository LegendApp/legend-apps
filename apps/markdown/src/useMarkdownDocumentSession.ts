import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import {
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentCommands,
  type MarkdownSaveState,
} from "@legend-desktop/markdown-document";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import { useCallback, useRef, useState } from "react";
import { markdownFileTypes } from "./appConstants";
import { addRecentMarkdownFile } from "./appMetadata";
import { getDirectory, getFilename, isMarkdownPath } from "./markdownFiles";
import { setLastMarkdownDocumentPath } from "./markdownSettings";
import { untitledFilename, untitledMarkdownAdapter } from "./untitledMarkdownAdapter";

export type DocumentSource = "file" | "untitled";

export function useMarkdownDocumentSession() {
  const [filename, setFilename] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
  const [documentSource, setDocumentSource] = useState<DocumentSource>("untitled");
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);

  const hasDocument = filename !== null;
  const isUntitledDocument = documentSource === "untitled";
  const activeAdapter = isUntitledDocument ? untitledMarkdownAdapter : nativeMarkdownDocumentAdapter;

  const clearDocumentError = useCallback(() => {
    setLastError(null);
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

  const openUntitledDocument = useCallback(() => {
    setDocumentSource("untitled");
    setFilename(untitledFilename);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
  }, []);

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

  const flushCurrentDocumentBeforeTransition = useCallback(async () => {
    if (!hasDocument || !isDirty) {
      return true;
    }

    return saveCurrentDocument();
  }, [hasDocument, isDirty, saveCurrentDocument]);

  const openMarkdownDialog = useCallback(async () => {
    if (openDialogInFlight.current) {
      return;
    }

    openDialogInFlight.current = true;

    try {
      const didFlush = await flushCurrentDocumentBeforeTransition();
      if (!didFlush) {
        return;
      }

      const paths = await openFileDialog();
      const path = paths?.find(isMarkdownPath) ?? null;

      if (path) {
        openSelectedFile(path);
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
    hasDocument,
    isDirty,
    isUntitledDocument,
    lastError,
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

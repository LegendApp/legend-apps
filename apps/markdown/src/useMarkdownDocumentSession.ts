import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import {
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentCommandState,
  type MarkdownDocumentCommands,
  type MarkdownSaveState,
} from "@legend-desktop/markdown-document";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useRef } from "react";
import { markdownFileTypes } from "./appConstants";
import { addRecentMarkdownFile, removeRecentMarkdownFile } from "./appMetadata";
import { confirmDirtyDocumentTransition } from "./confirmDirtyDocumentTransition";
import { getDirectory, getFilename, isMarkdownPath } from "./markdownFiles";
import { clearLastMarkdownDocumentPath, setLastMarkdownDocumentPath } from "./markdownSettings";
import { untitledFilename, untitledMarkdownAdapter } from "./untitledMarkdownAdapter";

export type DocumentSource = "file" | "untitled";

export type MarkdownDocumentSessionState = {
  commandState: MarkdownDocumentCommandState;
  documentSource: DocumentSource;
  filename: string | null;
  isDirty: boolean;
  lastError: string | null;
  saveState: MarkdownSaveState;
};

export type MarkdownDocumentSessionState$ = Observable<MarkdownDocumentSessionState>;

type OpenUntitledDocumentOptions = {
  preserveError?: boolean;
};

export function useMarkdownDocumentSession() {
  const sessionState$ = useObservable<MarkdownDocumentSessionState>({
    commandState: { canRedo: false, canUndo: false },
    documentSource: "untitled",
    filename: null,
    isDirty: false,
    lastError: null,
    saveState: "idle",
  });
  const filename = useValue(sessionState$.filename);
  const lastError = useValue(sessionState$.lastError);
  const documentSource = useValue(sessionState$.documentSource);
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);
  const preserveNextLoadedError = useRef(false);

  const hasDocument = filename !== null;
  const isUntitledDocument = documentSource === "untitled";
  const activeAdapter = isUntitledDocument ? untitledMarkdownAdapter : nativeMarkdownDocumentAdapter;

  const clearDocumentError = useCallback(() => {
    sessionState$.lastError.set(null);
  }, [sessionState$]);

  const handleDocumentLoaded = useCallback(() => {
    if (preserveNextLoadedError.current) {
      preserveNextLoadedError.current = false;
    } else {
      sessionState$.lastError.set(null);
    }
  }, [sessionState$]);

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    sessionState$.lastError.set(message);
  }, [sessionState$]);

  const setCommandState = useCallback((commandState: MarkdownDocumentCommandState) => {
    sessionState$.commandState.set(commandState);
  }, [sessionState$]);

  const setIsDirty = useCallback((isDirty: boolean) => {
    sessionState$.isDirty.set(isDirty);
  }, [sessionState$]);

  const setSaveState = useCallback((saveState: MarkdownSaveState) => {
    sessionState$.saveState.set(saveState);
  }, [sessionState$]);

  const markOpenedFile = useCallback((path: string) => {
    addRecentMarkdownFile(path);
    setLastMarkdownDocumentPath(path);
    noteRecentDocument(path);
  }, []);

  const openSelectedFile = useCallback((path: string) => {
    sessionState$.assign({
      documentSource: "file",
      filename: path,
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
    markOpenedFile(path);
  }, [markOpenedFile, sessionState$]);

  const openUntitledDocument = useCallback((options: OpenUntitledDocumentOptions = {}) => {
    sessionState$.assign({
      documentSource: "untitled",
      filename: untitledFilename,
      isDirty: false,
      lastError: options.preserveError ? sessionState$.lastError.peek() : null,
      saveState: "idle",
    });
  }, [sessionState$]);

  const handleDocumentLoadError = useCallback((error: Error) => {
    handleError(error);
    const state = sessionState$.peek();

    if (state.documentSource === "file" && state.filename) {
      removeRecentMarkdownFile(state.filename);
      clearLastMarkdownDocumentPath(state.filename);
      preserveNextLoadedError.current = true;
      openUntitledDocument({ preserveError: true });
    }
  }, [handleError, openUntitledDocument, sessionState$]);

  const completeSaveAs = useCallback((path: string) => {
    sessionState$.assign({
      documentSource: "file",
      filename: path,
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
    markOpenedFile(path);
  }, [markOpenedFile, sessionState$]);

  const saveCurrentDocumentAs = useCallback(async () => {
    const state = sessionState$.peek();
    if (!state.filename || !documentCommandsRef.current) {
      return false;
    }

    try {
      const path = await saveFileDialog({
        allowedFileTypes: markdownFileTypes,
        defaultName: state.documentSource === "untitled" ? untitledFilename : getFilename(state.filename),
        directory: state.documentSource === "untitled" ? undefined : getDirectory(state.filename),
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
  }, [completeSaveAs, handleError, sessionState$]);

  const saveCurrentDocument = useCallback(async () => {
    if (!documentCommandsRef.current) {
      return false;
    }

    if (sessionState$.documentSource.peek() === "untitled") {
      return saveCurrentDocumentAs();
    }

    try {
      await documentCommandsRef.current.save();
      return true;
    } catch (error) {
      handleError(error);
      return false;
    }
  }, [handleError, saveCurrentDocumentAs, sessionState$]);

  const flushCurrentDocumentBeforeTransition = useCallback(async (reason: "new" | "open" | "quit" = "open") => {
    const state = sessionState$.peek();
    if (!state.filename || !state.isDirty) {
      return true;
    }

    const action = await confirmDirtyDocumentTransition({
      filename: getFilename(state.filename),
      reason,
    });

    if (action === "discard") {
      return true;
    }

    if (action === "save") {
      return saveCurrentDocument();
    }

    return false;
  }, [saveCurrentDocument, sessionState$]);

  const prepareCurrentDocumentForClose = useCallback(async ({ autosaveEnabled }: { autosaveEnabled: boolean }) => {
    const state = sessionState$.peek();
    if (!state.filename || !state.isDirty) {
      return true;
    }

    if (state.documentSource !== "untitled" && autosaveEnabled) {
      return saveCurrentDocument();
    }

    const action = await confirmDirtyDocumentTransition({
      filename: getFilename(state.filename),
      reason: "close",
    });

    if (action === "discard") {
      return true;
    }

    if (action === "save") {
      return saveCurrentDocument();
    }

    return false;
  }, [saveCurrentDocument, sessionState$]);

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
    isUntitledDocument,
    lastError,
    newMarkdownDocument,
    openMarkdownDialog,
    openSelectedFile,
    openUntitledDocument,
    prepareCurrentDocumentForClose,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    sessionState$,
    setCommandState,
    setIsDirty,
    setSaveState,
  };
}

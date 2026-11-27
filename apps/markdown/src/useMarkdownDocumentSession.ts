import { openFileDialog, saveFileDialog } from "@legendapp/spark/dialogs";
import {
  isMarkdownFileConflictError,
  type MarkdownDocumentCommandState,
  type MarkdownDocumentCommands,
  type MarkdownSaveState,
} from "@legend-apps/markdown-document";
import { noteRecentDocument } from "@legendapp/spark/app/documents";
import type { Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { useCallback, useRef } from "react";
import { markdownFileTypes } from "./appConstants";
import { addRecentMarkdownFile, removeRecentMarkdownFile } from "./appMetadata";
import { confirmDirtyDocumentTransition } from "./confirmDirtyDocumentTransition";
import { getDirectory, getFilename, isMarkdownPath } from "./markdownFiles";
import { clearLastMarkdownDocumentPath, setLastMarkdownDocumentPath } from "./markdownSettings";
import { isMarkdownDraft, removeMarkdownDraft } from "./markdownDrafts";

export type DocumentSource = "file" | "draft";

export type MarkdownDocumentSessionState = {
  conflict: "changed" | "missing" | null;
  commandState: MarkdownDocumentCommandState;
  documentSource: DocumentSource;
  filename: string | null;
  isDirty: boolean;
  lastError: string | null;
  saveState: MarkdownSaveState;
};

export type MarkdownDocumentSessionState$ = Observable<MarkdownDocumentSessionState>;

export type MarkdownDocumentSessionOptions = {
  onOpenFile: (path: string) => void;
  onFileSavedAs: (from: string, to: string) => void;
};

function markOpenedFile(path: string) {
  addRecentMarkdownFile(path);
  setLastMarkdownDocumentPath(path);
  noteRecentDocument(path);
}

export function useMarkdownDocumentSession({ onOpenFile, onFileSavedAs }: MarkdownDocumentSessionOptions) {
  const sessionState$ = useObservable<MarkdownDocumentSessionState>({
    conflict: null,
    commandState: { canCommitAndBlur: false, canRedo: false, canUndo: false },
    documentSource: "file",
    filename: null,
    isDirty: false,
    lastError: null,
    saveState: "idle",
  });
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);
  const documentGenerationRef = useRef(0);

  const handleDocumentLoaded = useCallback(() => {
    documentGenerationRef.current += 1;
    if (sessionState$.lastError.peek()) sessionState$.lastError.set(null);
    const { documentSource, filename } = sessionState$.peek();
    if (filename && documentSource === "file") markOpenedFile(filename);
  }, [sessionState$]);

  const handleError = useCallback((error: unknown) => {
    if (isMarkdownFileConflictError(error)) return;
    const message = error instanceof Error ? error.message : String(error);
    sessionState$.lastError.set(message);
  }, [sessionState$]);

  const setCommandState = useCallback((commandState: MarkdownDocumentCommandState) => {
    sessionState$.commandState.set(commandState);
  }, [sessionState$]);

  const setIsDirty = useCallback((isDirty: boolean) => {
    sessionState$.isDirty.set(isDirty);
  }, [sessionState$]);

  const setConflict = useCallback((conflict: "changed" | "missing" | null) => {
    sessionState$.conflict.set(conflict);
  }, [sessionState$]);

  const useDiskVersion = useCallback(() => {
    if (sessionState$.conflict.peek() === "changed") documentCommandsRef.current?.reload();
  }, [sessionState$]);

  const overwriteWithLocal = useCallback(async () => {
    try {
      await documentCommandsRef.current?.overwrite();
      sessionState$.lastError.set(null);
    } catch (error) {
      handleError(error);
    }
  }, [handleError, sessionState$]);

  const setSaveState = useCallback((saveState: MarkdownSaveState) => {
    sessionState$.saveState.set(saveState);
  }, [sessionState$]);

  const openSelectedFile = useCallback((path: string) => {
    if (sessionState$.filename.peek() === path) return;
    documentGenerationRef.current += 1;
    sessionState$.assign({
      conflict: null,
      documentSource: isMarkdownDraft(path) ? "draft" : "file",
      filename: path,
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
  }, [sessionState$]);

  const handleDocumentLoadError = useCallback((error: Error) => {
    handleError(error);
    const { documentSource, filename } = sessionState$.peek();
    if (documentSource === "file" && filename) {
      removeRecentMarkdownFile(filename);
      clearLastMarkdownDocumentPath(filename);
    }
  }, [handleError, sessionState$]);

  const completeSaveAs = useCallback((from: string, path: string) => {
    documentGenerationRef.current += 1;
    sessionState$.assign({
      conflict: null,
      documentSource: "file",
      filename: path,
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
    markOpenedFile(path);
    onFileSavedAs(from, path);
  }, [onFileSavedAs, sessionState$]);

  const saveCurrentDocumentAs = useCallback(async (saveSeparately = false) => {
    const state = sessionState$.peek();
    if (!state.filename || !documentCommandsRef.current) {
      return false;
    }

    const documentGeneration = documentGenerationRef.current;
    const originalFilename = state.filename;
    const isCurrentDocument = () => sessionState$.filename.peek() === originalFilename
      && documentGenerationRef.current === documentGeneration;
    let defaultName = getFilename(originalFilename);
    if (saveSeparately) defaultName = defaultName.replace(/(\.[^.]+)?$/, " copy$1");
    const isDraft = state.documentSource === "draft";
    const directory = isDraft ? undefined : getDirectory(originalFilename);

    try {
      const result = await saveFileDialog({
        filters: [{ extensions: markdownFileTypes }],
        defaultName,
        defaultPath: directory,
      });

      const path = result.canceled ? null : result.path;
      if (!path || !isCurrentDocument() || !documentCommandsRef.current) {
        return false;
      }

      if (isMarkdownDraft(path)) {
        throw new Error("Choose a destination outside Markdown's drafts folder.");
      }
      if (saveSeparately && path === originalFilename) {
        throw new Error("Choose a different filename to save your local version separately.");
      }
      await documentCommandsRef.current.saveAs(path);
      if (!isCurrentDocument()) return false;
      completeSaveAs(originalFilename, path);
      if (isDraft) {
        try {
          removeMarkdownDraft(originalFilename);
        } catch (error) {
          handleError(error);
        }
      }
      return true;
    } catch (error) {
      if (isCurrentDocument()) handleError(error);
      return false;
    }
  }, [completeSaveAs, handleError, sessionState$]);

  const saveCurrentDocument = useCallback(async () => {
    if (!documentCommandsRef.current) {
      return false;
    }

    if (sessionState$.documentSource.peek() === "draft") {
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

  const prepareCurrentDocumentForClose = useCallback(async ({
    autosaveEnabled,
    reason = "close",
  }: {
    autosaveEnabled: boolean;
    reason?: "close" | "quit";
  }) => {
    const state = sessionState$.peek();
    if (!state.filename || (!state.isDirty && !state.conflict)) {
      return true;
    }

    if (state.documentSource !== "draft" && autosaveEnabled && !state.conflict) {
      return saveCurrentDocument();
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

  const openMarkdownDialog = useCallback(async () => {
    if (openDialogInFlight.current) {
      return;
    }

    openDialogInFlight.current = true;
    const markdownFileTypeList = markdownFileTypes.map((type) => `.${type}`).join(", ");

    try {
      const result = await openFileDialog({
        filters: [{ extensions: markdownFileTypes }],
        selection: "files",
      });
      const paths = result.canceled ? [] : result.paths;
      let path: string | null = null;
      if (paths) {
        const markdownPath = paths.find(isMarkdownPath);
        if (markdownPath) {
          path = markdownPath;
        }
      }

      if (path) {
        onOpenFile(path);
      } else {
        let hasSelectedInvalidFile = false;
        if (paths) {
          if (paths.length > 0) {
            hasSelectedInvalidFile = true;
          }
        }
        if (hasSelectedInvalidFile) {
          handleError(new Error(`Choose a Markdown file (${markdownFileTypeList}).`));
        }
      }
    } catch (error) {
      openDialogInFlight.current = false;
      handleError(error);
      return;
    }

    openDialogInFlight.current = false;
  }, [handleError, onOpenFile]);

  return {
    documentCommandsRef,
    handleError,
    handleDocumentLoaded,
    handleDocumentLoadError,
    openMarkdownDialog,
    openSelectedFile,
    prepareCurrentDocumentForClose,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    sessionState$,
    setConflict,
    useDiskVersion,
    overwriteWithLocal,
    setCommandState,
    setIsDirty,
    setSaveState,
  };
}

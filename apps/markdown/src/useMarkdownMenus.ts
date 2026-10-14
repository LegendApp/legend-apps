import type {
  MarkdownDocumentCommands,
} from "@legend-apps/markdown-document";
import { revealInFileManager } from "@legendapp/spark/files";
import type { MarkdownMenuHandlers } from "./markdownEditorActions";
import { markdownMenuState$ } from "./markdownMenus";
import { useObserveEffect } from "@legendapp/state/react";
import { useEffect, useMemo, type RefObject } from "react";
import { markdownMenuOwnerId } from "./appConstants";
import { registerMarkdownEditorMenuHandlers } from "./markdownEditorActions";
import {
  decreaseMarkdownFontSizeSetting,
  increaseMarkdownFontSizeSetting,
  resetMarkdownFontSizeSetting,
} from "./markdownSettings";
import type { MarkdownDocumentSessionState, MarkdownDocumentSessionState$ } from "./useMarkdownDocumentSession";

type MarkdownMenuOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
  onError: (error: unknown) => void;
  onNewDocument: () => Promise<void>;
  onOpenDocument: () => Promise<void>;
  onOpenSettings: () => void;
  onInsertLink: () => void;
  onFind: () => void;
  onSaveDocument: () => Promise<boolean>;
  onSaveDocumentAs: () => Promise<boolean>;
  sessionState$: MarkdownDocumentSessionState$;
};

function getCurrentFilePath(state: MarkdownDocumentSessionState) {
  return state.documentSource === "untitled" ? null : state.filename;
}

const disabledDocumentMenuItems = [
  "save",
  "saveAs",
  "revealInFinder",
  "undo",
  "redo",
  "selectAll",
  "find",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "spoiler",
  "link",
];

function disableDocumentMenuItems() {
  markdownMenuState$.set(Object.fromEntries(disabledDocumentMenuItems.map(id => [id, { disabled: true }])));
}

export function useMarkdownMenus({
  documentCommandsRef,
  onError,
  onNewDocument,
  onOpenDocument,
  onOpenSettings,
  onInsertLink,
  onFind,
  onSaveDocument,
  onSaveDocumentAs,
  sessionState$,
}: MarkdownMenuOptions) {
  const menuHandlers = useMemo<MarkdownMenuHandlers>(() => ({
    bold: () => documentCommandsRef.current?.toggleBold(),
    decreaseFontSize: decreaseMarkdownFontSizeSetting,
    italic: () => documentCommandsRef.current?.toggleItalic(),
    increaseFontSize: increaseMarkdownFontSizeSetting,
    link: onInsertLink,
    new: () => {
      onNewDocument().catch(onError);
    },
    open: () => {
      onOpenDocument().catch(onError);
    },
    redo: () => documentCommandsRef.current?.redo(),
    selectAll: () => documentCommandsRef.current?.selectAll(),
    find: onFind,
    revealInFinder: () => {
      const currentFilePath = getCurrentFilePath(sessionState$.peek());
      if (currentFilePath) {
        revealInFileManager(currentFilePath)
          .catch(onError);
      }
    },
    save: () => {
      onSaveDocument().catch(onError);
    },
    saveAs: () => {
      onSaveDocumentAs().catch(onError);
    },
    settings: onOpenSettings,
    resetFontSize: resetMarkdownFontSizeSetting,
    spoiler: () => documentCommandsRef.current?.toggleSpoiler(),
    strikethrough: () => documentCommandsRef.current?.toggleStrikethrough(),
    underline: () => documentCommandsRef.current?.toggleUnderline(),
    undo: () => documentCommandsRef.current?.undo(),
  }), [
    documentCommandsRef,
    onError,
    onNewDocument,
    onOpenDocument,
    onOpenSettings,
    onInsertLink,
    onFind,
    onSaveDocument,
    onSaveDocumentAs,
    sessionState$,
  ]);

  useEffect(() => {
    const unregister = registerMarkdownEditorMenuHandlers(menuHandlers);

    return () => {
      unregister();
      disableDocumentMenuItems();
    };
  }, [menuHandlers]);

  useObserveEffect(() => {
    const state = sessionState$.get();
    const hasDocument = state.filename !== null;
    const currentFilePath = getCurrentFilePath(state);

    markdownMenuState$.set(Object.fromEntries([
      { id: "save", enabled: hasDocument && state.isDirty && state.saveState !== "saving" },
      { id: "saveAs", enabled: hasDocument && state.saveState !== "saving" },
      { id: "revealInFinder", enabled: currentFilePath !== null },
      { id: "settings", enabled: true },
      { id: "undo", enabled: hasDocument && state.commandState.canUndo },
      { id: "redo", enabled: hasDocument && state.commandState.canRedo },
      { id: "selectAll", enabled: hasDocument },
      { id: "find", enabled: hasDocument },
      { id: "bold", enabled: hasDocument },
      { id: "italic", enabled: hasDocument },
      { id: "underline", enabled: hasDocument },
      { id: "strikethrough", enabled: hasDocument },
      { id: "spoiler", enabled: hasDocument },
      { id: "link", enabled: hasDocument },
    ].map(({ id, enabled }) => [id, { disabled: !enabled }])));
  }, [sessionState$]);
}

import type {
  MarkdownDocumentCommands,
} from "@legend-apps/markdown-document";
import { revealInFileManager } from "@legendapp/spark/files";
import type { MarkdownMenuHandlers } from "./markdownEditorActions";
import { markdownMenuState$ } from "./markdownMenus";
import { useObserveEffect } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { refreshMarkdownEditorMenuState, registerMarkdownEditorMenuHandlers } from "./markdownEditorActions";
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
  onSaveDocument: () => Promise<boolean>;
  onSaveDocumentAs: () => Promise<boolean>;
  onSaveWorkspace: () => Promise<void>;
  onToggleSidebar: () => void;
  sessionState$: MarkdownDocumentSessionState$;
  windowId: string;
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
  onSaveDocument,
  onSaveDocumentAs,
  onSaveWorkspace,
  onToggleSidebar,
  sessionState$,
  windowId,
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
    saveWorkspace: () => {
      onSaveWorkspace().catch(onError);
    },
    settings: onOpenSettings,
    resetFontSize: resetMarkdownFontSizeSetting,
    spoiler: () => documentCommandsRef.current?.toggleSpoiler(),
    strikethrough: () => documentCommandsRef.current?.toggleStrikethrough(),
    toggleSidebar: onToggleSidebar,
    underline: () => documentCommandsRef.current?.toggleUnderline(),
    undo: () => documentCommandsRef.current?.undo(),
  }), [
    documentCommandsRef,
    onError,
    onNewDocument,
    onOpenDocument,
    onOpenSettings,
    onInsertLink,
    onSaveDocument,
    onSaveDocumentAs,
    onSaveWorkspace,
    onToggleSidebar,
    sessionState$,
  ]);

  const refreshMenuState = useCallback(() => {
    const state = sessionState$.peek();
    const hasDocument = state.filename !== null;
    const currentFilePath = getCurrentFilePath(state);

    markdownMenuState$.set(Object.fromEntries([
      { id: "save", enabled: hasDocument && state.isDirty && state.saveState !== "saving" },
      { id: "saveAs", enabled: hasDocument && state.saveState !== "saving" },
      { id: "revealInFinder", enabled: currentFilePath !== null },
      { id: "settings", enabled: true },
      { id: "undo", enabled: hasDocument && state.commandState.canUndo },
      { id: "redo", enabled: hasDocument && state.commandState.canRedo },
      { id: "bold", enabled: hasDocument },
      { id: "italic", enabled: hasDocument },
      { id: "underline", enabled: hasDocument },
      { id: "strikethrough", enabled: hasDocument },
      { id: "spoiler", enabled: hasDocument },
      { id: "link", enabled: hasDocument },
    ].map(({ id, enabled }) => [id, { disabled: !enabled }])));
  }, [sessionState$]);

  useEffect(() => {
    const unregister = registerMarkdownEditorMenuHandlers(windowId, menuHandlers, refreshMenuState);
    refreshMarkdownEditorMenuState();
    return () => {
      unregister();
      if (!refreshMarkdownEditorMenuState()) disableDocumentMenuItems();
    };
  }, [menuHandlers, refreshMenuState, windowId]);

  useObserveEffect(() => {
    sessionState$.get();
    refreshMarkdownEditorMenuState();
  }, [sessionState$]);
}

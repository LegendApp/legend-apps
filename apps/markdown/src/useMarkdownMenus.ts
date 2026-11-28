import type {
  MarkdownDocumentCommands,
} from "@legend-apps/markdown-document";
import { revealInFileManager } from "@legendapp/spark/files";
import type { MarkdownMenuHandlers } from "./markdownEditorActions";
import { markdownMenuState$ } from "./markdownMenus";
import type { Observable } from "@legendapp/state";
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
  /** While the Assistant composer has keyboard focus, document editing commands are disabled. */
  composerFocused$: Observable<boolean>;
  /** Whether the window has root folders, which New Folder needs. */
  hasFolders: boolean;
  onAddFolder: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onNewTab: () => void;
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
  onError: (error: unknown) => void;
  onOpenDocument: () => Promise<void>;
  onOpenSettings: () => void;
  onInsertLink: () => void;
  onFind: () => void;
  onSaveDocument: () => Promise<boolean>;
  onSaveDocumentAs: () => Promise<boolean>;
  onSaveWorkspace: () => Promise<void>;
  onToggleAssistant: () => void;
  /** Close Tab, Close Window and the split pane commands of the window. */
  paneCommands: Record<MarkdownPaneMenuItem, () => void>;
  paneCommandState: { canSplitDown: boolean; canSplitRight: boolean; hasOtherPanes: boolean };
  sessionState$: MarkdownDocumentSessionState$;
  windowId: string;
};

export const markdownPaneMenuItems = ["closeTab", "closeWindow", "splitRight", "splitDown", "closePane", "closeOtherPanes", "focusNextPane", "focusPreviousPane"] as const;

type MarkdownPaneMenuItem = (typeof markdownPaneMenuItems)[number];

function getCurrentFilePath(state: MarkdownDocumentSessionState) {
  return state.documentSource === "draft" ? null : state.filename;
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
  "newTab",
  "newFolder",
  ...markdownPaneMenuItems.filter(id => id !== "closeTab"),
];

function disableDocumentMenuItems() {
  markdownMenuState$.set(Object.fromEntries(disabledDocumentMenuItems.map(id => [id, { disabled: true }])));
}

export function useMarkdownMenus({
  composerFocused$,
  hasFolders,
  onAddFolder,
  onNewFile,
  onNewFolder,
  onNewTab,
  documentCommandsRef,
  onError,
  onOpenDocument,
  onOpenSettings,
  onInsertLink,
  onFind,
  onSaveDocument,
  onSaveDocumentAs,
  onSaveWorkspace,
  onToggleAssistant,
  paneCommands,
  paneCommandState,
  sessionState$,
  windowId,
}: MarkdownMenuOptions) {
  const menuHandlers = useMemo<MarkdownMenuHandlers>(() => ({
    ...paneCommands,
    addFolder: onAddFolder,
    assistant: onToggleAssistant,
    newFile: onNewFile,
    newFolder: onNewFolder,
    newTab: onNewTab,
    bold: () => documentCommandsRef.current?.toggleBold(),
    decreaseFontSize: decreaseMarkdownFontSizeSetting,
    italic: () => documentCommandsRef.current?.toggleItalic(),
    increaseFontSize: increaseMarkdownFontSizeSetting,
    link: onInsertLink,
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
    saveWorkspace: () => {
      onSaveWorkspace().catch(onError);
    },
    settings: onOpenSettings,
    resetFontSize: resetMarkdownFontSizeSetting,
    spoiler: () => documentCommandsRef.current?.toggleSpoiler(),
    strikethrough: () => documentCommandsRef.current?.toggleStrikethrough(),
    underline: () => documentCommandsRef.current?.toggleUnderline(),
    undo: () => documentCommandsRef.current?.undo(),
  }), [
    onAddFolder,
    onNewFile,
    onNewFolder,
    onNewTab,
    documentCommandsRef,
    onError,
    onOpenDocument,
    onOpenSettings,
    onInsertLink,
    onFind,
    onSaveDocument,
    onSaveDocumentAs,
    onSaveWorkspace,
    onToggleAssistant,
    paneCommands,
    sessionState$,
  ]);

  const refreshMenuState = useCallback(() => {
    const state = sessionState$.peek();
    const hasDocument = state.filename !== null;
    const canEdit = hasDocument && !composerFocused$.peek();
    const currentFilePath = getCurrentFilePath(state);

    markdownMenuState$.set(Object.fromEntries([
      { id: "save", enabled: hasDocument && (state.isDirty || state.documentSource === "draft") && state.saveState !== "saving" },
      { id: "saveAs", enabled: hasDocument && state.saveState !== "saving" },
      { id: "revealInFinder", enabled: currentFilePath !== null },
      { id: "settings", enabled: true },
      { id: "undo", enabled: canEdit && state.commandState.canUndo },
      { id: "redo", enabled: canEdit && state.commandState.canRedo },
      { id: "selectAll", enabled: canEdit },
      { id: "find", enabled: canEdit },
      { id: "bold", enabled: canEdit },
      { id: "italic", enabled: canEdit },
      { id: "underline", enabled: canEdit },
      { id: "strikethrough", enabled: canEdit },
      { id: "spoiler", enabled: canEdit },
      { id: "link", enabled: canEdit },
      { id: "newTab", enabled: true },
      { id: "newFolder", enabled: hasFolders },
      { id: "closeWindow", enabled: true },
      { id: "splitRight", enabled: paneCommandState.canSplitRight },
      { id: "splitDown", enabled: paneCommandState.canSplitDown },
      { id: "closePane", enabled: paneCommandState.hasOtherPanes },
      { id: "closeOtherPanes", enabled: paneCommandState.hasOtherPanes },
      { id: "focusNextPane", enabled: paneCommandState.hasOtherPanes },
      { id: "focusPreviousPane", enabled: paneCommandState.hasOtherPanes },
    ].map(({ id, enabled }) => [id, { disabled: !enabled }])));
  }, [composerFocused$, hasFolders, paneCommandState, sessionState$]);

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
    composerFocused$.get();
    refreshMarkdownEditorMenuState();
  }, [composerFocused$, sessionState$]);
}

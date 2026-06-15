import type {
  MarkdownDocumentCommands,
} from "@legend-desktop/markdown-document";
import { revealInFinder } from "@legend-desktop/file-dialog";
import {
  updateMenuItems,
  useNativeMenu,
  type NativeMenuActionHandlers,
} from "@legend-desktop/native-menu";
import { useObserveEffect } from "@legendapp/state/react";
import { useMemo, type RefObject } from "react";
import { markdownMenuOwnerId } from "./appConstants";
import { markdownMenuConfig } from "./markdownMenus";
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
  onSaveDocument: () => Promise<boolean>;
  onSaveDocumentAs: () => Promise<boolean>;
  sessionState$: MarkdownDocumentSessionState$;
};

function getCurrentFilePath(state: MarkdownDocumentSessionState) {
  return state.documentSource === "untitled" ? null : state.filename;
}

export function useMarkdownMenus({
  documentCommandsRef,
  onError,
  onNewDocument,
  onOpenDocument,
  onOpenSettings,
  onSaveDocument,
  onSaveDocumentAs,
  sessionState$,
}: MarkdownMenuOptions) {
  const menuHandlers = useMemo<NativeMenuActionHandlers>(() => ({
    bold: () => documentCommandsRef.current?.toggleBold(),
    decreaseFontSize: decreaseMarkdownFontSizeSetting,
    italic: () => documentCommandsRef.current?.toggleItalic(),
    increaseFontSize: increaseMarkdownFontSizeSetting,
    link: () => documentCommandsRef.current?.insertLink(),
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
        revealInFinder(currentFilePath)
          .then((didReveal) => {
            if (!didReveal) {
              onError(new Error("Unable to reveal document in Finder."));
            }
          })
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
    onSaveDocument,
    onSaveDocumentAs,
    sessionState$,
  ]);

  useNativeMenu({
    handlers: menuHandlers,
    menus: markdownMenuConfig,
    ownerId: markdownMenuOwnerId,
  });

  useObserveEffect(() => {
    const state = sessionState$.get();
    const hasDocument = state.filename !== null;
    const currentFilePath = getCurrentFilePath(state);

    updateMenuItems(markdownMenuOwnerId, [
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
    ]);
  }, [sessionState$]);
}

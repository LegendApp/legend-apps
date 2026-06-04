import type {
  MarkdownDocumentCommands,
  MarkdownDocumentCommandState,
  MarkdownSaveState,
} from "@legend-desktop/markdown-document";
import { revealInFinder } from "@legend-desktop/file-dialog";
import {
  updateMenuItems,
  useNativeMenu,
  type NativeMenuActionHandlers,
} from "@legend-desktop/native-menu";
import { useEffect, useMemo, type RefObject } from "react";
import { markdownMenuOwnerId } from "./appConstants";
import { markdownMenuConfig } from "./markdownMenus";
import {
  decreaseMarkdownFontSizeSetting,
  increaseMarkdownFontSizeSetting,
  resetMarkdownFontSizeSetting,
} from "./markdownSettings";

type MarkdownMenuOptions = {
  currentFilePath: string | null;
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
  documentCommandState: MarkdownDocumentCommandState;
  hasDocument: boolean;
  isDirty: boolean;
  onError: (error: unknown) => void;
  onNewDocument: () => Promise<void>;
  onOpenDocument: () => Promise<void>;
  onOpenSettings: () => void;
  onSaveDocument: () => Promise<boolean>;
  onSaveDocumentAs: () => Promise<boolean>;
  saveState: MarkdownSaveState;
};

export function useMarkdownMenus({
  currentFilePath,
  documentCommandsRef,
  documentCommandState,
  hasDocument,
  isDirty,
  onError,
  onNewDocument,
  onOpenDocument,
  onOpenSettings,
  onSaveDocument,
  onSaveDocumentAs,
  saveState,
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
    currentFilePath,
    onError,
    onNewDocument,
    onOpenDocument,
    onOpenSettings,
    onSaveDocument,
    onSaveDocumentAs,
  ]);

  useNativeMenu({
    handlers: menuHandlers,
    menus: markdownMenuConfig,
    ownerId: markdownMenuOwnerId,
  });

  useEffect(() => {
    updateMenuItems(markdownMenuOwnerId, [
      { id: "save", enabled: hasDocument && isDirty && saveState !== "saving" },
      { id: "saveAs", enabled: hasDocument && saveState !== "saving" },
      { id: "revealInFinder", enabled: currentFilePath !== null },
      { id: "settings", enabled: true },
      { id: "undo", enabled: hasDocument && documentCommandState.canUndo },
      { id: "redo", enabled: hasDocument && documentCommandState.canRedo },
      { id: "bold", enabled: hasDocument },
      { id: "italic", enabled: hasDocument },
      { id: "underline", enabled: hasDocument },
      { id: "strikethrough", enabled: hasDocument },
      { id: "spoiler", enabled: hasDocument },
      { id: "link", enabled: hasDocument },
    ]);
  }, [currentFilePath, documentCommandState, hasDocument, isDirty, saveState]);
}

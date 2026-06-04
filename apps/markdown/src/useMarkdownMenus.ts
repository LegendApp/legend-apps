import type { MarkdownDocumentCommands, MarkdownSaveState } from "@legend-desktop/markdown-document";
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
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
  hasDocument: boolean;
  isDirty: boolean;
  onError: (error: unknown) => void;
  onOpenDocument: () => Promise<void>;
  onOpenSettings: () => void;
  onSaveDocument: () => Promise<boolean>;
  onSaveDocumentAs: () => Promise<boolean>;
  saveState: MarkdownSaveState;
};

export function useMarkdownMenus({
  documentCommandsRef,
  hasDocument,
  isDirty,
  onError,
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
    open: () => {
      onOpenDocument().catch(onError);
    },
    redo: () => documentCommandsRef.current?.redo(),
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
      { id: "settings", enabled: true },
      { id: "undo", enabled: hasDocument },
      { id: "redo", enabled: hasDocument },
      { id: "bold", enabled: hasDocument },
      { id: "italic", enabled: hasDocument },
      { id: "underline", enabled: hasDocument },
      { id: "strikethrough", enabled: hasDocument },
      { id: "spoiler", enabled: hasDocument },
      { id: "link", enabled: hasDocument },
    ]);
  }, [hasDocument, isDirty, saveState]);
}

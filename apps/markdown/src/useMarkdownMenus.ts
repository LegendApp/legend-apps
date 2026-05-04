import type { MarkdownDocumentCommands, MarkdownSaveState } from "@legend-desktop/markdown-document";
import {
  addNativeMenuActionListener,
  clearMenus,
  configureMenus,
  updateMenuItems,
} from "@legend-desktop/native-menu";
import { useEffect, type RefObject } from "react";
import { markdownMenuOwnerId } from "./appConstants";
import { markdownMenuConfig } from "./markdownMenus";

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
  useEffect(() => {
    configureMenus(markdownMenuOwnerId, markdownMenuConfig);

    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId !== markdownMenuOwnerId) {
        return;
      }

      const commandActions: Record<string, (() => void) | undefined> = {
        bold: () => documentCommandsRef.current?.toggleBold(),
        italic: () => documentCommandsRef.current?.toggleItalic(),
        link: () => documentCommandsRef.current?.insertLink(),
        redo: () => documentCommandsRef.current?.redo(),
        spoiler: () => documentCommandsRef.current?.toggleSpoiler(),
        strikethrough: () => documentCommandsRef.current?.toggleStrikethrough(),
        underline: () => documentCommandsRef.current?.toggleUnderline(),
        undo: () => documentCommandsRef.current?.undo(),
      };

      if (action.itemId === "open") {
        onOpenDocument().catch(onError);
      } else if (action.itemId === "settings") {
        onOpenSettings();
      } else if (action.itemId === "save") {
        onSaveDocument().catch(onError);
      } else if (action.itemId === "saveAs") {
        onSaveDocumentAs().catch(onError);
      } else {
        commandActions[action.itemId]?.();
      }
    });

    return () => {
      subscription.remove();
      clearMenus(markdownMenuOwnerId);
    };
  }, [
    documentCommandsRef,
    onError,
    onOpenDocument,
    onOpenSettings,
    onSaveDocument,
    onSaveDocumentAs,
  ]);

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

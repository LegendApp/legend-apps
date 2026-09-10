import { useHotkeys } from "@legend-apps/hotkeys";
import { addKeyDownListener, KeyCodes } from "@legend-apps/keyboard-manager";
import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { useEffect, useMemo, type RefObject } from "react";
import { Platform } from "react-native";
import { markdownHotkeyDefinitions } from "./markdownHotkeys";
import {
  toggleMarkdownFormattingToolbarModeSetting,
  useMarkdownHotkeySettings,
} from "./markdownSettings";

type MarkdownKeyboardShortcutsOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
};

export function useMarkdownKeyboardShortcuts({ documentCommandsRef }: MarkdownKeyboardShortcutsOptions) {
  const hotkeys = useMarkdownHotkeySettings();
  const hotkeyHandlers = useMemo(() => ({
    // AppKit owns visual-line selection, including the handoff between blocks.
    extendBlockSelectionDown: () => Platform.OS !== "macos" && (documentCommandsRef.current?.extendBlockSelectionDown() ?? false),
    extendBlockSelectionUp: () => Platform.OS !== "macos" && (documentCommandsRef.current?.extendBlockSelectionUp() ?? false),
    focusFirstBlock: () => documentCommandsRef.current?.focusFirstBlock(),
    focusLastBlock: () => documentCommandsRef.current?.focusLastBlock(),
    moveBlockDown: () => documentCommandsRef.current?.moveActiveBlockDown(),
    moveBlockUp: () => documentCommandsRef.current?.moveActiveBlockUp(),
    toggleFormattingToolbar: toggleMarkdownFormattingToolbarModeSetting,
  }), [documentCommandsRef]);

  useHotkeys({
    definitions: markdownHotkeyDefinitions,
    handlers: hotkeyHandlers,
    values: hotkeys,
  });

  useEffect(() => {
    return addKeyDownListener((event) => {
      if (event.keyCode === KeyCodes.KEY_ESCAPE) {
        return documentCommandsRef.current?.commitAndBlurActiveBlock() === true;
      }

      return false;
    });
  }, [documentCommandsRef]);
}

import { useHotkeys } from "@legend-desktop/hotkeys";
import { addKeyDownListener, KeyCodes } from "@legend-desktop/keyboard-manager";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { useEffect, useMemo, type RefObject } from "react";
import { markdownHotkeyDefinitions } from "./markdownHotkeys";
import { useMarkdownHotkeySettings } from "./markdownSettings";

type MarkdownKeyboardShortcutsOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
};

export function useMarkdownKeyboardShortcuts({ documentCommandsRef }: MarkdownKeyboardShortcutsOptions) {
  const hotkeys = useMarkdownHotkeySettings();
  const hotkeyHandlers = useMemo(() => ({
    extendBlockSelectionDown: () => documentCommandsRef.current?.extendBlockSelectionDown() ?? false,
    extendBlockSelectionUp: () => documentCommandsRef.current?.extendBlockSelectionUp() ?? false,
    focusFirstBlock: () => documentCommandsRef.current?.focusFirstBlock(),
    focusLastBlock: () => documentCommandsRef.current?.focusLastBlock(),
    focusNextBlock: () => documentCommandsRef.current?.focusNextBlockFromEditor() ?? false,
    focusPreviousBlock: () => documentCommandsRef.current?.focusPreviousBlockFromEditor() ?? false,
    moveBlockDown: () => documentCommandsRef.current?.moveActiveBlockDown(),
    moveBlockUp: () => documentCommandsRef.current?.moveActiveBlockUp(),
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

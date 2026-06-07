import { useHotkeys } from "@legend-desktop/hotkeys";
import { addKeyDownListener, KeyCodes } from "@legend-desktop/keyboard-manager";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { useEffect, useMemo, useSyncExternalStore, type RefObject } from "react";
import { markdownHotkeyDefinitions } from "./markdownHotkeys";
import {
  getMarkdownHotkeySettings,
  subscribeToMarkdownSettings,
} from "./markdownSettings";

type MarkdownKeyboardShortcutsOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
};

export function useMarkdownKeyboardShortcuts({ documentCommandsRef }: MarkdownKeyboardShortcutsOptions) {
  const hotkeys = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownHotkeySettings,
    getMarkdownHotkeySettings,
  );
  const hotkeyHandlers = useMemo(() => ({
    focusNextBlock: () => documentCommandsRef.current?.focusNextBlock(),
    focusPreviousBlock: () => documentCommandsRef.current?.focusPreviousBlock(),
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

import { ownRegistration } from "@legend-apps/runtime-utils";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { addKeyboardListener, KeyCodes } from "@legendapp/spark/shortcuts/keyboard";
import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { useEffect, useMemo, type RefObject } from "react";
import { Platform } from "react-native";
import { markdownHotkeyDefinitions, markdownHotkeyRouter } from "./markdownHotkeys";
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

  useRoutedHotkeys({
    definitions: markdownHotkeyDefinitions,
    handlers: hotkeyHandlers,
    bindings: hotkeys,
    router: markdownHotkeyRouter,
    scope: { kind: "window", windowId: "markdown-editor" },
    onError: console.error,
  });

  useEffect(() => {
    const registration = ownRegistration(addKeyboardListener("down", (event) => {
      if (event.keyCode === KeyCodes.KEY_ESCAPE) {
        return documentCommandsRef.current?.commitAndBlurActiveBlock() === true;
      }

      return false;
    }));
    return () => { void registration.remove().catch(console.error); };
  }, [documentCommandsRef]);
}

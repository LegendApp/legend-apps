import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { useValue } from "@legendapp/state/react";
import { useMemo, type RefObject } from "react";
import { Platform } from "react-native";
import { markdownHotkeyDefinitions, markdownHotkeyRouter } from "./markdownHotkeys";
import type { MarkdownDocumentSessionState$ } from "./useMarkdownDocumentSession";
import {
  toggleMarkdownFormattingToolbarModeSetting,
  useMarkdownHotkeySettings,
} from "./markdownSettings";

const commitDefinitions = [{ id: "commit", title: "Finish Editing Block", defaultBindings: ["Escape"] }];

type MarkdownKeyboardShortcutsOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
  sessionState$: MarkdownDocumentSessionState$;
};

export function useMarkdownKeyboardShortcuts({ documentCommandsRef, sessionState$ }: MarkdownKeyboardShortcutsOptions) {
  const hotkeys = useMarkdownHotkeySettings();
  const canCommitAndBlur = useValue(sessionState$.commandState.canCommitAndBlur);
  const hotkeyHandlers = useMemo(() => ({
    // AppKit owns visual-line selection, including the handoff between blocks.
    ...(Platform.OS !== "macos" ? {
      extendBlockSelectionDown: () => documentCommandsRef.current?.extendBlockSelectionDown(),
      extendBlockSelectionUp: () => documentCommandsRef.current?.extendBlockSelectionUp(),
    } : {}),
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

  useRoutedHotkeys({
    definitions: commitDefinitions,
    enabled: canCommitAndBlur,
    handlers: { commit: () => documentCommandsRef.current?.commitAndBlurActiveBlock() },
    router: markdownHotkeyRouter,
    scope: { kind: "window", windowId: "markdown-editor" },
    onError: console.error,
  });
}

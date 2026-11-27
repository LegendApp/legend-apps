import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import type { Observable } from "@legendapp/state";
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

const windowHotkeyHandlers = { toggleFormattingToolbar: toggleMarkdownFormattingToolbarModeSetting };
const commitDefinitions = [{ id: "commit", title: "Finish Editing Block", defaultBindings: ["Escape"] }];

type MarkdownKeyboardShortcutsOptions = {
  /** While the Assistant composer has keyboard focus, the document's block hotkeys go to the composer instead. */
  composerFocused$: Observable<boolean>;
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
  sessionState$: MarkdownDocumentSessionState$;
  windowId: string;
};

export function useMarkdownKeyboardShortcuts({ composerFocused$, documentCommandsRef, sessionState$, windowId }: MarkdownKeyboardShortcutsOptions) {
  const hotkeys = useMarkdownHotkeySettings();
  const canCommitAndBlur = useValue(sessionState$.commandState.canCommitAndBlur);
  const composerFocused = useValue(composerFocused$);
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
  }), [documentCommandsRef]);

  useRoutedHotkeys({
    definitions: markdownHotkeyDefinitions,
    enabled: !composerFocused,
    handlers: hotkeyHandlers,
    bindings: hotkeys,
    router: markdownHotkeyRouter,
    scope: { kind: "window", windowId },
    onError: console.error,
  });

  useRoutedHotkeys({
    definitions: markdownHotkeyDefinitions,
    handlers: windowHotkeyHandlers,
    bindings: hotkeys,
    router: markdownHotkeyRouter,
    scope: { kind: "window", windowId },
    onError: console.error,
  });

  useRoutedHotkeys({
    definitions: commitDefinitions,
    enabled: canCommitAndBlur && !composerFocused,
    handlers: { commit: () => documentCommandsRef.current?.commitAndBlurActiveBlock() },
    router: markdownHotkeyRouter,
    scope: { kind: "window", windowId },
    onError: console.error,
  });
}

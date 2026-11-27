import { observable } from "@legendapp/state";
import type { HotkeyDefinition } from "@legendapp/spark/shortcuts/commands";
import { act, render } from "@testing-library/react-native";
import React from "react";
import { getMarkdownFormattingToolbarModeSetting, setMarkdownFormattingToolbarModeSetting } from "../markdownSettings";
import { useMarkdownKeyboardShortcuts } from "../useMarkdownKeyboardShortcuts";

type Registration = { bindings?: Record<string, readonly string[]>; definitions: readonly HotkeyDefinition<string>[]; enabled?: boolean; handlers: Record<string, () => void> };
const mockRegistrations: Registration[] = [];
jest.mock("@legendapp/spark/shortcuts/commands", () => ({
  ...jest.requireActual("@legendapp/spark/shortcuts/commands"),
  useRoutedHotkeys: (options: Registration) => { mockRegistrations.push(options); },
}));

const commands = {
  commitAndBlurActiveBlock: jest.fn(),
  focusFirstBlock: jest.fn(),
  focusLastBlock: jest.fn(),
  moveActiveBlockDown: jest.fn(),
  moveActiveBlockUp: jest.fn(),
};

/** Runs what an enabled registration from the last render binds to `binding`, as the window's hotkey router would. */
function press(binding: string, count: number) {
  for (const { bindings, definitions, enabled = true, handlers } of mockRegistrations.slice(-count)) {
    if (!enabled) continue;
    const definition = definitions.find(entry => handlers[entry.id] && (bindings?.[entry.id] ?? entry.defaultBindings ?? []).includes(binding));
    if (definition) return handlers[definition.id]!();
  }
}

function Shortcuts({ composerFocused$ }: { composerFocused$: ReturnType<typeof observable<boolean>> }) {
  useMarkdownKeyboardShortcuts({
    composerFocused$,
    documentCommandsRef: { current: commands as never },
    sessionState$: observable({ commandState: { canCommitAndBlur: true } }) as never,
    windowId: "window",
  });
  return null;
}

it("leaves block hotkeys to the Assistant composer while it has focus and restores them on blur", async () => {
  setMarkdownFormattingToolbarModeSetting("top");
  const composerFocused$ = observable(false);
  const view = await render(<Shortcuts composerFocused$={composerFocused$} />);
  const count = mockRegistrations.length;
  const documentKeys = { "Cmd+Up": commands.focusFirstBlock, "Cmd+Down": commands.focusLastBlock, "Alt+Up": commands.moveActiveBlockUp, "Alt+Down": commands.moveActiveBlockDown, Escape: commands.commitAndBlurActiveBlock };
  const pressAll = () => {
    Object.values(commands).forEach(command => command.mockClear());
    Object.keys(documentKeys).forEach(key => press(key, count));
    return Object.values(documentKeys).map(command => command.mock.calls.length);
  };

  expect(pressAll()).toEqual([1, 1, 1, 1, 1]);
  await act(async () => composerFocused$.set(true));
  expect(pressAll()).toEqual([0, 0, 0, 0, 0]);
  // Toggling the formatting toolbar is a window preference, not a document edit, so it still works.
  press("Cmd+Alt+T", count);
  expect(getMarkdownFormattingToolbarModeSetting()).not.toBe("top");
  await act(async () => composerFocused$.set(false));
  expect(pressAll()).toEqual([1, 1, 1, 1, 1]);
  await view.unmount();
});

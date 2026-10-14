import { act, render } from "@testing-library/react-native";
import { observable } from "@legendapp/state";
import { trackDocumentWindow } from "@legend-apps/workspace";
import React from "react";
import { refreshMarkdownEditorMenuState } from "../markdownEditorActions";
import { markdownMenuState$ } from "../markdownMenus";
import type { MarkdownDocumentSessionState } from "../useMarkdownDocumentSession";
import { useMarkdownMenus } from "../useMarkdownMenus";

const mockFocusListeners = new Map<string, (event: { focused: boolean }) => void>();
jest.mock("@legendapp/spark/windows", () => ({
  addWindowListener: jest.fn(async (id: string, _type: string, listener: (event: { focused: boolean }) => void) => {
    mockFocusListeners.set(id, listener);
    return { remove: jest.fn(async () => {}) };
  }),
}));

const noop = () => {};
const transition = async () => {};
const save = async () => true;
const commands = { current: null };
function state(filename: string) {
  return observable<MarkdownDocumentSessionState>({
    conflict: null,
    commandState: { canCommitAndBlur: false, canRedo: false, canUndo: false },
    documentSource: "file",
    filename,
    isDirty: false,
    lastError: null,
    saveState: "idle",
  });
}

function MenuOwner({ windowId, sessionState$ }: { windowId: string; sessionState$: ReturnType<typeof state> }) {
  useMarkdownMenus({
    documentCommandsRef: commands,
    onError: noop,
    onNewDocument: transition,
    onOpenDocument: transition,
    onOpenSettings: noop,
    onInsertLink: noop,
    onSaveDocument: save,
    onSaveDocumentAs: save,
    onSaveWorkspace: transition,
    onToggleSidebar: noop,
    sessionState$,
    windowId,
  });
  return null;
}

it("uses the focused editor's menu state and restores the remaining editor after a close", async () => {
  const first = state("/first.md"), second = state("/second.md");
  const untrackFirst = trackDocumentWindow("first", refreshMarkdownEditorMenuState);
  const untrackSecond = trackDocumentWindow("second", refreshMarkdownEditorMenuState);
  const view = await render(<><MenuOwner windowId="first" sessionState$={first} /><MenuOwner windowId="second" sessionState$={second} /></>);
  await act(async () => first.isDirty.set(true));
  expect(markdownMenuState$.save.disabled.peek()).toBe(true);
  await act(async () => mockFocusListeners.get("first")?.({ focused: true }));
  expect(markdownMenuState$.save.disabled.peek()).toBe(false);
  await act(async () => mockFocusListeners.get("second")?.({ focused: true }));
  expect(markdownMenuState$.save.disabled.peek()).toBe(true);
  await view.rerender(<MenuOwner windowId="first" sessionState$={first} />);
  untrackSecond();
  expect(markdownMenuState$.save.disabled.peek()).toBe(false);
  await view.unmount();
  untrackFirst();
});

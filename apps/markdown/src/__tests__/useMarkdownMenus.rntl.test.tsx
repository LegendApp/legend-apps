import { act, render } from "@testing-library/react-native";
import { observable } from "@legendapp/state";
import { trackDocumentWindow } from "@legend-apps/workspace";
import React from "react";
import { refreshMarkdownEditorMenuState } from "../markdownEditorActions";
import { markdownMenuState$ } from "../markdownMenus";
import type { MarkdownDocumentSessionState } from "../useMarkdownDocumentSession";
import { markdownPaneMenuItems, useMarkdownMenus } from "../useMarkdownMenus";

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
const paneCommands = Object.fromEntries(markdownPaneMenuItems.map(id => [id, jest.fn()])) as unknown as Parameters<typeof useMarkdownMenus>[0]["paneCommands"];
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

function MenuOwner({ composerFocused$ = observable(false), hasFolders = false, split = false, windowId, sessionState$ }: { composerFocused$?: ReturnType<typeof observable<boolean>>; hasFolders?: boolean; split?: boolean; windowId: string; sessionState$: ReturnType<typeof state> }) {
  useMarkdownMenus({
    composerFocused$,
    hasFolders,
    onAddFolder: noop,
    onNewFile: noop,
    onNewFolder: noop,
    documentCommandsRef: commands,
    onError: noop,
    onNewTab: noop,
    onOpenDocument: transition,
    onOpenSettings: noop,
    onFind: noop,
    onInsertLink: noop,
    onSaveDocument: save,
    onSaveDocumentAs: save,
    onSaveWorkspace: transition,
    onToggleAssistant: noop,
    paneCommands,
    paneCommandState: { canSplitDown: false, canSplitRight: true, hasOtherPanes: split },
    sessionState$,
    windowId,
  });
  return null;
}

it("uses the focused editor's menu state and restores the remaining editor after a close", async () => {
  const first = state("/first.md"), second = state("/second.md");
  const untrackFirst = trackDocumentWindow("first", refreshMarkdownEditorMenuState);
  const untrackSecond = trackDocumentWindow("second", refreshMarkdownEditorMenuState);
  const view = await render(<><MenuOwner hasFolders windowId="first" sessionState$={first} /><MenuOwner windowId="second" sessionState$={second} /></>);
  await act(async () => first.isDirty.set(true));
  expect(markdownMenuState$.save.disabled.peek()).toBe(true);
  await act(async () => mockFocusListeners.get("first")?.({ focused: true }));
  expect(markdownMenuState$.save.disabled.peek()).toBe(false);
  expect(markdownMenuState$.newFolder.disabled.peek()).toBe(false);
  await act(async () => mockFocusListeners.get("second")?.({ focused: true }));
  expect(markdownMenuState$.save.disabled.peek()).toBe(true);
  expect(markdownMenuState$.newFolder.disabled.peek()).toBe(true);
  expect(markdownMenuState$.newTab.disabled.peek()).toBe(false);
  await view.rerender(<MenuOwner windowId="first" sessionState$={first} />);
  untrackSecond();
  expect(markdownMenuState$.save.disabled.peek()).toBe(false);
  await view.unmount();
  untrackFirst();
});

it("enables the pane commands from the focused window's layout", async () => {
  const untrack = trackDocumentWindow("panes", refreshMarkdownEditorMenuState);
  const view = await render(<MenuOwner windowId="panes" sessionState$={state("/a.md")} />);
  expect(markdownMenuState$.splitRight.disabled.peek()).toBe(false);
  expect(markdownMenuState$.splitDown.disabled.peek()).toBe(true);
  expect(markdownMenuState$.closePane.disabled.peek()).toBe(true);
  await view.rerender(<MenuOwner split windowId="panes" sessionState$={state("/a.md")} />);
  expect(markdownMenuState$.closePane.disabled.peek()).toBe(false);
  expect(markdownMenuState$.focusNextPane.disabled.peek()).toBe(false);
  await view.unmount();
  untrack();
  expect(markdownMenuState$.splitRight.disabled.peek()).toBe(true);
});

it("disables document editing commands while the Assistant composer has focus", async () => {
  const untrack = trackDocumentWindow("composer", refreshMarkdownEditorMenuState);
  const composerFocused$ = observable(false);
  const view = await render(<MenuOwner composerFocused$={composerFocused$} windowId="composer" sessionState$={state("/a.md")} />);
  const editing = ["selectAll", "find", "bold", "link"] as const;
  expect(editing.map(id => markdownMenuState$[id].disabled.peek())).toEqual([false, false, false, false]);
  await act(async () => composerFocused$.set(true));
  expect(editing.map(id => markdownMenuState$[id].disabled.peek())).toEqual([true, true, true, true]);
  expect(markdownMenuState$.saveAs.disabled.peek()).toBe(false);
  await act(async () => composerFocused$.set(false));
  expect(markdownMenuState$.selectAll.disabled.peek()).toBe(false);
  await view.unmount();
  untrack();
});

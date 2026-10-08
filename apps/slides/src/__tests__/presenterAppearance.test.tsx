// @ts-nocheck Native storage stays in memory; settings, persistence and subscriptions stay real.
import "./nativeMock";
import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { when, syncState } from "@legendapp/state";
import { defaultPresenterTextColor, defaultPresenterInactiveColor, normalizePresenterColor } from "../presenterAppearance";

const files = new Map();
let onWrite;
mock.module("react-native", () => ({
  Platform: { OS: "macos" }, View: "view", Text: "text", TextInput: "input", ScrollView: "scroll",
  StyleSheet: { create: styles => styles, flatten: styles => styles },
}));
mock.module("../../../../packages/storage/src/NativeStorage", () => ({ default: {
  ensureStorageDirectory: () => true,
  getStoragePathUri: (_root, path) => `file:///test/${path}`,
  readStorageText: (_root, path) => files.get(path) ?? null,
  writeStorageText: (_root, path, value) => { files.set(path, value); onWrite?.(); return true; },
} }));
mock.module("@legendapp/spark/settings/window", () => ({
  VirtualizedSettingsWindow: ({ pages }) => pages[0].render(),
  SettingsSection: "section",
  SettingsRow: ({ title, control }) => <row title={title}>{control}</row>,
}));
mock.module("@legend-apps/design-system", () => ({ SelectControl: "select", SwitchControl: "switch" }));
mock.module("../TransitionSettingsPage", () => ({ TransitionSettingsPage: "transitions" }));
mock.module("../slidesWindows", () => ({ slidesSettingsWindowIdentifier: "settings" }));
mock.module("../EditableMarkdown", () => ({ EditableMarkdown: "notes" }));
const { SettingsWindow } = await import("../SettingsWindow");
const { ScrollableNotes } = await import("../ScrollableNotes");
const { createObservableSettings } = await import("@legend-apps/storage");

test("presenter colors default safely and normalize valid hex colors", () => {
  expect(defaultPresenterInactiveColor).toBe("#52525b");
  expect(normalizePresenterColor(" #ABC ", defaultPresenterTextColor)).toBe("#aabbcc");
  expect(normalizePresenterColor(" #ABCDEF ", defaultPresenterTextColor)).toBe("#abcdef");
  for (const value of [null, 42, "", "#12", "#gggggg", "invalid", "#00000080"]) {
    expect(normalizePresenterColor(value, defaultPresenterTextColor)).toBe(defaultPresenterTextColor);
  }
});

test("Appearance color edits update notes immediately and persist across a new settings store", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await act(() => { tree = create(<><SettingsWindow /><ScrollableNotes notesWidth={800}
      editable={false} markdown="Notes" placeholder="Notes" onSave={async () => {}} /></>); });
    const notes = () => tree.root.findByType("notes");
    const input = label => tree.root.findAllByType("input").find(node => node.props.accessibilityLabel === label);
    expect(notes().props.textColor).toBe(defaultPresenterTextColor);
    expect(notes().props.inactiveColor).toBe(defaultPresenterInactiveColor);
    expect(tree.root.findAllByType("row").map(row => row.props.title)).toContain("Presenter Text Color");
    expect(tree.root.findAllByType("row").map(row => row.props.title)).toContain("Presenter Inactive Color");
    const persisted = new Promise(resolve => { onWrite = resolve; });
    await act(() => input("Presenter text color").props.onChangeText("#334455"));
    await act(() => input("Presenter text color").props.onSubmitEditing());
    expect(notes().props.textColor).toBe("#334455");
    await act(() => input("Presenter inactive color").props.onChangeText("#123"));
    await act(() => input("Presenter inactive color").props.onEndEditing());
    expect(notes().props.inactiveColor).toBe("#112233");
    await act(() => input("Presenter inactive color").props.onChangeText("invalid"));
    await act(() => input("Presenter inactive color").props.onEndEditing());
    expect(notes().props.inactiveColor).toBe("#112233");
    expect(input("Presenter inactive color").props.value).toBe("#112233");
    await persisted;
    const stored = JSON.parse(files.get("slides/settings.json"));
    expect(stored.presenterTextColor).toBe("#334455");
    expect(stored.presenterInactiveColor).toBe("#112233");
    const restored = createObservableSettings({ filename: "settings", subfolder: "slides", fields: {
      presenterTextColor: { defaultValue: defaultPresenterTextColor, normalize: value => normalizePresenterColor(value, defaultPresenterTextColor) },
      presenterInactiveColor: { defaultValue: defaultPresenterInactiveColor, normalize: value => normalizePresenterColor(value, defaultPresenterInactiveColor) },
    } });
    restored.field("presenterTextColor").get();
    await when(syncState(restored.settings$).isPersistLoaded);
    expect(restored.field("presenterTextColor").get()).toBe("#334455");
    expect(restored.field("presenterInactiveColor").get()).toBe("#112233");
  } finally {
    onWrite = undefined;
    if (tree) await act(() => tree.unmount());
  }
});

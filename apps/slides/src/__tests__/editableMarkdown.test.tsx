// @ts-nocheck Native focus and markdown events are supplied by the test.
import { expect, mock, test } from "bun:test";
import React, { useImperativeHandle, useRef } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
const blur = mock(() => {});
const setValue = mock(() => {});
let nextId = 0;
mock.module("react-native-enriched-markdown", () => ({
  EnrichedMarkdownTextInput: ({ ref, ...props }) => {
    const id = useRef(++nextId).current;
    useImperativeHandle(ref, () => ({ blur, setValue, getMarkdown: () => new Promise(() => {}) }));
    return <editor {...props} nativeId={id} />;
  },
}));
const { EditableMarkdown, NotesEditingBoundary } = await import("../EditableMarkdown");

test("focus preserves native text, layout and selection; outside clicks flush the draft", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const editing = mock(), save = mock(async () => {});
  let tree;
  try {
    await act(() => { tree = create(<NotesEditingBoundary testID="boundary"><EditableMarkdown editable fontSize={24}
      markdown={"First paragraph wraps when needed.\n\nSecond paragraph."} placeholder="Notes" onEditingChange={editing} onSave={save} /></NotesEditingBoundary>); });
    const before = tree.root.findByType("editor").props;
    expect(before.editable).toBe(true);
    expect(before.scrollEnabled).toBe(false);
    const valuesBefore = setValue.mock.calls.length;
    await act(() => before.onFocus());
    const editor = tree.root.findByType("editor");
    expect(editor.props.nativeId).toBe(before.nativeId);
    expect(editor.props.markdownStyle).toBe(before.markdownStyle);
    expect(editor.props.style).toEqual(before.style);
    expect(editor.props.defaultValue).toBe(before.defaultValue);
    expect(editor.props.autoFocus).toBeUndefined();
    expect(setValue.mock.calls.length).toBe(valuesBefore);
    for (const key of ["paragraph", "list", "h1", "h2", "h3", "code", "codeBlock"]) {
      expect(editor.props.markdownStyle[key].lineHeight / editor.props.markdownStyle[key].fontSize).toBeCloseTo(1.4);
    }
    await act(() => editor.props.onChangeMarkdown("changed notes"));
    expect(setValue.mock.calls.length).toBe(valuesBefore);
    await act(async () => { tree.root.findAllByType("view").find(x => x.props.testID === "boundary").props.onTouchStart(); });
    expect(blur).toHaveBeenCalled();
    expect(editing.mock.calls.map(x => x[0])).toEqual([true, false]);
    expect(save).toHaveBeenCalledWith("changed notes");
    expect(tree.root.findByType("editor").props.nativeId).toBe(before.nativeId);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("moving between sections retains edits and untouched separators", async () => {
  const save = mock(async () => {});
  let tree;
  try {
    await act(() => { tree = create(<EditableMarkdown editable markdown={"1. First\n\n\n2. Second"} placeholder="Notes" onSave={save} />); });
    const ids = tree.root.findAllByType("editor").map(x => x.props.nativeId);
    await act(() => tree.root.findAllByType("editor")[1].props.onFocus());
    await act(() => tree.root.findAllByType("editor")[1].props.onChangeMarkdown("2. Changed"));
    await act(async () => tree.root.findAllByType("editor")[1].props.onBlur());
    await act(() => tree.root.findAllByType("editor")[0].props.onFocus());
    await act(() => tree.root.findAllByType("editor")[0].props.onChangeMarkdown("1. Updated"));
    await act(async () => tree.root.findAllByType("editor")[0].props.onBlur());
    expect(save).toHaveBeenLastCalledWith("1. Updated\n\n\n2. Changed");
    expect(tree.root.findAllByType("editor").map(x => x.props.nativeId)).toEqual(ids);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("read-only notes cannot focus for editing; external updates synchronize without remounting", async () => {
  const editing = mock(), save = mock(async () => {});
  const content = markdown => <EditableMarkdown editable={false} markdown={markdown} placeholder="Notes" onEditingChange={editing} onSave={save} />;
  let tree;
  try {
    await act(() => { tree = create(content("Original")); });
    const id = tree.root.findByType("editor").props.nativeId;
    expect(tree.root.findByType("editor").props.editable).toBe(false);
    await act(() => tree.root.findByType("editor").props.onFocus());
    expect(editing).not.toHaveBeenCalled();
    await act(() => tree.update(content("Updated externally")));
    expect(setValue).toHaveBeenLastCalledWith("Updated externally");
    expect(tree.root.findByType("editor").props.nativeId).toBe(id);
  } finally { if (tree) await act(() => tree.unmount()); }
});

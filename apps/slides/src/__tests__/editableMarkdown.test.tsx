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
    useImperativeHandle(ref, () => ({ blur, setValue, getParagraphLayouts: async () => [{ text: "1.\u2060 First", y: 0, height: 30 }, { text: "2.\u2060 Second", y: 70, height: 30 }], getMarkdown: () => new Promise(() => {}) }));
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

test("one native document supports edits spanning step boundaries without remounting", async () => {
  const save = mock(async () => {}), sectionLayout = mock();
  let tree;
  try {
    await act(() => { tree = create(<EditableMarkdown editable currentStep={0} markdown={"1. First\n\n\n2. Second"} placeholder="Notes" onSave={save} onSectionLayout={sectionLayout} />); });
    expect(tree.root.findAllByType("editor")).toHaveLength(1);
    const editor = tree.root.findByType("editor");
    const id = editor.props.nativeId;
    expect(editor.props.defaultValue).toContain("1.\u2060 First");
    expect(editor.props.defaultValue).toContain("2.\u2060 Second");
    await act(async () => editor.props.onLayout({ nativeEvent: { layout: { width: 600 } } }));
    expect(sectionLayout).toHaveBeenCalledWith(1, 70, 30);
    await act(() => editor.props.onFocus());
    // This event models replacing a selection that spans both step sections.
    await act(async () => editor.props.onChangeMarkdown("Merged selection"));
    await act(async () => tree.root.findByType("editor").props.onBlur());
    expect(save).toHaveBeenLastCalledWith("Merged selection");
    expect(tree.root.findByType("editor").props.nativeId).toBe(id);
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

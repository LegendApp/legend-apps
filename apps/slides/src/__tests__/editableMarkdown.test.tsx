// @ts-nocheck Native focus and markdown events are supplied by the test.
import { expect, mock, test } from "bun:test";
import React, { useImperativeHandle } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
const blur = mock(() => {});
mock.module("react-native-enriched-markdown", () => ({
  EnrichedMarkdownText: "markdown",
  EnrichedMarkdownTextInput: ({ ref, ...props }) => {
    useImperativeHandle(ref, () => ({ blur, getMarkdown: async () => "changed notes" }));
    return <editor {...props} />;
  },
}));
const { EditableMarkdown, NotesEditingBoundary } = await import("../EditableMarkdown");
test("outside clicks finish notes editing, flush changes, and preserve markdown typography", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const editing = mock(() => {}), save = mock(async () => {});
  let tree;
  try {
    await act(() => { tree = create(<NotesEditingBoundary testID="boundary"><EditableMarkdown editable markdown="notes" placeholder="Notes" onEditingChange={editing} onSave={save} /></NotesEditingBoundary>); });
    const viewerStyle = tree.root.findByType("markdown").props.markdownStyle;
    await act(() => tree.root.findByType("pressable").props.onPress());
    const editor = tree.root.findByType("editor");
    expect(editor.props.markdownStyle).toBe(viewerStyle);
    expect(editor.parent.parent.props.style[1].borderColor).toBe("#3b82f6");
    const stopPropagation = mock(() => {});
    await act(() => editor.parent.parent.props.onTouchStart({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(blur).not.toHaveBeenCalled();
    await act(async () => { tree.root.findAllByType("view").find(x => x.props.testID === "boundary").props.onTouchStart(); });
    expect(blur).toHaveBeenCalledTimes(1);
    expect(editing.mock.calls.map(x => x[0])).toEqual([true, false]);
    expect(save).toHaveBeenCalledWith("changed notes");
    expect(tree.root.findAllByType("editor")).toHaveLength(0);
  } finally { if (tree) await act(() => tree.unmount()); }
});

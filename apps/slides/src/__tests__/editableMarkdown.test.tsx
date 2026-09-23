// @ts-nocheck Native focus and markdown events are supplied by the test.
import { expect, mock, test } from "bun:test";
import React, { useImperativeHandle } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
const blur = mock(() => {});
mock.module("react-native-enriched-markdown", () => ({
  EnrichedMarkdownText: "markdown",
  EnrichedMarkdownTextInput: ({ ref, ...props }) => {
    useImperativeHandle(ref, () => ({ blur, getMarkdown: () => new Promise(() => {}) }));
    return <editor {...props} />;
  },
}));
const { EditableMarkdown, NotesEditingBoundary } = await import("../EditableMarkdown");
test("outside clicks save immediately without waiting on an unmounted native editor", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const editing = mock(() => {}), save = mock(async () => {});
  let tree;
  try {
    await act(() => { tree = create(<NotesEditingBoundary testID="boundary"><EditableMarkdown editable editorHeight={300} fontSize={24} markdown={"First paragraph wraps when needed.\n\nSecond paragraph."} placeholder="Notes" onEditingChange={editing} onSave={save} /></NotesEditingBoundary>); });
    expect(tree.root.findByType("editor").props.editable).toBe(false);
    const viewerValue = tree.root.findByType("editor").props.defaultValue;
    const viewerTextStyle = tree.root.findByType("editor").props.style;
    const viewerStyle = tree.root.findByType("editor").props.markdownStyle;
    const viewerShell = tree.root.findByType("pressable").props.style;
    expect(viewerStyle.paragraph.fontSize).toBe(24);
    await act(() => tree.root.findByType("pressable").props.onPress());
    const editor = tree.root.findByType("editor");
    expect(editor.props.markdownStyle).toBe(viewerStyle);
    expect(editor.props.scrollEnabled).toBe(true);
    expect(editor.props.style.height).toBe(300);
    expect(editor.props.style.minHeight).toBe(0);
    expect(editor.props.defaultValue).toBe(viewerValue);
    expect(editor.parent.parent.props.style[1].borderColor).toBe("#3b82f6");
    expect(editor.parent.parent.props.style[0]).toBe(viewerShell);
    expect(editor.props.style.padding).toBe(viewerTextStyle.padding);
    expect(editor.props.style.width).toBe(viewerTextStyle.width);
    expect(editor.props.style.fontSize).toBe(24);
    expect(editor.props.style.lineHeight).toBeCloseTo(24 * 1.3);
    expect(viewerStyle.paragraph.lineHeight).toBeCloseTo(24 * 1.3);
    expect(editor.props.markdownStyle.paragraph.lineHeight).toBeCloseTo(24 * 1.3);
    await act(() => editor.props.onChangeMarkdown("changed notes"));
    expect(tree.root.findByType("editor").props.style.lineHeight).toBeCloseTo(24 * 1.3);
    expect(tree.root.findByType("editor").props.markdownStyle.paragraph.lineHeight).toBeCloseTo(24 * 1.3);
    for (const key of ["paragraph", "list", "h1", "h2", "h3", "code", "codeBlock"]) {
      expect(viewerStyle[key].lineHeight / viewerStyle[key].fontSize).toBeCloseTo(1.3);
    }
    const stopPropagation = mock(() => {});
    await act(() => editor.parent.parent.props.onTouchStart({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(blur).not.toHaveBeenCalled();
    await act(async () => { tree.root.findAllByType("view").find(x => x.props.testID === "boundary").props.onTouchStart(); });
    expect(blur).toHaveBeenCalledTimes(1);
    expect(editing.mock.calls.map(x => x[0])).toEqual([true, false]);
    expect(save).toHaveBeenCalledWith("changed notes");
    expect(tree.root.findByType("editor").props.editable).toBe(false);
  } finally { if (tree) await act(() => tree.unmount()); }
});

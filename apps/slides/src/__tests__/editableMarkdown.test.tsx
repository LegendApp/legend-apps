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
    const nativeText = useRef(props.defaultValue);
    const defaultValue = useRef(props.defaultValue).current;
    useImperativeHandle(ref, () => ({ blur, setValue: value => { nativeText.current = value; setValue(value); },
      getParagraphLayouts: async () => nativeText.current.split(/\n+/).map((text, i) => ({ text, y: i * 70, height: 30 })),
      getMarkdown: () => new Promise(() => {}) }));
    const Host = props.accessible === false ? "note-color-overlay" : "editor";
    return <Host {...props} defaultValue={defaultValue} nativeId={id} onChangeMarkdown={value => {
      nativeText.current = value;
      props.onChangeMarkdown(value);
    }} />;
  },
}));
const { EditableMarkdown, NotesEditingBoundary } = await import("../EditableMarkdown");

test("numbered notes start faded before native layout on every slide", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const content = (slide, currentStep) => <EditableMarkdown key={slide} editable={false} currentStep={currentStep}
    markdown={`1. First note on slide ${slide}\n\n2. Second note on slide ${slide}`}
    textColor="#abcdef" inactiveColor="#123456" placeholder="Notes" onSave={async () => {}} />;
  let tree;
  try {
    for (const [slide, step] of [[0, 0], [1, 1], [2, 0]]) {
      await act(() => { if (tree) tree.update(content(slide, step)); else tree = create(content(slide, step)); });
      const editor = tree.root.findByType("editor");
      expect(editor.props.style.color).toBe("#123456");
      expect(editor.props.markdownStyle.paragraph.color).toBe("#123456");
      expect(tree.root.findAllByType("note-color-overlay")).toHaveLength(0);
      await act(async () => editor.props.onLayout({ nativeEvent: { layout: { width: 600 } } }));
      expect(tree.root.findByType("editor").props.style.color).toBe("#123456");
      const overlays = tree.root.findAllByType("note-color-overlay");
      expect(overlays).toHaveLength(1);
      expect(overlays[0].props.style.color).toBe("#abcdef");
      expect(overlays[0].parent.parent.props.style.top).toBe(-step * 70);
    }
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("notes with no inactive steps start at the active color", async () => {
  let tree;
  try {
    for (const markdown of ["Plain notes", "1. Only the current step", "```text\n2. A fenced example\n```", "8:10 A timestamp"]) {
      await act(() => { tree = create(<EditableMarkdown editable={false} currentStep={0} markdown={markdown}
        textColor="#abcdef" inactiveColor="#123456" placeholder="Notes" onSave={async () => {}} />); });
      expect(tree.root.findByType("editor").props.style.color).toBe("#abcdef");
      await act(() => tree.unmount());
      tree = undefined;
    }
  } finally { if (tree) await act(() => tree.unmount()); }
});

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
    expect(save).toHaveBeenCalledWith("changed notes", "First paragraph wraps when needed.\n\nSecond paragraph.");
    expect(tree.root.findByType("editor").props.nativeId).toBe(before.nativeId);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("one native document supports edits spanning step boundaries without remounting", async () => {
  const save = mock(async () => {}), sectionLayout = mock();
  let tree;
  try {
    await act(() => { tree = create(<EditableMarkdown editable currentStep={0} markdown={"1. First\n\n\n2. Second"} placeholder="Notes" onSave={save} onSectionsLayout={sectionLayout} />); });
    expect(tree.root.findAllByType("editor")).toHaveLength(1);
    const editor = tree.root.findByType("editor");
    const id = editor.props.nativeId;
    expect(editor.props.defaultValue).toContain("1.\u2060 First");
    expect(editor.props.defaultValue).toContain("2.\u2060 Second");
    await act(async () => editor.props.onLayout({ nativeEvent: { layout: { width: 600 } } }));
    expect(sectionLayout).toHaveBeenLastCalledWith([{ step: 0, y: 0, height: 70 }, { step: 1, y: 70, height: 30 }]);
    await act(() => editor.props.onFocus());
    // This event models replacing a selection that spans both step sections.
    await act(async () => editor.props.onChangeMarkdown("Merged selection"));
    await act(async () => tree.root.findByType("editor").props.onBlur());
    expect(save).toHaveBeenLastCalledWith("Merged selection", "1. First\n\n\n2. Second");
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


test("newly entered step labels acquire layout markers on blur without replacing text during editing", async () => {
  const sectionLayout = mock();
  let tree;
  try {
    await act(() => { tree = create(<EditableMarkdown editable markdown="" placeholder="Notes" onSave={async () => {}}
      onSectionsLayout={sectionLayout} />); });
    const id = tree.root.findByType("editor").props.nativeId;
    await act(async () => tree.root.findByType("editor").props.onLayout({ nativeEvent: { layout: { width: 600 } } }));
    await act(() => tree.root.findByType("editor").props.onFocus());
    const writes = setValue.mock.calls.length;
    await act(async () => tree.root.findByType("editor").props.onChangeMarkdown("1: First\n\n2: Newly pasted"));
    expect(setValue.mock.calls.length).toBe(writes);
    expect(sectionLayout.mock.calls.at(-1)[0].every(region => region.step === undefined)).toBe(true);
    await act(async () => tree.root.findByType("editor").props.onBlur());
    expect(setValue).toHaveBeenLastCalledWith("1:\u2060 First\n\n2:\u2060 Newly pasted");
    expect(sectionLayout).toHaveBeenLastCalledWith([{ step: 0, y: 0, height: 70 }, { step: 1, y: 70, height: 30 }]);
    expect(tree.root.findByType("editor").props.nativeId).toBe(id);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("presenter colors follow the current step and editing without replacing the editable document", async () => {
  const markdown = "General reminder\n\n1. First step\n\n2. Second step";
  const content = (step, textColor = "#abcdef", inactiveColor = "#123456", notes = markdown) => <EditableMarkdown editable
    markdown={notes} currentStep={step} textColor={textColor} inactiveColor={inactiveColor}
    placeholder="Notes" onSave={async () => {}} />;
  let tree;
  try {
    await act(() => { tree = create(content(0)); });
    const id = tree.root.findByType("editor").props.nativeId;
    await act(async () => tree.root.findByType("editor").props.onLayout({ nativeEvent: { layout: { width: 600 } } }));
    const writes = setValue.mock.calls.length;
    for (const step of [0, 1, 0]) {
      await act(() => tree.update(content(step)));
      const editor = tree.root.findByType("editor");
      expect(editor.props.nativeId).toBe(id);
      expect(editor.props.style.color).toBe("#123456");
      expect(editor.props.markdownStyle.paragraph.color).toBe("#123456");
      const overlays = tree.root.findAllByType("note-color-overlay");
      expect(overlays).toHaveLength(2);
      for (const overlay of overlays) {
        expect(overlay.props.editable).toBe(false);
        expect(overlay.props.style.color).toBe("#abcdef");
        expect(overlay.props.defaultValue).toBe(editor.props.defaultValue);
      }
      expect(overlays[1].parent.parent.props.style.top).toBe(step === 0 ? -70 : -140);
    }
    await act(() => tree.update(content(0, "#fedcba", "#654321")));
    expect(tree.root.findByType("editor").props.style.color).toBe("#654321");
    expect(tree.root.findAllByType("note-color-overlay")[0].props.style.color).toBe("#fedcba");
    await act(() => tree.root.findByType("editor").props.onFocus());
    expect(tree.root.findAllByType("note-color-overlay")).toHaveLength(0);
    expect(tree.root.findByType("editor").props.style.color).toBe("#fedcba");
    expect(tree.root.findByType("editor").props.nativeId).toBe(id);
    await act(async () => tree.root.findByType("editor").props.onBlur());
    expect(tree.root.findAllByType("note-color-overlay")).toHaveLength(2);
    expect(tree.root.findByType("editor").props.nativeId).toBe(id);
    expect(setValue.mock.calls.length).toBe(writes);
    await act(async () => tree.update(content(0, "#fedcba", "#654321", "New reminder\n\n1. Updated first\n\n2. Updated second")));
    expect(tree.root.findByType("editor").props.nativeId).toBe(id);
    for (const overlay of tree.root.findAllByType("note-color-overlay")) {
      expect(overlay.props.defaultValue).toContain("Updated first");
      expect(overlay.props.defaultValue).toContain("Updated second");
    }
  } finally { if (tree) await act(() => tree.unmount()); }
});

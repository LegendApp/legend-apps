// @ts-nocheck Native scroll commands are recorded to verify focus never moves the viewport.
import { expect, mock, test } from "bun:test";
import React, { useImperativeHandle } from "react";
import { act, create } from "react-test-renderer";
const scrollTo = mock();
mock.module("react-native", () => ({
  View: "view",
  ScrollView: ({ ref, ...props }) => {
    useImperativeHandle(ref, () => ({ scrollTo }));
    return <scroll {...props} />;
  },
}));
mock.module("../EditableMarkdown", () => ({ EditableMarkdown: "notes" }));
mock.module("../slidesSettings", () => ({
  usePresenterTextColorSetting: () => "#d1d5db",
  usePresenterInactiveColorSetting: () => "#52525b",
}));
const { ScrollableNotes } = await import("../ScrollableNotes");

test("focus keeps the scrolled viewport and only navigation resumes step following", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  const content = currentStep => <ScrollableNotes notesWidth={600} editable currentStep={currentStep} markdown="Notes" placeholder="Notes" onSave={async () => {}} />;
  try {
    await act(() => { tree = create(content(1)); });
    await act(() => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { height: 400 } } }));
    await act(() => tree.root.findByType("scroll").props.onContentSizeChange(600, 1800));
    await act(() => tree.root.findByType("notes").props.onSectionsLayout([{ step: 1, y: 900, height: 200 }]));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 824, animated: false });
    const count = scrollTo.mock.calls.length;
    await act(() => tree.root.findByType("notes").props.onEditingChange(true));
    expect(tree.root.findByType("scroll").props.scrollEnabled).toBe(true);
    await act(() => tree.root.findByType("scroll").props.onContentSizeChange(600, 1900));
    await act(() => tree.root.findByType("notes").props.onSectionsLayout([{ step: 1, y: 950, height: 220 }]));
    expect(scrollTo.mock.calls.length).toBe(count);
    await act(() => tree.root.findByType("notes").props.onEditingChange(false));
    expect(scrollTo.mock.calls.length).toBe(count);
    await act(() => tree.root.findByType("notes").props.onSectionsLayout([{ step: 2, y: 1400, height: 200 }]));
    await act(() => tree.update(content(2)));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1324, animated: false });
    const afterNavigation = scrollTo.mock.calls.length;
    // Removing every numbered section must also forget all old positions.
    await act(() => tree.root.findByType("notes").props.onSectionsLayout([]));
    await act(() => tree.update(content(1)));
    await act(() => tree.update(content(2)));
    expect(scrollTo.mock.calls.length).toBe(afterNavigation);
  } finally { if (tree) await act(() => tree.unmount()); }
});

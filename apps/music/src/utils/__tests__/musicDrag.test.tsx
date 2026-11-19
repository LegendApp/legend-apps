// @ts-nocheck The Spark drag view is mocked as a plain view.
const React = require("react");
const { act, create } = require("react-test-renderer");
const { DragDropView } = require("@legendapp/spark/drag-drop");
const { MusicTrackDragSource } = require("../musicDrag");

test("forwards the drag-start callback to Spark and leaves touches alone", async () => {
    const onDragStart = jest.fn();
    let tree;
    await act(() => {
        tree = create(React.createElement(MusicTrackDragSource, { tracks: [{ id: "a", title: "A" }], onDragStart }));
    });
    const view = tree.root.findByType(DragDropView);
    expect(view.props.onDragStart).toBe(onDragStart);
    expect(view.props.onTouchStart).toBeUndefined();
    expect(view.props.onTouchMove).toBeUndefined();
    await act(() => tree.unmount());
});

test("requests a snapshot preview of the dragged track row", async () => {
    let tree;
    await act(() => {
        tree = create(<MusicTrackDragSource tracks={[{ id: "a", title: "A" }]} />);
    });
    try {
        expect(tree.root.findByType(DragDropView).props.dragPreview).toBe("snapshot");
    } finally {
        await act(() => tree.unmount());
    }
});

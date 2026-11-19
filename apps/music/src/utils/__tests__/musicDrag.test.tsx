// @ts-nocheck The Spark drag view is mocked as a plain view.
const React = require("react");
const { act, create } = require("react-test-renderer");
const { MusicTrackDragSource } = require("../musicDrag");

const touch = (pageX, pageY) => ({ nativeEvent: { pageX, pageY } });

test("reports a drag start only once the pointer moves, so plain clicks still select", async () => {
    const onDragStart = jest.fn();
    let tree;
    await act(() => {
        tree = create(React.createElement(MusicTrackDragSource, { tracks: [{ id: "a", title: "A" }], onDragStart }));
    });
    const view = tree.root.find((node) => typeof node.props.onTouchStart === "function");

    await act(() => {
        view.props.onTouchStart(touch(10, 10));
        view.props.onTouchMove?.(touch(12, 11));
        view.props.onTouchEnd?.(touch(12, 11));
    });
    expect(onDragStart).not.toHaveBeenCalled();

    await act(() => {
        view.props.onTouchStart(touch(10, 10));
        view.props.onTouchMove(touch(20, 10));
        view.props.onTouchMove(touch(30, 10));
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    await act(() => tree.unmount());
});

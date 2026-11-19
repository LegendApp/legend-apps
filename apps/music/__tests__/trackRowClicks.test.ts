// @ts-nocheck Native surfaces are controlled; application components use strict React Compiler output.
const createHarness = require("./helpers/musicRenderHarness.cjs");
const { MusicTrackDragSource } = require("../src/utils/musicDrag");

jest.mock("@legendapp/spark/drag-drop", () => ({ DragDropView: "drag-view" }));

function findAncestor(node, predicate) {
    for (let parent = node.parent; parent; parent = parent.parent) {
        if (predicate(parent)) return parent;
    }
}

test("library and queue rows handle clicks and leave drag detection to Spark", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const previousFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = () => 1;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const h = createHarness({ trackDragSource: MusicTrackDragSource });
    const { React, act, create, libraryUI$, selectTrack } = h;
    const TrackList = h.getTrackList();
    const Playlist = h.getPlaylist();
    libraryUI$.selectedView.set("songs");
    let library, queue;
    try {
        await act(() => {
            library = create(React.createElement(TrackList));
            queue = create(React.createElement(Playlist));
        });
        const libraryDrag = library.root.findAllByType("drag-view")[0];
        const libraryRow = findAncestor(libraryDrag, (node) => "isSelected" in node.props && typeof node.props.onClick === "function");
        const actionsButton = library.root.findAll((node) => node.props.accessibilityLabel === "Track actions")[0];
        expect(findAncestor(actionsButton, (node) => node.type === "drag-view")).toBeUndefined();

        const queueDrag = queue.root.findAllByType("drag-view")[0];
        const queueRow = findAncestor(queueDrag, (node) => node.type === "button" && typeof node.props.onClick === "function");
        const click = { button: 0 };
        for (const [dragView, row] of [[libraryDrag, libraryRow], [queueDrag, queueRow]]) {
            selectTrack.mockClear();
            await act(() => {
                dragView.props.onTouchStart?.({ nativeEvent: { pageX: 10, pageY: 10 } });
                dragView.props.onTouchMove?.({ nativeEvent: { pageX: 30, pageY: 10 } });
                row.props.onClick(click);
            });
            expect(selectTrack).toHaveBeenCalledTimes(1);
            expect(selectTrack).toHaveBeenCalledWith(0, click);

            await act(() => {
                dragView.props.onDragStart();
                row.props.onClick(click);
            });
            expect(selectTrack).toHaveBeenCalledTimes(1);
        }
    } finally {
        if (library) await act(() => library.unmount());
        if (queue) await act(() => queue.unmount());
        global.requestAnimationFrame = previousFrame;
        log.mockRestore();
    }
});

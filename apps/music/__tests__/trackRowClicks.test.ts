// @ts-nocheck Native surfaces are controlled; application components use strict React Compiler output.
const createHarness = require("./helpers/musicRenderHarness.cjs");

// Spark's native drag source claims every hit inside it, so the clickable row must wrap the drag source.
function isInside(node, predicate) {
    for (let parent = node.parent; parent; parent = parent.parent) {
        if (predicate(parent)) return true;
    }
    return false;
}

test("library and queue track rows keep their click handlers outside the native drag source", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const previousFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = () => 1;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const h = createHarness();
    const { React, act, create, libraryUI$ } = h;
    const TrackList = h.getTrackList();
    const Playlist = h.getPlaylist();
    libraryUI$.selectedView.set("songs");
    let library, queue;
    try {
        await act(() => {
            library = create(React.createElement(TrackList));
            queue = create(React.createElement(Playlist));
        });
        const isDragSource = (node) => node.type === "track-drag";

        const libraryDrag = library.root.findAllByType("track-drag")[0];
        expect(isInside(libraryDrag, (node) => "isSelected" in node.props && typeof node.props.onClick === "function")).toBe(true);
        const actionsButton = library.root.findAll((node) => node.props.accessibilityLabel === "Track actions")[0];
        expect(isInside(actionsButton, isDragSource)).toBe(false);

        const queueDrag = queue.root.findAllByType("track-drag")[0];
        expect(isInside(queueDrag, (node) => node.type === "button" && typeof node.props.onClick === "function")).toBe(true);
    } finally {
        if (library) await act(() => library.unmount());
        if (queue) await act(() => queue.unmount());
        global.requestAnimationFrame = previousFrame;
        log.mockRestore();
    }
});

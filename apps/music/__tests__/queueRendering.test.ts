// @ts-nocheck Native surfaces are controlled; application components use strict React Compiler output.
const createHarness = require("./helpers/musicRenderHarness.cjs");

test("queue appends preserve visible rows while edits, reorder, and retained actions stay current", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const previousFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = () => 1;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const h = createHarness();
    const { React, act, create, queue$, tracks, TrackItem } = h;
    const Playlist = h.getPlaylist();
    let tree;
    try {
        await act(() => { tree = create(React.createElement(Playlist)); });
        const initialDrop = tree.root.findAllByType("drop-zone").find((node) => node.props.id === "playlist-drop-1").props.onDrop;
        h.resetCounts();
        for (let i = 0; i < 5; i++) {
            await act(() => {
                const added = { ...tracks[0], id: `added${i}`, queueEntryId: `added${i}` };
                if (i % 2) queue$.tracks.push(added);
                else queue$.tracks.set([...queue$.tracks.peek(), added]);
            });
        }
        expect(h.getListData()).toHaveLength(25);
        expect(h.getCounts()["TrackItem.render"] ?? 0).toBe(0);
        await act(() => initialDrop({ data: { type: "playlist-track", queueEntryId: "added4" } }));
        expect(h.actions).toContainEqual(["reorder", 24, 1]);

        h.resetCounts();
        await act(() => queue$.tracks.set(queue$.tracks.peek().map((track, index) => index === 0
            ? { ...track, title: "Edited title", filePath: "/music/edited.mp3", isMissing: true }
            : track)));
        expect(h.getCounts()["TrackItem.render"]).toBe(1);
        expect(tree.root.findAllByType(TrackItem)[0].props.track).toMatchObject({ title: "Edited title", isMissing: true });
        expect(tree.root.findAllByType("track-drag")[0].props.tracks[0].title).toBe("Edited title");

        await act(() => {
            const current = queue$.tracks.peek();
            queue$.tracks.set([current[1], current[0], ...current.slice(2)]);
        });
        const rows = tree.root.findAllByType(TrackItem);
        expect(rows[0].props.track.queueEntryId).toBe("q1");
        expect(rows[1].props.track.title).toBe("Edited title");
        await act(() => rows[1].props.onDoubleClick(1));
        expect(h.actions).toContainEqual(["play", 1]);
        await act(() => rows[1].props.onRightClick(1, { pageX: 0, pageY: 0 }));
        expect(h.actions).toContainEqual(["context", "/music/edited.mp3"]);
    } finally {
        if (tree) await act(() => tree.unmount());
        global.requestAnimationFrame = previousFrame;
        log.mockRestore();
    }
});

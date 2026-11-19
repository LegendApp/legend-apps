// @ts-nocheck Native surfaces are controlled; the drag payload goes through Music's real encoder and validator.
const createHarness = require("./helpers/musicRenderHarness.cjs");
const { droppedMusicTracks, musicTrackPayload } = require("../src/utils/musicDrag");

test("library rows drag a payload the queue and playlist drop targets accept", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const previousFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = () => 1;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const h = createHarness();
    const { React, act, create, libraryUI$ } = h;
    const TrackList = h.getTrackList();
    h.library.library$.tracks.set(h.tracks.map((track, index) => ({
        ...track, queueEntryId: undefined, trackNumber: index + 1, thumbnailKey: "art" + index, addedAt: 1700000000000,
        durationMs: 120000, artists: ["Artist"], isMissing: false,
    })));
    libraryUI$.selectedView.set("songs");
    let library;
    try {
        await act(() => {
            library = create(React.createElement(TrackList));
        });
        const { tracks } = library.root.findAllByType("track-drag")[0].props;

        expect(droppedMusicTracks(musicTrackPayload(tracks))).toEqual([
            { id: "0", title: "Song 0", artist: "Artist", duration: "120", filePath: "/music/0.mp3", fileName: "0.mp3" },
        ]);
    } finally {
        if (library) await act(() => library.unmount());
        global.requestAnimationFrame = previousFrame;
        log.mockRestore();
    }
});

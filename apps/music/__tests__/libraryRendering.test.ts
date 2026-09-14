// @ts-nocheck Native surfaces are controlled; application components use strict React Compiler output.
const createHarness = require("./helpers/musicRenderHarness.cjs");

test("unrelated playlist edits leave Songs idle and retained menus read current playlists", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const h = createHarness();
    const { React, act, create, localMusicState$, libraryUI$ } = h;
    const TrackList = h.getTrackList();
    const useLibraryTrackList = h.getLibraryHook();
    libraryUI$.selectedView.set("songs");
    let tree, probe, hook;
    function Probe() { hook = useLibraryTrackList(); return null; }
    const playlist = { id: "unrelated", name: "Original", filePath: "/playlists/p.m3u", trackPaths: [], trackCount: 0, source: "cache" };
    try {
        await act(() => { tree = create(React.createElement(TrackList)); probe = create(React.createElement(Probe)); });
        const retainedMenu = hook.handleTrackContextMenu;
        h.resetCounts();
        for (let i = 0; i < 5; i++) await act(() => localMusicState$.playlists.set([{ ...playlist, name: `Renamed ${i}` }]));
        expect(h.getCounts()["List"] ?? 0).toBe(0);
        expect(h.getCounts()["LibraryTrackRow"] ?? 0).toBe(0);
        expect(hook.handleTrackContextMenu).toBe(retainedMenu);
        h.menuResponses.push("add-to-playlist");
        await act(() => retainedMenu(0, { pageX: 0, pageY: 0 }));
        expect(h.menus.at(-1)).toContainEqual({ id: "playlist:unrelated", title: "Renamed 4", enabled: true });

        // Switching to an editable playlist must still subscribe to its contents and name.
        await act(() => {
            localMusicState$.playlists.set([{ ...playlist, trackPaths: [h.tracks[0].filePath], trackCount: 1 }]);
            libraryUI$.selectedPlaylistId.set(playlist.id);
            libraryUI$.selectedView.set("playlist");
        });
        expect(h.getListData()).toHaveLength(1);
        await act(() => localMusicState$.playlists.set([{ ...playlist, name: "Selected rename", trackPaths: h.tracks.slice(0, 2).map((track) => track.filePath), trackCount: 2 }]));
        expect(h.getListData()).toHaveLength(2);
        expect(tree.root.findAllByType("text").some((node) => node.props.children === "Selected rename")).toBe(true);
    } finally {
        if (tree) await act(() => tree.unmount());
        if (probe) await act(() => probe.unmount());
        log.mockRestore();
    }
});

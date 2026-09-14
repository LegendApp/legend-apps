// @ts-nocheck Native surfaces are controlled; application components use strict React Compiler output.
const createHarness = require("./helpers/musicRenderHarness.cjs");

test("streaming selection updates only its previous and next buttons without stale actions", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    global.IS_REACT_ACT_ENVIRONMENT = true;
    const h = createHarness();
    const { React, act, create, providerLibrary$, providerPlaylists, libraryUI$ } = h;
    const Sidebar = h.getMediaLibrarySidebar();
    const buttons = () => tree.root.findAllByType("button").filter((node) => node.props.children?.[0]?.type === "badge" && node.props.onDoubleClick);
    let tree;
    try {
        await act(() => { tree = create(React.createElement(Sidebar)); });
        const firstClick = buttons()[0].props.onClick;
        h.resetCounts();
        for (let i = 1; i <= 5; i++) {
            await act(() => providerLibrary$.selectedPlaylist.set(providerPlaylists[i]));
            expect(buttons().filter((node) => node.props.className.split(" ").includes("bg-white/10"))).toHaveLength(1);
        }
        expect(h.getCounts()["ProviderButton"]).toBe(10);
        expect(h.getCounts()["MediaLibrary.Sidebar.render"] ?? 0).toBe(0);
        await act(() => providerLibrary$.selectedPlaylist.set(null));
        expect(buttons().some((node) => node.props.className.split(" ").includes("bg-white/10"))).toBe(false);
        await act(() => firstClick());
        expect(providerLibrary$.selectedPlaylist.id.peek()).toBe("p0");
        await act(() => buttons()[1].props.onDoubleClick());
        expect(h.actions.at(-1)).toEqual(["append", h.tracks.slice(0, 2)]);
        await act(() => libraryUI$.selectedView.set("songs"));
        expect(buttons().every((node) => !node.props.className.split(" ").includes("bg-white/10"))).toBe(true);
    } finally {
        if (tree) await act(() => tree.unmount());
        log.mockRestore();
    }
});

// @ts-nocheck Native panes and leaves are controlled; exercise the persisted split layout tree.
const React = require("react");
const { act, create } = require("react-test-renderer");
jest.mock("@legendapp/spark/ui/split-view", () => {
    const { Fragment } = require("react");
    return {
        SidebarSplitView: props => <sidebar-split {...props}>{props.sidebar}{props.content}</sidebar-split>,
        SplitView: props => <split {...props}>{props.panes.map(pane => <Fragment key={pane.id}>{pane.content}</Fragment>)}</split>,
    };
});
jest.mock("../../components/ResizablePanels", () => ({
    PanelGroup: ({ children }) => children, Panel: ({ children }) => children, ResizeHandle: () => null,
}));
jest.mock("../MusicLayoutRegistry", () => ({
    getMusicLayoutLeafDefinition: id => ({ render: () => <leaf id={id} /> }),
}));
const { MusicLayoutRenderer } = require("../MusicLayoutRenderer");
const { MusicSplitView } = require("../../components/MusicSplitView");
const { settings$ } = require("../../systems/Settings");

afterEach(() => settings$.state.panels.set({}));

test("restores nested Spark panes and saves measured sizes for the next mount", async () => {
    const queueId = "root.0.queue";
    const detailsId = "root.rest.0.details";
    const playbackId = `${detailsId}.0.playback`;
    settings$.state.panels.set({ [queueId]: 155, [detailsId]: 184, [playbackId]: 170, sidebar: 220 });
    const node = { type: "split", direction: "horizontal", children: [
        { type: "leaf", id: "queue" },
        { type: "split", id: "details", direction: "vertical", children: [
            { type: "leaf", id: "playback" },
            { type: "leaf", id: "playbackControls" },
        ] },
        { type: "leaf", id: "libraryTracks" },
    ] };
    let tree;
    await act(() => { tree = create(<MusicLayoutRenderer node={node} />); });
    try {
        const splits = tree.root.findAllByType("split");
        expect(splits).toHaveLength(2);
        const [outer, inner] = splits;
        expect(outer.props.orientation).toBe("horizontal");
        expect(outer.props.panes.map(pane => pane.initialSize)).toEqual([155, 184, undefined]);
        expect(outer.findAllByType("split")).toContain(inner);
        expect(inner.props.orientation).toBe("vertical");
        expect(inner.props.panes.map(pane => pane.initialSize)).toEqual([170, undefined]);
        expect(tree.root.findAllByType("leaf").map(leaf => leaf.props.id)).toEqual(["queue", "playback", "playbackControls", "libraryTracks"]);

        await act(() => inner.props.onResize([50, 50]));
        expect(settings$.state.panels[playbackId].peek()).toBe(170);
        await act(() => {
            outer.props.onResize([205, 244, 350]);
            inner.props.onResize([190, 210]);
            tree.update(<MusicLayoutRenderer node={node} context={{ benchmarkElapsedSeconds: 1 }} />);
        });
        expect(settings$.state.panels.peek()).toEqual({ [queueId]: 205, [detailsId]: 244, [playbackId]: 190, sidebar: 220 });
        expect(outer.props.panes.map(pane => pane.initialSize)).toEqual([155, 184, undefined]);
        expect(inner.props.panes.map(pane => pane.initialSize)).toEqual([170, undefined]);

        await act(() => tree.unmount());
        await act(() => { tree = create(<MusicLayoutRenderer node={node} />); });
        expect(tree.root.findAllByType("split").map(split => split.props.panes.map(pane => pane.initialSize)))
            .toEqual([[205, 244, undefined], [190, undefined]]);
    } finally {
        await act(() => tree.unmount());
    }
});

test("seeds the sidebar once and only persists ready widths", async () => {
    settings$.state.panels.sidebar.set(210);
    let tree;
    await act(() => { tree = create(<MusicSplitView id="sidebar" sidebar={null} content={null} />); });
    try {
        const split = tree.root.findByType("sidebar-split");
        await act(() => split.props.onResize({ phase: "provisional", sidebarWidth: 150 }));
        expect(settings$.state.panels.sidebar.peek()).toBe(210);
        await act(() => {
            split.props.onResize({ phase: "ready", sidebarWidth: 240 });
            tree.update(<MusicSplitView id="sidebar" sidebar={null} content={<leaf id="libraryTracks" />} />);
        });
        expect(settings$.state.panels.sidebar.peek()).toBe(240);
        expect(split.props.sidebarWidth).toBe(210);
    } finally {
        await act(() => tree.unmount());
    }
});

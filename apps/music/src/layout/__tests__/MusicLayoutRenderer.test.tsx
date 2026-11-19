// @ts-nocheck Native panes and leaves are controlled; exercise the persisted split layout tree.
const React = require("react");
const { act, create } = require("react-test-renderer");
jest.mock("@legendapp/spark/ui/split-view", () => ({
    SidebarSplitView: props => <split {...props}>{props.sidebar}{props.content}</split>,
}));
jest.mock("../../components/ResizablePanels", () => ({
    PanelGroup: ({ children }) => children, Panel: ({ children }) => children, ResizeHandle: () => null,
}));
jest.mock("../MusicLayoutRegistry", () => ({
    getMusicLayoutLeafDefinition: id => ({ render: () => <leaf id={id} /> }),
}));
const { MusicLayoutRenderer } = require("../MusicLayoutRenderer");
const { settings$ } = require("../../systems/Settings");

test("renders horizontal split nodes through Spark and persists native resize metrics", async () => {
    let tree;
    const node = { type: "split", direction: "horizontal", children: [{ type: "leaf", id: "queue" }, { type: "leaf", id: "libraryTracks" }] };
    await act(() => { tree = create(<MusicLayoutRenderer node={node} />); });
    expect(tree.root.findAllByType("split")).toHaveLength(1);
    expect(tree.root.findAllByType("leaf").map(leaf => leaf.props.id)).toEqual(["queue", "libraryTracks"]);
    await act(() => tree.root.findByType("split").props.onResize({ phase: "ready", sidebarWidth: 240 }));
    expect(settings$.state.panels["root.0.queue"].peek()).toBe(240);
    expect(tree.root.findByType("split").props.sidebarWidth).toBe(200);
    await act(() => tree.unmount());
});

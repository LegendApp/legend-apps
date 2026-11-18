import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { GitHistoryCommit } from "@legend-apps/diff-parser";
import { GraphCell, graphColumns, graphMaxLanes, graphStyle, laneColor, laneColors } from "../HistoryView";
import { defaultSettings } from "../settings/defaults";

jest.mock("@legend-apps/diff-parser", () => ({}));
jest.mock("@legendapp/list/react-native", () => ({ LegendList: "LegendList" }));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/sidebar", () => ({ Sidebar: "Sidebar", SidebarItem: "SidebarItem" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("../DiffPane", () => ({ DiffPane: "DiffPane" }));
jest.mock("react-native", () => ({
  Text: "Text", View: "View", Pressable: "Pressable", ScrollView: "ScrollView", useColorScheme: () => "dark",
  PlatformColor: (name: string) => ({ semantic: [name] }), StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: {} },
}));

// The graph as it drew before settings: 12 pt lanes, 2 pt lines, 44 pt rows, colored by the layout's branch color.
const graph = (palette: readonly string[]) => graphStyle({ ...defaultSettings.panels.commitList.graph, colorBy: "branch" }, 44, palette);
const commit = (lane: number, color: number, edges: number[], parents = ["p"]): GitHistoryCommit =>
  ({ oid: "c", parents, authorName: "", authorEmail: "", time: 0, summary: "", lane, color, edges });

type Node = { type: string; props: { style?: unknown }; children: Node[] | null };
const styles = (node: Node): Record<string, unknown>[] => [
  Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean)),
  ...(node.children ?? []).flatMap(child => typeof child === "object" ? styles(child) : []),
];

it("gives every lane a concrete system color in both appearances, and the overflow column its own", () => {
  for (const palette of [laneColors.light, laneColors.dark]) {
    for (let color = 0; color < 40; color++) expect(laneColor(palette, 1, color)).toMatch(/^#[0-9A-F]{6}$/);
    expect(laneColor(palette, graphMaxLanes, 3)).toBe(palette.at(-1));
  }
});

it("draws a side-branch row whose color index is past the palette (a row that rendered blank at runtime)", () => {
  let tree!: ReturnType<typeof create>;
  // Row 494 of the runtime fixture: lane 1 with color 16; lane 0 passes through.
  act(() => { tree = create(createElement(GraphCell, { commit: commit(1, 16, [0, 0, 0, 1, -1, 16, -1, 1, 16]), columns: 2, graph: graph(laneColors.dark) })); });
  const drawn = styles(tree.toJSON() as unknown as Node).slice(1);
  expect(drawn).toHaveLength(4);
  for (const style of drawn) expect(style.backgroundColor ?? style.borderColor).toMatch(/^#[0-9A-F]{6}$/);
  expect(drawn.filter(style => style.backgroundColor === laneColors.dark[6])).toHaveLength(3);
  expect(drawn.find(style => style.borderRadius)).toMatchObject({ left: 18 - 4.5, backgroundColor: laneColors.dark[6] });
});

it("bends a merge's second-parent line from the node into its lane and sizes the column to the widest row", () => {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(createElement(GraphCell, { commit: commit(0, 0, [0, -1, 0, -1, 0, 0, -1, 2, 5], ["a", "b"]), columns: 3, graph: graph(laneColors.light) })); });
  const [cell, ...drawn] = styles(tree.toJSON() as unknown as Node);
  expect(cell).toMatchObject({ width: 36 });
  expect(drawn.find(style => style.borderTopRightRadius)).toMatchObject({ left: 6, top: 21, borderTopWidth: 2, borderRightWidth: 2, borderColor: laneColors.light[5] });
  expect(drawn.find(style => style.borderRadius)).toMatchObject({ backgroundColor: { semantic: ["controlBackgroundColor"] } });
  expect(graphColumns([commit(0, 0, [-1, 0, 0]), commit(1, 1, [0, 0, 0, 1, 3, 1])])).toBe(4);
  expect(graphColumns([commit(graphMaxLanes, 0, [graphMaxLanes, -1, 0])])).toBe(graphMaxLanes + 1);
});

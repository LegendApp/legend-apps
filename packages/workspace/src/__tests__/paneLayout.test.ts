import {
  canSplitPane,
  clampSplitFraction,
  closeOtherPanes,
  closePane,
  closePaneTab,
  createPaneLayout,
  findSplit,
  focusAdjacentPane,
  getPaneIds,
  layoutPanes,
  movePaneTab,
  openPaneTab,
  parsePaneLayout,
  setSplitFraction,
  splitPane,
  splitPaneWithTab,
  type PaneLayout,
} from "../paneLayout";

const one = () => createPaneLayout({ active: "/a.md", paths: ["/a.md", "/b.md"] });

function fractions(layout: PaneLayout) {
  const result: number[] = [];
  const walk = (node: PaneLayout["root"]) => {
    if (node.kind === "split") {
      result.push(Math.round(node.fraction * 1000) / 1000);
      walk(node.first);
      walk(node.second);
    }
  };
  walk(layout.root);
  return result;
}

describe("splitPane", () => {
  it("adds a focused pane on the right with the active document", () => {
    const layout = splitPane(one(), "horizontal");
    expect(getPaneIds(layout.root)).toEqual(["p0", "p1"]);
    expect(layout.focused).toBe("p1");
    expect(layout.panes.p1).toEqual({ active: "/a.md", paths: ["/a.md"] });
    expect(layout.root).toMatchObject({ kind: "split", axis: "horizontal", fraction: 0.5 });
  });

  it("shares a same-axis run evenly between its panes", () => {
    const three = splitPane(splitPane(one(), "horizontal"), "horizontal");
    expect(getPaneIds(three.root)).toEqual(["p0", "p1", "p2"]);
    expect(fractions(three)).toEqual([0.333, 0.5]);
    const frames = layoutPanes(three.root, { height: 400, width: 912, x: 0, y: 0 }).panes;
    expect(frames.map(frame => frame.width)).toEqual([300, 300, 300]);
  });

  it("leaves other-axis splits alone", () => {
    const grid = splitPane(splitPane(one(), "horizontal"), "vertical");
    expect(fractions(grid)).toEqual([0.5, 0.5]);
    expect(grid.root).toMatchObject({ axis: "horizontal", second: { axis: "vertical" } });
  });
});

describe("closePane", () => {
  it("moves its tabs to the heir without duplicates and focuses the heir", () => {
    let layout = splitPane(one(), "horizontal");
    layout = openPaneTab(layout, "p1", "/c.md");
    const closed = closePane(layout);
    expect(getPaneIds(closed.root)).toEqual(["p0"]);
    expect(closed.focused).toBe("p0");
    expect(closed.panes).toEqual({ p0: { active: "/c.md", paths: ["/a.md", "/b.md", "/c.md"] } });
  });

  it("keeps the heir's active tab when an unfocused pane closes", () => {
    let layout = openPaneTab(splitPane(one(), "horizontal"), "p1", "/c.md");
    layout = { ...layout, focused: "p0", panes: { ...layout.panes, p0: { ...layout.panes.p0, active: "/b.md" } } };
    const closed = closePane(layout, "p1");
    expect(closed.focused).toBe("p0");
    expect(closed.panes.p0.active).toBe("/b.md");
  });

  it("gives the room to the nearest pane of the sibling side", () => {
    // p0 | (p1 / p2): closing p0 hands its room to p1, the first pane on its right.
    const layout = splitPane(splitPane(one(), "horizontal"), "vertical");
    expect(closePane(layout, "p0").focused).toBe("p2");
    expect(getPaneIds(closePane(layout, "p0").root)).toEqual(["p1", "p2"]);
    expect(Object.keys(closePane(layout, "p0").panes)).toEqual(["p1", "p2"]);
    expect(closePane({ ...layout, focused: "p0" }, "p0").focused).toBe("p1");
  });

  it("does nothing for the last pane", () => {
    const layout = one();
    expect(closePane(layout)).toBe(layout);
  });

  it("closes the others into the kept pane", () => {
    const layout = openPaneTab(splitPane(splitPane(one(), "horizontal"), "vertical"), "p2", "/z.md");
    const kept = closeOtherPanes(layout, "p0");
    expect(kept.root).toEqual({ kind: "pane", id: "p0" });
    expect(kept.panes.p0.paths).toEqual(["/a.md", "/b.md", "/z.md"]);
  });
});

describe("closePaneTab", () => {
  it("closes a split pane left without tabs", () => {
    const layout = splitPane(one(), "horizontal");
    const closed = closePaneTab(layout, "p1", "/a.md");
    expect(getPaneIds(closed.root)).toEqual(["p0"]);
    expect(closed.focused).toBe("p0");
  });

  it("keeps the last pane even with no tabs", () => {
    const closed = closePaneTab(closePaneTab(one(), "p0", "/a.md"), "p0", "/b.md");
    expect(closed.panes.p0).toEqual({ active: null, paths: [] });
  });
});

describe("tab drag", () => {
  // p0 holds a and b; p1 on the right holds c.
  const two = () => closePaneTab(openPaneTab(splitPane(one(), "horizontal"), "p1", "/c.md"), "p1", "/a.md");

  it("moves a tab into another pane's bar at the drop slot and focuses it", () => {
    const layout = movePaneTab(two(), "p0", "/b.md", "p1", 0);
    expect(layout.panes.p0).toEqual({ active: "/a.md", paths: ["/a.md"] });
    expect(layout.panes.p1).toEqual({ active: "/b.md", paths: ["/b.md", "/c.md"] });
    expect(layout.focused).toBe("p1");
  });

  it("reorders within a pane, counting the slot before the tab leaves", () => {
    const layout = movePaneTab(one(), "p0", "/a.md", "p0", 2);
    expect(layout.panes.p0).toEqual({ active: "/a.md", paths: ["/b.md", "/a.md"] });
  });

  it("closes a split pane whose last tab leaves", () => {
    const layout = movePaneTab(two(), "p1", "/c.md", "p0", 1);
    expect(getPaneIds(layout.root)).toEqual(["p0"]);
    expect(layout.panes.p0).toEqual({ active: "/c.md", paths: ["/a.md", "/c.md", "/b.md"] });
    expect(layout.focused).toBe("p0");
  });

  it("splits the target pane on the dropped edge with just the dragged tab", () => {
    const right = splitPaneWithTab(one(), "p0", "/b.md", "p0", "right");
    expect(right.root).toMatchObject({ kind: "split", axis: "horizontal", first: { id: "p0" }, second: { id: "p1" } });
    expect(right.panes).toEqual({ p0: { active: "/a.md", paths: ["/a.md"] }, p1: { active: "/b.md", paths: ["/b.md"] } });
    expect(right.focused).toBe("p1");
    const top = splitPaneWithTab(one(), "p0", "/b.md", "p0", "top");
    expect(top.root).toMatchObject({ kind: "split", axis: "vertical", first: { id: "p1" }, second: { id: "p0" } });
  });

  it("closes the source pane when its last tab splits another pane", () => {
    const layout = splitPaneWithTab(two(), "p1", "/c.md", "p0", "bottom");
    expect(getPaneIds(layout.root)).toEqual(["p0", "p2"]);
    expect(layout.root).toMatchObject({ kind: "split", axis: "vertical" });
    expect(layout.panes.p2).toEqual({ active: "/c.md", paths: ["/c.md"] });
    expect(layout.focused).toBe("p2");
  });

  it("does not split a pane with its own only tab", () => {
    const layout = two();
    expect(splitPaneWithTab(layout, "p1", "/c.md", "p1", "left")).toBe(layout);
  });

  it("persists the result", () => {
    const layout = splitPaneWithTab(two(), "p1", "/c.md", "p0", "bottom");
    expect(parsePaneLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });
});

describe("resizing", () => {
  it("clamps a split so both sides keep their minimum", () => {
    const layout = splitPane(one(), "horizontal");
    const split = findSplit(layout.root, "s1")!;
    expect(clampSplitFraction(split, 1006, 0.05)).toBeCloseTo(0.2233);
    expect(clampSplitFraction(split, 1006, 0.95)).toBeCloseTo(0.7826);
    expect(clampSplitFraction(split, 1006, 0.4)).toBe(0.4);
    expect(fractions(setSplitFraction(layout, "s1", 0.3))).toEqual([0.3]);
  });

  it("only splits a pane with room for two minimums", () => {
    expect(canSplitPane({ height: 400, width: 446, x: 0, y: 0 }, "horizontal")).toBe(true);
    expect(canSplitPane({ height: 400, width: 445, x: 0, y: 0 }, "horizontal")).toBe(false);
    expect(canSplitPane({ height: 311, width: 900, x: 0, y: 0 }, "vertical")).toBe(false);
  });

  it("stacks vertical panes edge to edge and spaces side-by-side panes by the gap", () => {
    const grid = splitPane(splitPane(splitPane(one(), "horizontal"), "vertical", "p0"), "vertical", "p1");
    const { panes } = layoutPanes(grid.root, { height: 600, width: 806, x: 0, y: 0 });
    expect(panes).toEqual([
      { id: "p0", height: 300, width: 400, x: 0, y: 0 },
      { id: "p2", height: 300, width: 400, x: 0, y: 300 },
      { id: "p1", height: 300, width: 400, x: 406, y: 0 },
      { id: "p3", height: 300, width: 400, x: 406, y: 300 },
    ]);
  });
});

describe("focus", () => {
  it("cycles panes in reading order", () => {
    const layout = splitPane(splitPane(one(), "horizontal"), "horizontal");
    expect(focusAdjacentPane(layout, 1).focused).toBe("p0");
    expect(focusAdjacentPane(layout, -1).focused).toBe("p1");
  });
});

describe("parsePaneLayout", () => {
  it("round-trips a saved layout", () => {
    const layout = openPaneTab(splitPane(splitPane(one(), "horizontal"), "vertical"), "p2", "/z.md");
    expect(parsePaneLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  });

  it("rejects missing or inconsistent layouts", () => {
    const layout = splitPane(one(), "horizontal");
    expect(parsePaneLayout(undefined)).toBeUndefined();
    expect(parsePaneLayout({ ...layout, focused: "p9" })).toBeUndefined();
    expect(parsePaneLayout({ ...layout, panes: { p0: layout.panes.p0 } })).toBeUndefined();
    expect(parsePaneLayout({ ...layout, root: { ...layout.root, fraction: 2 } })).toBeUndefined();
    expect(parsePaneLayout({ ...layout, panes: { ...layout.panes, p1: { active: "/x.md", paths: [] } } })).toBeUndefined();
  });

  it("never reuses a saved pane ID for a new pane", () => {
    const layout = splitPane(one(), "horizontal");
    expect(parsePaneLayout({ ...layout, nextId: 0 })?.nextId).toBe(2);
  });
});

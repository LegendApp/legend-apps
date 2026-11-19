import { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { loadUnifiedDiff } from "@legend-apps/diff-parser";
import { DiffPane } from "../DiffPane";
import { LayoutHost, type PanelRenderers } from "../layout/LayoutHost";
import { createDiffDocumentCache, DiffDocumentCacheContext } from "../layout/diffDocuments";
import { layoutMenu, saveLayoutAs } from "../layout/layoutMenu";
import { movePane, planPanels, renderPlan, viewKindFor, windowPlan, type RenderPlan } from "../layout/plan";
import { createWindowStateStore } from "../layout/windowState";
import { createPaneSizeWriter } from "../layout/paneSizes";
import { runLayoutAction } from "../layout/layoutMenu";
import { presetSettings, presetView } from "../settings/presets";
import { presetIds, viewKinds, type LayoutNode } from "../settings/schema";
import { createGitSettingsStore, sparkSettingsIO, type SettingsIO } from "../settings/store";
import { watch as sparkWatch } from "@legendapp/spark/files";

jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name, StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: {} },
  Text: "Text", View: "View", FlatList: "FlatList", Pressable: "Pressable", ScrollView: "ScrollView", useColorScheme: () => "light",
}));
jest.mock("@legend-apps/diff-parser", () => ({
  DiffNativeRow: "DiffNativeRow", DiffNativeRowConfig: "DiffNativeRowConfig", getDiffRowPalette: () => ({}),
  diffUnifiedChangeBarWidth: 4, diffUnifiedLineNumberWidth: 40, diffUnifiedMarkerWidth: 12, loadUnifiedDiff: jest.fn(),
}));
jest.mock("@legendapp/list/react-native", () => ({ LegendList: "LegendList" }));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("@legendapp/spark/files", () => ({ watch: jest.fn(async () => ({ remove: async () => {} })) }));

const all = () => true;
const settings = (preset: (typeof presetIds)[number]) => presetSettings(preset);

function memoryIO(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const io: SettingsIO = {
    read: async path => files.get(path),
    write: async (path, text) => { files.set(path, text); },
    mkdir: async () => {},
    watch: async () => ({ remove: () => {} }),
  };
  return { io, files };
}

describe("render plan", () => {
  it("lays out every view kind of every preset with a diff and no repeated panel", () => {
    for (const preset of presetIds) {
      for (const kind of viewKinds) {
        for (const fileSelected of [false, true]) {
          const panels = planPanels(windowPlan(settings(preset), preset, kind, { fileSelected }, all));
          expect(new Set(panels).size).toBe(panels.length);
          // GitKraken shows the diff in place of the graph once a file is selected.
          if (fileSelected || preset !== "gitkraken") expect(panels).toContain("diff");
        }
      }
    }
  });

  it("matches each preset's arrangement", () => {
    expect(planPanels(windowPlan(settings("sourcetree"), "sourcetree", "history", {}, all))).toEqual(["commitList", "fileList", "commitDetails", "diff"]);
    expect(planPanels(windowPlan(settings("sourcetree"), "sourcetree", "changes", {}, all))).toEqual(["staged", "unstaged", "diff", "composer"]);
    expect(planPanels(windowPlan(settings("fork"), "fork", "history", {}, all))).toEqual(["commitList", "commitDetails", "fileList", "diff"]);
    expect(planPanels(windowPlan(settings("fork"), "fork", "changes", {}, all))).toEqual(["unstaged", "staged", "composer", "diff"]);
    // GitKraken's switch: the graph until a file is selected, then the diff in its place.
    expect(planPanels(windowPlan(settings("gitkraken"), "gitkraken", "history", {}, all))).toEqual(["commitList", "commitDetails", "fileList"]);
    expect(planPanels(windowPlan(settings("gitkraken"), "gitkraken", "history", { fileSelected: true }, all))).toEqual(["diff", "commitDetails", "fileList"]);
    expect(planPanels(windowPlan(settings("gitkraken"), "gitkraken", "changes", { fileSelected: true }, all))).toEqual(["diff", "unstaged", "staged", "composer"]);
  });

  it("gives each preset a history arrangement of its own", () => {
    const top = (preset: (typeof presetIds)[number], fileSelected = false) => {
      const plan = windowPlan(settings(preset), preset, "history", { fileSelected }, all);
      return plan.type === "split" ? `${plan.direction}:${planPanels(plan.children[0]!.plan).join(",")}` : plan.id;
    };
    // SourceTree: the commit list across the top. Fork: the commit list down the left, details, files and diff to its right.
    expect(top("sourcetree")).toBe("column:commitList");
    expect(top("fork")).toBe("row:commitList");
    expect(planPanels(windowPlan(settings("fork"), "fork", "history", {}, all))).toEqual(["commitList", "commitDetails", "fileList", "diff"]);
    // GitKraken: the graph fills the left until a file is opened, then the diff takes its place.
    expect(top("gitkraken")).toBe("row:commitList");
    expect(top("gitkraken", true)).toBe("row:diff");
    expect(new Set(presetIds.map(preset => JSON.stringify(settings(preset).toolbar.items))).size).toBe(presetIds.length);
    expect(new Set(presetIds.map(preset => JSON.stringify(settings(preset).sidebar.sections))).size).toBe(presetIds.length);
  });

  it("keeps sizes as fixed panes and lets the last sized pane flex", () => {
    const plan = windowPlan(settings("sourcetree"), "sourcetree", "history", {}, all) as Extract<RenderPlan, { type: "split" }>;
    expect(plan).toMatchObject({ type: "split", direction: "column", children: [{ size: 340, minSize: 160, plan: { id: "commitList" } }, { plan: { type: "split", direction: "row" } }] });
    const stash = windowPlan(settings("sourcetree"), "sourcetree", "stash", {}, panel => panel === "fileList" || panel === "diff");
    // The stash has no commit list or details: the splits that held only them fold away.
    expect(stash).toEqual({ type: "split", direction: "row", sizeKey: "default.1", children: [
      { plan: { type: "panel", id: "fileList", panel: "fileList" }, index: 0, size: 320, minSize: 240 },
      { plan: { type: "panel", id: "diff", panel: "diff" }, index: 1, minSize: 400 },
    ] });
  });

  it("falls back to files beside the diff, then to a blank pane, when a view has nothing to show", () => {
    const onlyComposer: LayoutNode = { type: "panel", panel: "composer" };
    expect(renderPlan(onlyComposer, {}, panel => panel === "diff")).toBeNull();
    const custom = { ...settings("sourcetree"), layout: { active: "mine", layouts: { mine: { views: { default: onlyComposer } } } } };
    expect(planPanels(windowPlan(custom, "sourcetree", "stash", {}, panel => panel === "fileList" || panel === "diff"))).toEqual(["fileList", "diff"]);
    expect(windowPlan(custom, "sourcetree", "stash", {}, () => false)).toEqual({ type: "panel", id: "empty", panel: "empty" });
  });

  it("falls back per view when a layout in a settings file is invalid", async () => {
    const dir = "/data";
    const twice: LayoutNode = { type: "split", direction: "row", children: [{ node: { type: "panel", panel: "diff" } }, { node: { type: "panel", panel: "diff" } }] };
    const mine = { views: { default: { type: "panel", panel: "diff" }, history: twice } };
    const { io } = memoryIO({ [`${dir}/settings.json`]: JSON.stringify({ version: 1, layout: { active: "mine", layouts: { mine } } }) });
    const store = createGitSettingsStore({ io, directory: dir });
    await store.ready;
    const effective = store.settings$.peek();
    expect(effective.layout.layouts.mine!.views.history).toEqual(presetView("sourcetree", "history"));
    expect(planPanels(windowPlan(effective, "sourcetree", "history", {}, all))).toEqual(["commitList", "fileList", "commitDetails", "diff"]);
    expect(planPanels(windowPlan(effective, "sourcetree", "changes", {}, all))).toEqual(["diff"]);
    await store.close();
  });

  it("maps sidebar sections to view kinds", () => {
    expect(["changes", "history", "ref:refs/heads/main", "stash:abc", "worktree:/x", "review", "review:branch:x", "pr:12"].map(viewKindFor))
      .toEqual(["changes", "history", "ref", "stash", "worktree", "review", "review", "pullRequest"]);
  });
});

describe("pane sizes", () => {
  const sourcetree = settings("sourcetree");
  const withSizes = (sizes: Record<string, number[]>) => ({ ...sourcetree, layout: { ...sourcetree.layout, sizes: { sourcetree: sizes } } });
  type Split = Extract<RenderPlan, { type: "split" }>;

  it("puts SourceTree's commit details below the files, filling the left column beside the diff", () => {
    const plan = windowPlan(sourcetree, "sourcetree", "history", {}, all) as Split;
    const row = plan.children[1]!.plan as Split;
    expect(row).toMatchObject({ direction: "row", sizeKey: "default.1", children: [{ size: 320, plan: { type: "split", direction: "column" } }, { plan: { id: "diff" } }] });
    const left = row.children[0]!.plan as Split;
    expect(left.sizeKey).toBe("default.1.0");
    expect(left.children.map(child => [child.plan.type === "panel" && child.plan.id, child.size])).toEqual([["fileList", 240], ["commitDetails", undefined]]);
  });

  it("reads saved sizes by split path for the panes the layout sizes, leaving flexible panes flexible", () => {
    const plan = windowPlan(withSizes({ default: [420, 900], "default.1": [280.5, 700], "default.1.0": [180, 400] }), "sourcetree", "history", {}, all) as Split;
    expect(plan.children.map(child => child.size)).toEqual([420, undefined]);
    const row = plan.children[1]!.plan as Split;
    expect(row.children.map(child => child.size)).toEqual([280.5, undefined]);
    expect((row.children[0]!.plan as Split).children.map(child => child.size)).toEqual([180, undefined]);
    // A pane the view can't show keeps its size slot: the stash's files take the left column's saved width.
    const stash = windowPlan(withSizes({ "default.1": [260, 700] }), "sourcetree", "stash", {}, panel => panel === "fileList" || panel === "diff") as Split;
    expect(stash.children.map(child => [child.index, child.size])).toEqual([[0, 260], [1, undefined]]);
    // Another layout's sizes don't apply.
    const fork = { ...sourcetree, layout: { ...sourcetree.layout, active: "fork", sizes: { sourcetree: { default: [10, 10] } } } };
    expect(JSON.stringify(windowPlan(fork, "sourcetree", "history", {}, all))).not.toContain("\"size\":10");
  });

  it("validates layout.sizes in a settings file", async () => {
    const { io } = memoryIO({ "/data/settings.json": JSON.stringify({ version: 1, layout: { sizes: { sourcetree: { sidebar: [260], default: [400, 300] } } } }) });
    const store = createGitSettingsStore({ io, directory: "/data" });
    await store.ready;
    expect(store.settings$.peek().layout.sizes).toEqual({ sourcetree: { sidebar: [260], default: [400, 300] } });
    expect(store.issues$.peek()).toEqual([]);
    await store.close();
  });
});

describe("onPaneResize", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  it("writes the active layout's sizes to the user settings file, debounced and rounded", async () => {
    const { io, files } = memoryIO();
    const store = createGitSettingsStore({ io, directory: "/data" });
    await store.ready;
    const writer = createPaneSizeWriter({ store: () => store, current: () => ({ settings: store.settings$.peek(), base: store.base$.peek() }) });
    writer.onPaneResize("default.1", [300, 800]);
    writer.onPaneResize("default.1", [310.6, 789.4]);
    writer.onPaneResize("sidebar", [251.2]);
    writer.onPaneResize("default", [Number.NaN, 2]); // ignored
    expect(files.size).toBe(0);
    jest.advanceTimersByTime(300);
    await settle();
    expect(JSON.parse(files.get("/data/settings.json")!).layout).toEqual({ sizes: { sourcetree: { "default.1": [311, 789], sidebar: [251] } } });
    expect(store.settings$.peek().layout.sizes?.sourcetree).toEqual({ "default.1": [311, 789], sidebar: [251] });
    // The window reads them back: the plan uses the saved width.
    const plan = windowPlan(store.settings$.peek(), "sourcetree", "history", {}, all) as Extract<RenderPlan, { type: "split" }>;
    expect((plan.children[1]!.plan as Extract<RenderPlan, { type: "split" }>).children[0]!.size).toBe(311);

    // Reset Layout clears them, along with any pending resize.
    writer.onPaneResize("default.1", [500, 500]);
    await runLayoutAction("layout:reset", { windowId: "main", layout: { settings: store.settings$.peek(), base: "sourcetree", store, windowState: null, paneSizes: writer }, kind: "history", focused: "diff" });
    jest.advanceTimersByTime(1000);
    await settle();
    expect(store.settings$.peek().layout.sizes?.sourcetree).toBeUndefined();
    await store.close();
  });
});

describe("Move Pane", () => {
  it("swaps a pane with its neighbor along the axis, keeping each pane's size", () => {
    const changes = presetView("sourcetree", "changes");
    const moved = movePane(changes, "diff", "left")!;
    expect(planPanels(renderPlan(moved, {}, all)!)).toEqual(["diff", "staged", "unstaged", "composer"]);
    const row = (moved as Extract<LayoutNode, { type: "split" }>).children[0]!.node as Extract<LayoutNode, { type: "split" }>;
    expect(row.children[0]).toMatchObject({ node: { panel: "diff" }, minSize: 400 });
    expect(row.children[0]!.size).toBeUndefined();
    expect(row.children[1]).toMatchObject({ size: 320, minSize: 240 });
    // Up from the composer moves it above the row holding the lists and diff.
    expect(planPanels(renderPlan(movePane(changes, "composer", "up")!, {}, all)!)).toEqual(["composer", "staged", "unstaged", "diff"]);
    expect(movePane(changes, "diff", "right")).toBeNull();
    expect(movePane(changes, "missing", "left")).toBeNull();
  });

  it("moves a switch as one pane", () => {
    const view = presetView("gitkraken", "default");
    expect(planPanels(renderPlan(movePane(view, "commitList", "right")!, {}, all)!)).toEqual(["commitDetails", "fileList", "commitList"]);
  });
});

describe("settings file watching", () => {
  it("watches the settings folder recursively, so a file rewritten in place reloads", async () => {
    // Spark's plain directory watch only sees entries added, removed or renamed; `>` in a shell rewrites in place.
    const listener = () => {};
    await sparkSettingsIO().watch("/data", listener);
    expect(sparkWatch).toHaveBeenCalledWith("/data", listener, { recursive: true });
  });
});

describe("window state", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps ready resizes only, debounced, and restores them", async () => {
    const { io, files } = memoryIO();
    const state = createWindowStateStore({ io, directory: "/data", windowId: "main" });
    await state.ready;
    state.onResize({ phase: "provisional", sidebarWidth: 300 });
    state.onResize({ phase: "provisional", sidebarWidth: 310 });
    jest.advanceTimersByTime(1000);
    expect(files.size).toBe(0);
    state.onResize({ phase: "ready", sidebarWidth: 251.4 });
    state.onResize({ phase: "ready", sidebarWidth: 0 }); // collapsing reports 0; the width before stays
    state.setSidebarCollapsed(true);
    expect(files.size).toBe(0);
    jest.advanceTimersByTime(300);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(JSON.parse(files.get("/data/state/main.json")!)).toEqual({ sidebarWidth: 251, sidebarCollapsed: true });
    await state.close();
    const again = createWindowStateStore({ io, directory: "/data", windowId: "main" });
    await expect(again.ready).resolves.toEqual({ sidebarWidth: 251, sidebarCollapsed: true });
  });
});

describe("Save Layout As", () => {
  it("writes the layout and its activation as a sparse user-layer patch", async () => {
    const { io, files } = memoryIO();
    const store = createGitSettingsStore({ io, directory: "/data" });
    await store.ready;
    await saveLayoutAs(store, store.settings$.peek(), store.base$.peek(), "Wide Sidebar", { sidebarWidth: 280 });
    const file = JSON.parse(files.get("/data/settings.json")!);
    expect(Object.keys(file)).toEqual(["$schema", "version", "layout"]);
    expect(Object.keys(file.layout)).toEqual(["layouts", "active"]);
    expect(Object.keys(file.layout.layouts)).toEqual(["Wide Sidebar"]);
    expect(file.layout.layouts["Wide Sidebar"]).toEqual({ ...presetSettings("sourcetree").layout.layouts.sourcetree, sidebar: { width: 280 } });
    expect(file.layout.active).toBe("Wide Sidebar");
    const menu = layoutMenu({ settings: store.settings$.peek(), base: "sourcetree", store, windowState: null }, "changes", "diff") as unknown as { items: any[] };
    expect(menu.items.filter(item => item.type === "checkbox").map(item => [item.label, item.checked])).toEqual([["SourceTree", false], ["Fork", false], ["GitKraken", false], ["Wide Sidebar", true]]);
    await store.close();
  });
});

describe("remounting a pane", () => {
  it("keeps a moved split's panels mounted, so the composer keeps its draft", async () => {
    const mounted: string[] = [];
    const Probe = ({ id }: { id: string }) => { useEffect(() => { mounted.push(id); }, [id]); return null; };
    const panels: PanelRenderers = Object.fromEntries(["unstaged", "staged", "composer", "diff"].map(panel => [panel, () => <Probe id={panel} />]));
    const view = presetView("fork", "changes");
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<LayoutHost plan={renderPlan(view, {}, all)!} panels={panels} />); });
    mounted.length = 0;
    // Diff moves left past the column holding the lists and the composer.
    await act(async () => { renderer.update(<LayoutHost plan={renderPlan(movePane(view, "diff", "left")!, {}, all)!} panels={panels} />); });
    expect(mounted).toEqual([]);
    renderer.unmount();
  });

  it("reuses the window's diff document when the layout moves the diff", async () => {
    const text = "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n";
    const document = { documentId: 1, rowCount: 0, getPlainRows: () => [], releaseNativeResources: jest.fn() };
    jest.mocked(loadUnifiedDiff).mockResolvedValue({ document } as never);
    let mounts = 0;
    const Counted = ({ children }: { children: React.ReactNode }) => { useEffect(() => { mounts += 1; }, []); return <>{children}</>; };
    const patch = { path: "a.txt", text, file: { hunks: [{}], binary: false } as never, section: "unstaged" as const, conflicted: false };
    const panels: PanelRenderers = {
      fileList: () => null,
      empty: () => null,
      diff: () => <Counted><DiffPane readOnly disabled patch={patch} onApply={() => {}} /></Counted>,
    };
    const cache = createDiffDocumentCache();
    const before: LayoutNode = { type: "split", direction: "row", children: [{ node: { type: "panel", panel: "fileList" }, size: 300 }, { node: { type: "panel", panel: "diff" } }] };
    // The diff moves one level down, into a new split: React can't reparent, so the pane remounts.
    const after: LayoutNode = { type: "split", direction: "row", children: [{ node: { type: "panel", panel: "fileList" }, size: 300 },
      { node: { type: "split", direction: "column", children: [{ node: { type: "panel", panel: "diff" } }, { node: { type: "panel", panel: "empty" }, size: 100 }] } }] };
    const render = (node: LayoutNode) => <DiffDocumentCacheContext.Provider value={cache}><LayoutHost plan={renderPlan(node, {}, all)!} panels={panels} /></DiffDocumentCacheContext.Provider>;
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(render(before)); });
    expect(mounts).toBe(1);
    // Moving the diff into another split remounts it; the document comes from the cache.
    await act(async () => { renderer.update(render(after)); });
    expect(mounts).toBe(2);
    expect(loadUnifiedDiff).toHaveBeenCalledTimes(1);
    expect(document.releaseNativeResources).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(document.releaseNativeResources).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
  });
});

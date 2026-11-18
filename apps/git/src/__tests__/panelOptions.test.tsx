import { Profiler, type ReactNode } from "react";
import { act, create } from "react-test-renderer";
import type { GitHistoryCommit } from "@legend-apps/diff-parser";
import { parseUnifiedPatch, unifiedPatchHunkKeys } from "@legend-apps/diff-parser/src/unifiedPatch";
import type { GitStatusEntry } from "@legend-apps/git-core";
import { diffConfigProps, sideBySideLine, withContextLines } from "../diffOptions";
import { FileRow } from "../FileRow";
import { fileListRows } from "../fileList";
import { applyColumnMenu, columnMenuItems, formatCommitDate, graphColumns, HistoryList, laneColor, visibleColumns, visibleRefs } from "../HistoryView";
import { diffMenu, runDiffAction } from "../layout/diffMenu";
import { LayoutHost } from "../layout/LayoutHost";
import { capabilityIssues } from "../settings/capabilities";
import { defaultSettings } from "../settings/defaults";
import { SettingsContext, usePanelOptions, useThemeTokens } from "../settings/panelOptions";
import { presetSettings } from "../settings/presets";
import { createGitSettingsStore, type SettingsIO } from "../settings/store";
import { resolveColor, resolveTheme } from "../settings/theme";
import { emptyHistory, type HistoryState } from "../gitHistory";
import type { HistoryActions } from "../HistoryView";

jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name, StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: {} },
  Text: "Text", View: "View", FlatList: "FlatList", Pressable: "Pressable", ScrollView: "ScrollView", useColorScheme: () => "light",
}));
jest.mock("@legend-apps/diff-parser", () => ({
  ...jest.requireActual("@legend-apps/diff-parser/src/unifiedPatch"),
  ...jest.requireActual("@legend-apps/diff-parser/src/diffRowPresentation"),
  DiffNativeRow: "DiffNativeRow", DiffNativeRowConfig: "DiffNativeRowConfig", loadUnifiedDiff: jest.fn(),
}));
// The list renders every row, so a test can count what renders.
jest.mock("@legendapp/list/react-native", () => ({
  LegendList: ({ data, renderItem, keyExtractor }: { data: unknown[]; renderItem: (info: { item: unknown }) => ReactNode; keyExtractor: (item: unknown) => string }) =>
    data.map(item => { const { Fragment, createElement } = jest.requireActual("react"); return createElement(Fragment, { key: keyExtractor(item) }, renderItem({ item })); }),
}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/sidebar", () => ({ Sidebar: "Sidebar", SidebarItem: "SidebarItem" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("@legendapp/spark/files", () => ({ watch: jest.fn(async () => ({ remove: async () => {} })) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function memoryStore() {
  const files = new Map<string, string>();
  const io: SettingsIO = { read: async path => files.get(path), write: async (path, text) => { files.set(path, text); }, mkdir: async () => {}, watch: async () => ({ remove: () => {} }) };
  const store = createGitSettingsStore({ io, directory: "/data" });
  return { store, files, user: () => JSON.parse(files.get("/data/settings.json") ?? "{}") as Record<string, any> };
}

const patch = [
  "diff --git a/f.txt b/f.txt", "--- a/f.txt", "+++ b/f.txt",
  "@@ -1,11 +1,11 @@ head", " a", " b", " c", "-d", "+D", " e", " f", " g", " h", " i", "-j", "+J", " k",
  "",
].join("\n");

describe("diff options → DiffNativeRowConfig", () => {
  const tokens = resolveTheme(defaultSettings.theme, "light").diff;
  const base = defaultSettings.panels.diff;
  const props = (options: Partial<typeof base>, density: "compact" | "regular" | "comfortable" = "regular", size = 12) =>
    diffConfigProps({ options: { ...base, ...options }, density, tokens, font: { family: "Menlo", size }, appearance: "light" });

  it("maps mode, split, density, font, gutters, whitespace and colors", () => {
    expect(props({}).presentation).toBe("unified");
    expect(props({ mode: "sideBySide", sideBySideSplit: "vertical" })).toMatchObject({ presentation: "blocks", changeBarWidth: 0 });
    // Horizontal (old above new) is the unified order.
    expect(props({ mode: "sideBySide", sideBySideSplit: "horizontal" }).presentation).toBe("unified");
    expect([props({}, "compact").rowHeight, props({}).rowHeight, props({}, "comfortable").rowHeight]).toEqual([16, 18, 20]);
    expect(props({}, "compact", 16)).toMatchObject({ rowHeight: 21, fontSize: 16 });
    expect(props({ lineNumbers: "none" }).lineNumberWidth).toBe(0);
    expect(props({ showWhitespace: true }).showWhitespaceCharacters).toBe(true);
    const custom = resolveTheme({ ...defaultSettings.theme, dark: { ...defaultSettings.theme.dark, diff: { ...defaultSettings.theme.dark.diff, addedLine: "#003300", gutter: "system:systemRed" } } }, "dark").diff;
    expect(diffConfigProps({ options: base, density: "regular", tokens: custom, font: { family: "Menlo", size: 12 }, appearance: "dark" })).toMatchObject({ addBackgroundColor: "#003300", mutedColor: "#FF453A", foregroundColor: "#e6edf3" });
    expect(props({})).toMatchObject({ addBackgroundColor: "#dafbe1", addAccentColor: "#1a7f37", removeBackgroundColor: "#ffebe9", removeAccentColor: "#cf222e", mutedColor: "#00000042" });
  });

  it("trims context lines and splits hunks, keeping every changed line's key", () => {
    expect(withContextLines(patch, 3)).toBe(patch);
    const one = parseUnifiedPatch(withContextLines(patch, 1))[0]!;
    expect(one.hunks.map(hunk => [hunk.oldStart, hunk.oldCount, hunk.newStart, hunk.newCount])).toEqual([[3, 3, 3, 3], [9, 3, 9, 3]]);
    expect(one.hunks[0]!.section).toBe(" head");
    const keys = (file: typeof one) => file.hunks.flatMap(unifiedPatchHunkKeys);
    expect(keys(one)).toEqual(keys(parseUnifiedPatch(patch)[0]!));
    expect(parseUnifiedPatch(withContextLines(patch, 0))[0]!.hunks.map(hunk => hunk.lines.map(line => line.kind).join(""))).toEqual(["-+", "-+"]);
  });

  it("selects both sides of a side-by-side row", () => {
    const row = (changeType: number, oldLineNumber: number, newLineNumber: number) => ({ changeType, oldLineNumber, newLineNumber }) as never;
    expect(sideBySideLine({ oldRowVisible: true, newRowVisible: true, newRowEqualsOldRow: false, oldRow: row(2, 4, 0), newRow: row(1, 0, 4) } as never).keys).toEqual(["-4", "+4"]);
    expect(sideBySideLine({ oldRowVisible: true, newRowVisible: true, newRowEqualsOldRow: true, oldRow: row(0, 5, 5), newRow: row(0, 5, 5) } as never).keys).toEqual([]);
  });

  it("View ▸ Diff checks the active mode and writes the user layer", async () => {
    const items = (diff: typeof base) => (diffMenu(diff, true) as unknown as { items: { id?: string; checked?: boolean }[] }).items.filter(item => item.checked).map(item => item.id);
    expect(items(base)).toEqual(["diff:mode:unified"]);
    expect(items({ ...base, mode: "sideBySide", sideBySideSplit: "horizontal" })).toEqual(["diff:mode:sideBySide", "diff:split:horizontal"]);
    const { store, user } = memoryStore();
    await store.ready;
    await runDiffAction("diff:split:horizontal", store);
    expect(user().panels).toEqual({ diff: { mode: "sideBySide", sideBySideSplit: "horizontal" } });
    await runDiffAction("diff:mode:unified", store);
    expect(store.settings$.panels.diff.mode.peek()).toBe("unified");
  });
});

describe("commit list options", () => {
  const columns = presetSettings("sourcetree").panels.commitList.columns;

  it("toggles, adds and resets columns from the header menu; the subject always shows", () => {
    expect(columnMenuItems(columns).filter(item => item.type === "checkbox" && item.checked).map(item => item.id)).toEqual(["column:graph", "column:subject", "column:author", "column:date", "column:sha"]);
    const hidden = applyColumnMenu(columns, "column:author")!;
    expect(visibleColumns(hidden).map(column => column.id)).toEqual(["graph", "subject", "date", "sha"]);
    expect(applyColumnMenu(hidden, "column:author")).toEqual(columns);
    expect(applyColumnMenu(columns, "column:refs")!.at(-1)).toEqual({ id: "refs" });
    expect(applyColumnMenu(columns, "column:subject")).toBe(columns);
    expect(applyColumnMenu(columns, "column:reset")).toBeUndefined();
    expect(visibleColumns([{ id: "graph" }, { id: "subject", visible: false }]).map(column => column.id)).toEqual(["graph", "subject"]);
  });

  it("filters refs, formats dates, and folds lanes past the cap into the overflow color", () => {
    const refs = new Map([["a", [{ kind: "branch" as const, name: "main" }, { kind: "remote" as const, name: "origin/main" }, { kind: "tag" as const, name: "v1" }]]]);
    const options = { refs: "inline" as const, showRemoteRefs: true, showTags: true };
    expect(visibleRefs(refs, options)).toBe(refs);
    expect(visibleRefs(refs, { ...options, showRemoteRefs: false, showTags: false }).get("a")!.map(ref => ref.name)).toEqual(["main"]);
    expect(visibleRefs(refs, { ...options, refs: "hidden" }).size).toBe(0);
    expect(formatCommitDate(1_700_000_000, "iso")).toBe("2023-11-14T22:13:20Z");
    expect(formatCommitDate(1_700_000_000 - 120, "relative", 1_700_000_000_000)).toBe("2 minutes ago");

    const palette = ["#1", "#2", "#3", "#overflow"];
    expect(laneColor(palette, 2, 7, 4, "lane")).toBe("#3");
    expect(laneColor(palette, 2, 7, 4, "branch")).toBe("#2");
    expect(laneColor(palette, 4, 0, 4, "lane")).toBe("#overflow");
    const commit = (lane: number) => ({ lane, edges: [] }) as unknown as GitHistoryCommit;
    expect(graphColumns([commit(9)], 4)).toBe(5);
  });
});

describe("file list options", () => {
  const entries = [{ path: "src/b.ts", status: "2" }, { path: "README.md", status: "1" }, { path: "src/a/c.ts", status: "1" }, { path: "src/a.ts", status: "3" }];
  const ids = (rows: { id: string }[]) => rows.map(row => row.id);

  it("keeps the list's order for path, sorts by name or status, and groups a tree by folder", () => {
    expect(ids(fileListRows(entries, { style: "flat", sort: "path" }))).toEqual(["src/b.ts", "README.md", "src/a/c.ts", "src/a.ts"]);
    expect(ids(fileListRows(entries, { style: "flat", sort: "name" }))).toEqual(["src/a.ts", "src/b.ts", "src/a/c.ts", "README.md"]);
    expect(ids(fileListRows(entries, { style: "flat", sort: "status" }, entry => entry.status))).toEqual(["README.md", "src/a/c.ts", "src/b.ts", "src/a.ts"]);
    expect(ids(fileListRows(entries, { style: "tree", sort: "name" }))).toEqual(["README.md", "folder:src", "src/a.ts", "src/b.ts", "folder:src/a", "src/a/c.ts"]);
  });

  it("reports checkboxes falling back to buttons at info level (Spark ask A9)", () => {
    const issues = capabilityIssues(presetSettings("sourcetree"), "settings");
    expect(issues.filter(issue => issue.path.endsWith("stagingControl"))).toEqual([
      expect.objectContaining({ path: "panels.unstaged.stagingControl", level: "info" }),
      expect.objectContaining({ path: "panels.staged.stagingControl", level: "info" }),
    ]);
    expect(capabilityIssues(presetSettings("fork"), "settings").filter(issue => issue.path.endsWith("stagingControl"))).toEqual([]);
  });
});

describe("theme tokens", () => {
  it("resolves system colors to hex per appearance, once, frozen", () => {
    const light = resolveTheme(defaultSettings.theme, "light"), dark = resolveTheme(defaultSettings.theme, "dark");
    expect([light.accent, dark.accent]).toEqual(["#007AFF", "#0A84FF"]);
    expect([light.diff.hunkHeader, dark.diff.hunkHeader]).toEqual(["#00000080", "#FFFFFF8C"]);
    expect([resolveColor("system:systemGreen", "dark"), resolveColor("system:systemGreenColor", "light"), resolveColor("#123456", "dark")]).toEqual(["#32D74B", "#28CD41", "#123456"]);
    expect(resolveColor("system:noSuchColor", "light")).toBe("#8E8E93");
    expect(light.lanes.at(-1)).toBe("#00000042");
    expect(light.codeFont).toBe("Menlo");
    expect(Object.isFrozen(light) && Object.isFrozen(light.status) && Object.isFrozen(light.lanes)).toBe(true);
  });
});

describe("narrow subscriptions", () => {
  const commits: GitHistoryCommit[] = ["c3", "c2", "c1"].map((oid, index) => ({ oid, parents: [], authorName: "Ada", authorEmail: "", time: 1_700_000_000, summary: oid, lane: 0, color: index, edges: [] }));
  const history: HistoryState = { ...emptyHistory, root: "/repo", head: { oid: "c3", unborn: false, detached: false }, commits, done: true, currentBranch: "main" };
  const actions = new Proxy({}, { get: () => () => {} }) as HistoryActions;
  const entry: GitStatusEntry = { kind: "ordinary", path: "src/a.ts", indexStatus: ".", worktreeStatus: "M" };

  async function mount() {
    const { store } = memoryStore();
    await store.ready;
    const renders = { list: 0, file: 0 };
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SettingsContext.Provider value={{ settings$: store.settings$, store }}>
        <Profiler id="list" onRender={() => { renders.list += 1; }}><HistoryList history={history} actions={actions} /></Profiler>
        <Profiler id="file" onRender={() => { renders.file += 1; }}><FileRow entry={entry} staged={false} /></Profiler>
      </SettingsContext.Provider>);
    });
    renders.list = renders.file = 0;
    return { store, renders, renderer };
  }

  it("a diff option change renders no commit list row and no file row", async () => {
    const { store, renders, renderer } = await mount();
    await act(async () => { await store.edit("user", ["panels", "diff", "mode"], "sideBySide"); });
    await act(async () => { await store.edit("user", ["panels", "diff", "contextLines"], 1); });
    expect(store.settings$.panels.diff.mode.peek()).toBe("sideBySide");
    expect(renders).toEqual({ list: 0, file: 0 });
    // The control: a commit list option does render the list.
    await act(async () => { await store.edit("user", ["panels", "commitList", "dateFormat"], "iso"); });
    expect(renders.list).toBeGreaterThan(0);
    expect(renders.file).toBe(0);
    renderer.unmount();
  });

  it("draws tinted refs in the refs column with the column's width and the theme's ref colors", async () => {
    const { store } = memoryStore();
    await store.ready;
    await store.edit("user", ["panels", "commitList"], { columns: [{ id: "refs", width: 180 }, { id: "subject" }], refs: "column", refStyle: "tinted" });
    const refs = new Map([["c2", [{ kind: "branch" as const, name: "main" }, { kind: "tag" as const, name: "v1" }]]]);
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<SettingsContext.Provider value={{ settings$: store.settings$, store }}><HistoryList history={{ ...history, refs }} actions={actions} /></SettingsContext.Provider>);
    });
    const style = (name: string) => Object.assign({}, ...[renderer.root.findAll(node => (node.type as unknown) === "Text" && node.props.children === name)[0]!.props.style].flat(Infinity).filter(Boolean));
    expect(style("main")).toMatchObject({ color: "#28CD41", fontWeight: "600" });
    expect(style("v1")).toMatchObject({ color: "#FF9500" });
    // Inline refs give way to the subject at half the row; in their own column they keep the column.
    expect(style("main").maxWidth).toBeUndefined();
    expect(renderer.root.findAll(node => (node.type as unknown) === "SFSymbol").map(node => node.props.name)).toEqual(["arrow.triangle.branch", "tag"]);
    renderer.unmount();
  });

  it("a diff color change renders no list row; a status color renders only the file row", async () => {
    const { store, renders, renderer } = await mount();
    await act(async () => { await store.edit("user", ["theme", "light", "diff", "addedLine"], "#00ff00"); });
    expect(renders).toEqual({ list: 0, file: 0 });
    await act(async () => { await store.edit("user", ["theme", "light", "status", "modified"], "#123456"); });
    expect(renders).toEqual({ list: 0, file: 1 });
    expect(renderer.root.findByType("SFSymbol" as never).props.color).toBe("#123456");
    renderer.unmount();
  });
});

describe("per-instance options", () => {
  it("merges a layout node's options over panels.<panel> for that pane only", async () => {
    const { store } = memoryStore();
    await store.ready;
    const seen: Record<string, string> = {};
    function Probe({ id }: { id: string }) { seen[id] = usePanelOptions("fileList").style; return null; }
    const plan = { type: "split" as const, direction: "row" as const, children: [
      { plan: { type: "panel" as const, id: "files", panel: "fileList" as const, options: { style: "tree" } } },
      { plan: { type: "panel" as const, id: "staged", panel: "staged" as const } },
    ] };
    await act(async () => {
      create(<SettingsContext.Provider value={{ settings$: store.settings$, store }}>
        <LayoutHost plan={plan} panels={{ fileList: ({ id }) => <Probe id={id} />, staged: ({ id }) => <Probe id={id} /> }} />
      </SettingsContext.Provider>);
    });
    // The staged pane reads panels.staged (SourceTree: flat); the fileList pane its own override.
    expect(seen).toEqual({ files: "tree", staged: "flat" });
  });

  it("subscribes a token group, not the whole theme", async () => {
    const { store } = memoryStore();
    await store.ready;
    let renders = 0;
    function Lanes() { renders += 1; return <>{useThemeTokens("lanes").length}</>; }
    await act(async () => { create(<SettingsContext.Provider value={{ settings$: store.settings$, store }}><Lanes /></SettingsContext.Provider>); });
    renders = 0;
    await act(async () => { await store.edit("user", ["theme", "light", "refs", "tag"], "#abcdef"); });
    expect(renders).toBe(0);
    await act(async () => { await store.edit("user", ["theme", "light", "lanes"], ["#111111", "#222222", "#333333"]); });
    expect(renders).toBe(1);
  });
});

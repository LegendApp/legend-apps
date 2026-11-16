import { getGitService, type GitService } from "@legend-apps/git-core";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { Button } from "@legendapp/spark/ui";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { openFileDialog, showMessage, showPrompt } from "@legendapp/spark/dialogs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";
import { Switch, Text, TextInput } from "react-native";
import { useMenu } from "@legendapp/spark/menus";
import { runCommand } from "@legendapp/spark/processes";
import { App } from "../App";
import { blameLine, loadUnifiedDiff, openGitHistory } from "@legend-apps/diff-parser";
import { setStringAsync } from "@legendapp/spark/clipboard";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { openURL } from "@legendapp/spark/links";

jest.mock("@legend-apps/git-core", () => ({ ...jest.requireActual("@legend-apps/git-core"), getGitService: jest.fn() }));
jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text", View: "View", Pressable: "Pressable", FlatList: "FlatList", ScrollView: "ScrollView", Switch: "Switch", TextInput: "TextInput", useColorScheme: () => "light",
}));
jest.mock("@legend-apps/diff-parser", () => ({ DiffNativeRow: "DiffNativeRow", DiffNativeRowConfig: "DiffNativeRowConfig", getDiffRowPalette: () => ({}), loadUnifiedDiff: jest.fn(), gitHistoryPageSize: 500, openGitHistory: jest.fn(), blameLine: jest.fn() }));
jest.mock("@legendapp/list/react-native", () => ({ LegendList: "LegendList" }));
jest.mock("@legendapp/spark/clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("@legendapp/spark/context-menu", () => ({ showContextMenu: jest.fn(async () => ({ canceled: false, itemId: "copy-sha" })) }));
jest.mock("@legendapp/spark/links", () => ({ openURL: jest.fn(async () => true) }));
jest.mock("@legend-apps/file-system-watcher", () => ({ watchDirectories: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn(async () => ({ canceled: true })), showMessage: jest.fn(async () => ({ buttonId: "confirm" })), showPrompt: jest.fn(async () => ({ canceled: true })) }));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));
jest.mock("@legendapp/spark/ai", () => ({ ...jest.requireActual("@legendapp/spark/ai"), getAICommandAvailability: jest.fn(async () => ({ claude: true, codex: false, preferredTool: "claude" })) }));
jest.mock("@legendapp/spark/ui/sidebar", () => {
  const React = jest.requireActual("react");
  const ids = (children: unknown): unknown[] => React.Children.toArray(children).flatMap((child: any) =>
    child?.type === React.Fragment ? ids(child.props.children) : child?.props?.id !== undefined && child.props.selectable !== false ? [child.props.id] : []);
  return {
    SidebarItem: "SidebarItem",
    // Like Spark's, it throws when the selection names no selectable row.
    Sidebar: function Sidebar({ selectedId, children, ...props }: any) {
      if (selectedId != null && !ids(children).includes(selectedId)) throw new Error(`Selected sidebar ID must identify a selectable item: ${selectedId}`);
      return React.createElement("Sidebar", { selectedId, ...props }, children);
    },
  };
});
jest.mock("@legendapp/spark/ui/split-view", () => ({
  SidebarSplitView: ({ sidebar, list, content }: any) => <>{sidebar}{list}{content}</>,
}));
jest.mock("@legendapp/spark/windows", () => ({ setWindowOptions: jest.fn(async () => {}), addWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })) }));
jest.mock("@legendapp/spark/windows/macos", () => ({
  addMacOSWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));

const lastMenu = () => jest.mocked(useMenu).mock.calls.at(-1)![0] as unknown as { items: any[]; onAction: (action: { itemId: string }) => void };
const openMenu = () => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === "open-repository");
/** File ▸ Open Repository…, the way the menu bar runs it. */
const openRepository = () => lastMenu().onAction({ itemId: "open-repository" });

it("renders the empty window, toggles its sidebar, opens the folder panel and cleans up", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  expect(JSON.stringify(renderer.toJSON())).toContain("No repository open");
  // Without a repository the toolbar has only the sidebar toggle and there is no list column; Open Repository lives in the File menu.
  expect(jest.mocked(setWindowOptions).mock.calls.at(-1)![1]).toMatchObject({ title: "Legend Git", macos: { toolbar: { items: [{ id: "toggle-sidebar", type: "button" }] } } });
  expect(renderer.root.findByType(SidebarSplitView).props.list).toBeUndefined();
  expect(openMenu()).toMatchObject({ label: "Open Repository…", shortcut: "Cmd+o", disabled: false });
  const listener = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "toggle-sidebar" }); });
  expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(true);
  await act(async () => { renderer.root.findByType(SidebarSplitView).props.onSidebarCollapsedChange(false); });
  expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(false);
  await act(async () => { openRepository(); });
  expect(openFileDialog).toHaveBeenCalledWith({ windowId: "main", selection: "directories", multiple: false, title: "Open Repository" });
  const registration = await jest.mocked(addMacOSWindowListener).mock.results[0].value;
  await act(async () => { renderer.unmount(); });
  expect(registration.remove).toHaveBeenCalledTimes(1);
});

it("resolves the shared git workspace package without loading native capabilities", () => {
  expect(require.resolve("@legend-apps/git-core")).toMatch(/packages\/git-core\/src\/index\.ts$/);
});

it("opens a repository, selects a native file row, stages and unstages it, and releases window registrations on close", async () => {
  jest.clearAllMocks();
  const remove = jest.fn(); jest.mocked(watchDirectories).mockReturnValue({ remove });
  const branch = { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 };
  const entry = { kind: "ordinary" as const, path: "both.txt", indexStatus: "M", worktreeStatus: "M" };
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries: [entry] })), stageFile: jest.fn(async () => {}), unstageFile: jest.fn(async () => {}),
    fileDiff: jest.fn(async () => ""), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })), discardFiles: jest.fn(async () => {}), commit: jest.fn(async () => {}), headMessage: jest.fn(async () => "Last subject\nwrapped\n\nLast body") };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo/nested"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const toolbar = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { openRepository(); });
  const text = () => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join("")).join("\n");
  expect(text()).toContain("Unstaged (1)");
  expect(text()).toContain("Staged (1)");
  const select = async (section: number) => act(async () => { renderer.root.findAllByType(Sidebar)[section].props.onSelectionChange({ id: "both.txt" }); });
  await select(1);
  git.status.mockResolvedValueOnce({ branch, entries: [{ ...entry, worktreeStatus: "." }] });
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Stage")!.props.onPress(); });
  expect(git.stageFile).toHaveBeenCalledTimes(1);
  expect(text()).toContain("Unstaged (0)");
  await select(1);
  git.status.mockResolvedValueOnce({ branch, entries: [{ ...entry, indexStatus: "." }] });
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Unstage")!.props.onPress(); });
  expect(git.unstageFile).toHaveBeenCalledTimes(1);
  expect(text()).toContain("Staged (0)");
  const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.children === label)!;

  // Discard asks with a native warning sheet first; cancelling leaves the file alone.
  await select(1);
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { button("Discard…").props.onPress(); });
  expect(git.discardFiles).not.toHaveBeenCalled();
  await act(async () => { button("Discard…").props.onPress(); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ windowId: "main", kind: "warning", title: "Discard changes to “both.txt”?" }));
  expect(git.discardFiles).toHaveBeenCalledWith(["both.txt"], expect.anything());

  // Commit stays disabled until something is staged and a summary is entered; amend prefills HEAD's message.
  const inputs = () => renderer.root.findAllByType(TextInput);
  expect(button("Commit").props.disabled).toBe(true);
  git.status.mockResolvedValue({ branch, entries: [{ ...entry, worktreeStatus: "." }] });
  await act(async () => { toolbar({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  await act(async () => { inputs()[0]!.props.onChangeText("-Summary ✓"); inputs()[1]!.props.onChangeText("# kept\nBody"); });
  await act(async () => { renderer.root.findAllByType(Switch)[1]!.props.onValueChange(true); });
  expect(button("Commit").props.disabled).toBe(false);
  await act(async () => { button("Commit").props.onPress(); });
  expect(git.commit).toHaveBeenLastCalledWith({ message: "-Summary ✓\n\n# kept\nBody\n", amend: false, signoff: true }, expect.anything());
  expect(inputs()[0]!.props.value).toBe("");
  await act(async () => { renderer.root.findAllByType(Switch)[0]!.props.onValueChange(true); });
  expect(inputs().map(input => input.props.value)).toEqual(["Last subject", "wrapped\n\nLast body"]);
  // An unedited amend keeps HEAD's message exactly, even when its first paragraph wraps.
  await act(async () => { button("Amend Commit").props.onPress(); });
  expect(git.commit).toHaveBeenLastCalledWith({ message: "Last subject\nwrapped\n\nLast body\n", amend: true, signoff: true }, expect.anything());
  await act(async () => { jest.mocked(addWindowListener).mock.calls[0][2]({ windowId: "main" }); });
  expect(remove).toHaveBeenCalledTimes(1);
  const registration = await jest.mocked(addMacOSWindowListener).mock.results[0].value;
  expect(registration.remove).toHaveBeenCalledTimes(1);
  await act(async () => { renderer.unmount(); });
  expect(remove).toHaveBeenCalledTimes(1);
});

it("generates a commit message from the staged diff, shows progress, cancels on a second press and on window close", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const branch = { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 };
  const entry = { kind: "ordinary" as const, path: "app.ts", indexStatus: "M", worktreeStatus: "." };
  const stagedDiff = { files: [{ path: "app.ts", originalPath: null, binary: false, added: 1, deleted: 1 }], patch: "diff --git a/app.ts b/app.ts\n", truncated: false, omitted: [] };
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries: [entry] })), fileDiff: jest.fn(async () => ""), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    stagedDiff: jest.fn(async () => stagedDiff), commit: jest.fn(async () => {}) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.children === label);
  const menuItem = () => jest.mocked(useMenu).mock.calls.at(-1)![0].items.flatMap((item: any) => item.items ?? []).find((item: any) => item.id === "generate-message");
  const inputs = () => renderer.root.findAllByType(TextInput);
  expect(button("Generate")!.props.disabled).toBe(false);
  expect(menuItem()).toMatchObject({ label: "Generate Commit Message", shortcut: "Cmd+Alt+g", disabled: false });

  let finish!: (value: unknown) => void;
  const signals: AbortSignal[] = [];
  jest.mocked(runCommand).mockImplementation(async (options: any) => { signals.push(options.signal); return new Promise(resolve => { finish = resolve; }) as never; });
  await act(async () => { button("Generate")!.props.onPress(); });
  expect(git.stagedDiff).toHaveBeenCalledTimes(1);
  expect(jest.mocked(runCommand).mock.calls[0]![0]).toMatchObject({ target: { name: "claude" }, cwd: "/repo", input: expect.stringContaining("diff --git a/app.ts b/app.ts") });
  expect(button("Generating…")).toBeDefined();
  expect(button("Cancel")).toBeDefined();
  expect(menuItem()).toMatchObject({ label: "Cancel Generating Commit Message", disabled: false });
  await act(async () => { button("Generating…")!.props.onPress(); });
  expect(signals[0]!.aborted).toBe(true);
  expect(button("Generate")).toBeDefined();

  // A finished run fills the empty fields, which then commit as usual.
  await act(async () => { jest.mocked(useMenu).mock.calls.at(-1)![0].onAction!({ type: "action", itemId: "generate-message" }); });
  await act(async () => { finish({ exit: { type: "exited", code: 0 }, stdout: new TextEncoder().encode("{\"subject\": \"fix: keep app state\", \"body\": \"Body\"}"), stderr: new Uint8Array(), timedOut: false, aborted: false, outputTruncated: false }); });
  expect(inputs().map(input => input.props.value)).toEqual(["fix: keep app state", "Body"]);
  await act(async () => { button("Commit")!.props.onPress(); });
  expect(git.commit).toHaveBeenLastCalledWith({ message: "fix: keep app state\n\nBody\n", amend: false, signoff: false }, expect.anything());

  // Closing the window cancels a running generation.
  await act(async () => { button("Generate")!.props.onPress(); });
  await act(async () => { jest.mocked(addWindowListener).mock.calls[0][2]({ windowId: "main" }); });
  expect(signals.at(-1)!.aborted).toBe(true);

  // Nothing staged or a conflict disables it.
  await act(async () => { renderer.unmount(); });
  git.status.mockResolvedValue({ branch, entries: [{ kind: "unmerged", path: "app.ts", indexStatus: "U", worktreeStatus: "U" }, { ...entry, path: "b.ts" }] } as never);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  expect(button("Generate")!.props.disabled).toBe(true);
  expect(menuItem().disabled).toBe(true);
  await act(async () => { renderer.unmount(); });
});

it("shows History from the sidebar and View menu, selects commits, and copies or opens them on GitHub", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40), parent = "b".repeat(40);
  const commits = [
    { oid: head, parents: [parent], authorName: "Ada", authorEmail: "ada@example.test", time: 1_700_000_000, summary: "Second", lane: 0, color: 0, edges: [-1, 0, 0] },
    { oid: parent, parents: [], authorName: "Ada", authorEmail: "ada@example.test", time: 1_699_000_000, summary: "First", lane: 0, color: 0, edges: [0, -1, 0] },
  ];
  const reader = { head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: offset ? [] : commits, done: true })), close: jest.fn() };
  jest.mocked(openGitHistory).mockResolvedValue(reader);
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const locations = { root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] };
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => locations),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map([[head, [{ kind: "branch", name: "main" }, { kind: "tag", name: "v1.0" }]]])),
    remoteUrl: jest.fn(async () => "git@github.com:LegendApp/legend-apps.git"), currentBranch: jest.fn(async () => "main"),
    commitDetails: jest.fn(async (oid: string) => ({ oid, parents: oid === head ? [parent] : [], author: { name: "Ada", email: "ada@example.test", time: 1 }, committer: { name: "Ada", email: "ada@example.test", time: 1 }, message: oid === head ? "Second\n\nBody" : "First" })),
    commitPatch: jest.fn(async () => "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n"),
    fileHistory: jest.fn(async () => ({ commits: [{ oid: parent, parents: [], authorName: "Ada", authorEmail: "ada@example.test", time: 1_699_000_000, summary: "First", status: "A", path: "old/a.txt", oldPath: null }], done: true })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const toolbar = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { openRepository(); });
  const menu = () => jest.mocked(useMenu).mock.calls.at(-1)![0] as unknown as { items: any[]; onAction: (action: { itemId: string }) => void };
  const item = (id: string) => menu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  expect(item("show-file-history")).toMatchObject({ label: "Show File History", disabled: true });
  expect(item("show-history")).toMatchObject({ label: "History", shortcut: "Cmd+2", disabled: false });
  expect(item("copy-sha")).toMatchObject({ label: "Copy SHA", disabled: true });
  expect(openGitHistory).not.toHaveBeenCalled();

  await act(async () => { renderer.root.findAllByType(Sidebar)[0]!.props.onSelectionChange({ id: "history" }); });
  expect(openGitHistory).toHaveBeenCalledWith("/repo", expect.any(AbortSignal), "");
  expect(renderer.root.findAllByType(Sidebar)[0]!.props.selectedId).toBe("history");
  const list = renderer.root.findByType("LegendList" as any);
  expect(list.props.data.map((commit: { summary: string }) => commit.summary)).toEqual(["Second", "First"]);
  expect(list.props.getFixedItemSize()).toBe(44);

  let row!: ReactTestRenderer;
  await act(async () => { row = create(list.props.renderItem({ item: commits[0] })); });
  const text = (node: ReactTestRenderer) => node.root.findAllByType(Text).map(entry => [entry.props.children].flat().join("")).join("\n");
  // Ref names follow the subject as plain text, not pills; the current branch is in label color, semibold.
  expect(text(row)).toContain("Second\n");
  expect(text(row)).toContain("main\n, v1.0\naaaaaaa\nAda");
  const refText = (name: string) => row.root.findAllByType(Text).find(entry => [entry.props.children].flat().join("") === name)!;
  expect([refText("main").props.style].flat()).toContainEqual({ fontWeight: "600", color: "labelColor" });
  expect(refText(", v1.0").props.style).toBeUndefined();
  const [graph, textColumn] = (row.toJSON() as { children: unknown[] }).children;
  expect(JSON.stringify(textColumn)).not.toMatch(/borderWidth/);
  // The graph cell draws the tip's line from its node down to the parent's row in the same lane.
  expect(JSON.stringify(graph)).toContain('"top":22,"height":22');
  await act(async () => { row.root.findByProps({ accessibilityRole: "button" }).props.onPress({ nativeEvent: {} }); });
  expect(git.commitDetails).toHaveBeenCalledWith(head, expect.anything());
  expect(text(renderer)).toContain("Body");
  expect(item("copy-sha")).toMatchObject({ disabled: false });
  await act(async () => { menu().onAction({ itemId: "copy-sha" }); });
  expect(setStringAsync).toHaveBeenLastCalledWith(head);
  await act(async () => { menu().onAction({ itemId: "open-github" }); });
  expect(openURL).toHaveBeenLastCalledWith(`https://github.com/LegendApp/legend-apps/commit/${head}`);

  // Right-click shows the commit's native context menu; parents are clickable.
  await act(async () => { row.root.findByProps({ accessibilityRole: "button" }).props.onTouchEnd({ nativeEvent: { button: 2, pageX: 30, pageY: 40 } }); });
  expect(showContextMenu).toHaveBeenCalledWith(expect.objectContaining({ windowId: "main", position: { x: 30, y: 40 } }));
  expect(setStringAsync).toHaveBeenCalledTimes(2);
  // A primary-button touch end only selects, through onPress.
  await act(async () => { row.root.findByProps({ accessibilityRole: "button" }).props.onTouchEnd({ nativeEvent: { button: 0 } }); });
  expect(showContextMenu).toHaveBeenCalledTimes(1);
  await act(async () => { renderer.root.findByProps({ accessibilityLabel: "Parent bbbbbbb" }).props.onPress(); });
  expect(git.commitDetails).toHaveBeenLastCalledWith(parent, expect.anything());
  expect(text(renderer)).toContain("None (root commit)");

  // A ref that moves while HEAD stays still redraws the recycled rows' badges.
  const before = renderer.root.findByType("LegendList" as any).props.extraData;
  git.refDecorations.mockResolvedValueOnce(new Map([[parent, [{ kind: "remote", name: "origin/main" }]]]));
  await act(async () => { toolbar({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  expect(renderer.root.findByType("LegendList" as any).props.extraData).not.toBe(before);
  expect(renderer.root.findAllByProps({ children: "Open on GitHub" }).length).toBeGreaterThan(0);

  // A changed file's context menu opens its history (following renames); Show All returns to the graph.
  expect(item("show-file-history")).toMatchObject({ disabled: false, shortcut: "Cmd+Shift+h" });
  expect(item("show-all-history")).toMatchObject({ disabled: true });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "show-file-history" } as never);
  const fileItem = renderer.root.findAllByType(SidebarItem).find(entry => entry.props.id === "a.txt")!;
  await act(async () => { fileItem.props.onContextMenu({ id: "a.txt", position: { x: 1, y: 2 }, windowPosition: { x: 50, y: 60 } }); });
  expect(showContextMenu).toHaveBeenLastCalledWith({ windowId: "main", position: { x: 50, y: 60 }, items: [{ type: "action", id: "show-file-history", label: "Show File History", disabled: false }] });
  expect(git.fileHistory).toHaveBeenCalledWith("a.txt", expect.objectContaining({ offset: 0, count: 500 }));
  const fileList = renderer.root.findByType("LegendList" as any);
  expect(fileList.props.data.map((commit: { oid: string }) => commit.oid)).toEqual([parent]);
  expect(text(renderer)).toContain("File History: a.txt");
  let fileRow!: ReactTestRenderer;
  await act(async () => { fileRow = create(fileList.props.renderItem({ item: fileList.props.data[0] })); });
  expect(text(fileRow)).toContain("Ada · old/a.txt");
  expect(fileRow.root.findAllByProps({ importantForAccessibility: "no-hide-descendants" })).toHaveLength(0);
  expect(item("show-all-history")).toMatchObject({ disabled: false });
  await act(async () => { menu().onAction({ itemId: "show-all-history" }); });
  expect(renderer.root.findByType("LegendList" as any).props.data).toHaveLength(2);
  expect(text(renderer)).not.toContain("File History:");

  await act(async () => { menu().onAction({ itemId: "show-changes" }); });
  expect(renderer.root.findAllByType("LegendList" as any)).toHaveLength(0);
  await act(async () => { renderer.unmount(); });
  expect(reader.close).toHaveBeenCalled();
});

it("switches sections from the sidebar, the toolbar segment and the View menu, keeping each section's selection", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "c".repeat(40);
  const commits = [{ oid: head, parents: [], authorName: "Ada", authorEmail: "ada@example.test", time: 1_700_000_000, summary: "Only", lane: 0, color: 0, edges: [] }];
  jest.mocked(openGitHistory).mockResolvedValue({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: offset ? [] : commits, done: true })), close: jest.fn() });
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 };
  const entries = [
    { kind: "ordinary" as const, path: "src/app.ts", indexStatus: ".", worktreeStatus: "M" },
    { kind: "ordinary" as const, path: "README.md", indexStatus: ".", worktreeStatus: "M" },
    { kind: "untracked" as const, path: "notes.txt", indexStatus: "?", worktreeStatus: "?" },
  ];
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries })), fileDiff: jest.fn(async () => ""), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    commitDetails: jest.fn(async (oid: string) => ({ oid, parents: [], author: { name: "Ada", email: "ada@example.test", time: 1 }, committer: { name: "Ada", email: "ada@example.test", time: 1 }, message: "Only" })),
    commitPatch: jest.fn(async () => "") };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const listener = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  const toolbar = () => jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items!;
  const toolbarItem = (id: string) => toolbar().find(entry => entry.id === id) as any;
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const navigation = () => renderer.root.findAllByType(Sidebar)[0]!;
  const split = () => renderer.root.findByType(SidebarSplitView);
  const unstagedRows = () => renderer.root.findAllByType(Sidebar)[1]!;

  // Toolbar: sidebar toggle and branch menu leading, segmented sections, Refresh, search; no Open or Restore.
  expect(toolbar().map(entry => entry.id)).toEqual(["toggle-sidebar", "branch", "section", "refresh", "search"]);
  expect(toolbarItem("branch")).toMatchObject({ type: "menu", label: "main", items: [{ id: "switch-branch", disabled: true }, { id: "new-branch", disabled: false }] });
  expect(toolbarItem("section")).toMatchObject({ type: "segmented", value: "changes" });
  expect(split().props.list).toBeDefined();

  await act(async () => { unstagedRows().props.onSelectionChange({ id: "src/app.ts" }); });
  expect(unstagedRows().props.selectedId).toBe("src/app.ts");
  await act(async () => { renderer.root.findAllByType(TextInput)[0]!.props.onChangeText("Draft summary"); });

  // Toolbar segment → History; select a commit.
  await act(async () => { listener({ type: "toolbarSelectionChanged", windowId: "main", itemId: "section", value: "history" }); });
  expect(navigation().props.selectedId).toBe("history");
  expect(toolbarItem("section").value).toBe("history");
  expect(toolbarItem("search")).toMatchObject({ placeholder: "Search Commits" });
  expect(toolbarItem("search").disabled).toBeUndefined();
  expect(toolbarItem("search-scope")).toMatchObject({ type: "menu", label: "Message" });
  // A section switch updates only the toolbar; the title bar options went once, at mount.
  expect(jest.mocked(setWindowOptions).mock.calls.at(-1)![1]).toEqual({ macos: { toolbar: expect.anything() } });
  expect(jest.mocked(setWindowOptions).mock.calls.filter(call => call[1].macos?.titleBar)).toHaveLength(1);
  const list = renderer.root.findByType("LegendList" as any);
  let row!: ReactTestRenderer;
  await act(async () => { row = create(list.props.renderItem({ item: commits[0] })); });
  await act(async () => { row.root.findByProps({ accessibilityRole: "button" }).props.onPress({ nativeEvent: {} }); });
  expect(renderer.root.findAllByProps({ children: "Copy SHA" }).length).toBeGreaterThan(0);
  // In History the search field searches commits; its events don't filter the hidden Changes lists. Clearing it ends the search.
  await act(async () => { listener({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "zzz", shiftKey: false }); });
  expect(renderer.root.findAllByType("LegendList" as any)).toHaveLength(0);
  await act(async () => { listener({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "", shiftKey: false }); });
  // A Changes error still shows while History is in front.
  git.status.mockRejectedValueOnce(new Error("status failed"));
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  const visible = (node: any): boolean => !node || (![node.props?.style].flat(Infinity).some((style: any) => style?.display === "none") && visible(node.parent));
  expect(renderer.root.findAllByProps({ accessibilityRole: "alert" }).filter(visible).map(node => node.props.children)).toContain("status failed");

  // ⌘1 → Changes keeps the file; sidebar → History keeps the commit.
  await act(async () => { lastMenu().onAction({ itemId: "show-changes" }); });
  expect(navigation().props.selectedId).toBe("changes");
  expect(toolbarItem("section").value).toBe("changes");
  expect(unstagedRows().props.selectedId).toBe("src/app.ts");
  expect(renderer.root.findAllByType(TextInput)[0]!.props.value).toBe("Draft summary");
  await act(async () => { navigation().props.onSelectionChange({ id: "history" }); });
  expect(renderer.root.findByType("LegendList" as any).props.extraData.selectedOid).toBe(head);
  expect(menuItem("copy-sha")).toMatchObject({ disabled: false });
  // The hidden composer can't commit from History.
  expect(menuItem("commit")).toMatchObject({ disabled: true });
  await act(async () => { lastMenu().onAction({ itemId: "show-changes" }); });
  expect(menuItem("commit")).toMatchObject({ disabled: false });

  // The toolbar search filters the file lists by name; the selected file stays listed.
  const ids = () => unstagedRows().findAllByType("SidebarItem" as any).map(node => node.props.id);
  expect(ids()).toEqual(["src/app.ts", "README.md", "notes.txt"]);
  await act(async () => { listener({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "READ", shiftKey: false }); });
  expect(ids()).toEqual(["src/app.ts", "README.md"]);
  await act(async () => { listener({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "", shiftKey: false }); });
  expect(ids()).toHaveLength(3);
  await act(async () => { renderer.unmount(); });
});

it("computes each command's enabled state once for the menu bar, toolbar and context menus", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const listener = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const toolbarItem = (id: string) => (jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items! as any[]).find(entry => entry.id === id);

  // Without a repository, commands that need one are disabled everywhere and do nothing when sent anyway.
  for (const id of ["show-changes", "show-history", "refresh", "copy-sha", "open-github", "commit", "restore-discard"]) expect(menuItem(id)).toMatchObject({ disabled: true });
  expect(menuItem("toggle-sidebar")).toBeUndefined();
  expect(toolbarItem("toggle-sidebar")).toMatchObject({ label: "Hide Sidebar", disabled: false });
  await act(async () => { lastMenu().onAction({ itemId: "show-history" }); listener({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  expect(renderer.root.findAllByType(Sidebar)[0]!.props.selectedId).toBeNull();
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "toggle-sidebar" }); });
  expect(toolbarItem("toggle-sidebar")).toMatchObject({ label: "Show Sidebar" });

  // With a repository, the toolbar Refresh and the menu's Refresh agree and run the same command.
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: "abc", head: "(detached)", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  await act(async () => { openRepository(); });
  expect(toolbarItem("branch").label).toBe("abc (detached)");
  expect(menuItem("refresh")).toMatchObject({ shortcut: "Cmd+r", disabled: false });
  expect(toolbarItem("refresh").disabled).toBe(false);
  const reads = git.status.mock.calls.length;
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(git.status.mock.calls.length).toBe(reads + 2);
  // The branch menu's placeholders do nothing yet.
  await act(async () => { listener({ type: "toolbarMenuAction", windowId: "main", itemId: "branch", action: { type: "action", itemId: "switch-branch" } as any }); });
  // Commit-only commands stay disabled in Changes, whatever the menu, toolbar or context menu.
  expect(menuItem("copy-sha")).toMatchObject({ disabled: true });
  expect(menuItem("open-github")).toMatchObject({ disabled: true });
  await act(async () => { renderer.unmount(); });
});

it("blames a diff line into History, says when it is not committed, searches History by scope, and compares two commits", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40), parent = "b".repeat(40);
  const commits = [
    { oid: head, parents: [parent], authorName: "Ada", authorEmail: "ada@example.test", time: 1_700_000_000, summary: "Second", lane: 0, color: 0, edges: [-1, 0, 0] },
    { oid: parent, parents: [], authorName: "Ada", authorEmail: "ada@example.test", time: 1_699_000_000, summary: "First", lane: 0, color: 0, edges: [0, -1, 0] },
  ];
  jest.mocked(openGitHistory).mockResolvedValue({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: offset ? [] : commits, done: true })), close: jest.fn() });
  // Rows: a context line (old 1, new 1), a removed line (old 2) and an added line (new 2).
  const rows = [
    { index: 0, kind: 0, fileIndex: 0, hunkIndex: 0, oldLineNumber: 1, newLineNumber: 1, changeType: 0, text: "same", tokens: [] },
    { index: 1, kind: 0, fileIndex: 0, hunkIndex: 0, oldLineNumber: 2, newLineNumber: 0, changeType: 2, text: "old", tokens: [] },
    { index: 2, kind: 0, fileIndex: 0, hunkIndex: 0, oldLineNumber: 0, newLineNumber: 2, changeType: 1, text: "new", tokens: [] },
  ];
  jest.mocked(loadUnifiedDiff).mockResolvedValue({ document: { documentId: 1, rowCount: 3, getPlainRows: () => rows, releaseNativeResources: () => {} } } as never);
  const patch = "diff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -1,2 +1,2 @@\n same\n-old\n+new\n";
  const searchRow = { oid: parent, parents: [], authorName: "Ada", authorEmail: "ada@example.test", time: 1, summary: "First", status: "", path: "", oldPath: null };
  const locations = { root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] };
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => locations),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [{ kind: "ordinary", path: "b.txt", indexStatus: ".", worktreeStatus: "M" }] })),
    fileDiff: jest.fn(async () => patch), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    commitDetails: jest.fn(async (oid: string) => ({ oid, parents: oid === head ? [parent] : [], author: { name: "Ada", email: "a@x", time: 1 }, committer: { name: "Ada", email: "a@x", time: 1 }, message: oid === head ? "Second" : "First" })),
    commitPatch: jest.fn(async () => patch),
    fileHistory: jest.fn(async () => ({ commits: [{ ...searchRow, status: "M", path: "b.txt" }], done: true })),
    searchHistory: jest.fn(async () => ({ commits: [searchRow], done: true })),
    compareCommits: jest.fn(async () => patch) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const toolbar = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { openRepository(); });
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const toolbarItem = (id: string) => (jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items! as any[]).find(entry => entry.id === id);
  const text = () => renderer.root.findAllByType(Text).map(entry => [entry.props.children].flat().join("")).join("\n");
  await act(async () => { renderer.root.findAllByType(Sidebar)[1]!.props.onSelectionChange({ id: "b.txt" }); });
  const line = (index: number) => {
    const list = renderer.root.findByType("FlatList" as any);
    const items = list.props.data as unknown[];
    const at = items.findIndex(entry => (entry as { row?: { index: number } }).row?.index === index);
    return list.props.renderItem({ item: items[at], index: at }) as { props: Record<string, (event: unknown) => void> };
  };

  /** The memoized row's Pressable, rendered on its own. */
  const rowButton = async (commit: object) => {
    let row!: ReactTestRenderer;
    await act(async () => { row = create(renderer.root.findByType("LegendList" as any).props.renderItem({ item: commit })); });
    return row.root.findByProps({ accessibilityRole: "button" });
  };

  // Blame Line (⌘⌥B) needs a clicked line; an added line of an unstaged file blames the file on disk.
  expect(menuItem("blame-line")).toMatchObject({ label: "Blame Line", shortcut: "Cmd+Alt+b", disabled: true });
  await act(async () => { line(2).props.onPress({ nativeEvent: {} }); });
  expect(menuItem("blame-line")).toMatchObject({ disabled: false });
  jest.mocked(blameLine).mockResolvedValueOnce({ oid: "", path: "b.txt", startLine: 2, originalStartLine: 2, lineCount: 1, authorName: "", authorEmail: "", time: 0, summary: "" });
  await act(async () => { lastMenu().onAction({ itemId: "blame-line" }); });
  expect(blameLine).toHaveBeenLastCalledWith("/repo", "b.txt", "workdir", 2, undefined);
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "info", title: "Not Committed Yet", message: "Line 2 of “b.txt” has changes that are not committed yet." }));
  expect(renderer.root.findAllByType(Sidebar)[0]!.props.selectedId).toBe("changes");

  // Right-clicking a removed line offers Blame Line, which blames it as staged and lands on the commit in the file's history.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "blame-line" } as never);
  jest.mocked(blameLine).mockResolvedValueOnce({ oid: parent, path: "b.txt", startLine: 2, originalStartLine: 2, lineCount: 1, authorName: "Ada", authorEmail: "a@x", time: 1, summary: "First" });
  await act(async () => { line(1).props.onTouchEnd({ nativeEvent: { button: 2, pageX: 5, pageY: 6 } }); });
  expect(showContextMenu).toHaveBeenLastCalledWith({ windowId: "main", position: { x: 5, y: 6 }, items: [{ type: "action", id: "blame-line", label: "Blame Line", disabled: false }] });
  expect(blameLine).toHaveBeenLastCalledWith("/repo", "b.txt", "index", 2, undefined);
  expect(renderer.root.findAllByType(Sidebar)[0]!.props.selectedId).toBe("history");
  expect(git.fileHistory).toHaveBeenCalledWith("b.txt", expect.objectContaining({ offset: 0 }));
  expect(text()).toContain("File History: b.txt");
  expect(git.commitDetails).toHaveBeenLastCalledWith(parent, expect.anything());

  // In a commit's diff, removed lines blame as of its first parent and the rest as of the commit.
  await act(async () => { lastMenu().onAction({ itemId: "show-all-history" }); });
  { const button = await rowButton(commits[0]!); await act(async () => { button.props.onPress({ nativeEvent: {} }); }); }
  jest.mocked(blameLine).mockResolvedValueOnce(null);
  await act(async () => { line(1).props.onPress({ nativeEvent: {} }); });
  await act(async () => { lastMenu().onAction({ itemId: "blame-line" }); });
  expect(blameLine).toHaveBeenLastCalledWith("/repo", "b.txt", parent, 2, expect.any(AbortSignal));

  // The toolbar search searches History in the chosen scope after typing pauses; Show All clears it.
  expect(toolbarItem("search-scope").items.map((entry: { label: string; checked: boolean }) => `${entry.label}${entry.checked ? " ✓" : ""}`)).toEqual(["Message ✓", "Author", "Path", "Content"]);
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "fir", shiftKey: false }); });
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "first", shiftKey: false }); });
  expect(text()).toContain("Searching…");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(git.searchHistory).toHaveBeenCalledTimes(1);
  expect(git.searchHistory).toHaveBeenLastCalledWith(head, "message", "first", expect.objectContaining({ offset: 0, count: 500 }));
  expect(text()).toContain("Search: “first”");
  expect(text()).toContain("1 in Message");
  expect(renderer.root.findByType("LegendList" as any).props.data.map((commit: { oid: string }) => commit.oid)).toEqual([parent]);
  await act(async () => { toolbar({ type: "toolbarMenuAction", windowId: "main", itemId: "search-scope", action: { type: "action", itemId: "search-author" } as any }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(git.searchHistory).toHaveBeenLastCalledWith(head, "author", "first", expect.anything());
  expect(toolbarItem("search-scope")).toMatchObject({ label: "Author" });
  expect(menuItem("show-all-history")).toMatchObject({ disabled: false });
  // Showing a file's history ends the search and clears the field too.
  expect(toolbarItem("search").value).toBe("first");
  await act(async () => { lastMenu().onAction({ itemId: "show-file-history" }); });
  expect(text()).toContain("File History: b.txt");
  expect(toolbarItem("search").value).toBe("");
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "first", shiftKey: false }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(text()).toContain("Search: “first”");
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Show All")!.props.onPress(); });
  // Leaving the field (the Show All click) sends its action with the old text; that doesn't search again,
  // and after a switch to Changes it doesn't filter the files either.
  await act(async () => { toolbar({ type: "toolbarSearchSubmitted", windowId: "main", itemId: "search", value: "first", shiftKey: false }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(text()).not.toContain("Search:");
  await act(async () => { lastMenu().onAction({ itemId: "show-changes" }); });
  await act(async () => { toolbar({ type: "toolbarSearchSubmitted", windowId: "main", itemId: "search", value: "first", shiftKey: false }); });
  expect(text()).not.toContain("No matching files");
  await act(async () => { lastMenu().onAction({ itemId: "show-history" }); });
  expect(toolbarItem("search").value).toBe("");

  // Command-click compares with the selection (older first), Swap reverses it and Done goes back.
  { const button = await rowButton(commits[0]!); await act(async () => { button.props.onPress({ nativeEvent: {} }); }); }
  { const button = await rowButton(commits[1]!); await act(async () => { button.props.onPress({ nativeEvent: { metaKey: true } }); }); }
  expect(git.compareCommits).toHaveBeenLastCalledWith(parent, head, expect.anything());
  expect(text()).toContain("Comparing bbbbbbb → aaaaaaa");
  expect(text()).toContain("1 changed file");
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Swap")!.props.onPress(); });
  expect(git.compareCommits).toHaveBeenLastCalledWith(head, parent, expect.anything());
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Done")!.props.onPress(); });
  expect(text()).not.toContain("Comparing");
  // The row context menu offers Compare with Selected for another commit.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "compare-with-selected" } as never);
  { const button = await rowButton(commits[1]!); await act(async () => { button.props.onTouchEnd({ nativeEvent: { button: 2, pageX: 1, pageY: 2 } }); }); }
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items[0]).toEqual({ type: "action", id: "compare-with-selected", label: "Compare with Selected", disabled: false });
  expect(git.compareCommits).toHaveBeenLastCalledWith(parent, head, expect.anything());
  await act(async () => { renderer.unmount(); });
});

it("lists Branches, Remotes and Tags in the sidebar, scopes History to a ref, and checks out, creates, renames and deletes branches", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40), side = "c".repeat(40);
  const commit = (oid: string, summary: string) => ({ oid, parents: [], authorName: "Ada", authorEmail: "ada@example.test", time: 1_700_000_000, summary, lane: 0, color: 0, edges: [] });
  jest.mocked(openGitHistory).mockImplementation(async (_root, _signal, startRef) => {
    const tip = startRef ? side : head;
    return { head: { handle: 1, headOid: tip, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: offset ? [] : [commit(tip, startRef ? "On a ref" : "On HEAD")], done: true })), close: jest.fn() };
  });
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = (name: string, current = false, upstream: string | null = null, time = 1) => ({ name, ref: `refs/heads/${name}`, oid: current ? head : side, current, upstream, time });
  let refs = {
    branches: [branch("feature/ünï", false, "origin/feature/ünï", 3), branch("main", true, null, 2), branch("old", false, null, 1)],
    remotes: [{ name: "origin", branches: [{ name: "origin/fix/x", ref: "refs/remotes/origin/fix/x", oid: side, remote: "origin", branch: "fix/x" }] }],
    tags: [{ name: "v1.0", ref: "refs/tags/v1.0", oid: side }],
  };
  const { GitBranchNotMergedError } = jest.requireActual("@legend-apps/git-core");
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    revParse: jest.fn(async (ref: string) => ref === "HEAD" ? head : side), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    commitDetails: jest.fn(async (oid: string) => ({ oid, parents: [], author: { name: "Ada", email: "a@x", time: 1 }, committer: { name: "Ada", email: "a@x", time: 1 }, message: "m" })),
    commitPatch: jest.fn(async () => "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n"),
    fileHistory: jest.fn(async () => ({ commits: [{ oid: head, parents: [], authorName: "Ada", authorEmail: "a@x", time: 1, summary: "On HEAD", status: "M", path: "a.txt", oldPath: null }], done: true })),
    listRefs: jest.fn(async () => refs),
    checkoutBranch: jest.fn(async () => {}), checkoutRemoteBranch: jest.fn(async () => "fix/x"), createBranch: jest.fn(async () => {}), renameBranch: jest.fn(async () => {}),
    deleteBranch: jest.fn(async (_name: string, { force }: { force?: boolean }) => { if (!force) throw new GitBranchNotMergedError("old", "error: the branch 'old' is not fully merged"); }) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const listener = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  const items = () => sidebar().findAllByType(SidebarItem);
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const toolbarItem = (id: string) => (jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items! as any[]).find(entry => entry.id === id);

  // Group rows (not selectable), then branches with the current one marked by a trailing checkmark, remotes with their branches, tags.
  expect(items().map(item => item.props.id)).toEqual(["repositories", "changes", "history",
    "group:branches", "ref:refs/heads/feature/ünï", "ref:refs/heads/main", "ref:refs/heads/old",
    "group:remotes", "remote:origin", "ref:refs/remotes/origin/fix/x", "group:tags", "ref:refs/tags/v1.0"]);
  expect(items().filter(item => item.props.selectable === false).map(item => item.props.id)).toEqual(["repositories", "group:branches", "group:remotes", "remote:origin", "group:tags"]);
  const row = (id: string) => items().find(item => item.props.id === id)!;
  expect(row("ref:refs/heads/main").findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["arrow.triangle.branch", "checkmark"]);
  expect(row("ref:refs/heads/old").findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["arrow.triangle.branch"]);
  expect(row("ref:refs/remotes/origin/fix/x").findAllByType(Text).map(text => text.props.children)).toEqual(["fix/x"]);

  // Toolbar branch menu: recent branches (current checked), then Switch Branch… and New Branch…; the Branch menu has the shortcuts.
  expect(toolbarItem("branch").items.map((entry: any) => [entry.id, entry.checked, entry.disabled])).toEqual([
    ["checkout:refs/heads/feature/ünï", false, false], ["checkout:refs/heads/main", true, true], ["checkout:refs/heads/old", false, false],
    [undefined, undefined, undefined], ["switch-branch", undefined, false], ["new-branch", undefined, false]]);
  expect(menuItem("switch-branch")).toMatchObject({ label: "Switch Branch…", shortcut: "Cmd+Shift+b", disabled: false });
  expect(menuItem("new-branch")).toMatchObject({ label: "New Branch…", shortcut: "Cmd+Shift+n", disabled: false });
  // Rename acts on the current branch; Delete needs a selected branch that isn't current.
  expect(menuItem("rename-branch")).toMatchObject({ disabled: false });
  expect(menuItem("delete-branch")).toMatchObject({ disabled: true });

  // With a tag (not a branch) selected, Rename acts on the current branch and Delete has nothing to delete.
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/tags/v1.0" }); });
  expect(menuItem("rename-branch")).toMatchObject({ disabled: false });
  expect(menuItem("delete-branch")).toMatchObject({ disabled: true });

  // Selecting a branch lists its commits; the toolbar segment shows no value.
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/heads/feature/ünï" }); });
  expect(openGitHistory).toHaveBeenLastCalledWith("/repo", expect.any(AbortSignal), "refs/heads/feature/ünï");
  expect(renderer.root.findByType("LegendList" as any).props.data.map((entry: { summary: string }) => entry.summary)).toEqual(["On a ref"]);
  expect(toolbarItem("section").value).toBeNull();
  expect(menuItem("delete-branch")).toMatchObject({ disabled: false });

  // The scope menu works in a ref's list too.
  await act(async () => { listener({ type: "toolbarMenuAction", windowId: "main", itemId: "search-scope", action: { type: "checkbox", itemId: "search-author" } as any }); });
  expect(toolbarItem("search-scope").label).toBe("Author");

  // Show File History from a ref's commit lists HEAD's history of that file, and isn't closed by leaving the ref.
  let refRow!: ReactTestRenderer;
  await act(async () => { refRow = create(renderer.root.findByType("LegendList" as any).props.renderItem({ item: commit(side, "On a ref") })); });
  await act(async () => { refRow.root.findByProps({ accessibilityRole: "button" }).props.onPress({ nativeEvent: {} }); });
  expect(menuItem("show-file-history")).toMatchObject({ disabled: false });
  // The file's history is still being read when the section effect runs.
  const fileCommits = await git.fileHistory();
  git.fileHistory.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(fileCommits), 20)));
  await act(async () => { lastMenu().onAction({ itemId: "show-file-history" }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  expect(sidebar().props.selectedId).toBe("history");
  expect(git.fileHistory).toHaveBeenLastCalledWith("a.txt", expect.anything());
  expect(renderer.root.findByType("LegendList" as any).props.data.map((entry: { oid: string }) => entry.oid)).toEqual([head]);
  await act(async () => { lastMenu().onAction({ itemId: "show-all-history" }); });
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/heads/feature/ünï" }); });

  // Check Out from the toolbar menu.
  await act(async () => { listener({ type: "toolbarMenuAction", windowId: "main", itemId: "branch", action: { type: "checkbox", itemId: "checkout:refs/heads/old" } as any }); });
  expect(git.checkoutBranch).toHaveBeenLastCalledWith("old", expect.anything());
  // A refused checkout keeps the work and shows Git's reason in a warning sheet.
  git.checkoutBranch.mockRejectedValueOnce(new Error("error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\nPlease commit your changes or stash them before you switch branches.\nAborting"));
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "checkout-ref" });
  await act(async () => { row("ref:refs/heads/feature/ünï").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-")).toEqual(["Check Out", "New Branch from “feature/ünï”…", "-", "Rename Branch…", "Delete Branch…", "-", "Copy Name"]);
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Switch to “feature/ünï”", message: expect.stringMatching(/^Your local changes .*would be overwritten[\s\S]*Aborting$/) }));

  // A remote branch checks out as a tracking local branch, and its selection moves to that branch.
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/remotes/origin/fix/x" }); });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "checkout-ref" });
  refs = { ...refs, branches: [...refs.branches, branch("fix/x")] };
  await act(async () => { row("ref:refs/remotes/origin/fix/x").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(git.checkoutRemoteBranch).toHaveBeenCalledWith(expect.objectContaining({ ref: "refs/remotes/origin/fix/x" }), expect.anything());
  expect(sidebar().props.selectedId).toBe("ref:refs/heads/fix/x");

  // Switch Branch… (⌘⇧B) takes a typed name; New Branch… starts at HEAD, or at a commit from the History row menu.
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "feature/ünï" });
  await act(async () => { lastMenu().onAction({ itemId: "switch-branch" }); });
  expect(git.checkoutBranch).toHaveBeenLastCalledWith("feature/ünï", expect.anything());
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "topic/✓" });
  await act(async () => { lastMenu().onAction({ itemId: "new-branch" }); });
  expect(showPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ windowId: "main", title: "New Branch", message: "The new branch starts at “main” and is checked out.", confirmLabel: "Create" }));
  expect(git.createBranch).toHaveBeenLastCalledWith("topic/✓", undefined, expect.anything());
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "from-commit" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "new-branch" });
  let commitRow!: ReactTestRenderer;
  await act(async () => { commitRow = create(renderer.root.findByType("LegendList" as any).props.renderItem({ item: commit(side, "On a ref") })); });
  await act(async () => { commitRow.root.findByProps({ accessibilityRole: "button" }).props.onTouchEnd({ nativeEvent: { button: 2, pageX: 1, pageY: 2 } }); });
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items).toContainEqual({ type: "action", id: "new-branch", label: "New Branch from Commit…", disabled: false });
  expect(git.createBranch).toHaveBeenLastCalledWith("from-commit", side, expect.anything());

  // An invalid name is refused with Git's reason.
  git.createBranch.mockRejectedValueOnce(new Error("“a b” isn’t a valid branch name."));
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "a b" });
  await act(async () => { listener({ type: "toolbarMenuAction", windowId: "main", itemId: "branch", action: { type: "action", itemId: "new-branch" } as any }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Create the Branch", message: "“a b” isn’t a valid branch name." }));

  // Rename the selected branch; the selection follows the new name.
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/heads/old" }); });
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "older" });
  refs = { ...refs, branches: refs.branches.map(entry => entry.name === "old" ? branch("older") : entry) };
  await act(async () => { lastMenu().onAction({ itemId: "rename-branch" }); });
  expect(showPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Rename “old”", defaultValue: "old", confirmLabel: "Rename" }));
  expect(git.renameBranch).toHaveBeenLastCalledWith("old", "older", expect.anything());
  expect(sidebar().props.selectedId).toBe("ref:refs/heads/older");

  // Delete asks first, runs `-d`, and on "not fully merged" asks again before `-D`; cancelling the second keeps the branch.
  refs = { ...refs, branches: refs.branches.map(entry => entry.name === "older" ? { ...branch("old"), name: "older", ref: "refs/heads/older" } : entry) };
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" }).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { lastMenu().onAction({ itemId: "delete-branch" }); });
  expect(git.deleteBranch.mock.calls.map(call => call[1].force)).toEqual([false]);
  expect(jest.mocked(showMessage).mock.calls.at(-1)![0]).toMatchObject({ kind: "warning", title: "“older” isn’t fully merged.", buttons: [{ id: "confirm", label: "Delete Anyway" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "cancel" });
  await act(async () => { lastMenu().onAction({ itemId: "delete-branch" }); });
  expect(jest.mocked(showMessage).mock.calls.at(-2)![0]).toMatchObject({ title: "Delete the branch “older”?", buttons: [{ id: "confirm", label: "Delete" }, { id: "cancel", label: "Cancel" }] });
  expect(git.deleteBranch.mock.calls.map(call => [call[0], call[1].force])).toEqual([["older", false], ["older", false], ["older", true]]);

  // A selected branch deleted elsewhere falls back to History.
  refs = { ...refs, branches: refs.branches.filter(entry => entry.name !== "older") };
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  expect(sidebar().props.selectedId).toBe("history");
  await act(async () => { renderer.unmount(); });
});

it("has no branches and no New Branch on an unborn HEAD", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: "(initial)", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  expect(renderer.root.findAllByType(Sidebar)[0]!.findAllByType(SidebarItem).map(item => item.props.id)).toEqual(["repositories", "changes", "history"]);
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  for (const id of ["switch-branch", "new-branch", "rename-branch", "delete-branch"]) expect(menuItem(id)).toMatchObject({ disabled: true });
  await act(async () => { renderer.unmount(); });
});

it("leaves a selected ref when another repository opens, without walking that ref in the new one", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  const service = (root: string) => ({ repoRoot: root, resolveRoot: jest.fn(async () => root), watchLocations: jest.fn(async () => ({ root, gitDir: `${root}/.git`, commonDir: `${root}/.git`, ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), repoState: jest.fn(async () => ({ merging: false })),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => ({ branches: [{ name: "main", ref: "refs/heads/main", oid: head, current: true, upstream: null, time: 1 }, { name: "only-in-a", ref: "refs/heads/only-in-a", oid: head, current: false, upstream: null, time: 1 }], remotes: [], tags: [] })) });
  const services = new Map([["/a", service("/a")], ["/b", service("/b")]]);
  jest.mocked(getGitService).mockImplementation(path => services.get(path.startsWith("/b") ? "/b" : "/a") as unknown as GitService);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/a"] });
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/heads/only-in-a" }); });
  expect(openGitHistory).toHaveBeenLastCalledWith("/a", expect.any(AbortSignal), "refs/heads/only-in-a");
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/b"] });
  await act(async () => { openRepository(); });
  expect(sidebar().props.selectedId).toBe("changes");
  expect(jest.mocked(openGitHistory).mock.calls.filter(call => call[0] === "/b")).toEqual([]);
  await act(async () => { renderer.unmount(); });
});

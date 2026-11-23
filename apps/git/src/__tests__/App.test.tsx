import { getGitService, type GitService } from "@legend-apps/git-core";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { Button } from "@legendapp/spark/ui";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { openFileDialog, showMessage, showPrompt } from "@legendapp/spark/dialogs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener, setToolbarItemText } from "@legendapp/spark/windows/macos";
import { GitPullDivergedError, GitPushedCommitsError, GitPushRejectedError, GitServiceError, type GitNetworkOptions } from "@legend-apps/git-core";
import { PlatformColor, Switch, Text, TextInput } from "react-native";
import { useMenu } from "@legendapp/spark/menus";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { runCommand } from "@legendapp/spark/processes";
import { App } from "../App";
import { StateBar } from "../StateBar";
import { recentRepositories } from "../gitRecents";
import { noteRecentDocument, subscribeToOpenRequests } from "@legendapp/spark/app/documents";
import { sidebarDate } from "../gitStashes";
import { blameLine, loadUnifiedDiff, openGitHistory } from "@legend-apps/diff-parser";
import { setStringAsync } from "@legendapp/spark/clipboard";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { openURL } from "@legendapp/spark/links";
import { openSettingsWindow, openStartWindow, openWorktreeWindow } from "../gitWindows";
import { DiffPane } from "../DiffPane";
import { CommentSheet, ReviewThreadView } from "../ReviewThreadView";
import { CreatePullRequestSheet } from "../CreatePullRequestSheet";
import { InteractiveRebaseSheet } from "../InteractiveRebaseSheet";
import { gitHubAccount } from "../gitHubAccount";

jest.mock("@legend-apps/git-core", () => ({ ...jest.requireActual("@legend-apps/git-core"), getGitService: jest.fn() }));
jest.mock("react-native", () => ({
  AppRegistry: { registerComponent: jest.fn() },
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
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button", SegmentedControl: "SegmentedControl", Select: "Select" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn(async () => ({ canceled: true })), showMessage: jest.fn(async () => ({ buttonId: "confirm" })), showPrompt: jest.fn(async () => ({ canceled: true })) }));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ createHotkeyRouter: jest.fn(() => ({})), useRoutedHotkeys: jest.fn() }));
jest.mock("@legendapp/spark/secure-storage", () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }));
jest.mock("@legendapp/spark/app/documents", () => ({
  getRecentDocuments: jest.fn(async () => []), noteRecentDocument: jest.fn(async () => {}), clearRecentDocuments: jest.fn(async () => {}),
  subscribeToOpenRequests: jest.fn(async () => ({ remove: jest.fn() })),
}));
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
  SplitView: ({ panes }: { panes: readonly { id: string; content: import("react").ReactNode }[] }) => {
    const { Fragment } = require("react");
    return <>{panes.map(pane => <Fragment key={pane.id}>{pane.content}</Fragment>)}</>;
  },
}));
// Settings and window state files, in memory (the layout tests cover their contents).
jest.mock("@legendapp/spark/files", () => {
  const files = new Map<string, string>();
  return {
    getDirectory: async () => "/data",
    readText: async (path: string) => { if (!files.has(path)) throw Object.assign(new Error("missing"), { code: "E_NOT_FOUND" }); return files.get(path); },
    writeText: async (path: string, text: string) => { files.set(path, text); },
    mkdir: async () => {},
    watch: async () => ({ remove: async () => {} }),
  };
});
jest.mock("@legendapp/spark/windows", () => ({ setWindowOptions: jest.fn(async () => {}), addWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })) }));
// These tests drive the window's widgets and buttons: the built-in toolbar (sidebar toggle, branch menu, sections,
// Refresh, search) stands in for SourceTree's. actions.test.ts covers each preset's toolbar.
jest.mock("../settings/presets/sourcetree.json", () => ({ ...jest.requireActual("../settings/presets/sourcetree.json"),
  toolbar: { displayMode: "iconOnly", items: ["toggle-sidebar", "branchPicker", "flexibleSpace", "viewSwitcher", "networkProgress", "refresh", "search"] } }));
jest.mock("../gitWindows", () => ({ ...jest.requireActual("../gitWindows"), openWorktreeWindow: jest.fn(async () => ({})), openSettingsWindow: jest.fn(async () => {}), openStartWindow: jest.fn(async () => ({})) }));
jest.mock("@legendapp/spark/windows/macos", () => ({
  addMacOSWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
  setToolbarItemText: jest.fn(async () => {}),
}));

/** A Changes file list by title (the layout decides where it sits). */
const filesList = (renderer: ReactTestRenderer, title: "Unstaged" | "Staged") => renderer.root.findAllByType(Sidebar).find(node => node.props.accessibilityLabel === `${title} files`)!;
const lastMenu = () => jest.mocked(useMenu).mock.calls.at(-1)![0] as unknown as { items: any[]; onAction: (action: { itemId: string }) => void };
const openMenu = () => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === "open-repository");
/** File ▸ Open Repository…, the way the menu bar runs it. */
const openRepository = () => lastMenu().onAction({ itemId: "open-repository" });
const windowStateFile = "/data/state/main.json";
const mockFiles = () => jest.requireMock("@legendapp/spark/files") as { writeText(path: string, text: string): Promise<void>; readText(path: string): Promise<string> };
afterEach(async () => { await mockFiles().writeText(windowStateFile, "{}"); });

function mockEmptyRepository() {
  const resolveRoot = jest.fn(async () => "/repo");
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  jest.mocked(getGitService).mockReturnValue({
    resolveRoot,
    watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: "(initial)", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })),
    lastDiscard: jest.fn(async () => null),
    operationState: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })),
    listStashes: jest.fn(async () => []),
    listWorktrees: jest.fn(async () => []),
    remoteUrl: jest.fn(async () => null),
    configValue: jest.fn(async () => null),
  } as unknown as GitService);
  return resolveRoot;
}

it("shows the start screen and opens the native folder panel", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  try {
    expect(renderer.root.findAllByType(Text).map(node => node.props.children)).toContain("Legend Git");
    expect(renderer.root.findAllByType(SidebarSplitView)).toHaveLength(0);
    expect(openMenu()).toMatchObject({ label: "Open Repository…", shortcut: "Cmd+o", disabled: false });
    await act(async () => { renderer.root.findByProps({ accessibilityRole: "button" }).props.onPress(); });
    expect(openFileDialog).toHaveBeenCalledWith({ windowId: "main", selection: "directories", multiple: false, title: "Open Repository" });
    await act(async () => { lastMenu().onAction({ itemId: "newWindow" }); });
    expect(openStartWindow).toHaveBeenCalledTimes(1);
  } finally {
    const registration = await jest.mocked(addMacOSWindowListener).mock.results[0].value;
    await act(async () => { renderer.unmount(); });
    expect(registration.remove).toHaveBeenCalledTimes(1);
  }
});

it("reopens the saved repository without mounting the start screen", async () => {
  const resolveRoot = mockEmptyRepository();
  await mockFiles().writeText(windowStateFile, JSON.stringify({ repository: "/repo", sidebarCollapsed: true }));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  try {
    expect(resolveRoot).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType(Text).map(node => node.props.children)).not.toContain("Legend Git");
    expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(true);
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});

it("places the standard Mac menus before Git commands and groups the File actions around Open Recent", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  try {
    const menus = lastMenu().items;
    const order = ["app", "file", "edit", "format", "view", "window", "help"];
    for (const { id, placement } of menus) {
      if (!placement) continue;
      const previous = order.indexOf(id);
      if (previous >= 0) order.splice(previous, 1);
      const anchor = order.indexOf(placement.before?.menu ?? placement.after?.menu);
      order.splice(anchor + (placement.after ? 1 : 0), 0, id);
    }
    expect(order).toEqual([
      "app", "file", "edit", "view", "format", "repository", "branch", "changes", "worktree", "pull-request", "window", "help",
    ]);
    const file = menus.find(({ id }) => id === "file");
    expect(menus.at(-1)).toBe(file);
    expect(file.items).toMatchObject([
      { id: "newWindow", placement: { before: { role: "new" } }, shortcut: "Cmd+n" },
      { id: "open-repository", placement: { before: { role: "open" } }, shortcut: "Cmd+o" },
      { id: "open-worktree", placement: { after: { id: "open-repository" } } },
      { id: "reveal-repository", placement: { after: { role: "close" } } },
      { id: "native-new", hidden: true, disabled: true },
      { id: "native-open", hidden: true, disabled: true },
    ]);
  } finally {
    await act(async () => { renderer.unmount(); });
  }
});

it("gives the window the settings' appearance and switches the diff mode from View ▸ Diff", async () => {
  jest.clearAllMocks();
  const files = jest.requireMock("@legendapp/spark/files") as { writeText(path: string, text: string): Promise<void>; readText(path: string): Promise<string> };
  await files.writeText("/data/settings.json", JSON.stringify({ version: 1, appearance: "dark" }));
  let renderer!: ReactTestRenderer;
  // The file is shared by the tests below: put it back even when an expectation fails.
  try {
  await act(async () => { renderer = create(<App />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(jest.mocked(setWindowOptions).mock.calls.map(call => call[1])).toContainEqual({ appearance: "dark" });
  const diffMenu = () => lastMenu().items.find(entry => entry.id === "view").items.find((entry: { id: string }) => entry.id === "diff");
  expect(diffMenu().items.filter((entry: { checked?: boolean }) => entry.checked).map((entry: { id: string }) => entry.id)).toEqual(["diff:mode:unified"]);
  await act(async () => { lastMenu().onAction({ itemId: "diff:split:vertical" }); await new Promise(resolve => setTimeout(resolve, 0)); });
  // Vertical is the preset's split already, so the sparse write keeps only the mode.
  expect(JSON.parse(await files.readText("/data/settings.json"))).toMatchObject({ appearance: "dark", panels: { diff: { mode: "sideBySide" } } });
  expect(diffMenu().items.filter((entry: { checked?: boolean }) => entry.checked).map((entry: { id: string }) => entry.id)).toEqual(["diff:mode:sideBySide", "diff:split:vertical"]);
  } finally {
    await act(async () => { renderer?.unmount(); });
    await files.writeText("/data/settings.json", JSON.stringify({ version: 1 }));
  }
});

it("opens Settings from the app menu, and its Toolbar pane from View ▸ Customize Toolbar…", async () => {
  jest.clearAllMocks();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const app = lastMenu().items.find(entry => entry.id === "app");
  expect(app.items).toEqual([{ type: "action", id: "settings", label: "Settings…", target: { role: "settings" } }]);
  expect(lastMenu().items.find(entry => entry.id === "view").items.at(-1)).toEqual({ type: "action", id: "customize-toolbar", label: "Customize Toolbar…" });
  await act(async () => { lastMenu().onAction({ itemId: "settings" }); lastMenu().onAction({ itemId: "customize-toolbar" }); });
  expect(jest.mocked(openSettingsWindow).mock.calls).toEqual([[null, undefined], [null, "toolbar"]]);
  await act(async () => { renderer.unmount(); });
});

it("takes key bindings from settings into the menu bar and the hotkey router, and sends no toolbar update when the toolbar is unchanged", async () => {
  jest.clearAllMocks();
  const files = jest.requireMock("@legendapp/spark/files") as { writeText(path: string, text: string): Promise<void> };
  await files.writeText("/data/settings.json", JSON.stringify({ version: 1, keybindings: { "open-repository": ["Cmd+Shift+o", "Cmd+Alt+o"], "refresh": [], "stage-all": ["Cmd+n"], "nope": ["Cmd+k"] } }));
  let renderer!: ReactTestRenderer;
  try {
  await act(async () => { renderer = create(<App />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  expect(menuItem("open-repository")).toMatchObject({ shortcut: "Cmd+Shift+o" });
  // Open Worktree's default ⇧⌘O went to Open Repository; [] unbinds Refresh; the rest keep their defaults.
  expect(menuItem("open-worktree").shortcut).toBeUndefined();
  expect(menuItem("refresh").shortcut).toBeUndefined();
  expect(menuItem("stage-all")).toMatchObject({ label: "Stage All", shortcut: "Cmd+n" });
  expect(menuItem("newWindow").shortcut).toBeUndefined();
  expect(menuItem("fetch")).toMatchObject({ shortcut: "Cmd+Alt+f" });
  // The second binding has no menu item to carry it: the window's hotkey router runs it.
  const options = jest.mocked(useRoutedHotkeys).mock.calls.at(-1)![0];
  expect(options).toMatchObject({ scope: { kind: "window", windowId: "main" }, definitions: [{ id: "open-repository", title: "Open Repository…", defaultBindings: ["Cmd+Alt+o"] }] });
  await act(async () => { (options.handlers as Record<string, () => void>)["open-repository"]!(); });
  expect(openFileDialog).toHaveBeenCalledTimes(1);
  // A settings change that leaves the toolbar alone sends no toolbar.
  const toolbarUpdates = () => jest.mocked(setWindowOptions).mock.calls.filter(call => call[1].macos?.toolbar).length;
  const sent = toolbarUpdates();
  await act(async () => { lastMenu().onAction({ itemId: "diff:split:vertical" }); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(lastMenu().items.find(entry => entry.id === "view").items.find((entry: { id: string }) => entry.id === "diff").items.find((entry: { id: string }) => entry.id === "diff:mode:sideBySide").checked).toBe(true);
  expect(toolbarUpdates()).toBe(sent);
  } finally {
    await act(async () => { renderer?.unmount(); });
    await files.writeText("/data/settings.json", JSON.stringify({ version: 1 }));
  }
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
    fileDiff: jest.fn(async () => ""), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null), discardFiles: jest.fn(async () => {}), commit: jest.fn(async () => {}), headMessage: jest.fn(async () => "Last subject\nwrapped\n\nLast body") };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo/nested"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const toolbar = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { openRepository(); });
  const text = () => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join("")).join("\n");
  expect(text()).toContain("Unstaged (1)");
  expect(text()).toContain("Staged (1)");
  const select = async (title: "Unstaged" | "Staged") => act(async () => { filesList(renderer, title).props.onSelectionChange({ id: "both.txt" }); });
  await select("Unstaged");
  git.status.mockResolvedValueOnce({ branch, entries: [{ ...entry, worktreeStatus: "." }] });
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Stage")!.props.onPress(); });
  expect(git.stageFile).toHaveBeenCalledTimes(1);
  expect(text()).toContain("Unstaged (0)");
  await select("Staged");
  git.status.mockResolvedValueOnce({ branch, entries: [{ ...entry, indexStatus: "." }] });
  await act(async () => { renderer.root.findAllByType(Button).find(button => button.props.children === "Unstage")!.props.onPress(); });
  expect(git.unstageFile).toHaveBeenCalledTimes(1);
  expect(text()).toContain("Staged (0)");
  const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.children === label)!;

  // Discard asks with a native warning sheet first; cancelling leaves the file alone.
  await select("Unstaged");
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
    status: jest.fn(async () => ({ branch, entries: [entry] })), fileDiff: jest.fn(async () => ""), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
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
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
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
  expect(list.props.getFixedItemSize()).toBe(24);

  let row!: ReactTestRenderer;
  await act(async () => { row = create(list.props.renderItem({ item: commits[0] })); });
  const text = (node: ReactTestRenderer) => node.root.findAllByType(Text).map(entry => [entry.props.children].flat().join("")).join("\n");
  // SourceTree's columns: graph, subject with the refs inline before it (plain text, not pills; the current branch in
  // label color, semibold), date, author, SHA.
  expect(text(row)).toContain("main\n, v1.0\nSecond\n");
  expect(text(row)).toMatch(/Second\n.+\nAda\naaaaaaa$/);
  const refText = (name: string) => row.root.findAllByType(Text).find(entry => [entry.props.children].flat().join("") === name)!;
  expect([refText("main").props.style].flat()).toContainEqual({ fontWeight: "600", color: "labelColor" });
  expect(refText(", v1.0").props.style).toBeUndefined();
  const [graph, ...cells] = (row.toJSON() as { children: unknown[] }).children;
  expect(JSON.stringify(cells)).not.toMatch(/borderWidth/);
  // The graph cell draws the tip's line from its node down to the parent's row in the same lane (24 pt regular rows).
  expect(JSON.stringify(graph)).toContain('"top":12,"width":2,"height":12');
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
    status: jest.fn(async () => ({ branch, entries })), fileDiff: jest.fn(async () => ""), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
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
  const unstagedRows = () => filesList(renderer, "Unstaged");

  // Toolbar: sidebar toggle and branch menu leading, segmented sections, Refresh, search; no Open or Restore.
  expect(toolbar().map(entry => entry.id)).toEqual(["toggle-sidebar", "branch", "section", "refresh", "search"]);
  expect(toolbarItem("branch")).toMatchObject({ type: "menu", label: "main", items: [{ id: "switch-branch", disabled: true }, { id: "new-branch", disabled: false }] });
  expect(toolbarItem("section")).toMatchObject({ type: "segmented", value: "changes" });
  // Panes come from the layout (SourceTree by default) inside the content slot; the split view has no list column.
  expect(split().props.list).toBeUndefined();

  await act(async () => { unstagedRows().props.onSelectionChange({ id: "src/app.ts" }); });
  expect(unstagedRows().props.selectedId).toBe("src/app.ts");
  await act(async () => { renderer.root.findAllByType(TextInput)[0]!.props.onChangeText("Draft summary"); });

  // Toolbar segment → History; select a commit.
  await act(async () => { listener({ type: "toolbarSelectionChanged", windowId: "main", itemId: "section", value: "history" }); });
  expect(navigation().props.selectedId).toBe("history");
  expect(toolbarItem("section").value).toBe("history");
  // One search field searches every field; its placeholder hints at the qualifiers. There is no scope picker.
  expect(toolbarItem("search")).toMatchObject({ placeholder: "Search, or author:name path:src" });
  expect(toolbarItem("search").disabled).toBeUndefined();
  expect(toolbarItem("search-scope")).toBeUndefined();
  // A section switch updates only the toolbar. Opening a repository reveals its title.
  expect(jest.mocked(setWindowOptions).mock.calls.at(-1)![1]).toEqual({ macos: { toolbar: expect.anything() } });
  expect(jest.mocked(setWindowOptions).mock.calls.filter(call => call[1].macos?.titleBar?.contentLayout)).toHaveLength(1);
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
  expect(toolbarItem("toggle-sidebar")).toBeUndefined();
  await act(async () => { lastMenu().onAction({ itemId: "show-history" }); listener({ type: "toolbarAction", windowId: "main", itemId: "refresh" }); });
  expect(renderer.root.findAllByType(Sidebar)).toHaveLength(0);

  // With a repository, the toolbar Refresh and the menu's Refresh agree and run the same command.
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: "abc", head: "(detached)", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  await act(async () => { openRepository(); });
  expect(toolbarItem("toggle-sidebar")).toMatchObject({ label: "Hide Sidebar", disabled: false });
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "toggle-sidebar" }); });
  expect(toolbarItem("toggle-sidebar")).toMatchObject({ label: "Show Sidebar" });
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

it("blames a diff line into History, says when it is not committed, searches History, and compares two commits", async () => {
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
    fileDiff: jest.fn(async () => patch), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
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

  // The toolbar search searches all of History's fields after typing pauses; Show All clears it.
  expect(toolbarItem("search-scope")).toBeUndefined();
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "fir", shiftKey: false }); });
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "first", shiftKey: false }); });
  expect(text()).toContain("Searching…");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(git.searchHistory).toHaveBeenCalledTimes(1);
  expect(git.searchHistory).toHaveBeenLastCalledWith(expect.objectContaining({ revisions: [head], options: [], match: expect.any(Function) }), expect.objectContaining({ offset: 0, count: 500 }));
  expect(text()).toContain("Search: “first”");
  expect(text()).toContain("1 commit");
  expect(renderer.root.findByType("LegendList" as any).props.data.map((commit: { oid: string }) => commit.oid)).toEqual([parent]);
  // Qualifiers go to git; the field's text is the whole query.
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "author:ada first", shiftKey: false }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(git.searchHistory).toHaveBeenLastCalledWith(expect.objectContaining({ options: ["--regexp-ignore-case", "--fixed-strings", "--author=ada"] }), expect.anything());
  await act(async () => { toolbar({ type: "toolbarSearchChanged", windowId: "main", itemId: "search", value: "first", shiftKey: false }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(menuItem("show-all-history")).toMatchObject({ disabled: false });
  // Showing a file's history ends the search and clears the field too (the toolbar is rebuilt with an empty field).
  const toolbarUpdates = jest.mocked(setWindowOptions).mock.calls.length;
  await act(async () => { lastMenu().onAction({ itemId: "show-file-history" }); });
  expect(jest.mocked(setWindowOptions).mock.calls.length).toBeGreaterThan(toolbarUpdates);
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
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    revParse: jest.fn(async (ref: string) => ref === "HEAD" ? head : side), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    commitDetails: jest.fn(async (oid: string) => ({ oid, parents: [], author: { name: "Ada", email: "a@x", time: 1 }, committer: { name: "Ada", email: "a@x", time: 1 }, message: "m" })),
    commitPatch: jest.fn(async () => "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\n"),
    fileHistory: jest.fn(async () => ({ commits: [{ oid: head, parents: [], authorName: "Ada", authorEmail: "a@x", time: 1, summary: "On HEAD", status: "M", path: "a.txt", oldPath: null }], done: true })),
    listRefs: jest.fn(async () => refs), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []),
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

  const row = (id: string) => items().find(item => item.props.id === id)!;
  const header = (id: string) => row(id).findByType(Button);
  // The SourceTree preset's sections: Branches, then Tags and Remotes collapsed, each header with its count and a disclosure chevron.
  expect(items().map(item => item.props.id)).toEqual(["repositories", "changes", "history",
    "group:branches", "ref:refs/heads/feature/ünï", "ref:refs/heads/main", "ref:refs/heads/old", "group:tags", "group:remotes"]);
  expect(header("group:tags").props).toMatchObject({ variant: "borderless", children: "Tags", accessibilityLabel: "Tags, 1, collapsed" });
  expect(header("group:branches").props.accessibilityLabel).toBe("Branches, 3, expanded");
  expect(row("group:tags").findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["chevron.right"]);
  // Clicking a header expands its section (and collapses it again); the window remembers it.
  await act(async () => { header("group:remotes").props.onPress(); });
  await act(async () => { header("group:tags").props.onPress(); });
  expect(row("group:tags").findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["chevron.down"]);
  // Group rows (not selectable), then branches with the current one marked by a trailing checkmark, tags, remotes with their branches.
  expect(items().map(item => item.props.id)).toEqual(["repositories", "changes", "history",
    "group:branches", "ref:refs/heads/feature/ünï", "ref:refs/heads/main", "ref:refs/heads/old",
    "group:tags", "ref:refs/tags/v1.0", "group:remotes", "remote:origin", "ref:refs/remotes/origin/fix/x"]);
  expect(items().filter(item => item.props.selectable === false).map(item => item.props.id)).toEqual(["repositories", "group:branches", "group:tags", "group:remotes", "remote:origin"]);
  await act(async () => { header("group:branches").props.onPress(); });
  expect(items().map(item => item.props.id).slice(3, 5)).toEqual(["group:branches", "group:tags"]);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  const saved = await (jest.requireMock("@legendapp/spark/files") as { readText: (path: string) => Promise<string> }).readText("/data/state/main.json");
  expect(JSON.parse(saved).sections).toEqual({ remotes: true, tags: true, branches: false });
  await act(async () => { header("group:branches").props.onPress(); });
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
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-")).toEqual(["Check Out", "New Branch from “feature/ünï”…", "-", "Merge “feature/ünï” into “main”…", "Rebase “main” onto “feature/ünï”…", "Rebase “main” Interactively onto “feature/ünï”…", "-", "Rename Branch…", "Delete Branch…", "-", "Copy Name"]);
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
  // The window state file is shared by the tests below.
  await (jest.requireMock("@legendapp/spark/files") as { writeText(path: string, text: string): Promise<void> }).writeText("/data/state/main.json", "{}");
});

it("lays out the sidebar from settings: order, hidden sections, a large section collapsed, revealed by a selection, and restored per window", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const files = jest.requireMock("@legendapp/spark/files") as { writeText(path: string, text: string): Promise<void>; readText(path: string): Promise<string> };
  await files.writeText("/data/settings.json", JSON.stringify({ version: 1, sidebar: { sections: [{ id: "workspace" }, { id: "tags" }, { id: "remotes", expanded: false }, { id: "branches", visible: false }], showCounts: true } }));
  const oid = "a".repeat(40);
  const tags = Array.from({ length: 25 }, (_, index) => ({ name: `v${index}`, ref: `refs/tags/v${index}`, oid }));
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    revParse: jest.fn(async () => oid), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => ({ branches: [{ name: "main", ref: "refs/heads/main", oid, current: true, upstream: null, time: 1 }],
      remotes: [{ name: "origin", branches: [{ name: "origin/main", ref: "refs/remotes/origin/main", oid, remote: "origin", branch: "main" }] }], tags })),
    listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: oid, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<App />); });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    await act(async () => { openRepository(); });
    const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
    const ids = () => sidebar().findAllByType(SidebarItem).map(item => item.props.id);
    const header = (id: string) => sidebar().findAllByType(SidebarItem).find(item => item.props.id === id)!.findByType(Button);
    // Tags first (25 of them, so collapsed), Remotes collapsed by the settings, no Branches.
    expect(ids()).toEqual(["repositories", "changes", "history", "group:tags", "group:remotes"]);
    expect(header("group:tags").props.accessibilityLabel).toBe("Tags, 25, collapsed");
    // A tag selected from elsewhere (here the selection handler) opens its section.
    await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/tags/v3" }); });
    expect(ids()).toContain("ref:refs/tags/v3");
    expect(sidebar().props.selectedId).toBe("ref:refs/tags/v3");
    // Collapsing the selected row's section keeps the selection without a row to show it (Spark needs a listed ID).
    await act(async () => { header("group:tags").props.onPress(); });
    expect(ids()).toEqual(["repositories", "changes", "history", "group:tags", "group:remotes"]);
    expect(sidebar().props.selectedId).toBeNull();
    await act(async () => { header("group:remotes").props.onPress(); });
    await act(async () => { renderer.unmount(); });
    // A new window restores what the user expanded and collapsed.
    await act(async () => { renderer = create(<App />); });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    await act(async () => { openRepository(); });
    expect(ids()).toEqual(["repositories", "changes", "history", "group:tags", "group:remotes", "remote:origin", "ref:refs/remotes/origin/main"]);
  } finally {
    await act(async () => { renderer?.unmount(); });
    await files.writeText("/data/settings.json", JSON.stringify({ version: 1 }));
    await files.writeText("/data/state/main.json", "{}");
  }
});

it("starts the sidebar at the width saved in the settings file and saves a dragged width there", async () => {
  jest.clearAllMocks();
  mockEmptyRepository();
  await mockFiles().writeText(windowStateFile, JSON.stringify({ repository: "/repo" }));
  const files = jest.requireMock("@legendapp/spark/files") as { writeText(path: string, text: string): Promise<void>; readText(path: string): Promise<string> };
  await files.writeText("/data/settings.json", JSON.stringify({ version: 1, layout: { sizes: { sourcetree: { sidebar: [264] } } } }));
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<App />); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const split = () => renderer.root.findByType(SidebarSplitView);
    expect(split().props.sidebarWidth).toBe(264);
    await act(async () => {
      split().props.onResize({ phase: "provisional", sidebarWidth: 190, contentWidth: 810 });
      split().props.onResize({ phase: "ready", sidebarWidth: 250, contentWidth: 750 });
      split().props.onResize({ phase: "ready", sidebarWidth: 264, contentWidth: 836 });
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(JSON.parse(await files.readText("/data/settings.json")).layout.sizes.sourcetree.sidebar).toEqual([264]);
    await act(async () => {
      split().props.onResize({ phase: "ready", sidebarWidth: 287.6, contentWidth: 812.4 });
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    expect(JSON.parse(await files.readText("/data/settings.json")).layout.sizes.sourcetree.sidebar).toEqual([288]);
    expect(split().props.sidebarWidth).toBe(288);
    const dragged = split();
    await act(async () => { lastMenu().onAction({ itemId: "layout:reset" }); });
    expect(split()).not.toBe(dragged);
    expect(split().props.sidebarWidth).toBe(220);
    expect(JSON.parse(await files.readText("/data/settings.json")).layout?.sizes?.sourcetree).toBeUndefined();
  } finally {
    await act(async () => { renderer?.unmount(); });
    await files.writeText("/data/settings.json", JSON.stringify({ version: 1 }));
    await files.writeText("/data/state/main.json", "{}");
  }
});

it("starts the repository sidebar right under the title bar", async () => {
  jest.clearAllMocks();
  mockEmptyRepository();
  await mockFiles().writeText(windowStateFile, JSON.stringify({ repository: "/repo" }));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const split = renderer.root.findByType(SidebarSplitView);
  const sidebar = renderer.root.findAllByType(Sidebar)[0]!;
  expect(sidebar.props.contentInsetTop).toBe(split.props.titleBar.content.height);
  expect(renderer.root.findAllByType(SidebarItem).find(item => item.props.id === "repositories")!.props.rowHeight).toBe(24);
  await act(async () => { renderer.unmount(); });
});

it("puts the split view on the window's background, so the source list's glass shows the window and not the desktop", async () => {
  jest.clearAllMocks();
  mockEmptyRepository();
  await mockFiles().writeText(windowStateFile, JSON.stringify({ repository: "/repo" }));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const backdrop = renderer.root.findByType(SidebarSplitView).parent!;
  expect(Object.assign({}, ...[backdrop.props.style].flat())).toMatchObject({ flex: 1, backgroundColor: PlatformColor("windowBackgroundColor") });
  await act(async () => { renderer.unmount(); });
});

it("has no branches and no New Branch on an unborn HEAD", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: "(initial)", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []) };
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

it("opens the interactive rebase sheet from the Branch menu and History, says why it can't start, asks before rewriting pushed commits, and runs the todo", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "c".repeat(40), one = "a".repeat(40), two = "b".repeat(40), base = "f".repeat(40);
  const commits = [
    { oid: head, parents: [two], authorName: "Ada", authorEmail: "ada@example.test", time: 3, summary: "Three", lane: 0, color: 0, edges: [] },
    { oid: two, parents: [one], authorName: "Ada", authorEmail: "ada@example.test", time: 2, summary: "Two", lane: 0, color: 0, edges: [] },
  ];
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: offset ? [] : commits, done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "topic", upstream: null, ahead: 0, behind: 0 };
  const refs = {
    branches: [{ name: "main", ref: "refs/heads/main", oid: base, current: false, upstream: null, time: 2 }, { name: "topic", ref: "refs/heads/topic", oid: head, current: true, upstream: null, time: 1 }],
    remotes: [], tags: [],
  };
  const commit = (oid: string, subject: string, pushed = false) => ({ oid, subject, message: `${subject}\n`, pushed });
  const plan = { branch: "topic", base, head, stacked: ["lower"], refusal: null as string | null, commits: [commit(one, "One", true), commit(two, "Two"), commit(head, "Three")] };
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async (): Promise<unknown> => ({ branch, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async (): Promise<unknown> => null),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "topic"),
    listRefs: jest.fn(async () => refs), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""), commitDetails: jest.fn(() => new Promise(() => {})),
    interactiveRebasePlan: jest.fn(async (_base: string) => plan), interactiveRebase: jest.fn(async (..._args: unknown[]): Promise<string> => "rebased") };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  const row = (id: string) => sidebar().findAllByType(SidebarItem).find(item => item.props.id === id)!;
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const menuLabels = () => jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-");
  const sheets = () => renderer.root.findAllByType(InteractiveRebaseSheet);
  const sheetText = () => sheets()[0]!.findAllByType(Text).map(node => [node.props.children].flat().join(""));
  const press = (label: string) => act(async () => { sheets()[0]!.findAllByType(Button).find(node => node.props.children === label)!.props.onPress(); });
  const selects = () => sheets()[0]!.findAllByType("Select" as any);

  expect(menuItem("interactive-rebase-ref")).toMatchObject({ label: "Rebase Current Branch Interactively onto…", disabled: false });
  expect(lastMenu().items.find(entry => entry.id === "branch").items.map((entry: any) => entry.id)).toContain("interactive-rebase-ref");

  // A refused plan says why, and no sheet opens.
  git.interactiveRebasePlan.mockResolvedValueOnce({ ...plan, refusal: "“a.txt” has uncommitted changes. Commit or stash them first." });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "interactive-rebase-ref" });
  await act(async () => { row("ref:refs/heads/main").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(menuLabels()).toContain("Rebase “topic” Interactively onto “main”…");
  expect(git.interactiveRebasePlan).toHaveBeenLastCalledWith("refs/heads/main", expect.anything());
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Rebase “topic” Interactively", message: "“a.txt” has uncommitted changes. Commit or stash them first." }));
  expect(sheets()).toHaveLength(0);

  // The sheet lists the commits oldest first with Pick, the pushed one marked, and stacked branches moving along.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "interactive-rebase-ref" });
  await act(async () => { row("ref:refs/heads/main").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(sheetText()).toEqual(expect.arrayContaining(["Rebase “topic” Interactively onto “main”", "aaaaaaa", "One", "Pushed", "Two", "Three",
    "Nothing changes yet. Choose what to do with each commit, or move it."]));
  expect(selects().map(node => node.props.value)).toEqual(["pick", "pick", "pick", "update"]);
  // Squashing the first commit is refused in the sheet; rewording Three shows its message to edit.
  await act(async () => { selects()[0]!.props.onValueChange("squash"); });
  expect(sheetText()).toContain("“One” can’t be squashed or fixed up: there’s no commit kept above it to join.");
  expect(sheets()[0]!.findAllByType(Button).find(node => node.props.children === "Start Rebase")!.props.disabled).toBe(true);
  await act(async () => { selects()[0]!.props.onValueChange("pick"); });
  await act(async () => { selects()[2]!.props.onValueChange("reword"); });
  await act(async () => { sheets()[0]!.findByType(TextInput).props.onChangeText("Three, reworded"); });
  await press("Move Up");
  expect(sheetText()).toContain("3 commits after the rebase: reordered, 1 reworded.");

  // Pushed commits: Cancel keeps the sheet; Rebase Anyway runs again with them allowed. The rebase stops: Changes shows.
  const todo = [{ oid: one, action: "pick" }, { oid: head, action: "reword", message: "Three, reworded" }, { oid: two, action: "pick" }];
  git.interactiveRebase.mockRejectedValueOnce(new GitPushedCommitsError([{ oid: one, subject: "One" }]));
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await press("Start Rebase");
  expect(git.interactiveRebase).toHaveBeenLastCalledWith(plan, todo, expect.objectContaining({ updateRefs: true, allowPushed: [] }));
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Rewrite Pushed Commits?", message: expect.stringMatching(/^This commit was already pushed: aaaaaaa “One”\./), defaultButtonId: "cancel" }));
  expect(sheets()).toHaveLength(1);
  await act(async () => { selects()[3]!.props.onValueChange("leave"); });
  git.interactiveRebase.mockRejectedValueOnce(new GitPushedCommitsError([{ oid: one, subject: "One" }])).mockResolvedValueOnce("stopped");
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "rebase" });
  await press("Start Rebase");
  expect(git.interactiveRebase).toHaveBeenLastCalledWith(plan, todo, expect.objectContaining({ updateRefs: false, allowPushed: [one] }));
  expect(sheets()).toHaveLength(0);
  expect(sidebar().props.selectedId).toBe("changes");

  // History's row menu rebases onto that commit; Git's refusal keeps the sheet open with a warning; Cancel closes it.
  await act(async () => { sidebar().props.onSelectionChange({ id: "history" }); });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "interactive-rebase-commit" } as never);
  let commitRow!: ReactTestRenderer;
  await act(async () => { commitRow = create(renderer.root.findByType("LegendList" as any).props.renderItem({ item: commits[1] })); });
  await act(async () => { commitRow.root.findByProps({ accessibilityRole: "button" }).props.onTouchEnd({ nativeEvent: { button: 2, pageX: 1, pageY: 2 } }); });
  expect(menuLabels()).toContain("Rebase Interactively onto This Commit…");
  expect(git.interactiveRebasePlan).toHaveBeenLastCalledWith(two, expect.anything());
  expect(sheetText()).toContain("Rebase “topic” Interactively onto “bbbbbbb Two”");
  git.interactiveRebase.mockRejectedValueOnce(new Error("“topic” changed since the rebase was set up. Nothing was rebased; start it again."));
  await act(async () => { selects()[0]!.props.onValueChange("drop"); });
  await press("Start Rebase");
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Rebase “topic” Interactively", message: expect.stringMatching(/changed since/) }));
  expect(sheets()).toHaveLength(1);
  await press("Cancel");
  expect(sheets()).toHaveLength(0);
  await act(async () => { renderer.unmount(); });
});
it("offers Edit ▸ Undo for the reflog's newest operation, says why a refused one can't run, and asks before undoing", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40), before = "b".repeat(40);
  const merge = { kind: "merge", branch: "main", from: { oid: head, subject: "Merge branch 'feature'" }, to: { oid: before, subject: "Make it red" }, toBranch: null, name: "feature", keepsChanges: false, refusal: null, entry: "x" };
  let plan: object | null = null;
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({ branches: [{ name: "main", ref: "refs/heads/main", oid: head, current: true, upstream: null, time: 1 }], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []),
    undoPlan: jest.fn(async () => plan), undo: jest.fn(async () => { plan = null; }) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  // No repository, then nothing to undo: "Undo", off, and never ⌘Z (text editing keeps it).
  expect(menuItem("undo-operation")).toMatchObject({ type: "action", id: "undo-operation", label: "Undo", disabled: true });
  expect(lastMenu().items.find(entry => entry.id === "edit").items[0].id).toBe("undo-operation");
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  await act(async () => { openRepository(); });
  expect(menuItem("undo-operation")).toMatchObject({ label: "Undo", disabled: true });

  // A refused undo stays enabled and says why when chosen, without asking or undoing.
  plan = { ...merge, refusal: "“b.txt” has changes that undoing would overwrite. Commit, stash or discard them first." };
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(menuItem("undo-operation")).toMatchObject({ label: "Undo Merge…", disabled: false });
  await act(async () => { lastMenu().onAction({ itemId: "undo-operation" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Undo Merge", message: expect.stringMatching(/^“b\.txt” has changes/) }));
  expect(git.undo).not.toHaveBeenCalled();

  // The sheet names what moves where; Cancel changes nothing, the named button undoes and the label goes back to Undo.
  plan = merge;
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" } as any);
  await act(async () => { lastMenu().onAction({ itemId: "undo-operation" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Undo the merge of “feature”?",
    message: "“main” moves back from aaaaaaa “Merge branch 'feature'” to bbbbbbb “Make it red”. The worktree and index follow; changes to other files are kept.",
    buttons: [{ id: "confirm", label: "Undo Merge" }, { id: "cancel", label: "Cancel" }] }));
  expect(git.undo).not.toHaveBeenCalled();
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" } as any);
  await act(async () => { lastMenu().onAction({ itemId: "undo-operation" }); });
  expect(git.undo).toHaveBeenCalledWith(merge, expect.anything());
  expect(menuItem("undo-operation")).toMatchObject({ label: "Undo", disabled: true });

  // Git's refusal at undo time (a newer operation came in) shows as a warning.
  plan = { ...merge, kind: "commit", keepsChanges: true, name: null };
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(menuItem("undo-operation")).toMatchObject({ label: "Undo Commit…", disabled: false });
  git.undo.mockRejectedValueOnce(new Error("The repository changed since this undo was offered. Look at the new state, then try again."));
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" } as any);
  await act(async () => { lastMenu().onAction({ itemId: "undo-operation" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Undo Commit", message: expect.stringMatching(/changed since/) }));
  await act(async () => { renderer.unmount(); });
});

it("leaves a selected ref when another repository opens, without walking that ref in the new one", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  const service = (root: string) => ({ repoRoot: root, resolveRoot: jest.fn(async () => root), watchLocations: jest.fn(async () => ({ root, gitDir: `${root}/.git`, commonDir: `${root}/.git`, ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => ({ branches: [{ name: "main", ref: "refs/heads/main", oid: head, current: true, upstream: null, time: 1 }, { name: "only-in-a", ref: "refs/heads/only-in-a", oid: head, current: false, upstream: null, time: 1 }], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []) });
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

it("lists Stashes in the sidebar, previews one with Apply, Pop and Drop…, stashes changes, and offers Stash and Switch when a checkout is refused", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const head = "a".repeat(40), older = "d".repeat(40), newer = "e".repeat(40);
  const now = Math.floor(Date.now() / 1000);
  let stashes = [
    { oid: newer, index: 0, message: "On main: ünïcode ✓ work", time: now - 3 * 3600 },
    { oid: older, index: 1, message: "WIP on main: 1234567 First", time: now - 2 * 86400 },
  ];
  const { GitLocalChangesError } = jest.requireActual("@legend-apps/git-core");
  const entries = [{ kind: "ordinary" as const, path: "a.txt", indexStatus: ".", worktreeStatus: "M" }, { kind: "untracked" as const, path: "new.txt", indexStatus: "?", worktreeStatus: "?" }];
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 }, entries })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    fileDiff: jest.fn(async () => ""),
    listRefs: jest.fn(async () => ({ branches: [{ name: "main", ref: "refs/heads/main", oid: head, current: true, upstream: null, time: 2 }, { name: "other", ref: "refs/heads/other", oid: head, current: false, upstream: null, time: 1 }], remotes: [], tags: [] })),
    listStashes: jest.fn(async () => stashes), listWorktrees: jest.fn(async () => []),
    stashPatch: jest.fn(async () => "diff --git a/dir/a.txt b/dir/a.txt\n--- a/dir/a.txt\n+++ b/dir/a.txt\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+n\n"),
    stashPush: jest.fn(async () => newer), stashApply: jest.fn(async () => {}), stashPop: jest.fn(async () => {}), stashDrop: jest.fn(async () => {}),
    checkoutBranch: jest.fn(async () => {}), stashAndSwitch: jest.fn(async () => ({ branch: "other", stash: newer })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  const items = () => sidebar().findAllByType(SidebarItem);
  const row = (id: string) => items().find(item => item.props.id === id)!;
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.children === label)!;
  const texts = (node: { findAllByType: typeof renderer.root.findAllByType }) => node.findAllByType(Text).map(text => [text.props.children].flat().join(""));

  // A Stashes group after Branches: archivebox rows labelled with the message (without "On main: ") and a relative date.
  expect(items().map(item => item.props.id).slice(-3)).toEqual(["group:stashes", `stash:${newer}`, `stash:${older}`]);
  expect(row(`stash:${newer}`).findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["archivebox"]);
  expect(texts(row(`stash:${newer}`))).toEqual(["ünïcode ✓ work", sidebarDate(now - 3 * 3600)]);
  expect(texts(row(`stash:${older}`))).toEqual(["WIP on main: 1234567 First", sidebarDate(now - 2 * 86400)]);

  // Changes ▸ Stash Changes… (⌘⌥S) asks for a message; the untracked variant stashes untracked files too.
  expect(menuItem("stash-changes")).toMatchObject({ label: "Stash Changes…", shortcut: "Cmd+Alt+s", disabled: false });
  expect(menuItem("apply-stash")).toMatchObject({ disabled: true });
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: " ünï message " });
  await act(async () => { lastMenu().onAction({ itemId: "stash-changes" }); });
  expect(showPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Stash Changes", confirmLabel: "Stash", message: expect.stringContaining("Untracked files stay") }));
  expect(git.stashPush).toHaveBeenLastCalledWith("ünï message", expect.objectContaining({ includeUntracked: false }));
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "" });
  await act(async () => { lastMenu().onAction({ itemId: "stash-all-changes" }); });
  expect(git.stashPush).toHaveBeenLastCalledWith("", expect.objectContaining({ includeUntracked: true }));
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: true });
  await act(async () => { lastMenu().onAction({ itemId: "stash-changes" }); });
  expect(git.stashPush).toHaveBeenCalledTimes(2);

  // Selecting a stash lists its files and shows the first one's diff with Apply, Pop and Drop… in the diff header.
  await act(async () => { sidebar().props.onSelectionChange({ id: `stash:${newer}` }); });
  expect(git.stashPatch).toHaveBeenLastCalledWith(newer, expect.anything());
  const fileList = renderer.root.findAllByType(Sidebar).at(-1)!;
  expect(fileList.props.selectedId).toBe("dir/a.txt");
  expect(fileList.findAllByType(SidebarItem).map(item => item.props.id)).toEqual(["dir/a.txt", "new.txt"]);
  expect(texts(renderer.root)).toContain("On main: ünïcode ✓ work");
  await act(async () => { fileList.props.onSelectionChange({ id: "new.txt" }); });
  expect(renderer.root.findAllByType(Sidebar).at(-1)!.props.selectedId).toBe("new.txt");
  expect(texts(renderer.root)).toContain("new.txt");
  expect(menuItem("apply-stash")).toMatchObject({ label: "Apply Stash", disabled: false });
  const toolbarItems = jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items! as any[];
  expect(toolbarItems.find(entry => entry.id === "section")).toMatchObject({ value: null });
  expect(toolbarItems.find(entry => entry.id === "search")).toMatchObject({ placeholder: "Filter Files" });

  await act(async () => { button("Apply").props.onPress(); });
  expect(git.stashApply).toHaveBeenLastCalledWith(newer, expect.anything());
  // A conflicting Pop reports Git's message and that the stash was kept.
  git.stashPop.mockRejectedValueOnce(new Error("CONFLICT (content): Merge conflict in a.txt"));
  await act(async () => { button("Pop").props.onPress(); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Pop the Stash", message: "CONFLICT (content): Merge conflict in a.txt\n\nThe stash was kept." }));
  // When only the drop failed, the stash was applied: no "kept" note that invites applying it twice.
  const { GitStashDropError } = jest.requireActual("@legend-apps/git-core");
  git.stashPop.mockRejectedValueOnce(new GitStashDropError("index.lock exists"));
  await act(async () => { button("Pop").props.onPress(); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Pop the Stash", message: "The stash was applied, but Git couldn’t remove it from the list: index.lock exists" }));
  // Refreshes keep the selection by oid even when the index moves.
  stashes = [{ oid: "f".repeat(40), index: 0, message: "On main: newest", time: now }, ...stashes.map(stash => ({ ...stash, index: stash.index + 1 }))];
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(sidebar().props.selectedId).toBe(`stash:${newer}`);
  expect(git.stashPatch).toHaveBeenCalledTimes(1);

  // Drop… asks with a warning sheet whose default is Cancel; cancelling keeps the stash.
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { button("Drop…").props.onPress(); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Drop the stash “ünïcode ✓ work”?", defaultButtonId: "cancel", buttons: [{ id: "confirm", label: "Drop" }, { id: "cancel", label: "Cancel" }] }));
  expect(git.stashDrop).not.toHaveBeenCalled();
  // Once dropped, the stash's row is gone and the selection falls back to Changes without the sidebar throwing.
  git.stashDrop.mockImplementationOnce(async () => { stashes = stashes.filter(stash => stash.oid !== newer); });
  await act(async () => { button("Drop…").props.onPress(); });
  expect(git.stashDrop).toHaveBeenLastCalledWith(newer, expect.anything());
  expect(sidebar().props.selectedId).toBe("changes");
  expect(items().some(item => item.props.id === `stash:${newer}`)).toBe(false);

  // A stash whose patch can't be read still offers Apply, Pop and Drop….
  git.stashPatch.mockRejectedValueOnce(new Error("bad object"));
  await act(async () => { sidebar().props.onSelectionChange({ id: `stash:${older}` }); });
  expect(texts(renderer.root)).toContain("bad object");
  expect(["Apply", "Pop", "Drop…"].map(label => !!button(label))).toEqual([true, true, true]);

  // The stash row's context menu acts on that row.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "pop-stash" });
  await act(async () => { row(`stash:${older}`).props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-")).toEqual(["Apply Stash", "Pop Stash", "-", "Drop Stash…"]);
  expect(git.stashPop).toHaveBeenLastCalledWith(older, expect.anything());

  // A checkout Git refuses over local changes offers Stash and Switch (default) or Cancel.
  const refused = () => new GitLocalChangesError("other", "error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\n\tb.txt\nAborting");
  git.checkoutBranch.mockRejectedValueOnce(refused());
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "checkout-ref" });
  await act(async () => { row("ref:refs/heads/other").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({
    kind: "warning", title: "You have uncommitted changes in 2 files that switching to “other” would overwrite.",
    buttons: [{ id: "stash", label: "Stash and Switch" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "stash", cancelButtonId: "cancel",
  }));
  expect(git.stashAndSwitch).not.toHaveBeenCalled();
  git.checkoutBranch.mockRejectedValueOnce(refused());
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "stash" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "checkout-ref" });
  await act(async () => { row("ref:refs/heads/other").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(git.stashAndSwitch).toHaveBeenLastCalledWith("other", expect.anything());
  // When the switch still fails, Git's reason is shown (git-core has popped the stash back).
  git.checkoutBranch.mockRejectedValueOnce(refused());
  git.stashAndSwitch.mockRejectedValueOnce(new Error("fatal: invalid reference: other"));
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "stash" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "checkout-ref" });
  await act(async () => { row("ref:refs/heads/other").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Switch to “other”", message: "invalid reference: other" }));
  await act(async () => { renderer.unmount(); });
});

it("disables stashing on an unborn HEAD, with nothing to stash, and leaves out Stashes when there are none", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  let entries = [{ kind: "untracked" as const, path: "a.txt", indexStatus: "?", worktreeStatus: "?" }];
  let oid = "(initial)";
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid, head: "main", upstream: null, ahead: 0, behind: 0 }, entries })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  expect(menuItem("stash-changes")).toMatchObject({ disabled: true });
  expect(renderer.root.findAllByType(SidebarItem).some(item => item.props.id === "group:stashes")).toBe(false);
  oid = "a".repeat(40);
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(menuItem("stash-changes")).toMatchObject({ disabled: false });
  entries = [];
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(menuItem("stash-changes")).toMatchObject({ disabled: true });
  await act(async () => { renderer.unmount(); });
});

describe("worktrees", () => {
  const head = "a".repeat(40), other = "b".repeat(40);
  const main = { path: "/repo", head, branch: "main", detached: false, bare: false, locked: null, prunable: null, main: true };
  const linked = { path: "/work/fëature ✓", head: other, branch: "feature", detached: false, bare: false, locked: null, prunable: null, main: false };
  const detached = { path: "/work/detached", head: other, branch: null, detached: true, bare: false, locked: "on a disk", prunable: null, main: false };
  const files = [{ kind: "ordinary" as const, path: "dir/a.txt", indexStatus: ".", worktreeStatus: "M" }, { kind: "untracked" as const, path: "new.txt", indexStatus: "?", worktreeStatus: "?" }];
  const patch = "diff --git a/dir/a.txt b/dir/a.txt\n--- a/dir/a.txt\n+++ b/dir/a.txt\n@@ -1 +1 @@\n-a\n+b\n";
  function service(root: string, worktrees: () => unknown[]) {
    return { repoRoot: root, resolveRoot: jest.fn(async () => root), watchLocations: jest.fn(async () => ({ root, gitDir: `${root}/.git`, commonDir: "/repo/.git", ignoredPaths: [] })),
      status: jest.fn(async () => ({ branch: { oid: head, head: root === "/repo" ? "main" : "feature", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
      fileDiff: jest.fn(async () => ""),
      listRefs: jest.fn(async () => ({ branches: [{ name: "main", ref: "refs/heads/main", oid: head, current: root === "/repo", upstream: null, time: 2 }, { name: "feature", ref: "refs/heads/feature", oid: other, current: root !== "/repo", upstream: null, time: 1 }], remotes: [], tags: [] })),
      listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => worktrees()),
      worktreeChangeCount: jest.fn(async (path: string) => path === linked.path ? 2 : 0),
      worktreeStatus: jest.fn(async () => ({ branch: { oid: other, head: "feature", upstream: null, ahead: 0, behind: 0 }, entries: files })),
      worktreeFileDiff: jest.fn(async () => patch), addWorktree: jest.fn(async (): Promise<string> => ""), removeWorktree: jest.fn(async () => {}) };
  }

  it("lists linked worktrees with branch and count, previews one read-only, and opens, creates, reveals and removes worktrees", async () => {
    jest.clearAllMocks();
    jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
    jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
    let worktrees: unknown[] = [main];
    const git = service("/repo", () => worktrees);
    jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); });
    await act(async () => { openRepository(); });
    const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
    const items = () => sidebar().findAllByType(SidebarItem);
    const row = (id: string) => items().find(item => item.props.id === id)!;
    const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
    const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.children === label);
    const texts = (node: { findAllByType: typeof renderer.root.findAllByType }) => node.findAllByType(Text).map(text => [text.props.children].flat().join(""));

    // Only the main worktree: no Worktrees section, and no count is read.
    expect(items().some(item => item.props.id === "group:worktrees")).toBe(false);
    expect(git.worktreeChangeCount).not.toHaveBeenCalled();
    expect(lastMenu().items.find(entry => entry.id === "worktree").items.map((entry: any) => entry.id ?? "-")).toEqual(["new-worktree", "open-review-worktree", "-", "reveal-worktree", "remove-worktree"]);
    // Spark refuses a menu bar whose item ids repeat (Open Worktree in New Window lives in File only).
    const ids = lastMenu().items.flatMap(entry => [entry.id, ...(entry.items ?? []).map((child: any) => child.id)]).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(menuItem("open-worktree")).toMatchObject({ label: "Open Worktree in New Window", shortcut: "Cmd+Shift+o", disabled: true });
    expect(lastMenu().items.find(entry => entry.id === "file").items.map((entry: any) => entry.id ?? "-")).toEqual(["newWindow", "open-repository", "open-worktree", "reveal-repository", "native-new", "native-open"]);

    worktrees = [main, detached, linked];
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    // Worktrees, then the Review Queue (last in the SourceTree preset) with the changed worktree.
    expect(items().map(item => item.props.id).slice(-7)).toEqual(["group:worktrees", "worktree:/repo", "worktree:/work/detached", `worktree:${linked.path}`, "group:reviewQueue", "review-note", `review:worktree:${linked.path}`]);
    expect(row(`worktree:${linked.path}`).findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["folder"]);
    expect(texts(row(`worktree:${linked.path}`))).toEqual(["fëature ✓", "feature · 2"]);
    expect(texts(row("worktree:/work/detached"))).toEqual(["detached", "bbbbbbb"]);
    // This window's worktree carries the checkmark.
    expect(row("worktree:/repo").findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["folder", "checkmark"]);
    expect(menuItem("remove-worktree")).toMatchObject({ disabled: true });

    // Selecting one lists its changed files read-only with Open in New Window, and shows the first file's diff.
    await act(async () => { sidebar().props.onSelectionChange({ id: `worktree:${linked.path}` }); });
    expect(git.worktreeStatus).toHaveBeenLastCalledWith(linked.path, expect.anything());
    expect(git.worktreeFileDiff).toHaveBeenLastCalledWith(linked.path, { path: "dir/a.txt", untracked: false }, expect.anything());
    const fileList = renderer.root.findAllByType(Sidebar).at(-1)!;
    expect(fileList.findAllByType(SidebarItem).map(item => item.props.id)).toEqual(["dir/a.txt", "new.txt"]);
    expect(fileList.props.selectedId).toBe("dir/a.txt");
    expect(renderer.root.findAllByProps({ readOnly: true }).some(node => node.props.patch?.path === "dir/a.txt")).toBe(true);
    await act(async () => { fileList.props.onSelectionChange({ id: "new.txt" }); });
    expect(git.worktreeFileDiff).toHaveBeenLastCalledWith(linked.path, { path: "new.txt", untracked: true }, expect.anything());
    expect(menuItem("open-worktree")).toMatchObject({ disabled: false });
    expect(menuItem("remove-worktree")).toMatchObject({ disabled: false });

    // Open in New Window (button, ⌘⇧O) opens it as its own window titled "<repo> — <branch>".
    await act(async () => { button("Open in New Window")!.props.onPress(); });
    expect(openWorktreeWindow).toHaveBeenLastCalledWith(linked.path, "repo", "repo — feature");
    await act(async () => { lastMenu().onAction({ itemId: "open-worktree" }); });
    expect(openWorktreeWindow).toHaveBeenCalledTimes(2);

    // Refreshes keep the selection by path and the selected file.
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(sidebar().props.selectedId).toBe(`worktree:${linked.path}`);
    expect(renderer.root.findAllByType(Sidebar).at(-1)!.props.selectedId).toBe("new.txt");

    // The row's context menu: Open in New Window, Reveal in Finder, Remove….
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "reveal-worktree" });
    await act(async () => { row(`worktree:${linked.path}`).props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-")).toEqual(["Open in New Window", "Reveal in Finder", "-", "Remove…"]);
    expect(runCommand).toHaveBeenLastCalledWith(expect.objectContaining({ target: { type: "command", name: "open" }, args: ["-R", "--", linked.path] }));
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "open-worktree" });
    await act(async () => { row("worktree:/repo").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    // The window's own worktree can't be opened again or removed.
    expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.disabled ?? false)).toEqual([true, false, false, true]);
    expect(openWorktreeWindow).toHaveBeenCalledTimes(2);

    // Remove… asks first (Cancel default); Git refusing a dirty worktree shows its message and asks again before forcing.
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
    await act(async () => { lastMenu().onAction({ itemId: "remove-worktree" }); });
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Remove the worktree “fëature ✓”?", defaultButtonId: "cancel", buttons: [{ id: "confirm", label: "Remove" }, { id: "cancel", label: "Cancel" }] }));
    expect(git.removeWorktree).not.toHaveBeenCalled();
    git.removeWorktree.mockRejectedValueOnce(new Error("fatal: '/work/fëature ✓' contains modified or untracked files, use --force to delete it"));
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" }).mockResolvedValueOnce({ buttonId: "cancel" });
    await act(async () => { lastMenu().onAction({ itemId: "remove-worktree" }); });
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Git didn’t remove “fëature ✓”.", defaultButtonId: "cancel", buttons: [{ id: "confirm", label: "Remove Anyway" }, { id: "cancel", label: "Cancel" }], message: expect.stringContaining("contains modified or untracked files") }));
    expect(git.removeWorktree).toHaveBeenCalledTimes(1);
    git.removeWorktree.mockRejectedValueOnce(new Error("fatal: '/work/fëature ✓' contains modified or untracked files, use --force to delete it"));
    git.removeWorktree.mockImplementationOnce(async () => { worktrees = [main, detached]; });
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" }).mockResolvedValueOnce({ buttonId: "confirm" });
    await act(async () => { lastMenu().onAction({ itemId: "remove-worktree" }); });
    expect(git.removeWorktree).toHaveBeenLastCalledWith(linked.path, expect.objectContaining({ force: true }));
    // The removed worktree's row is gone and the selection falls back to Changes without the sidebar throwing.
    expect(sidebar().props.selectedId).toBe("changes");
    expect(items().some(item => item.props.id === `worktree:${linked.path}`)).toBe(false);

    // Selecting the main worktree, then losing the last linked one, hides the rows and falls back to Changes too.
    await act(async () => { sidebar().props.onSelectionChange({ id: "worktree:/repo" }); });
    worktrees = [main];
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(sidebar().props.selectedId).toBe("changes");
    expect(items().some(item => item.props.id === "group:worktrees")).toBe(false);
    worktrees = [main, detached];
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });

    // Errors other than Git's refusals are reported without offering to force.
    git.removeWorktree.mockRejectedValueOnce(new Error("Another branch or stash operation is still running."));
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" });
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "remove-worktree" });
    await act(async () => { row("worktree:/work/detached").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Remove “detached”", message: "Another branch or stash operation is still running." }));

    // New Worktree… asks for a branch, then for the parent folder: an existing branch is checked out, another name is created.
    git.addWorktree.mockImplementationOnce(async () => { worktrees = [main, detached, { ...linked, path: "/private/work/feature" }]; return "/private/work/feature"; });
    jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: " feature " });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/work/"] });
    await act(async () => { lastMenu().onAction({ itemId: "new-worktree" }); });
    expect(showPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ title: "New Worktree", windowId: "main" }));
    expect(openFileDialog).toHaveBeenLastCalledWith(expect.objectContaining({ selection: "directories", title: "Choose the Folder for the New Worktree" }));
    expect(git.addWorktree).toHaveBeenLastCalledWith("/work/feature", expect.objectContaining({ branch: "feature" }));
    // The new worktree is selected by the path Git lists.
    expect(sidebar().props.selectedId).toBe("worktree:/private/work/feature");
    jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "topic/new" });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/work"] });
    git.addWorktree.mockRejectedValueOnce(new Error("fatal: '/work/topic-new' already exists"));
    await act(async () => { lastMenu().onAction({ itemId: "new-worktree" }); });
    expect(git.addWorktree).toHaveBeenLastCalledWith("/work/topic-new", expect.objectContaining({ newBranch: "topic/new" }));
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Create the Worktree", message: "'/work/topic-new' already exists" }));
    // Cancelling the folder chooser creates nothing.
    jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "x" });
    await act(async () => { lastMenu().onAction({ itemId: "new-worktree" }); });
    expect(git.addWorktree).toHaveBeenCalledTimes(2);
    await act(async () => { renderer.unmount(); });
  });

  it("opens a worktree window on its path, titles it after the repository and branch, owns the menu bar while focused, and stops its watcher on close", async () => {
    jest.clearAllMocks();
    const removes: jest.Mock[] = [];
    jest.mocked(watchDirectories).mockImplementation(() => { const remove = jest.fn(); removes.push(remove); return { remove }; });
    const services = new Map([["/repo", service("/repo", () => [main, linked])], [linked.path, service(linked.path, () => [main, linked])]]);
    jest.mocked(getGitService).mockImplementation(root => services.get(root) as unknown as GitService);
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    let mainWindow!: ReactTestRenderer, worktreeWindow!: ReactTestRenderer;
    await act(async () => { mainWindow = create(<App />); });
    await act(async () => { openRepository(); });
    const menuCalls = () => jest.mocked(useMenu).mock.calls.length;
    const id = "worktree-test";
    await act(async () => { worktreeWindow = create(<App windowId={id} initialPath={linked.path} repoName="repo" />); });
    expect(services.get(linked.path)!.resolveRoot).toHaveBeenCalled();
    expect(jest.mocked(setWindowOptions).mock.calls.filter(call => call[0] === id).map(call => call[1].title).filter(Boolean).at(-1)).toBe("repo — feature");
    // No represented folder: AppKit would title the window with the folder's name instead.
    expect(jest.mocked(setWindowOptions).mock.calls.filter(call => call[0] === id).some(call => call[1].macos && "representedUri" in call[1].macos)).toBe(false);
    expect(jest.mocked(addMacOSWindowListener).mock.calls.map(call => call[0])).toEqual(["main", id]);
    // The new window owns the menu bar: menu actions act on its repository.
    const before = menuCalls();
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(services.get(linked.path)!.status.mock.calls.length).toBeGreaterThan(1);
    const sidebar = worktreeWindow.root.findAllByType(Sidebar)[0]!;
    expect(sidebar.findAllByType(SidebarItem).find(item => item.props.id === `worktree:${linked.path}`)!.findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["folder", "checkmark"]);
    // Focusing the main window hands it the menu bar.
    const focus = (windowId: string) => jest.mocked(addWindowListener).mock.calls.find(call => call[0] === windowId && call[1] === "focusChanged")![2] as (event: { windowId: string; focused: boolean }) => void;
    await act(async () => { focus("main")({ windowId: "main", focused: true }); });
    expect(menuCalls()).toBeGreaterThan(before);
    const mainStatus = services.get("/repo")!.status.mock.calls.length;
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(services.get("/repo")!.status.mock.calls.length).toBeGreaterThan(mainStatus);
    // Closing the worktree window removes its watcher and leaves the main window's alone.
    await act(async () => { focus(id)({ windowId: id, focused: true }); });
    const closed = jest.mocked(addWindowListener).mock.calls.find(call => call[0] === id && call[1] === "closed")![2] as (event: { windowId: string }) => void;
    await act(async () => { closed({ windowId: id }); });
    expect(removes.map(remove => remove.mock.calls.length)).toEqual([0, 1]);
    // The menu bar went back to the main window.
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(services.get("/repo")!.status.mock.calls.length).toBeGreaterThan(mainStatus + 1);
    await act(async () => { worktreeWindow.unmount(); mainWindow.unmount(); });
  });
});

it("fetches, pulls and pushes from the Repository menu with ↓/↑ counts and progress in the toolbar, reports Git's refusals and publishes a new branch", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  let branch = { oid: head, head: "main", upstream: "origin/main" as string | null, ahead: 1, behind: 2 };
  let fetchDone!: () => void;
  const git = { resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({ branches: [{ name: branch.head, ref: `refs/heads/${branch.head}`, oid: head, current: true, upstream: branch.upstream, time: 1 }], remotes: [{ name: "origin", branches: [] }], tags: [] })),
    listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []),
    fetch: jest.fn((options: GitNetworkOptions) => new Promise<void>((resolve, reject) => {
      fetchDone = resolve;
      options.signal?.addEventListener("abort", () => reject(new GitServiceError("aborted", "Git operation was cancelled.")));
      options.onProgress?.({ phase: "Receiving objects", percent: 45 });
    })),
    // Git's hints, including its bare "hint:" spacer lines, are left out of the sheet.
    pull: jest.fn(async () => { throw new GitPullDivergedError("hint: Diverging branches can't be fast-forwarded.\nhint:\nhint:\nfatal: Not possible to fast-forward, aborting."); }),
    push: jest.fn(async (_options: GitNetworkOptions & { setUpstream?: string }): Promise<void> => { throw new GitPushRejectedError("To /remote.git\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to '/remote.git'\nhint: Updates were rejected"); }),
    publishRemote: jest.fn(async () => "origin") };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const toolbarItems = () => jest.mocked(setWindowOptions).mock.calls.filter(call => call[1].macos?.toolbar).at(-1)![1].macos!.toolbar!.items! as any[];
  const repository = lastMenu().items.find(entry => entry.id === "repository").items.map((entry: any) => entry.id ?? "-");
  expect(repository).toEqual(["fetch", "pull", "push", "cancel-network", "-", "refresh", "-", "create-pull-request", "open-github", "-", "sign-in-github", "sign-out-github"]);
  expect(menuItem("fetch")).toMatchObject({ label: "Fetch", shortcut: "Cmd+Alt+f", disabled: false });
  expect(menuItem("pull")).toMatchObject({ label: "Pull", shortcut: "Cmd+Shift+Down", disabled: false });
  expect(menuItem("push")).toMatchObject({ label: "Push", shortcut: "Cmd+Shift+Up", disabled: false });
  expect(menuItem("cancel-network")).toMatchObject({ disabled: true });
  // The pinned Spark's disabled toolbar buttons still act enabled, so Fetch/Pull/Push have no toolbar buttons; the counts do.
  expect(toolbarItems().map(entry => entry.id)).not.toContain("fetch");
  expect(toolbarItems().find(entry => entry.id === "ahead-behind")).toMatchObject({ type: "label", text: "↓2 ↑1" });

  // Fetch: one at a time, progress in the toolbar label, Stop cancels without an alert.
  await act(async () => { lastMenu().onAction({ itemId: "fetch" }); });
  expect(git.fetch).toHaveBeenCalledWith(expect.objectContaining({ prune: true }));
  expect(toolbarItems().find(entry => entry.id === "network-progress")).toMatchObject({ type: "label", text: "Receiving objects 45%" });
  expect(setToolbarItemText).toHaveBeenLastCalledWith("main", "network-progress", "Receiving objects 45%");
  for (const id of ["fetch", "pull", "push"]) expect(menuItem(id)).toMatchObject({ disabled: true });
  expect(menuItem("cancel-network")).toMatchObject({ label: "Stop Fetching", disabled: false });
  await act(async () => { lastMenu().onAction({ itemId: "fetch" }); });
  expect(git.fetch).toHaveBeenCalledTimes(1);
  const reads = git.status.mock.calls.length;
  branch = { ...branch, behind: 3 };
  await act(async () => { fetchDone(); });
  expect(git.status.mock.calls.length).toBeGreaterThan(reads);
  expect(toolbarItems().find(entry => entry.id === "ahead-behind")).toMatchObject({ text: "↓3 ↑1" });
  expect(toolbarItems().some(entry => entry.id === "network-progress")).toBe(false);
  await act(async () => { lastMenu().onAction({ itemId: "fetch" }); });
  await act(async () => { lastMenu().onAction({ itemId: "cancel-network" }); });
  expect(showMessage).not.toHaveBeenCalled();
  expect(menuItem("fetch")).toMatchObject({ disabled: false });

  // A diverged pull and a rejected push say why, without Git's hints.
  await act(async () => { lastMenu().onAction({ itemId: "pull" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Pull", message: expect.stringMatching(/^Not possible to fast-forward, aborting\.\n\n“main” and “origin\/main” both have new commits/) }));
  await act(async () => { lastMenu().onAction({ itemId: "push" }); });
  const rejected = jest.mocked(showMessage).mock.calls.at(-1)![0] as { title: string; message: string };
  expect(rejected.title).toBe("“origin/main” Has Commits You Don’t Have");
  expect(rejected.message).toMatch(/^Pull first, then push again\.\n\nTo \/remote\.git\n ! \[rejected\]/);
  expect(rejected.message).not.toMatch(/hint:/);

  // A branch without an upstream is published after a sheet naming the remote; Cancel leaves it unpublished.
  branch = { ...branch, head: "topic", upstream: null, ahead: 0, behind: 0 };
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(menuItem("push")).toMatchObject({ label: "Publish Branch…", disabled: false });
  expect(menuItem("pull")).toMatchObject({ disabled: true });
  expect(toolbarItems().some(entry => entry.id === "ahead-behind")).toBe(false);
  git.push.mockClear();
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { lastMenu().onAction({ itemId: "push" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "info", title: "Publish “topic” to “origin”?", defaultButtonId: "publish" }));
  expect(git.push).not.toHaveBeenCalled();
  git.push.mockResolvedValueOnce(undefined);
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "publish" });
  await act(async () => { lastMenu().onAction({ itemId: "push" }); });
  expect(git.push).toHaveBeenCalledWith(expect.objectContaining({ setUpstream: "origin" }));
  // No remote to publish to.
  git.publishRemote.mockResolvedValueOnce(null as unknown as string);
  await act(async () => { lastMenu().onAction({ itemId: "push" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "There’s No Remote to Publish To" }));
  await act(async () => { renderer.unmount(); });
});

it("lists the Review Queue, stages and commits in a queued worktree through its own service, shows a branch's outgoing commits and pushes or publishes branches", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const head = "a".repeat(40), other = "b".repeat(40);
  jest.mocked(openGitHistory).mockResolvedValue({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async () => ({ offset: 0, commits: [], done: true })), close: jest.fn() });
  const main = { path: "/repo", head, branch: "main", detached: false, bare: false, locked: null, prunable: null, main: true };
  const dirty = { path: "/work/dirty", head: other, branch: "feature", detached: false, bare: false, locked: null, prunable: null, main: false };
  const clean = { path: "/work/clean", head, branch: "clean", detached: false, bare: false, locked: null, prunable: null, main: false };
  let worktrees: unknown[] = [main, dirty, clean];
  let counts: Record<string, number> = { [dirty.path]: 2, [clean.path]: 0 };
  let aheadBranch = 2;
  let outgoing: Record<string, number> = { "refs/heads/main": 0, "refs/heads/feature": 0, "refs/heads/clean": 0, "refs/heads/fresh": 1, "refs/heads/ahead": 2 };
  let files = [{ kind: "ordinary" as const, path: "a.txt", indexStatus: ".", worktreeStatus: "M" }, { kind: "untracked" as const, path: "new.txt", indexStatus: "?", worktreeStatus: "?" }];
  const branch = (name: string, upstream: string | null, ahead = 0, current = false) => ({ name, ref: `refs/heads/${name}`, oid: head, current, upstream, time: 1, ahead, behind: 0, gone: false });
  const remoteBranch = (name: string) => ({ name: `origin/${name}`, ref: `refs/remotes/origin/${name}`, oid: head, remote: "origin", branch: name });
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: head, head: "main", upstream: "origin/main", ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({
      branches: [branch("main", "origin/main", 0, true), branch("feature", null), branch("clean", null), branch("fresh", null), branch("ahead", "origin/ahead", aheadBranch)],
      remotes: [{ name: "origin", branches: [remoteBranch("main"), remoteBranch("ahead")] }], tags: [], defaultBranch: "refs/remotes/origin/main",
    })),
    branchesAhead: jest.fn(async () => outgoing),
    listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => worktrees),
    worktreeChangeCount: jest.fn(async (path: string) => counts[path] ?? 0),
    worktreeStatus: jest.fn(async () => ({ branch: { oid: other, head: "feature", upstream: null, ahead: 0, behind: 0 }, entries: files })),
    worktreeFileDiff: jest.fn(async () => ""),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    logRange: jest.fn(async () => ({ commits: [{ oid: other, parents: [head], author: "Ada", email: "ada@example.test", time: 1, summary: "Outgoing", path: "", oldPath: null, status: "" }], done: true })),
    commitDetails: jest.fn(async (oid: string) => ({ oid, parents: [head], author: { name: "Ada", email: "ada@example.test", time: 1 }, committer: { name: "Ada", email: "ada@example.test", time: 1 }, message: "Outgoing" })),
    commitPatch: jest.fn(async () => ""),
    stageFile: jest.fn(async () => {}), unstageFile: jest.fn(async () => {}), commit: jest.fn(async () => {}),
    pushBranch: jest.fn(async (_branch: string, _options: GitNetworkOptions & { setUpstream?: string }) => {}), publishRemote: jest.fn(async () => "origin") };
  // The queued worktree's writes go through its own service.
  const worktree = { repoRoot: dirty.path, stageFile: jest.fn(async () => { files = [{ ...files[0]!, indexStatus: "M", worktreeStatus: "." }, files[1]!]; }), unstageFile: jest.fn(async () => {}),
    commit: jest.fn(async () => { files = [files[1]!]; counts = { ...counts, [dirty.path]: 1 }; outgoing = { ...outgoing, "refs/heads/feature": 1 }; }) };
  jest.mocked(getGitService).mockImplementation(path => (path === dirty.path ? worktree : git) as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  const consoleError = jest.spyOn(console, "error");
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  const items = () => sidebar().findAllByType(SidebarItem);
  const row = (id: string) => items().find(item => item.props.id === id)!;
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  // A queued worktree's row also has a Worktrees row; their React keys must differ (the app pass hit a duplicate key).
  expect(consoleError.mock.calls.some(call => String(call[0]).includes("same key"))).toBe(false);
  // The last match: Changes' own Stage button stays mounted, hidden.
  const button = (label: string) => renderer.root.findAllByType(Button).filter(node => [node.props.children].flat().join("") === label).at(-1);
  const texts = (node: { findAllByType: typeof renderer.root.findAllByType }) => node.findAllByType(Text).map(text => [text.props.children].flat().join(""));

  // The dirty worktree, then the branch ahead of its upstream and the unpublished one; not the clean worktree, main or a branch level with main.
  const ids = items().map(item => item.props.id);
  // The SourceTree preset puts the queue last, under a header that says what it lists.
  expect(ids.slice(ids.indexOf("group:reviewQueue"))).toEqual(["group:reviewQueue", "review-note", "review:worktree:/work/dirty", "review:branch:refs/heads/fresh", "review:branch:refs/heads/ahead"]);
  expect(row("group:reviewQueue").findAllByType("SFSymbol" as any).map(symbol => symbol.props.name)).toEqual(["chevron.down"]);
  expect(texts(row("group:reviewQueue"))).toEqual(["Review Queue", "3"]);
  expect(texts(row("review-note"))).toEqual(["Uncommitted worktrees and unpushed branches"]);
  expect(texts(row("review:worktree:/work/dirty"))).toEqual(["dirty", "2 files"]);
  expect(texts(row("review:branch:refs/heads/ahead"))).toEqual(["ahead", "↑2"]);
  expect(texts(row("review:branch:refs/heads/fresh"))).toEqual(["fresh", "↑1"]);
  expect(git.branchesAhead).toHaveBeenCalledWith("refs/remotes/origin/main", expect.anything());
  expect(menuItem("show-review")).toMatchObject({ label: "Review Queue", shortcut: "Cmd+3", disabled: false });
  expect(menuItem("open-review-worktree")).toMatchObject({ shortcut: "Cmd+Down", disabled: true });

  // ⌘3 selects the first entry: its files, Stage for the selected one, Commit… once something is staged.
  await act(async () => { lastMenu().onAction({ itemId: "show-review" }); });
  expect(sidebar().props.selectedId).toBe("review:worktree:/work/dirty");
  expect(git.worktreeStatus).toHaveBeenLastCalledWith(dirty.path, expect.anything());
  expect(menuItem("commit")).toMatchObject({ label: "Commit…", disabled: true });
  await act(async () => { button("Stage")!.props.onPress(); });
  expect(worktree.stageFile).toHaveBeenCalledWith("a.txt");
  expect(git.stageFile).not.toHaveBeenCalled();
  expect(button("Unstage")).toBeDefined();
  expect(menuItem("commit")).toMatchObject({ disabled: false });
  // ⌘↓ opens the worktree in its window.
  expect(menuItem("open-review-worktree")).toMatchObject({ disabled: false });
  await act(async () => { lastMenu().onAction({ itemId: "open-review-worktree" }); });
  expect(openWorktreeWindow).toHaveBeenLastCalledWith(dirty.path, "repo", "repo — feature");

  // Commit… asks for the message, commits in that worktree only, and the queue re-reads its count and the branch's commits.
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "Review it" });
  await act(async () => { lastMenu().onAction({ itemId: "commit" }); });
  expect(worktree.commit).toHaveBeenCalledWith({ message: "Review it\n" });
  expect(git.commit).not.toHaveBeenCalled();
  expect(texts(row("review:worktree:/work/dirty"))).toEqual(["dirty", "1 file · ↑1"]);

  // A worktree with nothing left to commit gives way to its branch's entry, which lists the outgoing commits.
  counts = { ...counts, [dirty.path]: 0 };
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(sidebar().props.selectedId).toBe("review:branch:refs/heads/feature");
  expect(git.logRange).toHaveBeenLastCalledWith("refs/remotes/origin/main", "refs/heads/feature", expect.anything());
  expect(renderer.root.findAllByType("LegendList" as any).at(-1)!.props.data.map((commit: any) => commit.summary)).toEqual(["Outgoing"]);

  // Push sends a branch that isn't checked out to its upstream; once level, it leaves the queue.
  await act(async () => { sidebar().props.onSelectionChange({ id: "review:branch:refs/heads/ahead" }); });
  expect(git.logRange).toHaveBeenLastCalledWith("refs/remotes/origin/ahead", "refs/heads/ahead", expect.anything());
  git.pushBranch.mockImplementationOnce(async () => { aheadBranch = 0; });
  await act(async () => { button("Push")!.props.onPress(); });
  expect(git.pushBranch).toHaveBeenLastCalledWith("ahead", expect.objectContaining({ signal: expect.anything() }));
  expect(items().some(item => item.props.id === "review:branch:refs/heads/ahead")).toBe(false);
  expect(sidebar().props.selectedId).toMatch(/^review:branch:/);

  // An unpublished branch is published from its context menu after the sheet.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "push-review" });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "publish" });
  await act(async () => { row("review:branch:refs/heads/fresh").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label)).toEqual(["Publish Branch…"]);
  expect(git.pushBranch).toHaveBeenLastCalledWith("fresh", expect.objectContaining({ setUpstream: "origin" }));

  // A removed worktree leaves the queue; with nothing pending the Review Queue row is gone and the selection falls back.
  worktrees = [main, clean];
  outgoing = { ...outgoing, "refs/heads/feature": 0, "refs/heads/fresh": 0 };
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(items().some(item => String(item.props.id).startsWith("review"))).toBe(false);
  expect(sidebar().props.selectedId).toBe("changes");
  expect(menuItem("show-review")).toMatchObject({ disabled: true });
  await act(async () => { renderer.unmount(); });
});

it("lists recents in the empty window, opens Open Recent's requests, shows a paused merge in a state bar with Abort…, and offers another folder for a missing one", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const operation = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 2, mergeHead: true };
  const git = {
    resolveRoot: jest.fn(async () => "/work/repo"), watchLocations: jest.fn(async () => ({ root: "/work/repo", gitDir: "/work/repo/.git", commonDir: "/work/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch: { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null),
    operationState: jest.fn(async (): Promise<typeof operation | null> => operation), abortOperation: jest.fn(async () => {}),
  };
  const missing = { resolveRoot: jest.fn(async () => { throw new Error("cannot change to '/work/gone': No such file or directory"); }) };
  jest.mocked(getGitService).mockImplementation(((path: string) => path === "/work/gone" ? missing : git) as never);
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  await recentRepositories.note("/work/gone");
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  expect(renderer.root.findAllByType(Text).map(node => node.props.children)).toContain("/work/gone");
  expect(renderer.root.findAllByType(SidebarSplitView)).toHaveLength(0);
  const openRequest = jest.mocked(subscribeToOpenRequests).mock.calls[0]![0];

  // A folder that's gone (chosen from Open Recent): the sheet, and Choose Another… opens the folder panel.
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "choose" });
  await act(async () => { openRequest({ type: "file", id: "1", path: "/work/gone" }); });
  expect(showMessage).toHaveBeenCalledWith(expect.objectContaining({ title: "“gone” isn’t in a Git repository.", buttons: [{ id: "choose", label: "Choose Another…" }, { id: "cancel", label: "Cancel" }] }));
  expect(openFileDialog).toHaveBeenCalledWith(expect.objectContaining({ title: "Open Repository" }));

  // Opening a repository puts it first; the merge shows above the lists with Abort… (after a warning) and Continue (disabled with conflicts).
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/work/repo/src"] });
  await act(async () => { openRepository(); });
  await act(async () => { await recentRepositories.settled(); });
  expect(recentRepositories.get().slice(0, 2)).toEqual(["/work/repo", "/work/gone"]);
  expect(noteRecentDocument).toHaveBeenLastCalledWith("/work/repo");
  const bar = renderer.root.findByType(StateBar);
  expect(bar.props.text).toBe("Merging “feature” into “main” — 2 conflicted files");
  const [abort, resume] = bar.findAllByType(Button);
  expect(resume!.props.disabled).toBe(true);
  expect(menuItem("abort-operation")).toMatchObject({ label: "Abort Merge…", disabled: false });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" });
  git.operationState.mockResolvedValue(null);
  await act(async () => { abort!.props.onPress(); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Abort the merge?" }));
  expect(git.abortOperation).toHaveBeenCalledWith("merge", expect.anything());
  expect(renderer.root.findAllByType(StateBar)).toHaveLength(0);
  await act(async () => { renderer.unmount(); });
});

it("merges a branch into the current one after a sheet, shows the stopped merge with conflicted files first, marks files resolved and continues", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40), side = "c".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 };
  const refs = {
    branches: [{ name: "feature", ref: "refs/heads/feature", oid: side, current: false, upstream: null, time: 2 }, { name: "main", ref: "refs/heads/main", oid: head, current: true, upstream: null, time: 1 }],
    remotes: [{ name: "origin", branches: [{ name: "origin/fix", ref: "refs/remotes/origin/fix", oid: side, remote: "origin", branch: "fix" }] }], tags: [],
  };
  const merging = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 2, mergeHead: true };
  const conflicted = (path: string) => ({ kind: "unmerged" as const, path, indexStatus: "U", worktreeStatus: "U" });
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async (): Promise<unknown> => ({ branch, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async (): Promise<unknown> => null),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => refs), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""),
    mergeKind: jest.fn(async () => "merge"), merge: jest.fn(async () => "stopped"), mergeMessage: jest.fn(async () => "Merge branch 'feature'"),
    hasConflictMarkers: jest.fn(async () => true), stageFile: jest.fn(async () => {}), continueOperation: jest.fn(async () => {}), commit: jest.fn(async () => {}),
    conflictRegions: jest.fn(async (): Promise<unknown> => null), conflictFile: jest.fn(async () => ({ ours: true, theirs: true, binary: false, edited: false })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  const row = (id: string) => sidebar().findAllByType(SidebarItem).find(item => item.props.id === id)!;
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.children === label);
  const inputs = () => renderer.root.findAllByType(TextInput);
  const menuLabels = () => jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-");

  // The Branch menu has Merge into Current Branch…; a branch's context menu names both branches. The current branch has none.
  expect(lastMenu().items.find(entry => entry.id === "branch").items.map((entry: any) => entry.id ?? "-")).toEqual(["switch-branch", "new-branch", "-", "rename-branch", "delete-branch", "-", "merge-ref", "rebase-ref", "interactive-rebase-ref", "cherry-pick-commit", "revert-commit", "-", "abort-operation", "continue-operation"]);
  expect(menuItem("merge-ref")).toMatchObject({ label: "Merge into Current Branch…", disabled: false });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: true } as never);
  await act(async () => { row("ref:refs/heads/main").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(menuLabels()).not.toContain("Merge “main” into “main”…");

  // The sheet says a merge commit is made; Merge runs it, it stops with conflicts and Changes shows them first, with Git's message.
  git.merge.mockImplementationOnce(async () => {
    git.status.mockResolvedValue({ branch, entries: [{ kind: "ordinary", path: "a-clean.txt", indexStatus: "M", worktreeStatus: "." }, { kind: "ordinary", path: "0-edit.txt", indexStatus: ".", worktreeStatus: "M" }, conflicted("x.txt"), conflicted("y.txt")] });
    git.operationState.mockResolvedValue(merging);
    return "stopped";
  });
  await act(async () => { sidebar().props.onSelectionChange({ id: "history" }); });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "merge" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "merge-ref" });
  await act(async () => { row("ref:refs/heads/feature").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(menuLabels()).toEqual(["Check Out", "New Branch from “feature”…", "-", "Merge “feature” into “main”…", "Rebase “main” onto “feature”…", "Rebase “main” Interactively onto “feature”…", "-", "Rename Branch…", "Delete Branch…", "-", "Copy Name"]);
  expect(git.mergeKind).toHaveBeenCalledWith("refs/heads/feature", expect.anything());
  expect(showMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: "info", title: "Merge “feature” into “main”?", message: expect.stringContaining("Git makes a merge commit on “main” with its default message."),
    buttons: [{ id: "merge", label: "Merge" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "merge" }));
  expect(git.merge).toHaveBeenCalledWith("refs/heads/feature", expect.anything());
  expect(sidebar().props.selectedId).toBe("changes");
  const bar = renderer.root.findByType(StateBar);
  expect(bar.props.text).toBe("Merging “feature” into “main” — 2 conflicted files");
  expect(bar.findAllByType(Button)[1]!.props.disabled).toBe(true);
  expect(menuItem("continue-operation")).toMatchObject({ label: "Continue Merge", disabled: true });
  expect(menuItem("merge-ref")).toMatchObject({ disabled: true });
  const unstagedList = () => filesList(renderer, "Unstaged");
  expect(unstagedList().findAllByType(SidebarItem).map(item => item.props.id)).toEqual(["x.txt", "y.txt", "0-edit.txt"]);
  expect(inputs().map(input => input.props.value)).toEqual(["Merge branch 'feature'", ""]);
  // The toolbar's branch is still the current branch.
  expect((jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items! as any[]).find(entry => entry.id === "branch").label).toBe("main");

  // Mark Resolved (the conflict's diff header) on a file with markers asks first; Cancel stages nothing.
  await act(async () => { unstagedList().props.onSelectionChange({ id: "x.txt" }); });
  expect(button("Mark Resolved")!.props.disabled).toBe(false);
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { button("Mark Resolved")!.props.onPress(); });
  expect(git.hasConflictMarkers).toHaveBeenLastCalledWith("x.txt", expect.anything());
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Mark “x.txt” as resolved anyway?", buttons: [{ id: "confirm", label: "Mark Resolved" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "cancel" }));
  expect(git.stageFile).not.toHaveBeenCalled();
  // Once edited (no markers), it stages without asking; so does Stage on a conflicted row.
  git.hasConflictMarkers.mockResolvedValue(false);
  const asked = jest.mocked(showMessage).mock.calls.length;
  await act(async () => { button("Mark Resolved")!.props.onPress(); });
  expect(git.stageFile).toHaveBeenLastCalledWith("x.txt", expect.anything());
  expect(jest.mocked(showMessage).mock.calls.length).toBe(asked);
  // The file's context menu offers the picks and Mark Resolved too.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "mark-resolved" });
  await act(async () => { unstagedList().findAllByType(SidebarItem).find(item => item.props.id === "y.txt")!.props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(menuLabels()).toEqual(["Use “main”", "Use “feature”", "Use Both", "Mark Resolved", "-", "Show File History"]);
  expect(git.stageFile).toHaveBeenLastCalledWith("y.txt", expect.anything());

  // With no conflicts left Continue is enabled; it continues the merge, the bar goes away and the unedited message clears.
  git.status.mockResolvedValue({ branch, entries: [{ kind: "ordinary", path: "x.txt", indexStatus: "M", worktreeStatus: "." }] });
  git.operationState.mockResolvedValue({ ...merging, conflicts: 0 });
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(renderer.root.findByType(StateBar).findAllByType(Button)[1]!.props.disabled).toBe(false);
  // An edited message is the merge commit's (a commit while MERGE_HEAD exists); here a hook refused it, so the merge goes on.
  git.commit.mockRejectedValueOnce(new Error("hook said no"));
  await act(async () => { inputs()[0]!.props.onChangeText("Merge feature for the release"); });
  await act(async () => { renderer.root.findByType(StateBar).findAllByType(Button)[1]!.props.onPress(); });
  expect(git.commit).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Merge feature for the release\n" }), expect.anything());
  expect(git.continueOperation).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(StateBar).map(node => node.props.text)).toEqual(["Merging “feature” into “main”", "hook said no"]);
  // Unedited, Continue continues the merge with Git's message.
  await act(async () => { inputs()[0]!.props.onChangeText("Merge branch 'feature'"); });
  git.continueOperation.mockImplementationOnce(async () => { git.operationState.mockResolvedValue(null); git.status.mockResolvedValue({ branch, entries: [] }); });
  await act(async () => { renderer.root.findAllByType(StateBar)[0]!.findAllByType(Button)[1]!.props.onPress(); });
  expect(git.continueOperation).toHaveBeenCalledWith("merge", expect.anything());
  expect(renderer.root.findAllByType(StateBar)).toHaveLength(0);
  expect(inputs().map(input => input.props.value)).toEqual(["", ""]);

  // A branch merged already gets Git's "Already up to date." and no merge; a fast-forward says so; Git's refusal is shown.
  git.mergeKind.mockResolvedValueOnce("up-to-date");
  const merges = git.merge.mock.calls.length;
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/heads/feature" }); });
  await act(async () => { lastMenu().onAction({ itemId: "merge-ref" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "info", title: "Already up to date.", message: "“main” already has every commit of “feature”." }));
  expect(git.merge.mock.calls.length).toBe(merges);
  git.mergeKind.mockResolvedValueOnce("fast-forward");
  git.merge.mockRejectedValueOnce(new Error("error: Your local changes to the following files would be overwritten by merge:\n\ta.txt\nPlease commit your changes or stash them before you merge.\nAborting"));
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "merge" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "merge-ref" });
  // Remotes starts collapsed in the SourceTree preset.
  await act(async () => { row("group:remotes").findByType(Button).props.onPress(); });
  await act(async () => { row("ref:refs/remotes/origin/fix").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(menuLabels()).toEqual(["Check Out", "New Branch from “origin/fix”…", "-", "Merge “origin/fix” into “main”…", "Rebase “main” onto “origin/fix”…", "Rebase “main” Interactively onto “origin/fix”…", "-", "Copy Name"]);
  expect(jest.mocked(showMessage).mock.calls.at(-2)![0]).toMatchObject({ title: "Merge “origin/fix” into “main”?", message: expect.stringContaining("Git fast-forwards “main” to “origin/fix”") });
  expect(git.merge).toHaveBeenLastCalledWith("refs/remotes/origin/fix", expect.anything());
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Merge “origin/fix” into “main”", message: expect.stringMatching(/^Your local changes .*overwritten by merge:[\s\S]*Please commit your changes or stash them before you merge\.\nAborting$/) }));

  // From the menu bar without a branch selected, it asks for the name; Cancel merges nothing.
  await act(async () => { sidebar().props.onSelectionChange({ id: "changes" }); });
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: true });
  await act(async () => { lastMenu().onAction({ itemId: "merge-ref" }); });
  expect(showPrompt).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Merge into “main”" }));
  jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: "feature" });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { lastMenu().onAction({ itemId: "merge-ref" }); });
  expect(git.mergeKind).toHaveBeenLastCalledWith("refs/heads/feature", expect.anything());
  expect(git.merge.mock.calls.length).toBe(merges + 1);
  await act(async () => { renderer.unmount(); });
});

it("rebases the current branch after a sheet, shows a stopped rebase with its step and the branch kept, and cherry-picks and reverts commits", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40), side = "c".repeat(40), merged = "d".repeat(40);
  const commits = [
    { oid: merged, parents: [head, side], authorName: "Ada", authorEmail: "ada@example.test", time: 3, summary: "Merge feature", lane: 0, color: 0, edges: [] },
    { oid: side, parents: [head], authorName: "Ada", authorEmail: "ada@example.test", time: 2, summary: "Fix the title", lane: 0, color: 0, edges: [] },
  ];
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: offset ? [] : commits, done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "topic", upstream: null, ahead: 0, behind: 0 };
  const refs = {
    branches: [{ name: "main", ref: "refs/heads/main", oid: side, current: false, upstream: null, time: 2 }, { name: "topic", ref: "refs/heads/topic", oid: head, current: true, upstream: null, time: 1 }],
    remotes: [], tags: [],
  };
  const rebasing = { kind: "rebase", branch: "topic", target: "main", commit: null, step: { current: 1, total: 3 }, conflicts: 1, mergeHead: false };
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async (): Promise<unknown> => ({ branch, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async (): Promise<unknown> => null),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "topic"),
    listRefs: jest.fn(async () => refs), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""),
    rebasePlan: jest.fn(async () => ({ branch: "topic", commits: 3, behind: 2, pushed: true })), rebase: jest.fn(async () => "rebased"),
    cherryPick: jest.fn(async () => "committed"), revert: jest.fn(async () => "committed"), mergeMessage: jest.fn(async () => "Fix the title\n\n(cherry picked from commit cccc)"),
    continueOperation: jest.fn(async () => {}), commit: jest.fn(async () => {}), commitDetails: jest.fn(() => new Promise(() => {})),
    conflictRegions: jest.fn(async (): Promise<unknown> => null), conflictFile: jest.fn(async () => ({ ours: true, theirs: true, binary: false, edited: false })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
  const row = (id: string) => sidebar().findAllByType(SidebarItem).find(item => item.props.id === id)!;
  const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
  const inputs = () => renderer.root.findAllByType(TextInput);
  const menuLabels = () => jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-");
  const toolbarBranch = () => (jest.mocked(setWindowOptions).mock.calls.at(-1)![1].macos!.toolbar!.items! as any[]).find(entry => entry.id === "branch").label;

  // The sheet names both branches and the commits that move, and warns (Cancel first) that pushed ones are rewritten.
  expect(menuItem("rebase-ref")).toMatchObject({ label: "Rebase Current Branch onto…", disabled: false });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "rebase-ref" });
  await act(async () => { row("ref:refs/heads/main").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(menuLabels()).toContain("Rebase “topic” onto “main”…");
  expect(git.rebasePlan).toHaveBeenCalledWith("refs/heads/main", expect.anything());
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Rebase “topic” onto “main”?", buttons: [{ id: "rebase", label: "Rebase" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "cancel",
    message: expect.stringMatching(/^Git replays 3 commits of “topic” on top of “main”, rewriting them as new commits\.[\s\S]*already pushed to the upstream branch/) }));
  expect(git.rebase).not.toHaveBeenCalled();

  // Rebase runs it; it stops with a conflict: Changes shows the bar with the step, the branch keeps its label, nothing fills the composer.
  git.rebasePlan.mockResolvedValue({ branch: "topic", commits: 3, behind: 2, pushed: false });
  git.rebase.mockImplementationOnce(async () => {
    git.status.mockResolvedValue({ branch: { ...branch, head: "(detached)" }, entries: [{ kind: "unmerged", path: "a.txt", indexStatus: "U", worktreeStatus: "U" }] });
    git.operationState.mockResolvedValue(rebasing);
    return "stopped";
  });
  await act(async () => { sidebar().props.onSelectionChange({ id: "history" }); });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "rebase" });
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "rebase-ref" });
  await act(async () => { row("ref:refs/heads/main").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "info", defaultButtonId: "rebase", message: expect.not.stringContaining("pushed") }));
  expect(git.rebase).toHaveBeenCalledWith("refs/heads/main", expect.objectContaining({ branch: "topic" }));
  expect(sidebar().props.selectedId).toBe("changes");
  expect(renderer.root.findByType(StateBar).props.text).toBe("Rebasing “topic” onto “main”, commit 1 of 3 — 1 conflicted file");
  expect(menuItem("continue-operation")).toMatchObject({ label: "Continue Rebase", disabled: true });
  expect(toolbarBranch()).toBe("topic");
  expect(inputs()[0]!.props.value).toBe("");
  // The conflict's header names the sides by branch: during a rebase, ours is the branch rebased onto.
  await act(async () => { filesList(renderer, "Unstaged").props.onSelectionChange({ id: "a.txt" }); });
  expect(renderer.root.findByType(DiffPane).findAllByType(Button).map(node => node.props.children)).toEqual(["Use “main”", "Use “topic”", "Use Both", "Mark Resolved"]);
  // Resolved, Continue runs `git rebase --continue`.
  git.status.mockResolvedValue({ branch: { ...branch, head: "(detached)" }, entries: [{ kind: "ordinary", path: "a.txt", indexStatus: "M", worktreeStatus: "." }] });
  git.operationState.mockResolvedValue({ ...rebasing, conflicts: 0 });
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  git.continueOperation.mockImplementationOnce(async () => { git.operationState.mockResolvedValue(null); git.status.mockResolvedValue({ branch, entries: [] }); });
  await act(async () => { lastMenu().onAction({ itemId: "continue-operation" }); });
  expect(git.continueOperation).toHaveBeenCalledWith("rebase", expect.anything());
  expect(git.commit).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(StateBar)).toHaveLength(0);
  // Up to date: no sheet, no rebase.
  git.rebasePlan.mockResolvedValueOnce({ branch: "topic", commits: 1, behind: 0, pushed: false });
  await act(async () => { sidebar().props.onSelectionChange({ id: "ref:refs/heads/main" }); });
  await act(async () => { lastMenu().onAction({ itemId: "rebase-ref" }); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Already up to date.", message: "“topic” already has every commit of “main”." }));
  expect(git.rebase).toHaveBeenCalledTimes(1);

  // A History row's menu cherry-picks a commit at once and History re-reads.
  await act(async () => { sidebar().props.onSelectionChange({ id: "history" }); });
  const reads = git.revParse.mock.calls.length;
  const openRowMenu = async (oid: string, itemId: string) => {
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId } as never);
    let commitRow!: ReactTestRenderer;
    await act(async () => { commitRow = create(renderer.root.findByType("LegendList" as any).props.renderItem({ item: commits.find(entry => entry.oid === oid) })); });
    await act(async () => { commitRow.root.findByProps({ accessibilityRole: "button" }).props.onTouchEnd({ nativeEvent: { button: 2, pageX: 1, pageY: 2 } }); });
  };
  await openRowMenu(side, "cherry-pick-commit");
  expect(menuLabels()).toEqual(expect.arrayContaining(["Cherry-Pick Commit", "Revert Commit…"]));
  expect(git.cherryPick).toHaveBeenCalledWith(side, expect.objectContaining({ branch: "topic" }));
  expect(git.revParse.mock.calls.length).toBeGreaterThan(reads);
  // A pick the branch has already says so.
  git.cherryPick.mockResolvedValueOnce("empty");
  await openRowMenu(side, "cherry-pick-commit");
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "info", title: "Nothing to Cherry-Pick", message: "“topic” already has the changes of “Fix the title”, so no commit was made." }));
  // Revert asks first; Cancel reverts nothing, Revert runs it.
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await openRowMenu(side, "revert-commit");
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Revert “Fix the title”?", buttons: [{ id: "revert", label: "Revert" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "revert" }));
  expect(git.revert).not.toHaveBeenCalled();
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "revert" });
  await openRowMenu(side, "revert-commit");
  expect(git.revert).toHaveBeenCalledWith(side, expect.objectContaining({ branch: "topic" }));
  // A merge commit is refused with git-core's message.
  git.cherryPick.mockRejectedValueOnce(new Error("Cherry-picking a merge commit isn’t supported yet."));
  await openRowMenu(merged, "cherry-pick-commit");
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Couldn’t Cherry-Pick “Merge feature”", message: "Cherry-picking a merge commit isn’t supported yet." }));

  // A conflicting pick stops: Changes shows the bar and Git's prepared message; an edited message commits the pick.
  git.cherryPick.mockImplementationOnce(async () => {
    git.status.mockResolvedValue({ branch, entries: [{ kind: "ordinary", path: "a.txt", indexStatus: "M", worktreeStatus: "." }] });
    git.operationState.mockResolvedValue({ kind: "cherry-pick", branch: "topic", target: null, commit: { oid: "ccccccc", subject: "Fix the title" }, step: null, conflicts: 0, mergeHead: false });
    return "stopped";
  });
  await openRowMenu(side, "cherry-pick-commit");
  expect(sidebar().props.selectedId).toBe("changes");
  expect(renderer.root.findByType(StateBar).props.text).toBe("Cherry-picking “Fix the title” (ccccccc) onto “topic”");
  expect(inputs().map(input => input.props.value)).toEqual(["Fix the title", "(cherry picked from commit cccc)"]);
  await act(async () => { inputs()[0]!.props.onChangeText("Fix the title on topic"); });
  await act(async () => { lastMenu().onAction({ itemId: "continue-operation" }); });
  expect(git.commit).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Fix the title on topic\n\n(cherry picked from commit cccc)\n" }), expect.anything());
  await act(async () => { renderer.unmount(); });
});

describe("pull requests", () => {
  const keychain = new Map<string, string>();
  beforeAll(() => {
    const storage = jest.requireMock("@legendapp/spark/secure-storage") as Record<string, jest.Mock>;
    storage.getItemAsync!.mockImplementation(async (key: string) => keychain.get(key) ?? null);
    storage.setItemAsync!.mockImplementation(async (key: string, value: string) => { keychain.set(key, value); });
    storage.deleteItemAsync!.mockImplementation(async (key: string) => { keychain.delete(key); });
  });

  it("offers Sign In for a GitHub remote, lists open PRs after a pasted token, shows a PR's header, files and diff, reports a 401 with Sign In…, and clears on Sign Out", async () => {
    jest.clearAllMocks();
    jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
    jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
    const git = {
      resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
      status: jest.fn(async () => ({ branch: { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
      remoteUrl: jest.fn(async (name: string) => name === "origin" ? "git@github.com:me/app.git" : null), configValue: jest.fn(async () => null),
    };
    jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
    const token = "github_pat_PASTED";
    let pullsStatus = 200;
    const fetch = jest.fn(async (url: string, init: { headers: Record<string, string> }) => {
      const reply = (status: number, body: unknown) => ({ status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
      if (init.headers.Authorization !== `Bearer ${token}`) return reply(401, { message: "Bad credentials" });
      if (url.endsWith("/user")) return reply(200, { login: "ana" });
      if (url.includes("/pulls/4/reviews")) return reply(200, []);
      if (url.includes("/pulls/4/files")) return reply(200, [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }]);
      if (url.includes("/pulls?")) return reply(pullsStatus, pullsStatus === 200 ? [{ number: 4, title: "Fix the thing", user: { login: "bo" }, state: "open", draft: false, base: { ref: "main" }, head: { ref: "fix", label: "me:fix", repo: { full_name: "me/app" } }, html_url: "" }] : { message: "Bad credentials" });
      throw new Error(`unexpected ${url}`);
    });
    (globalThis as { fetch?: unknown }).fetch = fetch;
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    await act(async () => { openRepository(); });
    const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
    const ids = () => sidebar().findAllByType(SidebarItem).map(item => item.props.id);
    const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
    expect(ids().slice(-2)).toEqual(["group:pullRequests", "github-sign-in"]);
    expect(menuItem("sign-out-github")).toMatchObject({ disabled: true });
    expect(fetch).not.toHaveBeenCalled();

    // gh isn't signed in, so the sheet asks for a token in a secure field.
    jest.mocked(runCommand).mockResolvedValueOnce({ exit: { type: "exited", code: 1 }, stdout: new Uint8Array(), stderr: new Uint8Array(), timedOut: false, aborted: false, outputTruncated: false });
    jest.mocked(showPrompt).mockResolvedValueOnce({ canceled: false, value: ` ${token} ` });
    await act(async () => { sidebar().props.onSelectionChange({ id: "github-sign-in" }); });
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ target: { type: "command", name: "gh" }, args: ["auth", "token", "--hostname", "github.com"] }));
    expect(showPrompt).toHaveBeenCalledWith(expect.objectContaining({ title: "Sign In to GitHub", secure: true }));
    expect(keychain.get("github.com.token")).toBe(token);
    expect(ids().slice(-2)).toEqual(["group:pullRequests", "pr:4"]);
    expect(menuItem("sign-out-github")).toMatchObject({ label: "Sign Out of GitHub (ana)", disabled: false });

    await act(async () => { sidebar().props.onSelectionChange({ id: "pr:4" }); });
    const text = () => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join("")).join("\n");
    expect(text()).toContain("Fix the thing");
    expect(text()).toContain("#4 · bo · main ← fix · Open");
    expect(text()).toContain("+1 −1");
    expect(renderer.root.findByType(DiffPane).props.patch).toMatchObject({ path: "src/a.ts", text: expect.stringContaining("--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@") });

    // A refresh that GitHub refuses keeps the list and shows its message in the red bar with Sign In….
    pullsStatus = 401;
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    const bar = renderer.root.findAllByType(StateBar).find(entry => entry.props.tone === "error")!;
    expect(bar.props.text).toBe("GitHub didn’t accept the token: Bad credentials.");
    expect(bar.findAllByType(Button).map(button => button.props.children)).toEqual(["Sign In…"]);
    expect(ids()).toContain("pr:4");
    expect(JSON.stringify(renderer.toJSON())).not.toContain(token);

    // A window opened after sign-in (a worktree window here) lists the PRs too.
    pullsStatus = 200;
    let second!: ReactTestRenderer;
    await act(async () => { second = create(<App windowId="second" initialPath="/repo" repoName="app" />); });
    expect(second.root.findAllByType(Sidebar)[0]!.findAllByType(SidebarItem).map(item => item.props.id)).toContain("pr:4");
    await act(async () => { second.unmount(); });

    // Sign Out deletes the token and clears the list; the selected PR gives way to Changes.
    await act(async () => { lastMenu().onAction({ itemId: "sign-out-github" }); });
    expect(keychain.has("github.com.token")).toBe(false);
    expect(ids().slice(-2)).toEqual(["group:pullRequests", "github-sign-in"]);
    expect(sidebar().props.selectedId).toBe("changes");
    expect(renderer.root.findAllByType(StateBar)).toHaveLength(0);
    await act(async () => { renderer.unmount(); });
  });

  it("shows a PR's review threads on its diff and in the files list, posts a line comment and a reply on the head commit, and offers Sign In… for a 401", async () => {
    jest.clearAllMocks();
    jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
    jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
    jest.mocked(getGitService).mockReturnValue({
      resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
      status: jest.fn(async () => ({ branch: { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
      remoteUrl: jest.fn(async (name: string) => name === "origin" ? "git@github.com:me/app.git" : null), configValue: jest.fn(async () => null),
    } as unknown as GitService);
    const comment = (id: number, body: string) => ({ id: `C${id}`, databaseId: id, author: { login: "bo" }, body, createdAt: "2026-11-17T10:00:00Z" });
    const threads = [
      { id: "T1", path: "src/a.ts", line: 1, originalLine: 1, startLine: null, diffSide: "RIGHT", startDiffSide: null, isResolved: false, isOutdated: false, comments: { nodes: [comment(11, "Why b?")], pageInfo: { hasNextPage: false, endCursor: null } } },
      { id: "T2", path: "src/a.ts", line: 1, originalLine: 1, startLine: null, diffSide: "LEFT", startDiffSide: null, isResolved: true, isOutdated: false, comments: { nodes: [comment(12, "Done")], pageInfo: { hasNextPage: false, endCursor: null } } },
      { id: "T3", path: "src/a.ts", line: null, originalLine: 9, startLine: null, diffSide: "RIGHT", startDiffSide: null, isResolved: false, isOutdated: true, comments: { nodes: [comment(13, "Old")], pageInfo: { hasNextPage: false, endCursor: null } } },
    ];
    let postStatus = 201;
    let pullsFail = false;
    const posts: { url: string; body: unknown }[] = [];
    const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
      const reply = (status: number, body: unknown) => ({ status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
      if (url.endsWith("/user")) return reply(200, { login: "ana" });
      if (url.endsWith("/graphql") && postStatus === 401) return reply(401, { message: "Bad credentials" });
      if (url.endsWith("/graphql")) return reply(200, { data: { repository: { pullRequest: { headRefOid: "head4-pushed", reviewThreads: { nodes: threads, pageInfo: { hasNextPage: false, endCursor: null } } } } } });
      if (init.method === "POST") { posts.push({ url, body: JSON.parse(init.body!) }); return reply(postStatus, postStatus === 201 ? {} : { message: "Bad credentials" }); }
      if (url.includes("/pulls/4/reviews")) return reply(200, []);
      if (url.includes("/pulls/4/files")) return reply(200, [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }, { filename: "src/b.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1,2 @@\n a\n+b" }]);
      if (url.includes("/pulls?") && pullsFail) return reply(401, { message: "Bad credentials" });
      if (url.includes("/pulls?")) return reply(200, [{ number: 4, title: "Fix the thing", user: { login: "bo" }, state: "open", draft: false, base: { ref: "main" }, head: { ref: "fix", sha: "head4", label: "me:fix", repo: { full_name: "me/app" } }, html_url: "" }]);
      throw new Error(`unexpected ${url}`);
    });
    (globalThis as { fetch?: unknown }).fetch = fetch;
    await gitHubAccount.signIn("tok");
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    await act(async () => { openRepository(); });
    await act(async () => { renderer.root.findAllByType(Sidebar)[0]!.props.onSelectionChange({ id: "pr:4" }); });
    const text = () => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join("")).join("\n");
    expect(text()).toContain("3 comments");
    const pane = () => renderer.root.findByType(DiffPane);
    // The open thread sits under new line 1, the resolved one under old line 1; the outdated one is listed above the diff.
    expect([...pane().props.annotations.keys()]).toEqual(["R:1", "L:1"]);
    // Elements, not renders: the header and each row's annotation hold ReviewThreadView elements.
    const children = (node: { props: { children: unknown } }) => [node.props.children].flat() as { type: unknown; props: { thread: { id: string; resolved: boolean }; onReply: (thread: unknown) => void } }[];
    expect(children(pane().props.header).map(view => [view.type === ReviewThreadView, view.props.thread.id])).toEqual([[true, "T3"]]);
    const views = (key: string) => children(pane().props.annotations.get(key));
    expect(views("L:1").map(view => [view.props.thread.id, view.props.thread.resolved])).toEqual([["T2", true]]);
    let collapsed!: ReactTestRenderer;
    await act(async () => { collapsed = create(<ReviewThreadView thread={views("L:1")[0]!.props.thread as never} disabled={false} onReply={() => {}} />); });
    expect(collapsed.root.findAllByType(Text).map(node => [node.props.children].flat().join("")).join(" ")).toContain("Resolved  bo: Done");
    expect(JSON.stringify(collapsed.toJSON())).not.toContain("Reply…");

    // Add Comment… needs a selected line; it posts on the PR's head commit.
    const addButton = () => pane().props.accessory as { props: { disabled: boolean; onPress: () => void } };
    expect(addButton().props.disabled).toBe(true);
    await act(async () => { pane().props.onRangeChange({ start: { side: "old", line: 1, path: "src/a.ts" }, end: { side: "new", line: 1, path: "src/a.ts" } }); });
    await act(async () => { addButton().props.onPress(); });
    const sheet = () => renderer.root.findByType(CommentSheet);
    expect(sheet().props).toMatchObject({ title: "Add Comment", context: "Lines 1 (old)–1 of “src/a.ts”" });
    await act(async () => { sheet().props.onSubmit("Looks off"); });
    expect(posts.at(-1)).toEqual({ url: "https://api.github.com/repos/me/app/pulls/4/comments", body: { body: "Looks off", commit_id: "head4-pushed", path: "src/a.ts", line: 1, side: "RIGHT", start_line: 1, start_side: "LEFT" } });
    expect(renderer.root.findAllByType(CommentSheet)).toHaveLength(0);

    // Reply… on the open thread; a 401 keeps the sheet and offers Sign In….
    postStatus = 401;
    await act(async () => { views("R:1")[0]!.props.onReply(views("R:1")[0]!.props.thread); });
    expect(sheet().props.title).toBe("Reply to bo");
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
    await act(async () => { sheet().props.onSubmit("Fixed"); });
    expect(posts.at(-1)).toEqual({ url: "https://api.github.com/repos/me/app/pulls/4/comments/11/replies", body: { body: "Fixed" } });
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Post the Comment", message: "GitHub didn’t accept the token: Bad credentials.", buttons: [{ id: "sign-in", label: "Sign In…" }, { id: "cancel", label: "Cancel" }] }));
    expect(renderer.root.findAllByType(CommentSheet)).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("tok\"");
    // The thread re-read after the write was refused too: its bar offers Sign In…; a refused list read takes its place rather than doubling it.
    expect(renderer.root.findAllByType(StateBar).map(bar => [bar.props.text, bar.findAllByType(Button).map(button => button.props.children)])).toEqual([["GitHub didn’t accept the token: Bad credentials.", ["Sign In…"]]]);
    pullsFail = true;
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(renderer.root.findAllByType(StateBar).map(bar => bar.props.text)).toEqual(["GitHub didn’t accept the token: Bad credentials."]);
    pullsFail = false;
    await act(async () => { sheet().props.onCancel(); });
    // Choosing another file closes nothing open and shows its own (no) threads.
    await act(async () => { renderer.root.findAllByType(Sidebar)[1]!.props.onSelectionChange({ id: "src/b.ts" }); });
    expect(pane().props.annotations.size).toBe(0);
    await act(async () => { renderer.unmount(); });
    await gitHubAccount.signOut();
  });

  it("shows each reviewer's latest review in the PR header, submits a review from Review…, shows GitHub's 422, and checks a PR out as a branch or in a new worktree", async () => {
    jest.clearAllMocks();
    jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
    jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
    const { GitLocalChangesError } = jest.requireActual("@legend-apps/git-core");
    const branch = (name: string, current = false) => ({ name, ref: `refs/heads/${name}`, oid: "abc", current, upstream: null, time: 1 });
    let branches = [branch("main", true)];
    let worktrees: unknown[] = [{ path: "/src/app", head: "abc", branch: "main", detached: false, bare: false, locked: null, prunable: null, main: true }];
    const git = {
      resolveRoot: jest.fn(async () => "/src/app"), watchLocations: jest.fn(async () => ({ root: "/src/app", gitDir: "/src/app/.git", commonDir: "/src/app/.git", ignoredPaths: [] })),
      status: jest.fn(async () => ({ branch: { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
      remoteUrl: jest.fn(async (name: string) => name === "origin" ? "git@github.com:me/app.git" : null), configValue: jest.fn(async () => null),
      listRefs: jest.fn(async () => ({ branches, remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => worktrees),
      worktreeChangeCount: jest.fn(async () => 0), worktreeStatus: jest.fn(async () => ({ branch: { oid: "abc", head: "fix", upstream: null, ahead: 0, behind: 0 }, entries: [] })),
      fetchPullRequest: jest.fn(async (_remote: string, _number: number, name: string) => { if (!branches.some(entry => entry.name === name)) branches = [...branches, branch(name)]; return "def"; }),
      checkoutBranch: jest.fn(async () => {}), stashAndSwitch: jest.fn(async (name: string) => ({ branch: name, stash: "s1" })),
      addWorktree: jest.fn(async (path: string) => { worktrees = [...worktrees, { path, head: "def", branch: "fix", detached: false, bare: false, locked: null, prunable: null, main: false }]; return path; }),
    };
    jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
    const posts: unknown[] = [];
    let reviews = [{ id: 1, user: { login: "bo" }, state: "CHANGES_REQUESTED" }, { id: 2, user: { login: "cy" }, state: "COMMENTED" }, { id: 3, user: { login: "bo" }, state: "APPROVED" }];
    const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
      const reply = (status: number, body: unknown) => ({ status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
      if (url.endsWith("/user")) return reply(200, { login: "ana" });
      if (url.endsWith("/graphql")) return reply(200, { data: { repository: { pullRequest: { headRefOid: "head4-pushed", reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
      if (init.method === "POST") {
        const body = JSON.parse(init.body!) as { event: string; body?: string };
        posts.push({ url, body });
        // ana's own pull request: GitHub refuses approving it.
        if (body.event === "APPROVE") return reply(422, { message: "Unprocessable Entity", errors: ["Review Can not approve your own pull request"] });
        reviews = [...reviews, { id: 4, user: { login: "ana" }, state: "COMMENTED" }];
        return reply(200, {});
      }
      if (url.includes("/pulls/4/reviews")) return reply(200, reviews);
      if (url.includes("/pulls/4/files")) return reply(200, [{ filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }]);
      if (url.includes("/pulls?")) return reply(200, [
        { number: 4, title: "Fix the thing", user: { login: "ana" }, state: "open", draft: false, base: { ref: "main" }, head: { ref: "fix", sha: "head4", label: "me:fix", repo: { full_name: "me/app" } }, html_url: "" },
        { number: 5, title: "Gutter", user: { login: "bo" }, state: "open", draft: false, base: { ref: "main" }, head: { ref: "gutter", sha: "head5", label: "bo:gutter", repo: { full_name: "bo/app" } }, html_url: "" },
      ]);
      throw new Error(`unexpected ${url}`);
    });
    (globalThis as { fetch?: unknown }).fetch = fetch;
    await gitHubAccount.signIn("tok");
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/src/app"] });
    await act(async () => { openRepository(); });
    const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
    const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
    const text = () => renderer.root.findAllByType(Text).map(node => [node.props.children].flat().join("")).join("\n");
    expect(lastMenu().items.find(entry => entry.id === "pull-request").items.map((entry: { id?: string }) => entry.id)).toEqual(["review-pull-request", undefined, "checkout-pull-request", "pull-request-worktree"]);
    expect(menuItem("review-pull-request")).toMatchObject({ label: "Review…", disabled: true });

    await act(async () => { sidebar().props.onSelectionChange({ id: "pr:4" }); });
    expect(text()).toContain("bo approved · cy commented");
    expect(menuItem("review-pull-request")).toMatchObject({ disabled: false });
    const reviewButton = renderer.root.findAllByType(Button).find(node => node.props.children === "Review…")!;
    await act(async () => { reviewButton.props.onPress(); });
    const sheet = () => renderer.root.findByType(CommentSheet);
    expect(sheet().props).toMatchObject({ title: "Review Pull Request", context: "#4 Fix the thing", review: true });
    const segmented = sheet().findByType("SegmentedControl" as never) as unknown as { props: { options: { label: string }[]; value: string } };
    expect(segmented.props.options.map(option => option.label)).toEqual(["Comment", "Approve", "Request Changes"]);

    // Approving your own pull request: GitHub's message, and the sheet stays.
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "ok" });
    await act(async () => { sheet().props.onSubmit("", "APPROVE"); });
    expect(posts.at(-1)).toEqual({ url: "https://api.github.com/repos/me/app/pulls/4/reviews", body: { commit_id: "head4-pushed", event: "APPROVE" } });
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Submit the Review", message: "GitHub answered 422: Unprocessable Entity: Review Can not approve your own pull request." }));
    expect(renderer.root.findAllByType(CommentSheet)).toHaveLength(1);
    // Choosing another file keeps the review sheet open.
    await act(async () => { pullsFiles().props.onSelectionChange({ id: "src/a.ts" }); });
    expect(renderer.root.findAllByType(CommentSheet)).toHaveLength(1);
    await act(async () => { sheet().props.onSubmit("Looks good", "COMMENT"); });
    expect(posts.at(-1)).toEqual({ url: "https://api.github.com/repos/me/app/pulls/4/reviews", body: { commit_id: "head4-pushed", event: "COMMENT", body: "Looks good" } });
    expect(renderer.root.findAllByType(CommentSheet)).toHaveLength(0);
    expect(text()).toContain("bo approved · cy commented · ana commented");

    // Check Out as Branch from a fork PR's context menu: fetched into "bo/gutter", then checked out; changes in the way offer Stash and Switch.
    git.checkoutBranch.mockRejectedValueOnce(new GitLocalChangesError("bo/gutter", "error: Your local changes would be overwritten by checkout"));
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "stash" });
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "checkout-pull-request" } as never);
    const row = (id: string) => sidebar().findAllByType(SidebarItem).find(item => item.props.id === id)!;
    await act(async () => { row("pr:5").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: object) => (entry as { id?: string }).id)).toEqual(["checkout-pull-request", "pull-request-worktree"]);
    expect(git.fetchPullRequest).toHaveBeenLastCalledWith("origin", 5, "bo/gutter", expect.anything());
    expect(git.checkoutBranch).toHaveBeenLastCalledWith("bo/gutter", expect.anything());
    expect(git.stashAndSwitch).toHaveBeenLastCalledWith("bo/gutter", expect.anything());
    expect(sidebar().props.selectedId).toBe("ref:refs/heads/bo/gutter");
    expect(sidebar().findAllByType(SidebarItem).map(item => item.props.id)).toContain("ref:refs/heads/bo/gutter");

    // Open in New Worktree… for a same-repository PR: branch "fix", a folder next to the repository, its own window.
    await act(async () => { sidebar().props.onSelectionChange({ id: "pr:4" }); });
    await act(async () => { lastMenu().onAction({ itemId: "pull-request-worktree" }); });
    expect(git.fetchPullRequest).toHaveBeenLastCalledWith("origin", 4, "fix", expect.anything());
    expect(git.addWorktree).toHaveBeenLastCalledWith("/src/app-fix", expect.objectContaining({ branch: "fix" }));
    expect(openWorktreeWindow).toHaveBeenLastCalledWith("/src/app-fix", "app", "app — fix");
    expect(sidebar().props.selectedId).toBe("worktree:/src/app-fix");
    // Again: the worktree that has the branch is opened, nothing is fetched.
    await act(async () => { sidebar().props.onSelectionChange({ id: "pr:4" }); });
    await act(async () => { lastMenu().onAction({ itemId: "pull-request-worktree" }); });
    expect(git.fetchPullRequest).toHaveBeenCalledTimes(2);
    expect(openWorktreeWindow).toHaveBeenCalledTimes(2);

    // Git's refusal (a diverged branch) is shown as Git says it.
    git.fetchPullRequest.mockRejectedValueOnce(new Error(" ! [rejected]        refs/pull/5/head -> bo/gutter  (non-fast-forward)"));
    await act(async () => { sidebar().props.onSelectionChange({ id: "pr:5" }); });
    await act(async () => { lastMenu().onAction({ itemId: "checkout-pull-request" }); });
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Fetch Pull Request #5", message: "! [rejected]        refs/pull/5/head -> bo/gutter  (non-fast-forward)" }));
    expect(JSON.stringify(renderer.toJSON())).not.toContain("tok\"");
    await act(async () => { renderer.unmount(); });
    await gitHubAccount.signOut();

    function pullsFiles() { return renderer.root.findAllByType(Sidebar)[1]!; }
  });
  it("creates a pull request for the current branch after publishing it, selects it, shows GitHub's 422, opens it on GitHub, and marks and deletes a merged branch", async () => {
    jest.clearAllMocks();
    jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
    jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
    const { GitBranchNotMergedError } = jest.requireActual("@legend-apps/git-core");
    const branch = (name: string, oid: string, current = false, upstream: string | null = null) => ({ name, ref: `refs/heads/${name}`, oid, current, upstream, time: 1, ahead: 0, behind: 0, gone: false });
    let branches = [branch("main", "m1", false, "origin/main"), branch("feature", "f1", true), branch("squashed", "s1", false, "origin/squashed"), branch("wip", "w1")];
    const remoteBranch = (remote: string, name: string) => ({ name: `${remote}/${name}`, ref: `refs/remotes/${remote}/${name}`, oid: "x", remote, branch: name });
    const git = {
      resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
      status: jest.fn(async () => ({ branch: { oid: "f1", head: "feature", upstream: null, ahead: 0, behind: 0 }, entries: [] })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => null),
      remoteUrl: jest.fn(async (name: string) => ({ origin: "git@github.com:me/app.git", upstream: "https://github.com/LegendApp/app.git" } as Record<string, string>)[name] ?? null), configValue: jest.fn(async () => null),
      listRefs: jest.fn(async () => ({ branches, remotes: [{ name: "origin", branches: [remoteBranch("origin", "main")] }, { name: "upstream", branches: [remoteBranch("upstream", "develop"), remoteBranch("upstream", "main")] }], tags: [], defaultBranch: "refs/remotes/origin/main" })),
      listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => [{ path: "/repo", head: "f1", branch: "feature", detached: false, bare: false, locked: null, prunable: null, main: true }]),
      branchesAhead: jest.fn(async () => ({})), mergeBase: jest.fn(async () => "other"),
      logRange: jest.fn(async () => ({ commits: [{ summary: "Add the feature" }], done: true })),
      publishRemote: jest.fn(async () => "origin"),
      pushBranch: jest.fn(async (name: string) => { branches = branches.map(entry => entry.name === name ? { ...entry, upstream: `origin/${name}` } : entry); }),
      deleteBranch: jest.fn(async (name: string, options: { force?: boolean }) => {
        if ((name === "wip" || name === "squashed") && !options.force) throw new GitBranchNotMergedError(name, `error: the branch '${name}' is not fully merged`);
        branches = branches.filter(entry => entry.name !== name);
      }),
    };
    jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
    let created = false;
    const posts: unknown[] = [];
    const pull = (number: number, head: string) => ({ number, title: "Add the feature", user: { login: "me" }, state: "open", draft: true, base: { ref: "develop" }, head: { ref: head, sha: "f1", label: `me:${head}`, repo: { full_name: "me/app" } }, html_url: `https://github.com/LegendApp/app/pull/${number}` });
    const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
      const reply = (status: number, body: unknown) => ({ status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
      if (url.endsWith("/user")) return reply(200, { login: "me" });
      if (url.endsWith("/graphql")) {
        const { query } = JSON.parse(init.body!) as { query: string };
        if (query.includes("states: MERGED")) return reply(200, { data: { repository: { pullRequests: { nodes: [{ number: 3, headRefName: "squashed", headRefOid: "s1", headRepositoryOwner: { login: "me" } }], pageInfo: { hasNextPage: false, endCursor: null } } } } });
        return reply(200, { data: { repository: { pullRequest: { headRefOid: "f1", reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
      }
      if (init.method === "POST") {
        posts.push({ url, body: JSON.parse(init.body!) });
        if (created) return reply(422, { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: "A pull request already exists for me:feature." }] });
        created = true;
        return reply(201, pull(12, "feature"));
      }
      if (url.includes("/pulls/12/")) return reply(200, []);
      if (url.includes("/pulls?")) return reply(200, created ? [pull(12, "feature")] : []);
      throw new Error(`unexpected ${url}`);
    });
    (globalThis as { fetch?: unknown }).fetch = fetch;
    await gitHubAccount.signIn("tok");
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<App />); });
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    await act(async () => { openRepository(); });
    const sidebar = () => renderer.root.findAllByType(Sidebar)[0]!;
    const menuItem = (id: string) => lastMenu().items.flatMap(entry => entry.items ?? []).find(entry => entry.id === id);
    const row = (id: string) => sidebar().findAllByType(SidebarItem).find(item => item.props.id === id)!;
    const rowText = (id: string) => row(id).findAllByType(Text).map(node => [node.props.children].flat().join("")).join(" ");

    // One query for merged PRs: "squashed" (its tip is the PR's head) says so; "wip" doesn't.
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/graphql"))).toHaveLength(1);
    expect(rowText("ref:refs/heads/squashed")).toBe("squashed Merged #3");
    expect(rowText("ref:refs/heads/wip")).toBe("wip");

    // ⌘⇧R; the base is upstream's (the PR repository's) default, the title the branch's only commit.
    expect(menuItem("create-pull-request")).toMatchObject({ label: "Create Pull Request…", shortcut: "Cmd+Shift+r", disabled: false });
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: true } as never);
    await act(async () => { row("ref:refs/heads/feature").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: object) => (entry as { id?: string }).id)).toContain("create-pull-request");
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: true } as never);
    await act(async () => { row("ref:refs/heads/wip").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: object) => (entry as { id?: string }).id)).not.toContain("create-pull-request");
    await act(async () => { lastMenu().onAction({ itemId: "create-pull-request" }); });
    const sheet = () => renderer.root.findByType(CreatePullRequestSheet);
    expect(sheet().props).toMatchObject({ branch: "feature", bases: ["develop", "main"], base: "main", title: "Add the feature" });
    expect(git.logRange).toHaveBeenCalledWith("refs/remotes/upstream/main", "refs/heads/feature", expect.objectContaining({ count: 1 }));

    // No upstream yet: published to origin after the sheet, then opened as a fork branch, selected.
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "publish" });
    await act(async () => { sheet().props.onSubmit({ base: "develop", title: "Add the feature", body: "Why", draft: true }); });
    expect(showMessage).toHaveBeenCalledWith(expect.objectContaining({ title: "Publish “feature” to “origin”?" }));
    expect(git.pushBranch).toHaveBeenCalledWith("feature", expect.objectContaining({ setUpstream: "origin" }));
    expect(posts).toEqual([{ url: "https://api.github.com/repos/LegendApp/app/pulls", body: { head: "me:feature", base: "develop", title: "Add the feature", body: "Why", draft: true } }]);
    expect(renderer.root.findAllByType(CreatePullRequestSheet)).toHaveLength(0);
    expect(sidebar().props.selectedId).toBe("pr:12");

    // Open on GitHub: the header button and ⌃⌘G open the PR's page.
    expect(menuItem("open-github")).toMatchObject({ shortcut: "Ctrl+Cmd+g", disabled: false });
    await act(async () => { renderer.root.findAllByType(Button).find(node => node.props.children === "Open on GitHub")!.props.onPress(); });
    expect(openURL).toHaveBeenLastCalledWith("https://github.com/LegendApp/app/pull/12");

    // Again: published now, nothing to push; GitHub's 422 shows and the sheet keeps its text.
    await act(async () => { lastMenu().onAction({ itemId: "create-pull-request" }); });
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "ok" });
    await act(async () => { sheet().props.onSubmit({ base: "main", title: "Again", body: "", draft: false }); });
    expect(git.pushBranch).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn’t Create the Pull Request", message: "GitHub answered 422: Validation Failed: A pull request already exists for me:feature." }));
    expect(renderer.root.findAllByType(CreatePullRequestSheet)).toHaveLength(1);
    await act(async () => { sheet().props.onCancel(); });

    // A commit made on the merged branch while Delete asks: Git's check applies again.
    jest.mocked(showMessage).mockImplementationOnce(async () => { branches = branches.map(entry => entry.name === "squashed" ? { ...entry, oid: "s2" } : entry); return { buttonId: "confirm" }; }).mockResolvedValueOnce({ buttonId: "cancel" });
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "delete-branch" } as never);
    await act(async () => { row("ref:refs/heads/squashed").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(git.deleteBranch).toHaveBeenLastCalledWith("squashed", expect.objectContaining({ force: false }));
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "“squashed” isn’t fully merged." }));
    expect(rowText("ref:refs/heads/squashed")).toBe("squashed");
    branches = branches.map(entry => entry.name === "squashed" ? { ...entry, oid: "s1" } : entry);
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });

    // Delete asks once for the merged branch and deletes it with force; an unmerged one is asked about twice.
    jest.mocked(showMessage).mockClear();
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" });
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "delete-branch" } as never);
    await act(async () => { row("ref:refs/heads/squashed").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(showMessage).toHaveBeenCalledTimes(1);
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Delete the branch “squashed”?", message: "Its pull request #3 was merged on GitHub." }));
    expect(git.deleteBranch).toHaveBeenLastCalledWith("squashed", expect.objectContaining({ force: true }));
    jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "confirm" }).mockResolvedValueOnce({ buttonId: "cancel" });
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "delete-branch" } as never);
    await act(async () => { row("ref:refs/heads/wip").props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
    expect(showMessage).toHaveBeenCalledTimes(3);
    expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ title: "“wip” isn’t fully merged." }));
    expect(git.deleteBranch).toHaveBeenLastCalledWith("wip", expect.objectContaining({ force: false }));

    // Sign Out clears the merged marks; the token never shows.
    branches = [...branches, branch("squashed", "s1", false, "origin/squashed")];
    await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
    expect(rowText("ref:refs/heads/squashed")).toBe("squashed Merged #3");
    await act(async () => { lastMenu().onAction({ itemId: "sign-out-github" }); });
    expect(rowText("ref:refs/heads/squashed")).toBe("squashed");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("tok\"");
    await act(async () => { renderer.unmount(); });
  });
});


it("resolves conflicted files with the side named for the operation, or both, from the diff header and menus", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 };
  const conflicted = (path: string, theirs = "100644") => ({ kind: "unmerged" as const, path, indexStatus: "U", worktreeStatus: theirs === "000000" ? "D" : "U", modes: ["100644", "100644", theirs, "100644"] });
  let entries: unknown[] = [conflicted("a.txt"), conflicted("gone.txt", "000000"), conflicted("logo.png"), { kind: "ordinary", path: "b.txt", indexStatus: "M", worktreeStatus: "." }];
  const merging = () => ({ kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: entries.filter((entry: any) => entry.kind === "unmerged").length, mergeHead: true });
  const files: Record<string, { ours: boolean; theirs: boolean; binary: boolean; edited: boolean }> = {
    "a.txt": { ours: true, theirs: true, binary: false, edited: false }, "gone.txt": { ours: true, theirs: false, binary: false, edited: true }, "logo.png": { ours: true, theirs: true, binary: true, edited: false },
  };
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => merging()),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""),
    mergeMessage: jest.fn(async () => "Merge branch 'feature'"), continueOperation: jest.fn(async () => {}),
    conflictRegions: jest.fn(async (): Promise<unknown> => null), conflictFile: jest.fn(async (path: string): Promise<(typeof files)[string] | null> => files[path] ?? null),
    resolveConflict: jest.fn(async (path: string) => { entries = entries.map((entry: any) => entry.path === path ? { kind: "ordinary", path, indexStatus: "M", worktreeStatus: "." } : entry); }) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const unstagedList = () => filesList(renderer, "Unstaged");
  const select = (id: string) => act(async () => { unstagedList().props.onSelectionChange({ id }); });
  const headerButtons = () => renderer.root.findByType(DiffPane).findAllByType(Button);
  const headerLabels = () => headerButtons().map(node => node.props.children);
  const menuItem = (id: string) => lastMenu().items.find(entry => entry.id === "changes").items.find((entry: any) => entry.id === id);
  const bar = () => renderer.root.findAllByType(StateBar)[0]!;
  expect(bar().props.text).toBe("Merging “feature” into “main” — 3 conflicted files");
  // Nothing selected: the Changes menu's picks are there, disabled.
  expect(menuItem("use-ours")).toMatchObject({ label: "Use “main”", disabled: true });

  // A text file both sides changed: Use “main” (ours), Use “feature” (theirs), Use Both; the Changes menu names them too.
  await select("a.txt");
  expect(headerLabels()).toEqual(["Use “main”", "Use “feature”", "Use Both", "Mark Resolved"]);
  expect(["use-ours", "use-theirs", "use-both", "mark-resolved"].map(id => menuItem(id))).toEqual([
    expect.objectContaining({ label: "Use “main”", disabled: false }), expect.objectContaining({ label: "Use “feature”", disabled: false }),
    expect.objectContaining({ label: "Use Both", disabled: false }), expect.objectContaining({ label: "Mark Resolved", disabled: false })]);
  // An unedited file is resolved at once; the count drops and Continue stays off while conflicts remain.
  const historyReads = git.revParse.mock.calls.length;
  await act(async () => { headerButtons()[1]!.props.onPress(); });
  expect(git.resolveConflict).toHaveBeenCalledWith("a.txt", "theirs", expect.anything());
  expect(showMessage).not.toHaveBeenCalled();
  expect(bar().props.text).toBe("Merging “feature” into “main” — 2 conflicted files");
  expect(bar().findAllByType(Button)[1]!.props.disabled).toBe(true);
  expect(renderer.root.findAllByType(TextInput)[0]!.props.value).toBe("Merge branch 'feature'");

  // A file "feature" deleted: keep it or delete it, no Both. It was resolved by hand, so replacing it asks first.
  await select("gone.txt");
  expect(headerLabels()).toEqual(["Keep File from “main”", "Delete File as on “feature”", "Mark Resolved"]);
  expect(menuItem("use-both")).toMatchObject({ disabled: true });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await act(async () => { headerButtons()[0]!.props.onPress(); });
  expect(showMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "warning", title: "Replace your edits to “gone.txt”?", defaultButtonId: "cancel",
    buttons: [{ id: "confirm", label: "Keep File from “main”" }, { id: "cancel", label: "Cancel" }], message: expect.stringContaining("looks resolved by hand") }));
  expect(git.resolveConflict).toHaveBeenCalledTimes(1);
  await act(async () => { headerButtons()[0]!.props.onPress(); });
  expect(git.resolveConflict).toHaveBeenLastCalledWith("gone.txt", "ours", expect.anything());

  // A binary file's context menu (read first; it isn't selected) offers one side or the other, not Both.
  jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId: "use-ours" });
  await act(async () => { unstagedList().findAllByType(SidebarItem).find(item => item.props.id === "logo.png")!.props.onContextMenu({ windowPosition: { x: 1, y: 2 } }); });
  expect(jest.mocked(showContextMenu).mock.calls.at(-1)![0].items.map((entry: any) => entry.label ?? "-")).toEqual(["Use “main”", "Use “feature”", "Mark Resolved", "-", "Show File History"]);
  expect(git.resolveConflict).toHaveBeenLastCalledWith("logo.png", "ours", expect.anything());
  // No conflicts left: the bar has no count and Continue is enabled; History wasn't re-read by the picks.
  expect(bar().props.text).toBe("Merging “feature” into “main”");
  expect(bar().findAllByType(Button)[1]!.props.disabled).toBe(false);
  expect(git.revParse).toHaveBeenCalledTimes(historyReads);
  // A file no longer conflicted when picked just refreshes (the first null is the selection's read).
  git.conflictFile.mockResolvedValueOnce(null);
  const reads = git.status.mock.calls.length;
  entries = [conflicted("a.txt")];
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  await select("a.txt");
  git.conflictFile.mockResolvedValueOnce(null);
  await act(async () => { headerButtons()[0]!.props.onPress(); });
  expect(git.resolveConflict).toHaveBeenCalledTimes(3);
  expect(git.status.mock.calls.length).toBeGreaterThan(reads);
  await act(async () => { renderer.unmount(); });
});

it("shows a conflicted file's regions with picks named for the operation, resolves one region at a time, then Mark Resolved", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 };
  let entries: unknown[] = [{ kind: "unmerged", path: "app.ts", indexStatus: "U", worktreeStatus: "U", modes: ["100644", "100644", "100644", "100644"] }];
  let operation: Record<string, unknown> = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 1, mergeHead: true };
  const two = "<<<<<<< HEAD\nmain\n=======\nfeature\n>>>>>>> feature\nx\n<<<<<<< HEAD\nred\n||||||| base\nblue\n=======\n>>>>>>> feature\n";
  const one = "feature\nx\n<<<<<<< HEAD\nred\n||||||| base\nblue\n=======\n>>>>>>> feature\n";
  let text = two;
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => operation),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""),
    mergeMessage: jest.fn(async () => null), hasConflictMarkers: jest.fn(async () => false),
    stageFile: jest.fn(async () => { entries = [{ kind: "ordinary", path: "app.ts", indexStatus: "M", worktreeStatus: "." }]; operation = { ...operation, conflicts: 0 }; }),
    conflictFile: jest.fn(async () => ({ ours: true, theirs: true, binary: false, edited: false })),
    conflictRegions: jest.fn(async () => ({ text, regions: jest.requireActual("@legend-apps/git-core").parseConflictRegions(text) })),
    resolveConflictRegion: jest.fn(async (_path: string, index: number, side: string, shown: string) => {
      if (shown !== text) throw new Error("“app.ts” changed since its conflicts were shown, so nothing was picked. Review them again.");
      text = jest.requireActual("@legend-apps/git-core").resolveConflictRegion(text, index, side);
    }) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const pane = () => renderer.root.findByType(DiffPane);
  const labels = () => pane().findAllByType(Button).map(node => node.props.children);
  const texts = () => pane().findAllByType(Text).map(node => node.props.children);
  const press = (label: string, nth = 0) => act(async () => { pane().findAllByType(Button).filter(node => node.props.children === label)[nth]!.props.onPress(); });
  const bar = () => renderer.root.findAllByType(StateBar)[0]!;
  await act(async () => { filesList(renderer, "Unstaged").props.onSelectionChange({ id: "app.ts" }); });

  // The file's picks stay in its header; each region has its own, and sections named for the sides (and the ancestor).
  expect(labels()).toEqual(["Use “main”", "Use “feature”", "Use Both", "Mark Resolved", "Use “main”", "Use “feature”", "Use Both", "Use “main”", "Use “feature”", "Use Both", "Revert", "Save"]);
  expect(texts()).toEqual(expect.arrayContaining(["Conflict 1 of 2, line 1", "Conflict 2 of 2, line 7", "“main”", "“feature”", "Common ancestor", "No lines"]));
  // A region pick writes only that region (the file stays conflicted and unstaged).
  await press("Use “feature”", 1);
  expect(git.resolveConflictRegion).toHaveBeenLastCalledWith("app.ts", 0, "theirs", two, expect.anything());
  expect(text).toBe(one);
  expect(texts()).toEqual(expect.arrayContaining(["Conflict 1 of 1, line 3"]));
  expect(bar().props.text).toBe("Merging “feature” into “main” — 1 conflicted file");

  // A file changed since it was shown is refused with a plain message and shown again as it is now.
  text = "edited\n" + one;
  await press("Use “main”", 1);
  expect(text).toBe("edited\n" + one);
  expect(renderer.root.findAllByType(StateBar).map(node => node.props.text)).toContain("“app.ts” changed since its conflicts were shown, so nothing was picked. Review them again.");
  expect(texts()).toEqual(expect.arrayContaining(["Conflict 1 of 1, line 4"]));

  // The last region: no markers left, but the file stays conflicted until Mark Resolved; then Continue is on.
  await press("Use Both", 1);
  expect(text).toBe("edited\nfeature\nx\nred\n");
  expect(labels()).toEqual(["Use “main”", "Use “feature”", "Use Both", "Mark Resolved", "Revert", "Save"]);
  expect(texts()).toContain("No conflict markers are left. Review the file, then Mark Resolved.");
  expect(bar().findAllByType(Button)[1]!.props.disabled).toBe(true);
  await press("Mark Resolved");
  expect(git.stageFile).toHaveBeenLastCalledWith("app.ts", expect.anything());
  expect(bar().props.text).toBe("Merging “feature” into “main”");
  expect(bar().findAllByType(Button)[1]!.props.disabled).toBe(false);
  await act(async () => { renderer.unmount(); });
});

it("names a conflict region's sides for a rebase and a cherry-pick", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: null, upstream: null, ahead: 0, behind: 0 };
  const text = "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> topic\n";
  let operation: Record<string, unknown> = { kind: "rebase", branch: "topic", target: "main", commit: null, step: { current: 1, total: 2 }, conflicts: 1, mergeHead: false };
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries: [{ kind: "unmerged", path: "a.txt", indexStatus: "U", worktreeStatus: "U", modes: ["100644", "100644", "100644", "100644"] }] })),
    lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => operation),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => null),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""),
    mergeMessage: jest.fn(async () => null), conflictFile: jest.fn(async () => ({ ours: true, theirs: true, binary: false, edited: false })),
    conflictRegions: jest.fn(async () => ({ text, regions: jest.requireActual("@legend-apps/git-core").parseConflictRegions(text) })) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  await act(async () => { renderer.root.findAllByType(Sidebar)[1]!.props.onSelectionChange({ id: "a.txt" }); });
  const regionLabels = () => renderer.root.findByType(DiffPane).findAllByType(Button).slice(4, 7).map(node => node.props.children);
  const texts = () => renderer.root.findByType(DiffPane).findAllByType(Text).map(node => node.props.children);
  // During a rebase, ours is the branch rebased onto.
  expect(regionLabels()).toEqual(["Use “main”", "Use “topic”", "Use Both"]);
  expect(texts()).toEqual(expect.arrayContaining(["“main”", "“topic”"]));
  operation = { kind: "cherry-pick", branch: "main", target: null, commit: { oid: "ccccccc", subject: "Fix the title" }, step: null, conflicts: 1, mergeHead: false };
  await act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  expect(regionLabels()).toEqual(["Use “main”", "Use “Fix the title”", "Use Both"]);
  await act(async () => { renderer.unmount(); });
});

it("edits a conflicted file's Result, keeps the draft through refreshes, asks before losing it, saves it, then Mark Resolved", async () => {
  jest.clearAllMocks();
  jest.mocked(watchDirectories).mockReturnValue({ remove: jest.fn() });
  const head = "a".repeat(40);
  jest.mocked(openGitHistory).mockImplementation(async () => ({ head: { handle: 1, headOid: head, unborn: false, detached: false }, page: jest.fn(async (offset: number) => ({ offset, commits: [], done: true })), close: jest.fn() }));
  jest.mocked(loadUnifiedDiff).mockReturnValue(new Promise(() => {}));
  const branch = { oid: head, head: "main", upstream: null, ahead: 0, behind: 0 };
  const unmerged = (path: string) => ({ kind: "unmerged", path, indexStatus: "U", worktreeStatus: "U", modes: ["100644", "100644", "100644", "100644"] });
  let entries: unknown[] = [unmerged("app.ts"), unmerged("notes.txt")];
  const operation = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 2, mergeHead: true };
  const shown = "top\r\n<<<<<<< HEAD\r\nmain\r\n=======\r\nfeature\r\n>>>>>>> feature\r\nend";
  const files: Record<string, string> = { "app.ts": shown, "notes.txt": "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature\n" };
  const { parseConflictRegions } = jest.requireActual("@legend-apps/git-core");
  const git = { repoRoot: "/repo", resolveRoot: jest.fn(async () => "/repo"), watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] })),
    status: jest.fn(async () => ({ branch, entries })), lastDiscard: jest.fn(async () => null), operationState: jest.fn(async () => operation),
    revParse: jest.fn(async () => head), refDecorations: jest.fn(async () => new Map()), remoteUrl: jest.fn(async () => null), currentBranch: jest.fn(async () => "main"),
    listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), fileDiff: jest.fn(async () => ""),
    mergeMessage: jest.fn(async () => null), hasConflictMarkers: jest.fn(async (path: string) => files[path]!.includes("<<<<<<<")),
    stageFile: jest.fn(async (path: string) => { entries = entries.map(entry => (entry as { path: string }).path === path ? { kind: "ordinary", path, indexStatus: "M", worktreeStatus: "." } : entry); }),
    conflictFile: jest.fn(async () => ({ ours: true, theirs: true, binary: false, edited: false })),
    conflictRegions: jest.fn(async (path: string) => ({ text: files[path], size: 7, regions: parseConflictRegions(files[path]) })),
    resolveConflictRegion: jest.fn(async () => {}),
    saveConflictResult: jest.fn(async (path: string, text: string, base: string) => {
      if (files[path] !== base) throw new Error(`“${path}” changed since you began editing it, so your edits weren’t saved. Revert to see it.`);
      files[path] = text;
    }) };
  jest.mocked(getGitService).mockReturnValue(git as unknown as GitService);
  jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  await act(async () => { openRepository(); });
  const pane = () => renderer.root.findByType(DiffPane);
  const editor = () => pane().findByType("SourceDocumentEditor" as never);
  const button = (label: string, nth = 0) => pane().findAllByType(Button).filter(node => node.props.children === label)[nth]!;
  const press = (label: string, nth = 0) => act(async () => { await button(label, nth).props.onPress(); });
  const states = () => ({ revert: !button("Revert").props.disabled, save: !button("Save").props.disabled });
  const texts = () => pane().findAllByType(Text).map(node => node.props.children);
  const type = (edit: { offset: number; removedLength: number; insertedText: string }) => act(async () => { editor().props.onChange(edit); });
  const select = (id: string) => act(async () => { filesList(renderer, "Unstaged").props.onSelectionChange({ id }); });
  const refresh = () => act(async () => { lastMenu().onAction({ itemId: "refresh" }); });
  await select("app.ts");

  // The Result shows the worktree text with its region tinted, beside the regions; nothing to save or revert yet.
  expect(editor().props.initialSource).toBe(shown);
  expect([0, 1, 2, 3, 4, 5, 6].map(line => editor().props.lineBackground(line) === undefined)).toEqual([true, false, false, false, false, false, true]);
  expect(texts()).toEqual(expect.arrayContaining(["Conflict 1 of 1, line 2", "Result"]));
  expect(states()).toEqual({ revert: false, save: false });

  // A hand edit: Save and Revert turn on; a refresh of the unchanged file keeps the draft and the editor.
  const resolved = "top\r\nmain and feature\r\nend";
  await type({ offset: shown.indexOf("<<<<<<<"), removedLength: shown.lastIndexOf("feature") + "feature".length - shown.indexOf("<<<<<<<"), insertedText: "main and feature" });
  expect(texts()).toContain("Result — edited");
  expect(states()).toEqual({ revert: true, save: true });
  expect(editor().props.lineBackground(1)).toBeUndefined();
  const mounted = editor();
  await refresh();
  expect(editor()).toBe(mounted);
  expect(texts()).toContain("Result — edited");

  // Switching files asks first; Cancel stays. A region pick asks to discard; Cancel picks nothing.
  jest.mocked(showMessage).mockClear();
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await select("notes.txt");
  expect(jest.mocked(showMessage).mock.calls[0]![0]).toMatchObject({ title: "Save your edits to “app.ts”?", buttons: [{ label: "Save" }, { label: "Don’t Save" }, { label: "Cancel" }] });
  expect(pane().props.patch.path).toBe("app.ts");
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await press("Use “feature”", 1);
  expect(jest.mocked(showMessage).mock.calls[1]![0]).toMatchObject({ title: "Discard your edits to “app.ts”?", buttons: [{ label: "Use “feature”" }, { label: "Cancel" }] });
  expect(git.resolveConflictRegion).not.toHaveBeenCalled();
  expect(texts()).toContain("Result — edited");

  // Save writes the draft over the text it began from (line endings and the missing final newline as typed).
  await press("Save");
  expect(git.saveConflictResult).toHaveBeenLastCalledWith("app.ts", resolved, shown, expect.anything());
  expect(files["app.ts"]).toBe(resolved);
  expect(texts()).toEqual(expect.arrayContaining(["No conflict markers are left. Review the file, then Mark Resolved.", "Result"]));
  expect(states()).toEqual({ revert: false, save: false });

  // The file changing on disk under new edits keeps them, marks them, and only Revert (to the disk text) is offered.
  await type({ offset: 0, removedLength: 0, insertedText: "// " });
  const editing = editor();
  files["app.ts"] = "outside\n";
  await refresh();
  expect(editor()).toBe(editing);
  expect(texts()).toContain("Result — the file changed since you began editing");
  expect(states()).toEqual({ revert: true, save: false });
  // Edits that can't be saved: switching offers only Don't Save or Cancel.
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "cancel" });
  await select("notes.txt");
  expect(jest.mocked(showMessage).mock.calls.at(-1)![0]).toMatchObject({ buttons: [{ label: "Don’t Save" }, { label: "Cancel" }], defaultButtonId: "cancel" });
  expect(pane().props.patch.path).toBe("app.ts");
  await press("Revert");
  expect(editor().props.initialSource).toBe("outside\n");
  expect(states()).toEqual({ revert: false, save: false });

  // Mark Resolved with unsaved edits asks to save them first; then it stages the file (no markers, so no second ask).
  await type({ offset: 0, removedLength: 0, insertedText: "x" });
  jest.mocked(showMessage).mockClear();
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "save" });
  await press("Mark Resolved");
  expect(jest.mocked(showMessage)).toHaveBeenCalledTimes(1);
  expect(files["app.ts"]).toBe("xoutside\n");
  expect(git.stageFile).toHaveBeenLastCalledWith("app.ts", expect.anything());

  // Switching with Don't Save drops the edits.
  await select("notes.txt");
  await type({ offset: 0, removedLength: 0, insertedText: "y" });
  jest.mocked(showMessage).mockResolvedValueOnce({ buttonId: "discard" });
  await act(async () => { filesList(renderer, "Staged").props.onSelectionChange({ id: "app.ts" }); });
  expect(pane().props.patch).toMatchObject({ path: "app.ts", section: "staged" });
  expect(files["notes.txt"]).not.toContain("y");
  expect(git.saveConflictResult).toHaveBeenCalledTimes(2);
  await act(async () => { renderer.unmount(); });
});

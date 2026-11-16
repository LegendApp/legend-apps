import { getGitService, type GitService } from "@legend-apps/git-core";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { Button } from "@legendapp/spark/ui";
import { Sidebar } from "@legendapp/spark/ui/sidebar";
import { openFileDialog, showMessage } from "@legendapp/spark/dialogs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";
import { Switch, Text, TextInput } from "react-native";
import { useMenu } from "@legendapp/spark/menus";
import { runCommand } from "@legendapp/spark/processes";
import { App } from "../App";

jest.mock("@legend-apps/git-core", () => ({ ...jest.requireActual("@legend-apps/git-core"), getGitService: jest.fn() }));
jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text", View: "View", Pressable: "Pressable", FlatList: "FlatList", Switch: "Switch", TextInput: "TextInput", useColorScheme: () => "light",
}));
jest.mock("@legend-apps/diff-parser", () => ({ DiffNativeRow: "DiffNativeRow", DiffNativeRowConfig: "DiffNativeRowConfig", getDiffRowPalette: () => ({}), loadUnifiedDiff: jest.fn() }));
jest.mock("@legend-apps/file-system-watcher", () => ({ watchDirectories: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn(async () => ({ canceled: true })), showMessage: jest.fn(async () => ({ buttonId: "confirm" })) }));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));
jest.mock("@legendapp/spark/ai", () => ({ ...jest.requireActual("@legendapp/spark/ai"), getAICommandAvailability: jest.fn(async () => ({ claude: true, codex: false, preferredTool: "claude" })) }));
jest.mock("@legendapp/spark/ui/sidebar", () => ({ Sidebar: "Sidebar", SidebarItem: "SidebarItem" }));
jest.mock("@legendapp/spark/ui/split-view", () => ({
  SidebarSplitView: ({ sidebar, content }: any) => <>{sidebar}{content}</>,
}));
jest.mock("@legendapp/spark/windows", () => ({ setWindowOptions: jest.fn(async () => {}), addWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })) }));
jest.mock("@legendapp/spark/windows/macos", () => ({
  addMacOSWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));

it("renders the empty window, toggles its sidebar, opens the folder panel and cleans up", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  expect(JSON.stringify(renderer.toJSON())).toContain("No repository open");
  expect(setWindowOptions).toHaveBeenCalledWith("main", expect.objectContaining({
    title: "Legend Git",
    macos: expect.objectContaining({ toolbar: expect.objectContaining({ items: expect.arrayContaining([
      expect.objectContaining({ id: "open-repository", type: "button" }),
    ]) }) }),
  }));
  const listener = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "toggle-sidebar" }); });
  expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(true);
  await act(async () => { renderer.root.findByType(SidebarSplitView).props.onSidebarCollapsedChange(false); });
  expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(false);
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "open-repository" }); });
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
  await act(async () => { toolbar({ type: "toolbarAction", windowId: "main", itemId: "open-repository" }); });
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
  await act(async () => { jest.mocked(addMacOSWindowListener).mock.calls[0][1]({ type: "toolbarAction", windowId: "main", itemId: "open-repository" }); });
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
  await act(async () => { jest.mocked(addMacOSWindowListener).mock.calls.at(-1)![1]({ type: "toolbarAction", windowId: "main", itemId: "open-repository" }); });
  expect(button("Generate")!.props.disabled).toBe(true);
  expect(menuItem().disabled).toBe(true);
  await act(async () => { renderer.unmount(); });
});

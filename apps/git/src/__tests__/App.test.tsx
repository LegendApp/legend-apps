import { getGitService, type GitService } from "@legend-apps/git-core";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { Button } from "@legendapp/spark/ui";
import { Sidebar } from "@legendapp/spark/ui/sidebar";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";
import { Text } from "react-native";
import { App } from "../App";

jest.mock("@legend-apps/git-core", () => ({ ...jest.requireActual("@legend-apps/git-core"), getGitService: jest.fn() }));
jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text", View: "View", Pressable: "Pressable", FlatList: "FlatList", useColorScheme: () => "light",
}));
jest.mock("@legend-apps/diff-parser", () => ({ DiffNativeRow: "DiffNativeRow", DiffNativeRowConfig: "DiffNativeRowConfig", getDiffRowPalette: () => ({}), loadUnifiedDiff: jest.fn() }));
jest.mock("@legend-apps/file-system-watcher", () => ({ watchDirectories: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn(async () => ({ canceled: true })) }));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));
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
    status: jest.fn(async () => ({ branch, entries: [entry] })), stageFile: jest.fn(async () => {}), unstageFile: jest.fn(async () => {}) };
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
  await act(async () => { jest.mocked(addWindowListener).mock.calls[0][2]({ windowId: "main" }); });
  expect(remove).toHaveBeenCalledTimes(1);
  const registration = await jest.mocked(addMacOSWindowListener).mock.results[0].value;
  expect(registration.remove).toHaveBeenCalledTimes(1);
  await act(async () => { renderer.unmount(); });
  expect(remove).toHaveBeenCalledTimes(1);
});

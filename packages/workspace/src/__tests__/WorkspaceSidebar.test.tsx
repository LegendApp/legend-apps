import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { list, mkdir, revealInFileManager, writeText } from "@legendapp/spark/files";
import { useWorkspaceWindow } from "../useWorkspaceWindow";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import type { WorkspaceWindowProps } from "../workspaceState";

const mockTree: Record<string, string | null> = {
  "/repo": null,
  "/repo/src": null,
  "/repo/src/a.ts": "",
  "/repo/node_modules": null,
  "/repo/notes.md": "",
  "/data/w.json": '{"folders":["/repo"],"theme":"dark"}',
};

jest.mock("@legendapp/spark/files", () => ({
  getDirectory: jest.fn(async () => "/data"),
  list: jest.fn(async (directory: string) => Object.keys(mockTree)
    .filter(path => path.startsWith(`${directory}/`) && !path.slice(directory.length + 1).includes("/"))
    .map(path => ({ name: path.slice(directory.length + 1), path }))),
  mkdir: jest.fn(async (path: string) => { mockTree[path] = null; }),
  readText: jest.fn(async (path: string) => mockTree[path]),
  revealInFileManager: jest.fn(async () => {}),
  stat: jest.fn(async (path: string) => ({ type: mockTree[path] === null ? "directory" : "file" })),
  watch: jest.fn(async (_path: string, listener: (path: string) => void) => {
    mockWatchers.push(listener);
    return { remove: async () => {} };
  }),
  writeText: jest.fn(async (path: string, text: string) => { if (!path.startsWith("/data/")) mockTree[path] = text; }),
}));
jest.mock("@legendapp/spark/context-menu", () => ({ showContextMenu: jest.fn() }));
const mockWatchers: ((path: string) => void)[] = [];
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: () => null }));
jest.mock("@legendapp/spark/ui/sidebar", () => {
  const React = require("react");
  return {
    Sidebar: ({ children, onSelectionChange, selectedId }: { children: React.ReactNode; onSelectionChange: unknown; selectedId: string | null }) =>
      React.createElement("Sidebar", { onSelectionChange, selectedId }, children),
    SidebarItem: ({ children, id, onContextMenu, selectable }: { children: React.ReactNode; id: string; onContextMenu?: unknown; selectable?: boolean }) =>
      React.createElement("SidebarItem", { id, onContextMenu, selectable }, children),
  };
});

const colors = { border: "#ccc", foreground: "#000", muted: "#888", selection: "#ddd" };
let workspace: ReturnType<typeof useWorkspaceWindow>;

const onAddFolder = jest.fn();

function Harness({ props, sidebarOpenSetting = true, sidebarColors = colors }: { props: WorkspaceWindowProps; sidebarOpenSetting?: boolean; sidebarColors?: typeof colors }) {
  workspace = useWorkspaceWindow(props, { sidebarOpenSetting });
  const { files, folders, tabs } = workspace.state;
  return (
    <WorkspaceSidebar
      activePath={tabs.active}
      colors={sidebarColors}
      files={files}
      folderMenu={{ newFileName: "Untitled.md", onRemoveFolder: workspace.removeFolder, windowId: "w" }}
      folders={folders}
      isDocumentPath={path => path.endsWith(".md")}
      onAddFolder={onAddFolder}
      onError={error => { throw error; }}
      onOpenFile={workspace.openTab}
      titleBarHeight={36}
    />
  );
}

describe("WorkspaceSidebar", () => {
  let renderer: ReactTestRenderer;
  // Folder rows and buttons are pressable; file rows are native sidebar rows, selectable when the app opens them.
  const labels = () => renderer.root.findAll(node => typeof node.type === "string" && typeof node.props.accessibilityLabel === "string")
    .map(node => [node.props.accessibilityLabel, !node.props.accessibilityState?.disabled]);
  const press = (label: string) => act(async () => {
    const item = renderer.root.findAll(node => node.type === ("SidebarItem" as never) && node.props.id.endsWith(`/${label}`))[0];
    if (item && !renderer.root.findAll(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel === label).length) {
      return renderer.root.findByType("Sidebar" as never).props.onSelectionChange({ id: item.props.id });
    }
    return renderer.root.find(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel === label).props.onPress();
  });

  const pressable = (label: string) => renderer.root.find(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel === label);
  const sidebarItem = (id: string) => renderer.root.find(node => node.type === ("SidebarItem" as never) && node.props.id === id);
  const chooseMenuItem = (itemId: string | null) => jest.mocked(showContextMenu).mockResolvedValueOnce(itemId ? { canceled: false, itemId } : { canceled: true });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWatchers.length = 0;
    for (const path of Object.keys(mockTree)) if (/Untitled|New Folder|\/repo\/later\.md/.test(path)) delete mockTree[path];
  });
  afterEach(() => act(async () => renderer.unmount()));

  it("starts single files with the sidebar closed", async () => {
    await act(async () => { renderer = create(<Harness props={{ files: ["/x/one.md"] }} />); });
    expect(workspace.state.sidebarOpen).toBe(false);
    expect(labels()).toEqual([["one.md", true]]);

    expect(workspace.state.workspacePath).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("refreshes mounted row colors when the theme changes without changing the files", async () => {
    const props = { files: ["/x/one.md"] };
    await act(async () => { renderer = create(<Harness props={props} />); });
    const filenameColor = () => renderer.root.find(node => node.type === ("Text" as never) && node.props.children === "one.md").props.style[1].color;
    expect(filenameColor()).toBe("#000");
    await act(async () => renderer.update(<Harness props={props} sidebarColors={{ ...colors, foreground: "#fff" }} />));
    expect(filenameColor()).toBe("#fff");
  });

  it("expands directories lazily and dims files the app cannot open", async () => {
    await act(async () => { renderer = create(<Harness props={{ folders: ["/repo"] }} />); });
    expect(workspace.state.sidebarOpen).toBe(true);
    await press("src");
    expect(labels()).toEqual([["repo", true], ["src", true], ["a.ts", false], ["notes.md", true]]);
    expect(renderer.root.findAll(node => node.type === ("SidebarItem" as never)).map(node => [node.props.id, node.props.selectable]))
      .toEqual([["/repo", false], ["/repo/src", false], ["/repo/src/a.ts", false], ["/repo/notes.md", true]]);
    await press("repo");
    expect(labels().map(([label]) => label)).toEqual(["repo"]);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("opens files as tabs and saves workspace folders without overwriting other fields", async () => {
    await act(async () => { renderer = create(<Harness props={{ folders: ["/repo", "/other"], workspacePath: "/data/w.json" }} />); });
    await press("notes.md");
    expect(workspace.state.tabs).toEqual({ active: "/repo/notes.md", paths: ["/repo/notes.md"] });
    expect(renderer.root.findByType("Sidebar" as never).props.selectedId).toBe("/repo/notes.md");

    await act(async () => workspace.saveWorkspace());
    expect(writeText).toHaveBeenCalledWith("/data/w.json", '{\n  "folders": [\n    "/repo",\n    "/other"\n  ],\n  "theme": "dark"\n}\n');
  });

  it("shows Add Folder only while there are no folders, and adds and removes folders without touching disk", async () => {
    await act(async () => { renderer = create(<Harness props={{}} />); });
    await act(async () => pressable(undefined as never).props.onPress());
    expect(onAddFolder).toHaveBeenCalledTimes(1);

    await act(async () => workspace.addFolders(["/repo", "/other", "/repo"]));
    expect(workspace.state.folders).toEqual(["/repo", "/other"]);
    expect(workspace.state.sidebarOpen).toBe(true);
    expect(renderer.root.findAll(node => node.type === ("Text" as never) && node.props.children === "Add Folder…")).toHaveLength(0);

    chooseMenuItem("remove");
    await act(async () => sidebarItem("/other").props.onContextMenu({ windowPosition: { x: 5, y: 6 } }));
    expect(showContextMenu).toHaveBeenCalledWith(expect.objectContaining({ position: { x: 5, y: 6 }, windowId: "w" }));
    expect(jest.mocked(showContextMenu).mock.calls[0][0].items.map(item => item.type === "action" ? item.label : "-"))
      .toEqual(["New File", "New Folder", "-", "Reveal in Finder", "-", "Remove Folder from Sidebar"]);
    expect(workspace.state.folders).toEqual(["/repo"]);
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("runs the section header's hover menu: New File opens a numbered file and Reveal shows the folder", async () => {
    mockTree["/repo/Untitled.md"] = "";
    const measureInWindow = (callback: (x: number, y: number, width: number, height: number) => void) => callback(10, 20, 20, 18);
    await act(async () => { renderer = create(<Harness props={{ folders: ["/repo"] }} />, { createNodeMock: () => ({ measureInWindow }) }); });
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === "repo Actions")).toHaveLength(0);
    await act(async () => pressable("repo").props.onHoverIn());
    expect(pressable("repo Actions").props.tooltip).toBe("Folder Actions");

    chooseMenuItem("newFile");
    await act(async () => pressable("repo Actions").props.onPress());
    expect(showContextMenu).toHaveBeenCalledWith(expect.objectContaining({ position: { x: 10, y: 38 } }));
    expect(writeText).toHaveBeenCalledWith("/repo/Untitled 2.md", "");
    expect(workspace.state.tabs.active).toBe("/repo/Untitled 2.md");

    chooseMenuItem("reveal");
    await act(async () => sidebarItem("/repo").props.onContextMenu({ windowPosition: { x: 0, y: 0 } }));
    expect(revealInFileManager).toHaveBeenCalledWith("/repo");
  });

  it("offers New File and New Folder on folder rows, and reloads listings when files change on disk", async () => {
    await act(async () => { renderer = create(<Harness props={{ folders: ["/repo"] }} />); });
    expect(sidebarItem("/repo/notes.md").props.onContextMenu).toBeUndefined();

    chooseMenuItem("newFolder");
    await act(async () => sidebarItem("/repo/src").props.onContextMenu({ windowPosition: { x: 0, y: 0 } }));
    expect(jest.mocked(showContextMenu).mock.calls[0][0].items.map(item => item.type === "action" ? item.id : "-"))
      .toEqual(["newFile", "newFolder", "-", "reveal"]);
    expect(mkdir).toHaveBeenCalledWith("/repo/src/New Folder");
    expect(labels().map(([label]) => label)).toEqual(["repo", "src", "New Folder", "a.ts", "notes.md"]);

    mockTree["/repo/later.md"] = "";
    expect(labels().map(([label]) => label)).not.toContain("later.md");
    await act(async () => mockWatchers[0]("/repo/later.md"));
    expect(labels().map(([label]) => label)).toContain("later.md");
  });

  it("saves a new workspace and remembers the sidebar choice only for folders", async () => {
    const onSidebarOpenChange = jest.fn();
    function Toggle({ props }: { props: WorkspaceWindowProps }) {
      workspace = useWorkspaceWindow(props, { onSidebarOpenChange, sidebarOpenSetting: false });
      return null;
    }
    await act(async () => { renderer = create(<Toggle props={{ files: ["/x/one.md"] }} />); });
    await act(async () => workspace.toggleSidebar());
    expect(workspace.state.sidebarOpen).toBe(true);
    expect(onSidebarOpenChange).not.toHaveBeenCalled();

    await act(async () => renderer.update(<Toggle key="folder" props={{ folders: ["/repo"] }} />));
    await act(async () => workspace.toggleSidebar());
    expect(onSidebarOpenChange).toHaveBeenCalledWith(true);
    await act(async () => workspace.saveWorkspace());
    expect(workspace.state.workspacePath).toBe("/data/Workspaces/repo.json");
  });
});

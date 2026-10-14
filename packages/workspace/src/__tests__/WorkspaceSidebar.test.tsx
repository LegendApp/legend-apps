import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { list, writeText } from "@legendapp/spark/files";
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
  mkdir: jest.fn(async () => {}),
  readText: jest.fn(async (path: string) => mockTree[path]),
  stat: jest.fn(async (path: string) => ({ type: mockTree[path] === null ? "directory" : "file" })),
  writeText: jest.fn(async () => {}),
}));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn() }));
jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  return {
    LegendList: ({ data, renderItem }: { data: unknown[]; renderItem: (info: { item: unknown }) => React.ReactNode }) =>
      React.createElement("List", null, data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item })))),
  };
});

const colors = { border: "#ccc", foreground: "#000", muted: "#888", selection: "#ddd" };
let workspace: ReturnType<typeof useWorkspaceWindow>;

function Harness({ props, sidebarOpenSetting = true }: { props: WorkspaceWindowProps; sidebarOpenSetting?: boolean }) {
  workspace = useWorkspaceWindow(props, { fileTypes: ["md"], onError: error => { throw error; }, sidebarOpenSetting });
  const { files, folders, tabs } = workspace.state;
  return (
    <WorkspaceSidebar
      activePath={tabs.active}
      colors={colors}
      files={files}
      folders={folders}
      isDocumentPath={path => path.endsWith(".md")}
      onAddFile={workspace.chooseFiles}
      onAddFolder={workspace.chooseFolders}
      onError={error => { throw error; }}
      onOpenFile={workspace.openTab}
    />
  );
}

describe("WorkspaceSidebar", () => {
  let renderer: ReactTestRenderer;
  const labels = () => renderer.root.findAll(node => node.type === ("Pressable" as never)).map(node => [node.props.accessibilityLabel, !node.props.disabled]);
  const press = (label: string) => act(async () => renderer.root.find(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel === label).props.onPress());

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(async () => renderer.unmount()));

  it("starts single files with the sidebar closed, then adds folders", async () => {
    await act(async () => { renderer = create(<Harness props={{ files: ["/x/one.md"] }} />); });
    expect(workspace.state.sidebarOpen).toBe(false);
    expect(labels()).toEqual([["Add File", true], ["Add Folder", true], ["one.md", true]]);

    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/repo"] });
    await press("Add Folder");
    expect(openFileDialog).toHaveBeenLastCalledWith({ multiple: true, selection: "directories" });
    expect(workspace.state.sidebarOpen).toBe(true);
    expect(workspace.state.workspacePath).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    expect(labels().map(([label]) => label)).toEqual(["Add File", "Add Folder", "repo", "src", "notes.md", "one.md"]);
  });

  it("expands directories lazily and dims files the app cannot open", async () => {
    await act(async () => { renderer = create(<Harness props={{ folders: ["/repo"] }} />); });
    expect(workspace.state.sidebarOpen).toBe(true);
    await press("src");
    expect(labels()).toEqual([["Add File", true], ["Add Folder", true], ["repo", true], ["src", true], ["a.ts", false], ["notes.md", true]]);
    await press("repo");
    expect(labels().map(([label]) => label)).toEqual(["Add File", "Add Folder", "repo"]);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("opens files as tabs and persists folders added to a workspace", async () => {
    await act(async () => { renderer = create(<Harness props={{ folders: ["/repo"], workspacePath: "/data/w.json" }} />); });
    await press("notes.md");
    expect(workspace.state.tabs).toEqual({ active: "/repo/notes.md", paths: ["/repo/notes.md"] });

    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/other"] });
    await press("Add Folder");
    expect(writeText).toHaveBeenCalledWith("/data/w.json", '{\n  "folders": [\n    "/repo",\n    "/other"\n  ],\n  "theme": "dark"\n}\n');

    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/x/a.md", "/x/b.md"] });
    await press("Add File");
    expect(openFileDialog).toHaveBeenLastCalledWith({ filters: [{ extensions: ["md"] }], multiple: true, selection: "files" });
    expect(workspace.state.files).toEqual(["/x/a.md", "/x/b.md"]);
    expect(workspace.state.tabs).toEqual({ active: "/x/a.md", paths: ["/repo/notes.md", "/x/a.md"] });
  });

  it("saves a new workspace and remembers the sidebar choice only for folders", async () => {
    const onSidebarOpenChange = jest.fn();
    function Toggle({ props }: { props: WorkspaceWindowProps }) {
      workspace = useWorkspaceWindow(props, { onError: error => { throw error; }, onSidebarOpenChange, sidebarOpenSetting: false });
      return null;
    }
    await act(async () => { renderer = create(<Toggle props={{ files: ["/x/one.md"] }} />); });
    await act(async () => workspace.toggleSidebar());
    expect(workspace.state.sidebarOpen).toBe(true);
    expect(onSidebarOpenChange).not.toHaveBeenCalled();

    await act(async () => renderer.update(<Toggle props={{}} />));
    await act(async () => workspace.addFolders(["/repo"]));
    await act(async () => workspace.toggleSidebar());
    expect(onSidebarOpenChange).toHaveBeenCalledWith(false);
    await act(async () => workspace.saveWorkspace());
    expect(workspace.state.workspacePath).toBe("/data/Workspaces/repo.json");
  });
});

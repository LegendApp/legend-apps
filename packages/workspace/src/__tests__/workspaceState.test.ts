import {
  closeDocumentTab,
  createWorkspaceWindowState,
  openDocumentTab,
  renameDocumentTab,
} from "../workspaceState";

describe("createWorkspaceWindowState", () => {
  it("keeps the sidebar closed for single files even when the setting is open", () => {
    const state = createWorkspaceWindowState({ files: ["/a.md"] }, true);
    expect(state.sidebarOpen).toBe(false);
    expect(state.files).toEqual(["/a.md"]);
    expect(state.tabs).toEqual({ active: "/a.md", paths: ["/a.md"] });
  });

  it("follows the setting for folders and workspaces", () => {
    expect(createWorkspaceWindowState({ folders: ["/repo"] }, true).sidebarOpen).toBe(true);
    expect(createWorkspaceWindowState({ folders: ["/repo"] }, false).sidebarOpen).toBe(false);
    expect(createWorkspaceWindowState({ workspacePath: "/data/w.json" }, true).sidebarOpen).toBe(true);
    expect(createWorkspaceWindowState({}, true).sidebarOpen).toBe(false);
  });
});

describe("document tabs", () => {
  const tabs = { active: "/b", paths: ["/a", "/b", "/c"] };

  it("inserts new tabs after the active tab and focuses existing ones", () => {
    expect(openDocumentTab(tabs, "/d")).toEqual({ active: "/d", paths: ["/a", "/b", "/d", "/c"] });
    expect(openDocumentTab(tabs, "/a")).toEqual({ active: "/a", paths: tabs.paths });
    expect(openDocumentTab({ active: null, paths: [] }, "/a")).toEqual({ active: "/a", paths: ["/a"] });
  });

  it("activates a neighbor when closing the active tab", () => {
    expect(closeDocumentTab(tabs, "/b")).toEqual({ active: "/c", paths: ["/a", "/c"] });
    expect(closeDocumentTab({ active: "/c", paths: ["/a", "/c"] }, "/c")).toEqual({ active: "/a", paths: ["/a"] });
    expect(closeDocumentTab(tabs, "/a")).toEqual({ active: "/b", paths: ["/b", "/c"] });
    expect(closeDocumentTab({ active: "/a", paths: ["/a"] }, "/a")).toEqual({ active: null, paths: [] });
  });

  it("renames tabs after Save As", () => {
    expect(renameDocumentTab(tabs, "/b", "/e")).toEqual({ active: "/e", paths: ["/a", "/e", "/c"] });
    expect(renameDocumentTab(tabs, "/b", "/c")).toEqual({ active: "/c", paths: ["/a", "/c"] });
  });
});

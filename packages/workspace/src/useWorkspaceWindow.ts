import { useCallback, useRef, useState } from "react";
import { readWorkspace, writeWorkspace } from "./workspaceFiles";
import {
  addUniquePaths,
  closeDocumentTab,
  createWorkspaceWindowState,
  openDocumentTab,
  renameDocumentTab,
  type WorkspaceWindowProps,
  type WorkspaceWindowState,
} from "./workspaceState";

export type UseWorkspaceWindowOptions = {
  /** Called when the user toggles the sidebar of a folder or workspace window. */
  onSidebarOpenChange?: (open: boolean) => void;
  sidebarOpenSetting: boolean;
};

export function useWorkspaceWindow(props: WorkspaceWindowProps, { onSidebarOpenChange, sidebarOpenSetting }: UseWorkspaceWindowOptions) {
  const [initialState] = useState(() => createWorkspaceWindowState(props, sidebarOpenSetting));
  const [state, setState] = useState(initialState);
  // Actions read and write the ref so consecutive calls see each other's changes before rendering.
  const stateRef = useRef(initialState);
  const update = useCallback((change: (state: WorkspaceWindowState) => Partial<WorkspaceWindowState>) => {
    stateRef.current = { ...stateRef.current, ...change(stateRef.current) };
    setState(stateRef.current);
  }, []);

  const openTab = useCallback((path: string) => update(({ files, folders, tabs, workspacePath }) => ({
    files: files.length === 0 && folders.length === 0 && !workspacePath ? [path] : files,
    tabs: openDocumentTab(tabs, path),
  })), [update]);
  const closeTab = useCallback((path: string) => update(({ tabs }) => ({ tabs: closeDocumentTab(tabs, path) })), [update]);
  const renameTab = useCallback((from: string, to: string) => update(({ tabs }) => ({ tabs: renameDocumentTab(tabs, from, to) })), [update]);

  const setSidebarOpen = useCallback((open: boolean) => {
    const { folders, sidebarOpen, workspacePath } = stateRef.current;
    if (open === sidebarOpen) return;
    if (folders.length > 0 || workspacePath) onSidebarOpenChange?.(open);
    update(() => ({ sidebarOpen: open }));
  }, [onSidebarOpenChange, update]);
  const toggleSidebar = useCallback(() => setSidebarOpen(!stateRef.current.sidebarOpen), [setSidebarOpen]);

  /** Adds root folders and shows the sidebar. */
  const addFolders = useCallback((added: readonly string[]) => {
    if (added.length === 0) return;
    update(({ folders }) => ({ folders: addUniquePaths(folders, added) }));
    setSidebarOpen(true);
  }, [setSidebarOpen, update]);
  /** Takes a root folder out of the window; nothing on disk changes. */
  const removeFolder = useCallback((path: string) => update(({ folders }) => ({ folders: folders.filter(folder => folder !== path) })), [update]);

  /** Saves the folders as a workspace in app data, creating the file on first save. */
  const saveWorkspace = useCallback(async () => {
    const { folders, workspacePath } = stateRef.current;
    if (workspacePath) {
      await writeWorkspace({ ...await readWorkspace(workspacePath), folders }, workspacePath);
      return;
    }
    const path = await writeWorkspace({ folders });
    update(() => ({ workspacePath: path }));
  }, [update]);

  return {
    addFolders,
    closeTab,
    openTab,
    removeFolder,
    renameTab,
    saveWorkspace,
    setSidebarOpen,
    state,
    toggleSidebar,
  };
}

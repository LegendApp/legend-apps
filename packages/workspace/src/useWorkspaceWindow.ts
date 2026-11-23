import { useCallback, useRef, useState } from "react";
import { readWorkspace, writeWorkspace } from "./workspaceFiles";
import {
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

  const toggleSidebar = useCallback(() => {
    const { folders, sidebarOpen, workspacePath } = stateRef.current;
    if (folders.length > 0 || workspacePath) onSidebarOpenChange?.(!sidebarOpen);
    update(() => ({ sidebarOpen: !sidebarOpen }));
  }, [onSidebarOpenChange, update]);

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
    closeTab,
    openTab,
    renameTab,
    saveWorkspace,
    state,
    toggleSidebar,
  };
}

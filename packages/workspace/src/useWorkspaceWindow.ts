import { openFileDialog } from "@legendapp/spark/dialogs";
import { useCallback, useRef, useState } from "react";
import { chooseFolders, readWorkspace, writeWorkspace } from "./workspaceFiles";
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
  /** Extensions without dots for Add File; empty allows any file. */
  fileTypes?: readonly string[];
  onError: (error: unknown) => void;
  /** Called when the user toggles the sidebar of a folder or workspace window. */
  onSidebarOpenChange?: (open: boolean) => void;
  sidebarOpenSetting: boolean;
};

export function useWorkspaceWindow(props: WorkspaceWindowProps, { fileTypes = [], onError, onSidebarOpenChange, sidebarOpenSetting }: UseWorkspaceWindowOptions) {
  const [initialState] = useState(() => createWorkspaceWindowState(props, sidebarOpenSetting));
  const [state, setState] = useState(initialState);
  // Actions read and write the ref so consecutive calls see each other's changes before rendering.
  const stateRef = useRef(initialState);
  const update = useCallback((change: (state: WorkspaceWindowState) => Partial<WorkspaceWindowState>) => {
    stateRef.current = { ...stateRef.current, ...change(stateRef.current) };
    setState(stateRef.current);
  }, []);

  const openTab = useCallback((path: string) => update(({ tabs }) => ({ tabs: openDocumentTab(tabs, path) })), [update]);
  const closeTab = useCallback((path: string) => update(({ tabs }) => ({ tabs: closeDocumentTab(tabs, path) })), [update]);
  const renameTab = useCallback((from: string, to: string) => update(({ tabs }) => ({ tabs: renameDocumentTab(tabs, from, to) })), [update]);

  const toggleSidebar = useCallback(() => {
    const { folders, sidebarOpen, workspacePath } = stateRef.current;
    if (folders.length > 0 || workspacePath) onSidebarOpenChange?.(!sidebarOpen);
    update(() => ({ sidebarOpen: !sidebarOpen }));
  }, [onSidebarOpenChange, update]);

  const persistFolders = useCallback(async (folders: string[]) => {
    const { workspacePath } = stateRef.current;
    if (workspacePath) await writeWorkspace({ ...await readWorkspace(workspacePath), folders }, workspacePath);
  }, []);

  const addFolders = useCallback((paths: readonly string[]) => {
    const folders = addUniquePaths(stateRef.current.folders, paths);
    update(() => ({ folders, sidebarOpen: true }));
    persistFolders(folders).catch(onError);
  }, [onError, persistFolders, update]);

  /** Adds chosen files to the sidebar and resolves with them, so the caller can open one through its own document flow. */
  const chooseFiles = useCallback(async (): Promise<string[]> => {
    try {
      const result = await openFileDialog({ filters: fileTypes.length > 0 ? [{ extensions: fileTypes }] : [], multiple: true, selection: "files" });
      if (result.canceled) return [];
      update(({ files }) => ({ files: addUniquePaths(files, result.paths), sidebarOpen: true }));
      return result.paths;
    } catch (error) {
      onError(error);
      return [];
    }
  }, [fileTypes, onError, update]);

  /** Saves the folders as a workspace in app data, creating the file on first save. */
  const saveWorkspace = useCallback(async () => {
    const { folders, workspacePath } = stateRef.current;
    if (workspacePath) return persistFolders(folders);
    const path = await writeWorkspace({ folders });
    update(() => ({ workspacePath: path }));
  }, [persistFolders, update]);

  return {
    addFolders,
    chooseFiles,
    chooseFolders: useCallback(() => { chooseFolders().then(paths => { if (paths.length > 0) addFolders(paths); }).catch(onError); }, [addFolders, onError]),
    closeTab,
    openTab,
    renameTab,
    saveWorkspace,
    state,
    toggleSidebar,
  };
}

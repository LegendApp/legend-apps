/** Serializable props a document window opens with. */
export type WorkspaceWindowProps = {
  files?: string[];
  folders?: string[];
  windowId?: string;
  workspacePath?: string;
};

export type DocumentTabs = { active: string | null; paths: string[] };

export type WorkspaceWindowState = {
  /** Files shown at the top level of the sidebar, beside the folders. */
  files: string[];
  folders: string[];
  sidebarOpen: boolean;
  tabs: DocumentTabs;
  workspacePath: string | null;
};

export function addUniquePaths(paths: readonly string[], added: readonly string[]) {
  return [...new Set([...paths, ...added])];
}

export function createWorkspaceWindowState({ files = [], folders = [], workspacePath }: WorkspaceWindowProps, sidebarOpenSetting: boolean): WorkspaceWindowState {
  return {
    files: addUniquePaths([], files),
    folders: addUniquePaths([], folders),
    // A window opened on files alone never starts with the sidebar open, whatever the setting says.
    sidebarOpen: sidebarOpenSetting && (workspacePath !== undefined || folders.length > 0),
    tabs: { active: files[0] ?? null, paths: addUniquePaths([], files) },
    workspacePath: workspacePath ?? null,
  };
}

/** Focuses an open tab, or inserts a new one after the active tab. */
export function openDocumentTab(tabs: DocumentTabs, path: string): DocumentTabs {
  if (tabs.paths.includes(path)) return { ...tabs, active: path };
  const index = tabs.active === null ? tabs.paths.length : tabs.paths.indexOf(tabs.active) + 1;
  return { active: path, paths: [...tabs.paths.slice(0, index), path, ...tabs.paths.slice(index)] };
}

/** Closing the active tab activates its right neighbor, else its left. */
export function closeDocumentTab(tabs: DocumentTabs, path: string): DocumentTabs {
  const index = tabs.paths.indexOf(path);
  if (index < 0) return tabs;
  const paths = tabs.paths.filter(tab => tab !== path);
  return { active: tabs.active === path ? paths[Math.min(index, paths.length - 1)] ?? null : tabs.active, paths };
}

/** Follows a Save As, merging into an existing tab for the new path. */
export function renameDocumentTab(tabs: DocumentTabs, from: string, to: string): DocumentTabs {
  if (from === to || !tabs.paths.includes(from)) return tabs;
  const paths = tabs.paths.includes(to) ? tabs.paths.filter(tab => tab !== from) : tabs.paths.map(tab => tab === from ? to : tab);
  return { active: tabs.active === from ? to : tabs.active, paths };
}

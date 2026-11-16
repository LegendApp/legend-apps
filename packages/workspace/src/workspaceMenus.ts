import type { MenuItem } from "@legendapp/spark/menus";
import { chooseFolders, chooseWorkspace } from "./workspaceFiles";
import type { WorkspaceWindowProps } from "./workspaceState";

/** File menu entries shared by document apps; dispatch `toggleSidebar` and `saveWorkspace` to the focused window. */
export const workspaceFileMenuItems: MenuItem[] = [
  { type: "action", id: "newWindow", label: "New Window", shortcut: "Cmd+Shift+n" },
  { type: "action", id: "openFolder", label: "Open Folder…" },
  { type: "action", id: "openWorkspace", label: "Open Workspace…" },
  { type: "action", id: "saveWorkspace", label: "Save Workspace" },
  { type: "separator" },
  { type: "action", id: "toggleSidebar", label: "Toggle Sidebar", shortcut: "Cmd+Ctrl+s" },
];

/** Handlers for the window-opening entries above; `openWindow` opens a document window with the given props. */
export function createWorkspaceMenuHandlers(openWindow: (props: WorkspaceWindowProps) => Promise<unknown>, onError: (error: unknown) => void) {
  return {
    newWindow: () => { openWindow({}).catch(onError); },
    openFolder: () => { chooseFolders().then(folders => folders.length > 0 ? openWindow({ folders }) : undefined).catch(onError); },
    openWorkspace: () => { chooseWorkspace().then(props => props ? openWindow(props) : undefined).catch(onError); },
  };
}

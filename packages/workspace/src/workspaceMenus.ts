export { workspaceFileMenuItems } from "./menuItems";
import { chooseFolders, chooseWorkspace } from "./workspaceFiles";
import type { WorkspaceWindowProps } from "./workspaceState";

/** Handlers for the window-opening entries above; `openWindow` opens a document window with the given props. */
export function createWorkspaceMenuHandlers(openWindow: (props: WorkspaceWindowProps) => Promise<unknown>, onError: (error: unknown) => void) {
  return {
    newWindow: () => { openWindow({}).catch(onError); },
    openFolder: () => { chooseFolders().then(folders => folders.length > 0 ? openWindow({ folders }) : undefined).catch(onError); },
    openWorkspace: () => { chooseWorkspace().then(props => props ? openWindow(props) : undefined).catch(onError); },
  };
}

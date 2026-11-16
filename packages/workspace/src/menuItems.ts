import type { MenuItem } from "@legendapp/spark/menus";

/** File menu entries shared by document apps; dispatch `toggleSidebar` and `saveWorkspace` to the focused window. */
export const workspaceFileMenuItems: MenuItem[] = [
  { type: "action", id: "newWindow", label: "New Window", shortcut: "Cmd+Shift+n" },
  { type: "action", id: "openFolder", label: "Open Folder…" },
  { type: "action", id: "openWorkspace", label: "Open Workspace…" },
  { type: "action", id: "saveWorkspace", label: "Save Workspace" },
  { type: "separator" },
  { type: "action", id: "toggleSidebar", label: "Toggle Sidebar", shortcut: "Cmd+Ctrl+s" },
];

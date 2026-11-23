import type { MenuItem } from "@legendapp/spark/menus";

/** Menu items shared by document apps, placed by each app; dispatch `saveWorkspace` to the focused window. */
export const workspaceMenuItems = {
  newWindow: { type: "action", id: "newWindow", label: "New Window", shortcut: "Cmd+Shift+n" },
  openFolder: { type: "action", id: "openFolder", label: "Open Folder…" },
  openWorkspace: { type: "action", id: "openWorkspace", label: "Open Workspace…" },
  saveWorkspace: { type: "action", id: "saveWorkspace", label: "Save Workspace" },
} satisfies Record<string, MenuItem>;

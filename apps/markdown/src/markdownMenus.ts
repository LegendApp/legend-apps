import { observable } from "@legendapp/state";
import type { MenuState } from "@legend-apps/runtime-utils";
export const markdownMenuState$ = observable<Record<string, MenuState>>({});
import {
  type MenuRootItem,
} from "@legendapp/spark/menus";
import { macMenuPlacement, workspaceMenuItems } from "@legend-apps/workspace/menu-items";

// Spark merges this configuration into the native menu bar, which supplies the remaining system commands.
export const markdownMenuConfig: MenuRootItem[] = [
  { type: "submenu",
    id: "app",
    label: "Legend Markdown",
    target: { menu: "app" },
    items: [
      { type: "action",
        id: "settings",
        target: { role: "settings" }, label: "Settings…",
        },
    ],
  },
  { type: "submenu",
    id: "file",
    label: "File",
    target: { menu: "file" },
    placement: macMenuPlacement.file,
    items: [
      {
        id: "new",
        type: "action", target: { role: "new" }, label: "New", shortcut: "Cmd+n",
      },
      { type: "action", id: "newFile", label: "New File", disabled: true, placement: { after: { role: "new" } } },
      { type: "action", id: "newFolder", label: "New Folder", disabled: true, placement: { after: { id: "newFile" } } },
      { ...workspaceMenuItems.newWindow, placement: { after: { id: "newFolder" } } },
      { type: "action",
        id: "open",
        target: { role: "open" }, label: "Open…", shortcut: "Cmd+o",
        placement: { after: { id: "newWindow" } },
      },
      { type: "action", id: "addFolder", label: "Add Folder…", shortcut: "Cmd+Shift+o", placement: { after: { role: "open" } } },
      { ...workspaceMenuItems.openFolder, placement: { after: { id: "addFolder" } } },
      { ...workspaceMenuItems.openWorkspace, placement: { after: { id: "openFolder" } } },
      { type: "action",
        id: "save",
        target: { role: "save" }, label: "Save", shortcut: "Cmd+s",
        disabled: true,
      },
      { type: "action",
        id: "saveAs",
        target: { role: "saveAs" },
        label: "Save As…",
        disabled: true,
        shortcut: "Cmd+Shift+s",
      },
      // Close Tab takes the system Close item's ⌘W; Close Window moves to ⇧⌘W.
      { type: "action", id: "closeTab", target: { role: "close" }, label: "Close Tab", shortcut: "Cmd+w" },
      { type: "action", id: "closeWindow", label: "Close Window", shortcut: "Cmd+Shift+w", disabled: true, placement: { after: { role: "close" } } },
      { ...workspaceMenuItems.saveWorkspace, placement: { after: { role: "saveAs" } } },
      { type: "action",
        id: "revealInFinder",
        label: "Reveal in Finder",
        disabled: true,
        placement: { after: { id: "saveWorkspace" } },
      },
    ],
  },
  { type: "submenu",
    id: "edit",
    label: "Edit",
    target: { menu: "edit" },
    placement: macMenuPlacement.edit,
    items: [
      {
        id: "undo",
        type: "action", target: { role: "undo" }, label: "Undo", disabled: true,
      },
      {
        id: "redo",
        type: "action", target: { role: "redo" }, label: "Redo", disabled: true,
      },
      { id: "find", type: "action", label: "Find…", shortcut: "Cmd+f", placement: { before: { role: "selectAll" } }, disabled: true },
      { id: "selectAll", type: "action", target: { role: "selectAll" }, label: "Select All", shortcut: "Cmd+a", disabled: true },
    ],
  },
  { type: "submenu",
    id: "format",
    label: "Format",
    placement: { after: { menu: "edit" } },
    items: [
      {
        id: "bold",
        shortcut: "Cmd+b",
        type: "action", label: "Bold", disabled: true,
      },
      {
        id: "italic",
        shortcut: "Cmd+i",
        type: "action", label: "Italic", disabled: true,
      },
      {
        id: "underline",
        shortcut: "Cmd+u",
        type: "action", label: "Underline", disabled: true,
      },
      { type: "separator" },
      { type: "action",
        id: "strikethrough",
        label: "Strikethrough",
        disabled: true,
      },
      { type: "action",
        id: "spoiler",
        label: "Spoiler",
        disabled: true,
      },
      { type: "action",
        id: "link",
        label: "Link…",
        disabled: true,
        shortcut: "Cmd+k",
      },
    ],
  },
  { type: "submenu",
    id: "view",
    label: "View",
    target: { menu: "view" },
    placement: { after: { id: "format" } },
    items: [
      { type: "separator" },
      { id: "splitRight", type: "action", label: "Split Right", shortcut: "Cmd+d", disabled: true },
      { id: "splitDown", type: "action", label: "Split Down", shortcut: "Cmd+Shift+d", disabled: true },
      { id: "closePane", type: "action", label: "Close Pane", shortcut: "Cmd+Ctrl+w", disabled: true },
      { id: "closeOtherPanes", type: "action", label: "Close Other Panes", disabled: true },
      { id: "focusNextPane", type: "action", label: "Focus Next Pane", shortcut: "Cmd+Alt+Right", disabled: true },
      { id: "focusPreviousPane", type: "action", label: "Focus Previous Pane", shortcut: "Cmd+Alt+Left", disabled: true },
      { type: "separator" },
      { id: "assistant", type: "action", label: "Assistant", shortcut: "Cmd+Shift+a" },
      { type: "separator" },
      {
        id: "increaseFontSize",
        type: "action", label: "Increase Font Size", shortcut: "Cmd+=",
      },
      {
        id: "decreaseFontSize",
        type: "action", label: "Decrease Font Size", shortcut: "Cmd+-",
      },
      { type: "action",
        id: "resetFontSize",
        label: "Reset Font Size",
        shortcut: "Cmd+0",
      },
    ],
  },
];

// In the menu bar's order.
const modifierSymbols = [["Ctrl", "⌃"], ["Alt", "⌥"], ["Shift", "⇧"], ["Cmd", "⌘"]] as const;

/** A menu item's shortcut as the menu bar shows it, such as ⌘N. */
export function getMarkdownMenuShortcutLabel(id: string) {
  type MenuNode = { id?: string; items?: readonly MenuNode[]; shortcut?: string };
  const find = (items: readonly MenuNode[]): string | undefined => {
    for (const item of items) {
      const found = item.id === id ? item.shortcut : item.items && find(item.items);
      if (found) return found;
    }
    return undefined;
  };
  const parts = find(markdownMenuConfig as readonly MenuNode[])?.split("+") ?? [];
  const key = parts.pop() ?? "";
  return modifierSymbols.filter(([modifier]) => parts.includes(modifier)).map(([, symbol]) => symbol).join("") + key.toUpperCase();
}

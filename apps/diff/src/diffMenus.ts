import type { NativeMenuConfig } from "@legend-desktop/native-menu";
import { commandModifier } from "./appConstants";

export const diffMenuConfig: NativeMenuConfig[] = [
  {
    id: "app",
    title: "Application",
    systemMenu: "app",
    items: [
      {
        id: "settings",
        targetTitles: ["Settings...", "Settings…", "Preferences...", "Preferences…"],
        enabled: true,
      },
    ],
  },
  {
    id: "file",
    title: "File",
    placement: { before: "Window" },
    items: [
      {
        id: "hideNew",
        targetTitle: "New",
        hidden: true,
      },
      {
        id: "openFolder",
        title: "Open Folder...",
        targetTitles: ["Open", "Open...", "Open…", "Open Folder", "Open Folder...", "Open Folder…"],
        enabled: true,
        shortcut: { key: "o", modifiers: commandModifier },
      },
      {
        id: "hideSave",
        targetTitles: ["Save", "Save...", "Save…"],
        hidden: true,
      },
      {
        id: "hideSaveAs",
        targetTitles: ["Save As", "Save As...", "Save As…"],
        hidden: true,
      },
    ],
  },
];

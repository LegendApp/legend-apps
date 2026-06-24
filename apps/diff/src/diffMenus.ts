import {
  commandModifier,
  openTargetTitles,
  optionModifier,
  saveAsTargetTitles,
  saveTargetTitles,
  settingsTargetTitles,
  type NativeMenuConfig,
} from "@legend-desktop/native-menu";

export const diffMenuConfig: NativeMenuConfig[] = [
  {
    id: "app",
    title: "Application",
    systemMenu: "app",
    items: [
      {
        id: "settings",
        targetTitles: settingsTargetTitles,
        enabled: true,
      },
      { separator: true, id: "separator-app-updates" },
      {
        id: "checkForUpdates",
        title: "Check for Updates...",
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
        targetTitles: [...openTargetTitles, "Open Folder", "Open Folder...", "Open Folder…"],
        enabled: true,
        shortcut: { key: "o", modifiers: commandModifier },
      },
      {
        id: "reload",
        title: "Reload",
        enabled: false,
        shortcut: { key: "r", modifiers: commandModifier },
      },
      {
        id: "revealInFinder",
        title: "Reveal in Finder",
        enabled: false,
      },
      { separator: true, id: "separator-file-readonly" },
      {
        id: "hideSave",
        targetTitles: saveTargetTitles,
        hidden: true,
      },
      {
        id: "hideSaveAs",
        targetTitles: saveAsTargetTitles,
        hidden: true,
      },
    ],
  },
  {
    id: "view",
    title: "View",
    placement: { before: "Window" },
    items: [
      {
        id: "toggleSidebar",
        title: "Show Sidebar",
        enabled: false,
        shortcut: { key: "s", modifiers: commandModifier | optionModifier },
      },
      { separator: true, id: "separator-view-mode" },
      {
        id: "viewUnified",
        title: "Unified",
        checked: true,
        enabled: false,
        shortcut: { key: "1", modifiers: commandModifier },
      },
      {
        id: "viewBlocks",
        title: "Blocks",
        checked: false,
        enabled: false,
        shortcut: { key: "2", modifiers: commandModifier },
      },
    ],
  },
];

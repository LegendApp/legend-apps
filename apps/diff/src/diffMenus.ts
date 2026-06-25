import {
  commandModifier,
  openTargetTitles,
  optionModifier,
  saveAsTargetTitles,
  saveTargetTitles,
  settingsTargetTitles,
  shiftModifier,
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
        id: "openFromClipboard",
        title: "Open from Clipboard",
        enabled: true,
        placement: { before: "Open Recent" },
        shortcut: { key: "o", modifiers: commandModifier | shiftModifier },
      },
      {
        id: "hidePageSetup",
        targetTitles: ["Page Setup...", "Page Setup…"],
        hidden: true,
      },
      {
        id: "hidePrint",
        targetTitles: ["Print...", "Print…"],
        hidden: true,
      },
      { separator: true, id: "separator-file-diff", placement: { before: "Close" } },
      {
        id: "reload",
        title: "Reload",
        enabled: false,
        placement: { before: "Close" },
        shortcut: { key: "r", modifiers: commandModifier },
      },
      {
        id: "revealInFinder",
        title: "Reveal in Finder",
        enabled: false,
        placement: { before: "Close" },
      },
      { separator: true, id: "separator-file-copy", placement: { before: "Close" } },
      {
        id: "copySource",
        title: "Copy Source",
        enabled: false,
        placement: { before: "Close" },
        shortcut: { key: "c", modifiers: commandModifier | optionModifier },
      },
      {
        id: "copyFilePath",
        title: "Copy File Path",
        enabled: false,
        placement: { before: "Close" },
      },
      {
        id: "copyRelativePath",
        title: "Copy Relative Path",
        enabled: false,
        placement: { before: "Close" },
        shortcut: { key: "c", modifiers: commandModifier | optionModifier | shiftModifier },
      },
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
        targetTitles: ["Show Sidebar", "Hide Sidebar"],
        enabled: false,
        shortcut: { key: "s", modifiers: commandModifier | optionModifier },
      },
      {
        id: "filterFiles",
        title: "Filter Files",
        enabled: false,
        placement: { after: "Show Sidebar" },
        shortcut: { key: "f", modifiers: commandModifier },
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

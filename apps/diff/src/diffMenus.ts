import {
  commandModifier,
  openTargetTitles,
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
];

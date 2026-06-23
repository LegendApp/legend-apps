import {
  commandModifier,
  openTargetTitles,
  saveTargetTitles,
  settingsTargetTitles,
  shiftModifier,
  type NativeMenuConfig,
} from "@legend-desktop/native-menu";

export const markdownMenuConfig: NativeMenuConfig[] = [
  {
    id: "file",
    title: "File",
    placement: { before: "Window" },
    items: [
      {
        id: "new",
        targetTitle: "New",
        enabled: true,
        shortcut: { key: "n", modifiers: commandModifier },
      },
      {
        id: "open",
        targetTitles: openTargetTitles,
        enabled: true,
      },
      {
        id: "save",
        targetTitles: saveTargetTitles,
        enabled: false,
      },
      {
        id: "saveAs",
        title: "Save As...",
        enabled: false,
        shortcut: { key: "s", modifiers: commandModifier | shiftModifier },
      },
      { separator: true, id: "separator-file-location" },
      {
        id: "revealInFinder",
        title: "Reveal in Finder",
        enabled: false,
      },
    ],
  },
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
    id: "edit",
    title: "Edit",
    placement: { before: "Window" },
    items: [
      {
        id: "undo",
        targetTitle: "Undo",
        enabled: false,
      },
      {
        id: "redo",
        targetTitle: "Redo",
        enabled: false,
      },
    ],
  },
  {
    id: "format",
    title: "Format",
    items: [
      {
        id: "bold",
        targetPath: ["Font", "Bold"],
        enabled: false,
      },
      {
        id: "italic",
        targetPath: ["Font", "Italic"],
        enabled: false,
      },
      {
        id: "underline",
        targetPath: ["Font", "Underline"],
        enabled: false,
      },
      { separator: true, id: "separator-markdown-formatting" },
      {
        id: "strikethrough",
        title: "Strikethrough",
        enabled: false,
      },
      {
        id: "spoiler",
        title: "Spoiler",
        enabled: false,
      },
      {
        id: "link",
        title: "Link...",
        enabled: false,
        shortcut: { key: "k", modifiers: commandModifier },
      },
      { separator: true, id: "separator-markdown-appearance" },
      {
        id: "increaseFontSize",
        targetPath: ["Font", "Bigger"],
        enabled: true,
        shortcut: { key: "=", modifiers: commandModifier },
      },
      {
        id: "decreaseFontSize",
        targetPath: ["Font", "Smaller"],
        enabled: true,
        shortcut: { key: "-", modifiers: commandModifier },
      },
      {
        id: "resetFontSize",
        title: "Reset Font Size",
        enabled: true,
        shortcut: { key: "0", modifiers: commandModifier },
      },
    ],
  },
];

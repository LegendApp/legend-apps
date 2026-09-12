import { commandModifier, openTargetTitles, saveTargetTitles, saveAsTargetTitles, settingsTargetTitles, type NativeMenuConfig } from "@legend-apps/native-menu";

export const codeMenuConfig: NativeMenuConfig[] = [
  {
    id: "editor", title: "Editor", placement: { before: "Window" }, items: [
      { id: "automaticPairs", title: "Automatic Bracket and Quote Pairs", enabled: true, checked: true },
      { id: "goToLine", title: "Go to Line…", enabled: true, shortcut: { key: "l", modifiers: commandModifier } },
      { id: "indent", title: "Indent Lines", enabled: true, shortcut: { key: "]", modifiers: commandModifier } },
      { id: "outdent", title: "Outdent Lines", enabled: true, shortcut: { key: "[", modifiers: commandModifier } },
      { id: "toggleComment", title: "Toggle Line Comments", enabled: true, shortcut: { key: "/", modifiers: commandModifier } },
      { id: "duplicateLine", title: "Duplicate Lines", enabled: true, shortcut: { key: "d", modifiers: commandModifier | (1 << 17) } },
      { id: "moveLineUp", title: "Move Lines Up", enabled: true, shortcut: { key: "\uF700", modifiers: 1 << 19 } },
      { id: "moveLineDown", title: "Move Lines Down", enabled: true, shortcut: { key: "\uF701", modifiers: 1 << 19 } },
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
    id: "file",
    title: "File",
    placement: { before: "Window" },
    items: [
      {
        id: "open",
        targetTitles: openTargetTitles,
        enabled: true,
        shortcut: { key: "o", modifiers: commandModifier },
      },
      { id: "save", targetTitles: saveTargetTitles, enabled: true, shortcut: { key: "s", modifiers: commandModifier } },
      { id: "saveAs", targetTitles: saveAsTargetTitles, enabled: true, shortcut: { key: "s", modifiers: commandModifier | (1 << 17) } },
    ],
  },
];

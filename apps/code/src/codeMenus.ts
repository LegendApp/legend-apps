import { commandModifier, openTargetTitles, settingsTargetTitles, type NativeMenuConfig } from "@legend-desktop/native-menu";

export const codeMenuConfig: NativeMenuConfig[] = [
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
    ],
  },
];

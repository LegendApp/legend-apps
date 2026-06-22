import type { NativeMenuConfig } from "@legend-desktop/native-menu";
import { commandModifier } from "./appConstants";

export const codeMenuConfig: NativeMenuConfig[] = [
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
        id: "open",
        targetTitles: ["Open", "Open...", "Open…"],
        enabled: true,
        shortcut: { key: "o", modifiers: commandModifier },
      },
    ],
  },
];

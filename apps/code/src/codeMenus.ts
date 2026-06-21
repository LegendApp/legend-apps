import type { NativeMenuConfig } from "@legend-desktop/native-menu";
import { commandModifier } from "./appConstants";

export const codeMenuConfig: NativeMenuConfig[] = [
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

import type { NativeMenuConfig } from "@legend-desktop/native-menu";
import { commandModifier } from "./appConstants";

export const diffMenuConfig: NativeMenuConfig[] = [
  {
    id: "file",
    title: "File",
    placement: { before: "Window" },
    items: [
      {
        id: "openFolder",
        targetTitles: ["Open Folder", "Open Folder..."],
        enabled: true,
        shortcut: { key: "o", modifiers: commandModifier },
      },
    ],
  },
];

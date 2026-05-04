import type { NativeMenuConfig } from "@legend-desktop/native-menu";
import { commandModifier, shiftModifier } from "./appConstants";

export const markdownMenuConfig: NativeMenuConfig[] = [
  {
    id: "file",
    title: "File",
    placement: { before: "Window" },
    items: [
      {
        id: "open",
        targetTitle: "Open...",
        enabled: true,
      },
      {
        id: "save",
        targetTitle: "Save...",
        enabled: false,
      },
      {
        id: "saveAs",
        title: "Save As...",
        enabled: false,
        shortcut: { key: "s", modifiers: commandModifier | shiftModifier },
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
        targetTitles: ["Settings...", "Settings…", "Preferences...", "Preferences…"],
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
    ],
  },
];

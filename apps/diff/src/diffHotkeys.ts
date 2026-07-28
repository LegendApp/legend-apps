import {
  KeyCodes,
  createHotkeyRouter,
  getDefaultHotkeyBindings,
  hotkeyToMenuShortcut,
  type HotkeyDefinition,
  type HotkeyScope,
  type HotkeyValue,
} from "@legend-apps/hotkeys";
import { createHotkeyStore } from "@legend-apps/hotkeys/storage";
import type { NativeMenuItemPatch } from "@legend-apps/native-menu";
import { batch } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";

const command = KeyCodes.MODIFIER_COMMAND;
const option = KeyCodes.MODIFIER_OPTION;
const shift = KeyCodes.MODIFIER_SHIFT;

function binding(...keyCodes: number[]) {
  return keyCodes.join("+") as HotkeyValue;
}

export const diffHotkeyDefinitions = [
  {
    defaultBindings: [binding(command, KeyCodes.KEY_N)],
    defaultValue: binding(command, KeyCodes.KEY_N),
    description: "Open another Diff window.",
    id: "startWindow",
    title: "New Window",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_O)],
    defaultValue: binding(command, KeyCodes.KEY_O),
    description: "Choose a repository or folder to compare.",
    id: "openFolder",
    title: "Open Folder",
  },
  {
    defaultBindings: [binding(command, option, KeyCodes.KEY_O)],
    defaultValue: binding(command, option, KeyCodes.KEY_O),
    description: "Choose two files to compare.",
    id: "compareFiles",
    title: "Compare Files",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_L)],
    defaultValue: binding(command, KeyCodes.KEY_L),
    description: "Open a GitHub or diff URL.",
    id: "openUrl",
    title: "Open URL",
  },
  {
    defaultBindings: [binding(command, shift, KeyCodes.KEY_O)],
    defaultValue: binding(command, shift, KeyCodes.KEY_O),
    description: "Open a supported path or URL from the clipboard.",
    id: "openFromClipboard",
    title: "Open from Clipboard",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_R)],
    defaultValue: binding(command, KeyCodes.KEY_R),
    description: "Reload the active diff source.",
    id: "reload",
    title: "Reload",
  },
  {
    defaultBindings: [binding(command, option, KeyCodes.KEY_C)],
    defaultValue: binding(command, option, KeyCodes.KEY_C),
    description: "Copy the active repository, file, or URL source.",
    id: "copySource",
    title: "Copy Source",
  },
  {
    defaultBindings: [binding(command, option, shift, KeyCodes.KEY_C)],
    defaultValue: binding(command, option, shift, KeyCodes.KEY_C),
    description: "Copy the selected file path relative to its repository.",
    id: "copyRelativePath",
    title: "Copy Relative Path",
  },
  {
    defaultBindings: [binding(command, option, KeyCodes.KEY_S)],
    defaultValue: binding(command, option, KeyCodes.KEY_S),
    description: "Show or hide the file sidebar.",
    id: "toggleSidebar",
    title: "Toggle Sidebar",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_F)],
    defaultValue: binding(command, KeyCodes.KEY_F),
    description: "Focus the file filter in the active Diff window.",
    id: "filterFiles",
    title: "Search Files",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_1)],
    defaultValue: binding(command, KeyCodes.KEY_1),
    description: "Switch the active Diff window to unified view.",
    id: "viewUnified",
    title: "Unified View",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_2)],
    defaultValue: binding(command, KeyCodes.KEY_2),
    description: "Switch the active Diff window to side-by-side view.",
    id: "viewBlocks",
    title: "Side-by-Side View",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_LEFT_BRACKET)],
    defaultValue: binding(command, KeyCodes.KEY_LEFT_BRACKET),
    description: "Scroll to the previous changed hunk.",
    id: "previousHunk",
    title: "Previous Hunk",
  },
  {
    defaultBindings: [binding(command, KeyCodes.KEY_RIGHT_BRACKET)],
    defaultValue: binding(command, KeyCodes.KEY_RIGHT_BRACKET),
    description: "Scroll to the next changed hunk.",
    id: "nextHunk",
    title: "Next Hunk",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

export type DiffHotkeyId = (typeof diffHotkeyDefinitions)[number]["id"];

export const diffHotkeyRouter = createHotkeyRouter();
export const diffApplicationHotkeyScope: HotkeyScope = { kind: "application" };

export const diffHotkeys$ = createHotkeyStore({
  definitions: diffHotkeyDefinitions,
  filename: "hotkeys",
  maxBindingsPerCommand: 1,
});

export function useDiffHotkeyBindings() {
  return useValue(diffHotkeys$.bindings);
}

export function useDiffHotkeyBindingsSnapshot() {
  return useValue(() => {
    const snapshot = {} as Record<DiffHotkeyId, readonly HotkeyValue[]>;
    for (const definition of diffHotkeyDefinitions) {
      snapshot[definition.id] = [...diffHotkeys$.bindings[definition.id].get()];
    }
    return snapshot;
  });
}

export function setDiffHotkeyBindings(id: DiffHotkeyId, bindings: readonly HotkeyValue[]) {
  diffHotkeys$.bindings[id].set(bindings.slice(0, 1));
}

export function resetDiffHotkeyBindings() {
  batch(() => {
    for (const definition of diffHotkeyDefinitions) {
      diffHotkeys$.bindings[definition.id].set([...getDefaultHotkeyBindings(definition)]);
    }
  });
}

export function getDiffHotkeyMenuPatches(
  bindings: Record<DiffHotkeyId, readonly HotkeyValue[]>,
): NativeMenuItemPatch[] {
  return diffHotkeyDefinitions.map((definition) => ({
    id: definition.id,
    shortcut: bindings[definition.id]
      .map(hotkeyToMenuShortcut)
      .find((shortcut) => shortcut !== null) ?? null,
  }));
}

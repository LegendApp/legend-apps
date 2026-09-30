import {
  createHotkeyRouter,
  getDefaultHotkeyBindings,
  normalizeHotkeyFile,
  type HotkeyDefinition,
  type HotkeyScope,
  type HotkeyValue,
} from "@legendapp/spark/shortcuts/commands";
import { createObservableFile } from "@legend-apps/storage";

import { batch } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";




export const diffHotkeyDefinitions = [
  {
    defaultBindings: ["Cmd+N"],
    description: "Open another Diff window.",
    id: "startWindow",
    title: "New Window",
  },
  {
    defaultBindings: ["Cmd+O"],
    description: "Choose a repository or folder to compare.",
    id: "openFolder",
    title: "Open Folder",
  },
  {
    defaultBindings: ["Cmd+Alt+O"],
    description: "Choose two files to compare.",
    id: "compareFiles",
    title: "Compare Files",
  },
  {
    defaultBindings: ["Cmd+L"],
    description: "Open a GitHub or diff URL.",
    id: "openUrl",
    title: "Open URL",
  },
  {
    defaultBindings: ["Cmd+Shift+O"],
    description: "Open a supported path or URL from the clipboard.",
    id: "openFromClipboard",
    title: "Open from Clipboard",
  },
  {
    defaultBindings: ["Cmd+R"],
    description: "Reload the active diff source.",
    id: "reload",
    title: "Reload",
  },
  {
    defaultBindings: ["Cmd+Alt+C"],
    description: "Copy the active repository, file, or URL source.",
    id: "copySource",
    title: "Copy Source",
  },
  {
    defaultBindings: ["Cmd+Alt+Shift+C"],
    description: "Copy the selected file path relative to its repository.",
    id: "copyRelativePath",
    title: "Copy Relative Path",
  },
  {
    defaultBindings: ["Cmd+Alt+S"],
    description: "Show or hide the file sidebar.",
    id: "toggleSidebar",
    title: "Toggle Sidebar",
  },
  {
    defaultBindings: ["Cmd+F"],
    description: "Focus the file filter in the active Diff window.",
    id: "filterFiles",
    title: "Search Files",
  },
  {
    defaultBindings: ["Cmd+1"],
    description: "Switch the active Diff window to unified view.",
    id: "viewUnified",
    title: "Unified View",
  },
  {
    defaultBindings: ["Cmd+2"],
    description: "Switch the active Diff window to side-by-side view.",
    id: "viewBlocks",
    title: "Side-by-Side View",
  },
  {
    defaultBindings: ["Cmd+["],
    description: "Scroll to the previous changed hunk.",
    id: "previousHunk",
    title: "Previous Hunk",
  },
  {
    defaultBindings: ["Cmd+]"],
    description: "Scroll to the next changed hunk.",
    id: "nextHunk",
    title: "Next Hunk",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

export type DiffHotkeyId = (typeof diffHotkeyDefinitions)[number]["id"];

export const diffHotkeyRouter = createHotkeyRouter();
export const diffApplicationHotkeyScope: HotkeyScope = { kind: "application" };

export const diffHotkeys$ = createObservableFile({
  initialValue: normalizeHotkeyFile(undefined, diffHotkeyDefinitions, { maxBindingsPerCommand: 1 }),
  transform: { load: value => normalizeHotkeyFile(value, diffHotkeyDefinitions, { maxBindingsPerCommand: 1 }) },
  filename: "hotkeys",
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
) {
  return diffHotkeyDefinitions.map((definition) => ({
    id: definition.id,
    shortcut: bindings[definition.id][0],
  }));
}

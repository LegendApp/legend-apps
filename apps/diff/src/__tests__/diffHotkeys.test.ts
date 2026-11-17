import { getDefaultHotkeyBindings, type HotkeyValue } from "@legendapp/spark/shortcuts/commands";
import {
  diffHotkeys$,
  diffHotkeyDefinitions,
  getDiffHotkeyMenuPatches,
  loadDiffHotkeyFile,
  setDiffHotkeyBindings,
  type DiffHotkeyId,
} from "../diffHotkeys";

function defaultBindings() {
  return Object.fromEntries(diffHotkeyDefinitions.map((definition) => [
    definition.id,
    getDefaultHotkeyBindings(definition),
  ])) as Record<DiffHotkeyId, readonly HotkeyValue[]>;
}

describe("Diff hotkeys", () => {
  it("loads a missing, unversioned or invalid hotkeys file without throwing", () => {
    const defaults = loadDiffHotkeyFile(undefined);
    expect(defaults.bindings.changeStory).toEqual(["Cmd+Shift+S"]);
    expect(loadDiffHotkeyFile({})).toEqual(defaults);
    expect(loadDiffHotkeyFile({ bindings: { reload: ["Cmd+Shift+R"] } }).bindings.reload).toEqual(["Cmd+Shift+R"]);
    expect(loadDiffHotkeyFile({ version: 1, bindings: { reload: ["Cmd+Alt+R"] } }).bindings.reload).toEqual(["Cmd+Alt+R"]);
    expect(loadDiffHotkeyFile({ version: 1, bindings: { reload: "nonsense" } })).toEqual(defaults);
  });

  it("uses the primary representable binding for each native menu item", () => {
    const bindings = defaultBindings();
    bindings.nextHunk = [
      "Cmd+ArrowDown",
    ];

    const patches = getDiffHotkeyMenuPatches(bindings);

    expect(patches).toHaveLength(diffHotkeyDefinitions.length);
    expect(patches).toContainEqual({
      id: "nextHunk",
      shortcut: "Cmd+ArrowDown",
    });
    expect(patches).toContainEqual({
      id: "previousHunk",
      shortcut: "Cmd+[",
    });
  });

  it("clears a menu shortcut when a command has no bindings", () => {
    const bindings = defaultBindings();
    bindings.reload = [];

    expect(getDiffHotkeyMenuPatches(bindings)).toContainEqual({
      id: "reload",
      shortcut: undefined,
    });
  });

  it("clears a configured shortcut in the observable store", () => {
    const previousBindings = diffHotkeys$.bindings.reload.peek();

    try {
      setDiffHotkeyBindings("reload", []);
      expect(diffHotkeys$.bindings.reload.peek()).toEqual([]);
    } finally {
      setDiffHotkeyBindings("reload", previousBindings);
    }
  });
});

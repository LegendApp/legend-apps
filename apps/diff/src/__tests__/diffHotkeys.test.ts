import { getDefaultHotkeyBindings, type HotkeyValue } from "@legendapp/spark/shortcuts/commands";
import {
  diffHotkeys$,
  diffHotkeyDefinitions,
  getDiffHotkeyMenuPatches,
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

import { getDefaultHotkeyBindings, KeyCodes, type HotkeyValue } from "@legend-apps/hotkeys";
import {
  diffHotkeyDefinitions,
  getDiffHotkeyMenuPatches,
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
      KeyCodes.KEY_MEDIA_NEXT,
      `${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.KEY_DOWN}`,
    ];

    const patches = getDiffHotkeyMenuPatches(bindings);

    expect(patches).toHaveLength(diffHotkeyDefinitions.length);
    expect(patches).toContainEqual({
      id: "nextHunk",
      shortcut: { key: String.fromCharCode(0xf701), modifiers: KeyCodes.MODIFIER_COMMAND },
    });
    expect(patches).toContainEqual({
      id: "previousHunk",
      shortcut: { key: "[", modifiers: KeyCodes.MODIFIER_COMMAND },
    });
  });

  it("clears a menu shortcut when a command has no bindings", () => {
    const bindings = defaultBindings();
    bindings.reload = [];

    expect(getDiffHotkeyMenuPatches(bindings)).toContainEqual({
      id: "reload",
      shortcut: null,
    });
  });
});

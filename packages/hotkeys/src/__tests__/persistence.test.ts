import {
  KeyCodes,
  getHotkeyBindingConflicts,
  hotkeyFileVersion,
  normalizeHotkeyFile,
  serializeHotkeyFile,
  serializeHotkeyFilePatch,
  type HotkeyDefinition,
} from "../index";

const definitions = [
  {
    defaultBindings: [KeyCodes.KEY_A],
    defaultValue: KeyCodes.KEY_A,
    id: "open",
    title: "Open",
  },
  {
    defaultBindings: [KeyCodes.KEY_S],
    defaultValue: KeyCodes.KEY_S,
    id: "save",
    title: "Save",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

describe("hotkey persistence", () => {
  it("migrates legacy scalar and display-formatted values into binding arrays", () => {
    const normalized = normalizeHotkeyFile({
      open: `${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.KEY_O}`,
      save: "⌥+S",
    }, definitions);

    expect(normalized).toEqual({
      bindings: {
        open: [`${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.KEY_O}`],
        save: [`${KeyCodes.MODIFIER_OPTION}+${KeyCodes.KEY_S}`],
      },
      version: hotkeyFileVersion,
    });
  });

  it("serializes stable symbolic names and reads them back", () => {
    const normalized = normalizeHotkeyFile({
      bindings: {
        open: ["Command+KeyO", "Command+KeyO"],
        save: ["Option+KeyS", "Code999"],
      },
      version: 1,
    }, definitions);
    const serialized = serializeHotkeyFile(normalized, definitions);

    expect(serialized).toEqual({
      bindings: {
        open: ["Command+KeyO"],
        save: ["Option+KeyS", "Code999"],
      },
      version: 1,
    });
    expect(normalizeHotkeyFile(serialized, definitions)).toEqual(normalized);
  });

  it("fills missing commands from defaults while preserving explicitly empty bindings", () => {
    expect(normalizeHotkeyFile({ bindings: { open: [] }, version: 1 }, definitions)).toEqual({
      bindings: {
        open: [],
        save: [KeyCodes.KEY_S],
      },
      version: 1,
    });
  });

  it("limits loaded and default bindings when a command supports one shortcut", () => {
    expect(normalizeHotkeyFile({
      bindings: {
        open: ["KeyA", "KeyB"],
      },
      version: 1,
    }, definitions, { maxBindingsPerCommand: 1 })).toEqual({
      bindings: {
        open: [`${KeyCodes.KEY_A}`],
        save: [KeyCodes.KEY_S],
      },
      version: 1,
    });
  });

  it("preserves the path of a partial binding update", () => {
    expect(serializeHotkeyFilePatch({
      bindings: {
        save: [KeyCodes.KEY_A, KeyCodes.KEY_S],
      },
    }, definitions, { maxBindingsPerCommand: 1 })).toEqual({
      bindings: {
        save: ["KeyA"],
      },
    });

    expect(serializeHotkeyFilePatch({
      bindings: {
        save: [],
      },
    }, definitions, { maxBindingsPerCommand: 1 })).toEqual({
      bindings: {
        save: [],
      },
    });
  });

  it("reports conflicts across commands", () => {
    const conflicts = getHotkeyBindingConflicts(definitions, {
      open: [KeyCodes.KEY_A],
      save: [KeyCodes.KEY_A],
    });

    expect(conflicts.get(`${KeyCodes.KEY_A}`)).toEqual(["open", "save"]);
  });
});

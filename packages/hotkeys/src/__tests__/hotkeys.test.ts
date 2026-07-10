import { KeyCodes, matchesHotkey, parseHotkey } from "../index";

function keyboardEvent(keyCode: number, modifiers = 0) {
  return {
    keyCode,
    modifiers,
  };
}

describe("matchesHotkey", () => {
  it("does not confuse low numeric virtual key codes with digit labels", () => {
    expect(parseHotkey(KeyCodes.KEY_A)).toEqual([KeyCodes.KEY_A]);
    expect(parseHotkey(KeyCodes.KEY_S)).toEqual([KeyCodes.KEY_S]);
    expect(parseHotkey(KeyCodes.KEY_1)).toEqual([KeyCodes.KEY_1]);
  });

  it("ignores the implicit function modifier on navigation keys", () => {
    const implicitArrowModifiers = KeyCodes.MODIFIER_FUNCTION | 0x100;

    expect(matchesHotkey(keyboardEvent(KeyCodes.KEY_UP, implicitArrowModifiers), KeyCodes.KEY_UP)).toBe(true);
    expect(matchesHotkey(keyboardEvent(KeyCodes.KEY_DOWN, implicitArrowModifiers), KeyCodes.KEY_DOWN)).toBe(true);
  });

  it("preserves explicit modifier matching for navigation keys", () => {
    const implicitArrowModifiers = KeyCodes.MODIFIER_FUNCTION | 0x100;

    expect(
      matchesHotkey(
        keyboardEvent(KeyCodes.KEY_UP, implicitArrowModifiers | KeyCodes.MODIFIER_SHIFT),
        `${KeyCodes.MODIFIER_SHIFT}+${KeyCodes.KEY_UP}`,
      ),
    ).toBe(true);
    expect(
      matchesHotkey(
        keyboardEvent(KeyCodes.KEY_UP, implicitArrowModifiers),
        `${KeyCodes.MODIFIER_SHIFT}+${KeyCodes.KEY_UP}`,
      ),
    ).toBe(false);
  });

  it("still requires explicit function when a hotkey is configured with function", () => {
    expect(
      matchesHotkey(
        keyboardEvent(KeyCodes.KEY_UP, KeyCodes.MODIFIER_FUNCTION),
        `${KeyCodes.MODIFIER_FUNCTION}+${KeyCodes.KEY_UP}`,
      ),
    ).toBe(true);
    expect(
      matchesHotkey(
        keyboardEvent(KeyCodes.KEY_UP),
        `${KeyCodes.MODIFIER_FUNCTION}+${KeyCodes.KEY_UP}`,
      ),
    ).toBe(false);
  });
});

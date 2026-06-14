import { KeyCodes, matchesHotkey } from "../index";

function keyboardEvent(keyCode: number, modifiers = 0) {
  return {
    keyCode,
    modifiers,
  };
}

describe("matchesHotkey", () => {
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

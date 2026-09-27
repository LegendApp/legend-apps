import { expect, test } from "bun:test";
import { createKeyText } from "../src/systems/keyboard/keyText";

test("saved shortcut labels retain letters, numbers, arrows, punctuation, and modifiers", () => {
  const labels = createKeyText({KEY_A: 0, KEY_S: 1, KEY_1: 18, KEY_LEFT: 123, KEY_RETURN: 36, KEY_COMMA: 43, MODIFIER_COMMAND: 1048576});
  expect([labels[0], labels[1], labels[18], labels[123], labels[36], labels[43], labels[1048576]])
    .toEqual(["A", "S", "1", "←", "↩", ",", "⌘"]);
});

import { loadHotkeys } from "../src/systems/keyboard/hotkeySerialization";
test("numeric defaults remain native codes while persisted labels and chords decode", () => {
  const codes = {F: "3", "3": "20", A: "0", "⌘": "1048576", "1": "18", "←": "123"};
  expect(loadHotkeys({numeric: 3, zero: 0, letter: "F", digit: "3", chord: "⌘+1", arrow: "←"}, text => codes[text] ?? text))
    .toEqual({numeric: 3, zero: 0, letter: "3", digit: "20", chord: "1048576+18", arrow: "123"});
});

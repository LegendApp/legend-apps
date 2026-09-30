import { expect, mock, test } from "bun:test";
import { ownRegistration } from "../../../packages/runtime-utils/src/ownRegistration";
mock.module("@legend-apps/runtime-utils", () => ({ ownRegistration }));
import { observable } from "@legendapp/state";
const bindings$ = observable({Help: 0});
const state$ = observable({showSettings: false, listeningForKeyPress: false});
mock.module("../src/settings/Hotkeys", () => ({
  getHotkey: name => bindings$[name].get(),
  getHotkeyMetadata: () => ({description: "Test shortcut"}),
}));
mock.module("../src/systems/State", () => ({state$}));
mock.module("../src/systems/keyboard/KeyboardManager", () => ({
  addKeyboardListener: async () => ({ remove: async () => {} }), KeyText: {}, KeyCodes: {MODIFIER_COMMAND: 1048576, MODIFIER_SHIFT: 131072, MODIFIER_OPTION: 524288, MODIFIER_CONTROL: 262144},
}));
const {onHotkeys, keysPressed$} = await import("../src/systems/keyboard/Keyboard");
test("shortcuts accept key code zero, update live, match modifiers, and clean up", () => {
  let calls = 0;
  const dispose = onHotkeys({Help: () => calls++});
  keysPressed$.set({0: true});
  expect(calls).toBe(1);
  keysPressed$.set({0: true, 1: true});
  expect(calls).toBe(1);
  keysPressed$.set({});
  bindings$.Help.set(2);
  keysPressed$.set({0: true});
  expect(calls).toBe(1);
  keysPressed$.set({2: true, 1048576: true});
  expect(calls).toBe(1);
  keysPressed$.set({});
  keysPressed$.set({2: true});
  expect(calls).toBe(2);
  dispose();
  keysPressed$.set({});
  keysPressed$.set({2: true});
  expect(calls).toBe(2);
  keysPressed$.set({});
});

test("the first shortcut press after closing Settings is not lost", () => {
  bindings$.Help.set(43);
  keysPressed$.set({});
  state$.showSettings.set(false);
  let opened = 0;
  const dispose = onHotkeys({Help: () => { opened++; state$.showSettings.set(true); }});
  keysPressed$.set({43: true});
  expect(opened).toBe(1);
  keysPressed$.set({}); // Key-up arrives while Settings is open.
  state$.showSettings.set(false);
  keysPressed$.set({43: true});
  expect(opened).toBe(2);
  dispose();
  keysPressed$.set({});
  state$.showSettings.set(false);
});

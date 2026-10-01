import { expect, mock, test } from "bun:test";
import { ownRegistration } from "../../../packages/runtime-utils/src/ownRegistration";
import { observable } from "@legendapp/state";
const bindings$ = observable({ Help: "A" });
const state$ = observable({ showSettings: false });
const registrations = new Set();
mock.module("@legend-apps/runtime-utils", () => ({ ownRegistration }));
mock.module("../src/settings/Hotkeys", () => ({
  getHotkey: name => bindings$[name].get(), hotkeys$: bindings$,
  getHotkeyMetadata: () => ({ description: "Test shortcut", repeat: true }),
}));
mock.module("../src/systems/State", () => ({ state$ }));
mock.module("@legendapp/spark/shortcuts/commands", () => ({
  formatHotkey: value => value,
  useRoutedHotkeys: () => {},
  createHotkeyRouter: () => ({ register: async options => {
    const registration = { ...options }; registrations.add(registration);
    return { setEnabled: async enabled => { registration.enabled = enabled; }, remove: async () => { registrations.delete(registration); } };
  } }),
}));
const { onHotkeys } = await import("../src/systems/keyboard/Keyboard");
const settled = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
test("plugin shortcuts publish portable bindings, follow settings, and release ownership", async () => {
  let calls = 0;
  const dispose = onHotkeys({ Help: () => calls++ });
  await settled();
  let registration = [...registrations][0];
  expect(registration.scope).toEqual({ kind: "window", windowId: "main" });
  expect(registration.definitions[0]).toMatchObject({ defaultBindings: ["A"], repeat: true });
  registration.handlers.Help(); expect(calls).toBe(1);
  bindings$.Help.set("Cmd+1"); await settled();
  expect(registrations.size).toBe(1);
  registration = [...registrations][0];
  expect(registration.definitions[0].defaultBindings).toEqual(["Cmd+1"]);
  state$.showSettings.set(true); await settled(); expect(registration.enabled).toBe(false);
  state$.showSettings.set(false); await settled(); expect(registration.enabled).toBe(true);
  dispose(); expect(registration.handlers.Help()).toBe(false); expect(calls).toBe(1);
  await settled(); expect(registrations.size).toBe(0);
});
test("late plugin setup is removed if ownership ends before readiness", async () => {
  const dispose = onHotkeys({ Help() {} }); dispose();
  await settled(); expect(registrations.size).toBe(0);
});

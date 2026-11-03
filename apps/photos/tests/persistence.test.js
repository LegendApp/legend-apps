import { expect, mock, test } from "bun:test";
const legacyHotkeys = {Left: "←", Right: 124, Down: 125, "Decrease Columns": 27, "Increase Columns": 24, "Open Photo": 36, "Close Photo": 53, "Close Photo-2": 36, "Toggle Filmstrip": 3, Sidebar: "⌘+P", Settings: "1048576+Left", Help: 44, Up: 999, "Delete Photo": 999, "Rate 3": "3"};
const writes = [];
const disk = new Map([
  [".legendphotos/hotkeys.json", JSON.stringify(legacyHotkeys)],
  [".legendphotos/settings.json", JSON.stringify({library: {paths: ["/Pictures/Existing"]}, state: {numColumns: 6}})],
  [".legendphotos/metadata.json", JSON.stringify({"asset/L0/001": {rating: 4, flag: true}, "/Pictures/Existing/a.jpg": {reject: true}})],
]);
const nativeStorage = {
  getStoragePathUri: (_root, path) => `file:///Documents/${path}`,
  ensureStorageDirectory: () => true,
  readStorageText: (_root, path) => disk.get(path) ?? null,
  writeStorageText: (_root, path, value) => { writes.push(path); disk.set(path, value); return true; },
};
// Load Spark's real binding parser without its native UI/keyboard entry point.
const { parseAccelerator } = await import("../../../node_modules/@legendapp/spark/vendor/node_modules/@legendapp/spark-desktop-app/src/contracts/accelerator");
const normalizeHotkeyBindings = values => values.map(value => parseAccelerator(value, "macos", {allowUnmodifiedCharacter: true, allowExtendedKeys: true}));
mock.module("@legendapp/spark/shortcuts/commands", () => ({normalizeHotkeyBindings}));
mock.module("../../../packages/storage/src/NativeStorage", () => ({default: nativeStorage}));
const { syncState, when } = await import("@legendapp/state");
const { createJSONManager, flushPhotoSettings } = await import("../src/utils/JSONManager");
test("app storage loads existing settings and flushes ratings without changing legacy files or IDs", async () => {
  const settings = createJSONManager({filename: "settings.json", initialValue: {library: {paths: []}, state: {numColumns: 4, showFilmstrip: true}}, saveDefaultToFile: true});
  const metadata = createJSONManager({filename: "metadata.json", initialValue: {}, saveDefaultToFile: false});
  await when(syncState(settings).isPersistLoaded);
  await when(syncState(metadata).isPersistLoaded);
  expect(settings.library.paths.get()).toEqual(["/Pictures/Existing"]);
  expect(settings.state.numColumns.get()).toBe(6);
  expect(settings.state.showFilmstrip.get()).toBe(true);
  expect(metadata["asset/L0/001"].rating.get()).toBe(4);
  metadata["asset/L0/001"].rating.set(5);
  // Legend State schedules persistence after changes; wait until the plugin sees them.
  await new Promise(resolve => setTimeout(resolve, 0));
  await flushPhotoSettings();
  const saved = JSON.parse(disk.get(".legendphotos/metadata.json"));
  expect(saved["asset/L0/001"]).toEqual({rating: 5, flag: true});
  expect(saved["/Pictures/Existing/a.jpg"]).toEqual({reject: true});
  expect([...disk.keys()].some(key => key.endsWith(".json.json"))).toBe(false);
});

test("saved legacy hotkeys load as accelerators without rewriting the prefs file", async () => {
  const { hotkeys$ } = await import("../src/settings/Hotkeys");
  await when(syncState(hotkeys$).isPersistLoaded);
  expect(hotkeys$.get()).toEqual({
    Left: "Left", Right: "Right", Up: "Up", Down: "Down",
    "Decrease Columns": "-", "Increase Columns": "=", "Open Photo": "Enter",
    "Close Photo": "Escape", "Close Photo-2": "Enter", "Toggle Filmstrip": "F",
    Sidebar: "Cmd+P", Settings: "Cmd+Left", Help: "/", "Rate 3": "3",
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  await flushPhotoSettings();
  expect(writes).not.toContain(".legendphotos/hotkeys.json");
  expect(disk.get(".legendphotos/hotkeys.json")).toBe(JSON.stringify(legacyHotkeys));
});

test("hotkey migration preserves valid strings and omits unknown codes and invalid values", async () => {
  const { loadHotkeys } = await import("../src/settings/hotkeySerialization");
  const saved = {Left: 0, Right: 999, Help: "Cmd+Shift+/", Sidebar: "", "Rate 3": "3", Valid: " ctrl + P ", Plus: "Cmd+Plus", Custom: 999,
    Invalid: "Bogus+P", Duplicate: "Cmd+Cmd+P", Unknown: "NotAKey", Null: null, Object: {key: "P"}};
  expect(loadHotkeys(saved)).toEqual({Left: "A", Help: "Cmd+Shift+/", "Rate 3": "3", Valid: " ctrl + P ", Plus: "Cmd+Plus"});
  expect(saved).toEqual({Left: 0, Right: 999, Help: "Cmd+Shift+/", Sidebar: "", "Rate 3": "3", Valid: " ctrl + P ", Plus: "Cmd+Plus", Custom: 999,
    Invalid: "Bogus+P", Duplicate: "Cmd+Cmd+P", Unknown: "NotAKey", Null: null, Object: {key: "P"}});
  expect(loadHotkeys({Help: 44, Function: 105, Delete: 51, ForwardDelete: 117, Home: 115})).toEqual({
    Help: "/", Function: "F13", Delete: "Backspace", ForwardDelete: "Delete", Home: "Home",
  });
});

test("legacy labels and modifiers migrate to Spark accelerators", async () => {
  const { loadHotkeys } = await import("../src/settings/hotkeySerialization");
  const labels = ["←", "→", "↑", "↓", "↩", "⇥", "⌫", "Esc", "⌘+P", "⌃+←", "⌥+3", "⌘+⇧+P",
    "1048576+Left", "131072+262144+524288+P", "⇪+P", "65536+8388608+P", "Page_up", "Forward_delete", "Next Track"];
  const migrated = loadHotkeys(Object.fromEntries(labels.map(label => [label, label])));
  expect(Object.values(migrated)).toEqual(["Left", "Right", "Up", "Down", "Enter", "Tab", "Backspace", "Escape",
    "Cmd+P", "Ctrl+Left", "Alt+3", "Cmd+Shift+P", "Cmd+Left", "Shift+Ctrl+Alt+P", "CapsLock+P", "CapsLock+Fn+P",
    "PageUp", "Delete", "MediaNext"]);
  expect(loadHotkeys(migrated)).toEqual(migrated);
  expect(() => normalizeHotkeyBindings(Object.values(migrated))).not.toThrow();
});

test("every legacy numeric key table value parses as a Spark accelerator", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/settings/hotkeySerialization.ts", import.meta.url), "utf8");
  const table = source.match(/const legacyKeys[^=]*= \{([\s\S]*?)\};/)[1];
  const values = [...table.matchAll(/\d+: "([^"]+)"/g)].map(match => match[1]);
  expect(values).toHaveLength(80);
  for (const value of values) expect(() => normalizeHotkeyBindings([value])).not.toThrow();
});

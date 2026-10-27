import { expect, mock, test } from "bun:test";
const legacyHotkeys = {Left: 123, Right: 124, Up: 126, Down: 125, "Decrease Columns": 27, "Increase Columns": 24, "Open Photo": 36, "Close Photo": 53, "Close Photo-2": 36, "Toggle Filmstrip": 3, Sidebar: 1, Settings: 43, Help: 44, "Rate 3": "3"};
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

test("saved numeric hotkeys load as accelerators without rewriting the prefs file", async () => {
  const { hotkeys$ } = await import("../src/settings/Hotkeys");
  await when(syncState(hotkeys$).isPersistLoaded);
  expect(hotkeys$.get()).toEqual({
    Left: "Left", Right: "Right", Up: "Up", Down: "Down",
    "Decrease Columns": "-", "Increase Columns": "=", "Open Photo": "Enter",
    "Close Photo": "Escape", "Close Photo-2": "Enter", "Toggle Filmstrip": "F",
    Sidebar: "S", Settings: ",", Help: "/", "Rate 3": "3",
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  await flushPhotoSettings();
  expect(writes).not.toContain(".legendphotos/hotkeys.json");
  expect(disk.get(".legendphotos/hotkeys.json")).toBe(JSON.stringify(legacyHotkeys));
});

test("hotkey migration preserves custom keys and strings and defaults unknown codes", async () => {
  const { loadHotkeys } = await import("../src/settings/hotkeySerialization");
  const saved = {Left: 0, Right: 999, Help: "Cmd+Shift+/", Sidebar: "", "Rate 3": "3", Custom: 999};
  expect(loadHotkeys(saved, {Left: "Left", Right: "Right"})).toEqual({
    Left: "A", Right: "Right", Help: "Cmd+Shift+/", Sidebar: "", "Rate 3": "3", Custom: "",
  });
  expect(saved.Left).toBe(0);
  expect(saved.Right).toBe(999);
  expect(loadHotkeys({Help: 44, Function: 105, Delete: 51, ForwardDelete: 117, Home: 115}, {})).toEqual({
    Help: "/", Function: "F13", Delete: "Backspace", ForwardDelete: "Delete", Home: "Home",
  });
});

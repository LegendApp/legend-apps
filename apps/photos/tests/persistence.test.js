import { expect, mock, test } from "bun:test";
const disk = new Map([
  [".legendphotos/settings.json", JSON.stringify({library: {paths: ["/Pictures/Existing"]}, state: {numColumns: 6}})],
  [".legendphotos/metadata.json", JSON.stringify({"asset/L0/001": {rating: 4, flag: true}, "/Pictures/Existing/a.jpg": {reject: true}})],
]);
const nativeStorage = {
  getStoragePathUri: (_root, path) => `file:///Documents/${path}`,
  ensureStorageDirectory: () => true,
  readStorageText: (_root, path) => disk.get(path) ?? null,
  writeStorageText: (_root, path, value) => { disk.set(path, value); return true; },
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

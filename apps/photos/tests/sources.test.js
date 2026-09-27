import { expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
const settings$ = observable({library: {paths: []}});
mock.module("../src/settings/SettingsFile", () => ({settings$}));
mock.module("../src/native-modules/FileSystemWatcher", () => ({
  addChangeListener: () => () => {}, setWatchedDirectories: () => {},
}));
let finishSlowScan;
import { photoKitAlbumPath, photoKitAlbumIdentifier, photoKitAlbumTitle } from "../src/utils/photoKitPaths";
const requests = [];
mock.module("@legend-apps/photo-library", () => ({default: {
  getPermissionStatus: async () => ({status: "denied"}),
  requestPermissions: async () => ({status: "denied"}),
  getPhotosInAlbum: async (id) => { requests.push(id); return [{identifier: "asset/L0/001", uri: "/tmp/photo.jpg", filename: "photo.jpg", creationDate: "2024-01-01", modificationDate: "2024-01-02"}]; },
}}));
mock.module("@legendapp/spark/files", () => ({
  list: async (path) => path === "/slow" ? new Promise(resolve => { finishSlowScan = resolve; }) : path === "/changing" ? ["kept.jpg", "removed.jpg", "folder.jpg"] : path === "/photos" ? ["b.HEIC", "a.jpg", "notes.txt", "nested"] : ["c.png"],
  stat: async (path) => {
    if (path.endsWith("removed.jpg")) throw new Error("File no longer exists");
    return {type: path.endsWith("nested") || path.endsWith("folder.jpg") ? "directory" : "file", size: 10, modifiedAt: 1000};
  },
}));
const { PluginPhotoKit } = await import("../src/plugins/PluginPhotoKit");
const { listPhotosInFolder, scanFolderRecursive } = await import("../src/systems/FileManager");
test("saved legacy album selections and encoded titles preserve full PhotoKit IDs", async () => {
  const id = "UUID/L0/040";
  const path = photoKitAlbumPath(id, "Trips / 100% #1");
  expect(photoKitAlbumIdentifier(path)).toBe(id);
  expect(photoKitAlbumIdentifier(`photokit://${id}/Trips / 100% #1`)).toBe(id);
  const photos = await PluginPhotoKit.getPhotos(path);
  expect(requests).toEqual([id]);
  expect(photos[0].id).toBe("asset/L0/001");
});
test("denied Photos access settles the source so local folders remain usable", async () => {
  await PluginPhotoKit.initialize();
  expect(PluginPhotoKit.isLoaded()).toBe(true);
  expect(PluginPhotoKit.getSidebarGroups()).toEqual([]);
});
test("Spark directory entries retain local metadata keys and case-insensitive photo filtering", async () => {
  const photos = await listPhotosInFolder("/photos");
  expect(photos.map(photo => photo.id)).toEqual(["/photos/a.jpg", "/photos/b.HEIC"]);
  expect(photos[0].mtime).toEqual(new Date(1000));
  expect(await scanFolderRecursive("/photos")).toEqual(["/photos/nested", "/photos"]);
});

test("a disappearing entry does not hide remaining photos or treat folders as images", async () => {
  expect((await listPhotosInFolder("/changing")).map(photo => photo.name)).toEqual(["kept.jpg"]);
});
test("removing a library while its scan is pending does not restore stale sidebar folders", async () => {
  const { PluginLocalFiles } = await import("../src/plugins/PluginLocalFiles");
  settings$.library.paths.set(["/slow"]);
  await PluginLocalFiles.initialize();
  settings$.library.paths.set([]);
  finishSlowScan(["photo.jpg"]);
  await Bun.sleep(0);
  settings$.library.paths.set(["/slow"]);
  expect(PluginLocalFiles.getSidebarGroups()).toEqual([]);
  settings$.library.paths.set([]);
  finishSlowScan([]);
  await Bun.sleep(0);
});

test("album headers display encoded and legacy titles without losing slash-separated names", () => {
  const title = "Trips / 100% #1 日本";
  expect(photoKitAlbumTitle(photoKitAlbumPath("UUID/L0/040", title))).toBe(title);
  expect(photoKitAlbumTitle(`photokit://UUID/L0/040/${title}`)).toBe(title);
});

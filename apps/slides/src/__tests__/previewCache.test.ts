import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPreviewCache } from "../previewCache";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slides-preview-cache-")); directories.push(root);
  let writes = 0, failWrite = false;
  const files = {
    getDirectory: async () => root,
    readText: (file: string) => fs.readFile(file, "utf8"),
    writeText: async (file: string, contents: string) => { writes++; await fs.writeFile(file, contents); if (failWrite) throw Error("disk write failed"); },
    mkdir: (file: string) => fs.mkdir(file, { recursive: true }).then(() => {}),
    move: (from: string, to: string) => fs.rename(from, to),
    remove: (file: string) => fs.rm(file, { force: true }),
  };
  return { root, files, writes: () => writes, fail: (value: boolean) => { failWrite = value; } };
}
const deck = "a".repeat(64);
const snapshot = { stills: { "0:0": "data:image/jpeg;base64,AA==" }, noSurface: [1], targets: ["0:0", "1:0", "1:1"] };

test("prepared previews survive a new cache instance and mismatched content is a miss", async () => {
  const f = await fixture(), cache = createPreviewCache(f.files);
  expect(await cache.read(deck, "visual-a")).toBeUndefined();
  await cache.save(deck, "visual-a", snapshot);
  const reopened = createPreviewCache(f.files);
  expect(await reopened.read(deck, "visual-a")).toEqual(snapshot);
  await reopened.save(deck, "visual-a", snapshot);
  expect(f.writes()).toBe(1);
  expect(await reopened.read(deck, "visual-b")).toBeUndefined();
});

test("one current file per deck is replaced atomically and repeated saves are idle", async () => {
  const f = await fixture(), cache = createPreviewCache(f.files);
  await Promise.all([cache.save(deck, "old", snapshot), cache.save(deck, "new", snapshot), cache.save(deck, "new", snapshot)]);
  expect(await createPreviewCache(f.files).read(deck, "new")).toEqual(snapshot);
  expect(await fs.readdir(path.join(f.root, "slides/previews"))).toEqual([`${deck}.json`]);
  expect(f.writes()).toBe(2);
});

test("interrupted writes preserve the previous complete cache and leave no temporary file", async () => {
  const f = await fixture(), cache = createPreviewCache(f.files);
  await cache.save(deck, "old", snapshot);
  f.fail(true); await cache.save(deck, "new", snapshot);
  expect(await createPreviewCache(f.files).read(deck, "old")).toEqual(snapshot);
  expect(await fs.readdir(path.join(f.root, "slides/previews"))).toEqual([`${deck}.json`]);
  f.fail(false); await cache.save(deck, "new", snapshot);
  expect(await createPreviewCache(f.files).read(deck, "new")).toEqual(snapshot);
});

test("malformed, incomplete and invalid-URI cache entries are misses", async () => {
  const f = await fixture(), cache = createPreviewCache(f.files);
  await cache.save(deck, "key", snapshot);
  const filename = path.join(f.root, `slides/previews/${deck}.json`);
  for (const data of ["broken JSON", "null", JSON.stringify({ version: 1, key: "key", ...snapshot, stills: {} }),
    JSON.stringify({ version: 1, key: "key", ...snapshot, stills: { "0:0": "https://invalid/image" } })]) {
    await fs.writeFile(filename, data);
    expect(await cache.read(deck, "key")).toBeUndefined();
  }
  await cache.save(deck, "key", snapshot);
  expect(await createPreviewCache(f.files).read(deck, "key")).toEqual(snapshot);
});

test("late metadata can complete a cache entry without a new content fingerprint", async () => {
  const f = await fixture(), cache = createPreviewCache(f.files);
  await cache.save(deck, "key", { stills: snapshot.stills, noSurface: [], targets: ["0:0"] });
  await cache.read(deck, "key");
  await cache.save(deck, "key", snapshot);
  expect(await createPreviewCache(f.files).read(deck, "key")).toEqual(snapshot);
  await cache.save(deck, "key", { ...snapshot, targets: [...snapshot.targets].reverse() });
  expect(f.writes()).toBe(2);
});

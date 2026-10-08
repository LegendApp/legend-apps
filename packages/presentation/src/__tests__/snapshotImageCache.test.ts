// @ts-nocheck Bun tests exercise concrete disposable resources.
import { expect, test } from "bun:test";
import { createSnapshotImageCache } from "../snapshotImageCache";

test("bounded snapshots reuse textures and defer eviction until every mounted consumer releases", () => {
  const disposed: string[] = [];
  const image = (id: string) => ({ id, width: () => 10, height: () => 10 });
  const cache = createSnapshotImageCache({ maxBytes: 1600, maxEntries: 2, dispose: value => disposed.push(value.id) });
  const a = cache.insert("a", image("a"));
  const b = cache.insert("b", image("b"));
  const shared = cache.acquire("a")!;
  expect(shared.image).toBe(a.image);
  b.release();
  const c = cache.insert("c", image("c"));
  expect(cache.size).toBe(2);
  expect(cache.bytes).toBe(1600);
  expect(disposed).toEqual(["b"]);
  cache.clear();
  expect(disposed).toEqual(["b"]);
  a.release(); a.release();
  expect(disposed).toEqual(["b"]);
  shared.release(); c.release();
  expect(disposed).toEqual(["b", "a", "c"]);
  expect(cache.acquire("a")).toBeUndefined();
});

test("replacement and oversized images cannot dispose a texture still displayed by an earlier consumer", () => {
  const disposed: number[] = [];
  const cache = createSnapshotImageCache({ maxBytes: 8, dispose: image => disposed.push(image.id) });
  const first = cache.insert("key", { id: 1, width: () => 1, height: () => 1 });
  const next = cache.insert("key", { id: 2, width: () => 2, height: () => 2 });
  expect(cache.size).toBe(0);
  expect(disposed).toEqual([]);
  first.release(); next.release();
  expect(disposed).toEqual([1, 2]);
});

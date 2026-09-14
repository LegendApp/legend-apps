import { SourceHeightCache } from "../SourceHeightCache";
import { SourceLineDataSource } from "../SourceLineDataSource";

it("keeps exact heights by stable ID, with narrow subscriptions and configuration invalidation", () => {
  const cache = new SourceHeightCache();
  cache.configure("wide");
  const listener = jest.fn();
  const unsubscribe = cache.subscribe("1099511627776", listener);
  expect(cache.get("wide", "1")).toBeUndefined();
  expect(cache.wasRequested("1")).toBe(false);
  expect(cache.getForLayout("wide", "1")).toBeUndefined();
  expect(cache.wasRequested("1")).toBe(true);
  expect(cache.set("wide", "1", 22)).toBe(true);
  expect(listener).not.toHaveBeenCalled();
  expect(cache.set("wide", "1099511627776", 66)).toBe(true);
  expect(cache.get("wide", "1099511627776")).toBe(66);
  expect(cache.set("wide", "1099511627776", 66)).toBe(false);
  expect(listener).toHaveBeenCalledTimes(1);
  cache.invalidate("1099511627776");
  expect(cache.get("wide", "1099511627776")).toBeUndefined();
  cache.configure("narrow");
  expect(cache.wasRequested("1")).toBe(false);
  expect(cache.get("wide", "1")).toBeUndefined();
  expect(cache.set("wide", "1", 22)).toBe(false);
  expect(cache.set("narrow", "1", NaN)).toBe(false);
  expect(cache.set("narrow", "1", 0)).toBe(false);
  cache.set("narrow", "1", 44);
  cache.configure("narrow", true);
  expect(cache.get("narrow", "1")).toBeUndefined();
  unsubscribe();
});

it("publishes batched layout invalidations without advancing the native document revision", () => {
  const source = new SourceLineDataSource(10);
  const listener = jest.fn();
  source.subscribe(listener);
  source.invalidateHeights([4, 2, 3, 2, 8]);
  expect(listener.mock.calls[0][0].operations).toEqual([
    { type: "update", index: 2, count: 3, layout: "invalidate" },
    { type: "update", index: 8, count: 1, layout: "invalidate" },
  ]);
  expect(source.getRevision()).toBe(1);
  expect(source.getDocumentRevision()).toBe(0);
  source.apply({ startLine: 1, removedLineCount: 1, lines: [{ id: "11" }],
    revision: 1, lineCount: 10, offset: 2, removedLength: 1, insertedText: "a" });
  expect(source.getRevision()).toBe(2);
  expect(source.getDocumentRevision()).toBe(1);
  source.append({ startLine: 9, retainedId: "10", firstId: 12, count: 1, revision: 2, lineCount: 11 });
  expect(source.getRevision()).toBe(3);
  expect(source.getDocumentRevision()).toBe(2);
});

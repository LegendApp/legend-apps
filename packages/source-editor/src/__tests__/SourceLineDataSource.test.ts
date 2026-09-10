import { SourceLineDataSource } from "../SourceLineDataSource";

describe("SourceLineDataSource", () => {
  it.each([
    { revision: 0 }, { revision: 2 }, { startLine: -1 }, { startLine: 4 },
    { removedLineCount: -1 }, { removedLineCount: 4 }, { lineCount: 99 },
    { lines: [{ id: "NaN" }] }, { lines: [{ id: "0" }] },
    { lines: [{ id: "9007199254740992" }] }, { startLine: 0.5 },
  ])("rejects malformed edits atomically: %j", (override) => {
    const rows = new SourceLineDataSource(3);
    const first = rows.getItem(0);
    const listener = jest.fn();
    rows.subscribe(listener);
    expect(() => rows.apply({ startLine: 0, removedLineCount: 1,
      lines: [{ id: "4" }], revision: 1, lineCount: 3,
      offset: 0, removedLength: 0, insertedText: "", ...override })).toThrow();
    expect(rows.getRevision()).toBe(0);
    expect(rows.getLength()).toBe(3);
    expect(rows.getItem(0)).toBe(first);
    expect([0, 1, 2].map((i) => rows.getKey(i))).toEqual(["1", "2", "3"]);
    expect(listener).not.toHaveBeenCalled();
  });
  it.each([
    { revision: 2 }, { retainedId: "2" }, { startLine: 1 },
    { count: -1 }, { count: 0.5 }, { firstId: 0 }, { firstId: Infinity },
    { lineCount: 10 },
  ])("rejects malformed loading packets atomically: %j", (override) => {
    const rows = new SourceLineDataSource(3);
    const listener = jest.fn(); rows.subscribe(listener);
    expect(() => rows.append({ startLine: 2, retainedId: "3", firstId: 4,
      count: 2, revision: 1, lineCount: 5, ...override })).toThrow();
    expect(rows.getRevision()).toBe(0);
    expect(rows.getLength()).toBe(3);
    expect(rows.getKey(2)).toBe("3");
    expect(listener).not.toHaveBeenCalled();
  });
  it("publishes partial-line appends without a structural splice and unsubscribes", () => {
    const rows = new SourceLineDataSource(1);
    const row = rows.getItem(0);
    const listener = jest.fn(); const unsubscribe = rows.subscribe(listener);
    rows.append({ startLine: 0, retainedId: "1", firstId: 2, count: 0, revision: 1, lineCount: 1 });
    expect(rows.getItem(0)).toBe(row);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ operations: [
      { type: "update", index: 0, count: 1, layout: "preserve" },
    ] }));
    unsubscribe();
    rows.append({ startLine: 0, retainedId: "1", firstId: 2, count: 2, revision: 2, lineCount: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("appends compact runs after edits without replacing retained rows", () => {
    const rows = new SourceLineDataSource(129);
    const retained = rows.getItem(128);
    rows.apply({ startLine: 0, removedLineCount: 0, lines: [{ id: String(2 ** 40) }],
      revision: 1, lineCount: 130, offset: 0, removedLength: 0, insertedText: "edited\n" });
    rows.append({ startLine: 129, retainedId: "129", firstId: 130, count: 4096, revision: 2, lineCount: 4226 });
    expect(rows.getItem(129)).toBe(retained);
    expect(rows.getKey(4225)).toBe("4225");
    expect(rows.getKey(0)).toBe(String(2 ** 40));
    expect(() => rows.append({ startLine: 129, retainedId: "129", firstId: 130, count: 1, revision: 3, lineCount: 4227 })).toThrow();
    expect(rows.getLength()).toBe(4226);
  });
  it("matches an array across 10000 randomized structural edits", () => {
    let seed = 41;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
    const rows = new SourceLineDataSource(1000);
    const ids = Array.from({ length: 1000 }, (_, i) => String(i + 1));
    for (let revision = 1; revision <= 10000; revision++) {
      const start = random() % ids.length;
      const removed = Math.min(random() % 5, ids.length - start);
      const lines = Array.from({ length: random() % 6 }, (_, i) => ({ id: String(1e9 + revision * 10 + i) }));
      ids.splice(start, removed, ...lines.map((line) => line.id));
      rows.apply({ startLine: start, removedLineCount: removed, lines, revision, lineCount: ids.length,
        offset: 0, removedLength: 0, insertedText: "" });
      expect(rows.getLength()).toBe(ids.length);
      for (let n = 0; n < 3; n++) { const index = random() % ids.length; expect(rows.getKey(index)).toBe(ids[index]); }
    }
  });
  it("opens a billion-row index without allocating a billion row objects", () => {
    const rows = new SourceLineDataSource(1_000_000_000);
    expect(rows.getLength()).toBe(1_000_000_000);
    expect(rows.getItem(999_999_999)).toEqual({ id: "1000000000" });
    expect(rows.getItem(0)).toEqual({ id: "1" });
  });
  it("publishes an atomic edit and preserves unchanged row identity", () => {
    const rows = new SourceLineDataSource(3);
    const retained = rows.getItem(1)!;
    const listener = jest.fn(() => expect(rows.getLength()).toBe(4));
    rows.subscribe(listener);
    rows.apply({ startLine: 0, removedLineCount: 2,
      lines: [{ id: "1" }, { id: "4" }, { ...retained }],
      revision: 1, lineCount: 4, offset: 1, removedLength: 0, insertedText: "\n" });
    expect(rows.getItem(2)).toBe(retained);
    expect(rows.getKey(3)).toBe("3");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ previousRevision: 0, revision: 1, previousLength: 3, length: 4 }));
    expect(listener.mock.calls[0]).toEqual([expect.objectContaining({ operations: [
      { type: "update", index: 0, count: 1, layout: "preserve" },
      { type: "splice", index: 1, deleteCount: 0, insertCount: 1 },
      { type: "update", index: 2, count: 1, layout: "preserve" },
    ] })]);
  });
  it("retains mounted keys and measured heights for an in-line edit", () => {
    const rows = new SourceLineDataSource(3);
    const listener = jest.fn();
    rows.subscribe(listener);
    rows.apply({ startLine: 0, removedLineCount: 2,
      lines: [{ id: "1" }, rows.getItem(1)!],
      revision: 1, lineCount: 3, offset: 3, removedLength: 0, insertedText: "!" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ operations: [
      { type: "update", index: 0, count: 2, layout: "preserve" },
    ] }));
  });
  it("rejects a missing native transaction before mutating", () => {
    const rows = new SourceLineDataSource(1);
    expect(() => rows.apply({ startLine: 0, removedLineCount: 1, lines: [], revision: 2, lineCount: 0, offset: 0, removedLength: 3, insertedText: "" })).toThrow("Out-of-sequence");
    expect(rows.getItem(0)?.id).toBe("1");
  });
  it("handles top-of-document splices across 100k lines without renumbering", () => {
    const rows = new SourceLineDataSource(100001);
    const end = rows.getItem(100000);
    for (let revision = 1; revision <= 1000; revision++) {
      rows.apply({ startLine: 0, removedLineCount: 0,
        lines: [{ id: String(2 ** 40 + revision) }],
        revision, lineCount: 100001 + revision, offset: 0, removedLength: 0, insertedText: "new\n" });
    }
    expect(rows.getItem(101000)).toBe(end);
  });
});

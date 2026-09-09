import { SourceLineDataSource } from "../SourceLineDataSource";

describe("SourceLineDataSource", () => {
  it("preserves CRLF, lone CR, unicode, and the final empty line", () => {
    const source = "a\r\nb\rc\n👩🏽‍💻\n";
    const rows = new SourceLineDataSource(source);
    expect(rows.getLength()).toBe(5);
    expect(Array.from({ length: rows.getLength() }, (_, i) => {
      const row = rows.getItem(i)!;
      expect(row.id).toBe(String(i + 1));
      return row.text + row.ending;
    }).join("")).toBe(source);
  });
  it("publishes an atomic edit and preserves unchanged row identity", () => {
    const rows = new SourceLineDataSource("one\ntwo\nthree");
    const retained = rows.getItem(1)!;
    const listener = jest.fn(() => expect(rows.getLength()).toBe(4));
    rows.subscribe(listener);
    rows.apply({ startLine: 0, removedLineCount: 2,
      lines: [{ id: "1", text: "o", ending: "\n" }, { id: "4", text: "ne", ending: "\n" }, { ...retained }],
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
    const rows = new SourceLineDataSource("one\ntwo\nthree");
    const listener = jest.fn();
    rows.subscribe(listener);
    rows.apply({ startLine: 0, removedLineCount: 2,
      lines: [{ id: "1", text: "one!", ending: "\n" }, rows.getItem(1)!],
      revision: 1, lineCount: 3, offset: 3, removedLength: 0, insertedText: "!" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ operations: [
      { type: "update", index: 0, count: 2, layout: "preserve" },
    ] }));
  });
  it("rejects a missing native transaction before mutating", () => {
    const rows = new SourceLineDataSource("one");
    expect(() => rows.apply({ startLine: 0, removedLineCount: 1, lines: [], revision: 2, lineCount: 0, offset: 0, removedLength: 3, insertedText: "" })).toThrow("Out-of-sequence");
    expect(rows.getItem(0)?.text).toBe("one");
  });
  it("handles top-of-document splices across 100k lines without renumbering", () => {
    const rows = new SourceLineDataSource("line\n".repeat(100000));
    const end = rows.getItem(100000);
    for (let revision = 1; revision <= 1000; revision++) {
      rows.apply({ startLine: 0, removedLineCount: 0,
        lines: [{ id: `new-${revision}`, text: "new", ending: "\n" }],
        revision, lineCount: 100001 + revision, offset: 0, removedLength: 0, insertedText: "new\n" });
    }
    expect(rows.getItem(101000)).toBe(end);
  });
});

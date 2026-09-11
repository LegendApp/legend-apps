import { SourceSnapshot } from "../SourceSnapshot";

describe("revisioned source snapshots", () => {
  it("applies edits inside pieces, across pieces, and at both boundaries", () => {
    const snapshot = new SourceSnapshot("abc\r\n😀xyz");
    let expected = "abc\r\n😀xyz";
    let seed = 17;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let revision = 1; revision <= 2000; ++revision) {
      const offset = random() % (expected.length + 1);
      const removedLength = random() % (expected.length - offset + 1);
      const insertedText = ["", "xyz", "\r\n", "😀", "a\nb", "\ud800"][random() % 6];
      snapshot.apply({ offset, removedLength, insertedText, revision });
      expected = expected.slice(0, offset) + insertedText + expected.slice(offset + removedLength);
      if (revision % 23 === 0) expect(snapshot.materialize()).toBe(expected);
    }
    expect(snapshot.materialize()).toBe(expected);
    expect(snapshot.materialize()).toBe(expected);
  });
  it("ignores duplicated events and rejects invalid ranges without changing the snapshot", () => {
    const snapshot = new SourceSnapshot("hello");
    const edit = { offset: 5, removedLength: 0, insertedText: "!", revision: 1 };
    expect(snapshot.apply(edit)).toBe(true);
    expect(snapshot.apply(edit)).toBe(false);
    expect(() => snapshot.apply({ ...edit, revision: 2, offset: 20 })).toThrow(RangeError);
    expect(snapshot.materialize()).toBe("hello!");
  });
  it("materializes a large source only when requested", () => {
    const source = "const example = 42;\n".repeat(100000);
    const snapshot = new SourceSnapshot(source);
    for (let revision = 1; revision <= 100; ++revision) snapshot.apply({ offset: source.length, removedLength: 0, insertedText: "x", revision });
    expect(snapshot.materialize()).toBe(source + "x".repeat(100));
  });
  it("owns queued transactions and rejects non-finite revisions", () => {
    const snapshot = new SourceSnapshot("original");
    const edit = { offset: 0, removedLength: 0, insertedText: "new ", revision: 1 };
    snapshot.apply(edit);
    edit.insertedText = "mutated ";
    expect(snapshot.materialize()).toBe("new original");
    expect(() => snapshot.apply({ ...edit, revision: NaN })).toThrow(RangeError);
    expect(() => snapshot.apply({ ...edit, revision: Infinity })).toThrow(RangeError);
    expect(snapshot.apply({ ...edit, insertedText: "next ", revision: 2 })).toBe(true);
    expect(snapshot.materialize()).toBe("next new original");
  });
});

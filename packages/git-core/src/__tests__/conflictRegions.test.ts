import { parseConflictRegions, resolveConflictRegion } from "../conflictRegions";

const merged = [
  "title\n",
  "<<<<<<< HEAD\n", "main title\n", "=======\n", "feature title\n", ">>>>>>> feature\n",
  "middle\n",
  "<<<<<<< HEAD\n", "red\n", "=======\n", "green\n", "more green\n", ">>>>>>> feature\n",
  "end\n",
].join("");

describe("parseConflictRegions", () => {
  it("reads merge-style regions with their labels and line spans", () => {
    expect(parseConflictRegions(merged)).toEqual([
      { start: 1, end: 6, ours: ["main title"], base: null, theirs: ["feature title"], oursLabel: "HEAD", baseLabel: null, theirsLabel: "feature" },
      { start: 7, end: 13, ours: ["red"], base: null, theirs: ["green", "more green"], oursLabel: "HEAD", baseLabel: null, theirsLabel: "feature" },
    ]);
  });

  it("reads diff3 and zdiff3 base sections", () => {
    const text = "<<<<<<< HEAD\nours\n||||||| merged common ancestors\nbase\n=======\ntheirs\n>>>>>>> topic\n<<<<<<< HEAD\na\n||||||| 1234abc\n=======\nb\n>>>>>>> topic\n";
    expect(parseConflictRegions(text)).toEqual([
      { start: 0, end: 7, ours: ["ours"], base: ["base"], theirs: ["theirs"], oursLabel: "HEAD", baseLabel: "merged common ancestors", theirsLabel: "topic" },
      { start: 7, end: 13, ours: ["a"], base: [], theirs: ["b"], oursLabel: "HEAD", baseLabel: "1234abc", theirsLabel: "topic" },
    ]);
  });

  it("handles CRLF, a missing final newline and empty sides", () => {
    expect(parseConflictRegions("x\r\n<<<<<<< HEAD\r\n=======\r\nb\r\n>>>>>>> t\r\ny")).toEqual([
      { start: 1, end: 5, ours: [], base: null, theirs: ["b"], oursLabel: "HEAD", baseLabel: null, theirsLabel: "t" },
    ]);
    expect(parseConflictRegions("<<<<<<<\na\n=======\nb\n>>>>>>>")).toEqual([
      { start: 0, end: 5, ours: ["a"], base: null, theirs: ["b"], oursLabel: "", baseLabel: null, theirsLabel: "" },
    ]);
  });

  it("treats marker-like lines that aren't markers as content", () => {
    const text = "Heading\n=======\n<<<<<<<< eight\n<<<<<<<x\n<<<<<<< HEAD\n======= not a separator\n========\n=======\ntheirs\n>>>>>>> b\n";
    expect(parseConflictRegions(text)).toEqual([
      { start: 4, end: 10, ours: ["======= not a separator", "========"], base: null, theirs: ["theirs"], oursLabel: "HEAD", baseLabel: null, theirsLabel: "b" },
    ]);
    expect(parseConflictRegions("plain\ntext\n")).toEqual([]);
  });

  it("returns null for nested, unclosed or out-of-order markers", () => {
    expect(parseConflictRegions("<<<<<<< a\n<<<<<<< b\n=======\n>>>>>>> c\n")).toBeNull();
    expect(parseConflictRegions("<<<<<<< a\nx\n=======\ny\n")).toBeNull();
    expect(parseConflictRegions("<<<<<<< a\nx\n>>>>>>> b\n")).toBeNull();
    expect(parseConflictRegions(">>>>>>> b\n")).toBeNull();
    expect(parseConflictRegions("<<<<<<< a\n=======\n||||||| base\n>>>>>>> b\n")).toBeNull();
    // A content line that is exactly a separator (a Setext heading) makes the split ambiguous, in ours, base or theirs.
    expect(parseConflictRegions("<<<<<<< HEAD\nTitle\n=======\nbody\n=======\ntheirs\n>>>>>>> b\n")).toBeNull();
    expect(parseConflictRegions("<<<<<<< HEAD\na\n||||||| base\nTitle\n=======\n=======\nb\n>>>>>>> b\n")).toBeNull();
  });

  it("reads markers of another conflict-marker-size", () => {
    const text = "<<<<<<<<<< HEAD\n<<<<<<< not a marker\n==========\n=======\n>>>>>>>>>> b\n";
    expect(parseConflictRegions(text, 10)).toEqual([
      { start: 0, end: 5, ours: ["<<<<<<< not a marker"], base: null, theirs: ["======="], oursLabel: "HEAD", baseLabel: null, theirsLabel: "b" },
    ]);
    expect(parseConflictRegions(text)).toBeNull();
    expect(resolveConflictRegion(`x\n${text}`, 0, "theirs", 10)).toBe("x\n=======\n");
  });
});

describe("resolveConflictRegion", () => {
  it("replaces one region and leaves every other byte as it was", () => {
    const [first, second] = merged.split("middle\n") as [string, string];
    const ours = resolveConflictRegion(merged, 0, "ours");
    expect(ours).toBe(`title\nmain title\nmiddle\n${second}`);
    expect(resolveConflictRegion(merged, 1, "theirs")).toBe(`${first}middle\ngreen\nmore green\nend\n`);
    expect(resolveConflictRegion(merged, 1, "both")).toBe(`${first}middle\nred\ngreen\nmore green\nend\n`);
    expect(parseConflictRegions(ours)).toHaveLength(1);
  });

  it("drops the base section and keeps CRLF endings and a missing final newline", () => {
    const text = "x\r\n<<<<<<< HEAD\r\na\r\n||||||| base\r\nz\r\n=======\r\nb\r\n>>>>>>> t\r\ny";
    expect(resolveConflictRegion(text, 0, "both")).toBe("x\r\na\r\nb\r\ny");
    expect(resolveConflictRegion(text, 0, "theirs")).toBe("x\r\nb\r\ny");
  });

  it("leaves no markers after the last region", () => {
    const once = resolveConflictRegion(merged, 0, "theirs");
    const done = resolveConflictRegion(once, 0, "ours");
    expect(done).toBe("title\nfeature title\nmiddle\nred\nend\n");
    expect(parseConflictRegions(done)).toEqual([]);
  });

  it("throws for a region that isn't there", () => {
    expect(() => resolveConflictRegion(merged, 2, "ours")).toThrow("no longer in the file");
    expect(() => resolveConflictRegion("<<<<<<< a\n", 0, "ours")).toThrow("no longer in the file");
  });
});

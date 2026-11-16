import { buildUnifiedPatchSelection, findUnifiedPatchFile, parseUnifiedPatch, unifiedPatchHunkKeys } from "../unifiedPatch";

const quoted = [
  "diff --git \"a/tab\\tname.txt\" \"b/tab\\tname.txt\"",
  "index 1111111..2222222 100644",
  "--- \"a/tab\\tname.txt\"",
  "+++ \"b/tab\\tname.txt\"",
  "@@ -1,3 +1,3 @@ section",
  " one",
  "-two\r",
  "+TWO\r",
  " three",
  "\\ No newline at end of file",
  "",
].join("\n");

it("parses quoted paths, CR bytes and no-newline markers, and builds a minimal patch from line keys", () => {
  const files = parseUnifiedPatch(quoted);
  const file = findUnifiedPatchFile(files, "tab\tname.txt")!;
  expect(file).toMatchObject({ oldPath: "tab\tname.txt", newPath: "tab\tname.txt", binary: false });
  expect(file.hunks[0]!.lines.map(line => [line.kind, line.text, line.noNewline])).toEqual([[" ", "one", false], ["-", "two\r", false], ["+", "TWO\r", false], [" ", "three", true]]);
  expect(unifiedPatchHunkKeys(file.hunks[0]!)).toEqual(["-2", "+2"]);
  expect(buildUnifiedPatchSelection(file, new Set(["+2"]))).toBe([
    "diff --git \"a/tab\\tname.txt\" \"b/tab\\tname.txt\"", "--- \"a/tab\\tname.txt\"", "+++ \"b/tab\\tname.txt\"",
    "@@ -1,3 +1,4 @@ section", " one", " two\r", "+TWO\r", " three", "\\ No newline at end of file", "",
  ].join("\n"));
  expect(buildUnifiedPatchSelection(file, new Set(["-2"]), { reverse: true })).toBe([
    "diff --git \"a/tab\\tname.txt\" \"b/tab\\tname.txt\"", "--- \"a/tab\\tname.txt\"", "+++ \"b/tab\\tname.txt\"",
    "@@ -1,4 +1,3 @@ section", " one", "-two\r", " TWO\r", " three", "\\ No newline at end of file", "",
  ].join("\n"));
});

it("rewrites rename metadata to a content change of the destination and finds binary sections by their git header", () => {
  const files = parseUnifiedPatch([
    "diff --git a/old.txt b/new name.txt", "similarity index 90%", "rename from old.txt", "rename to new name.txt", "index 1..2 100644",
    "--- a/old.txt", "+++ b/new name.txt\t", "@@ -1 +1 @@", "-a", "+b",
    "diff --git a/img.png b/img.png", "index 3..4 100644", "Binary files a/img.png and b/img.png differ", "",
  ].join("\n"));
  expect(findUnifiedPatchFile(files, "img.png")).toMatchObject({ binary: true, oldPath: "img.png" });
  const rename = findUnifiedPatchFile(files, "new name.txt")!;
  expect(rename.oldPath).toBe("old.txt");
  expect(buildUnifiedPatchSelection(rename, new Set(["-1", "+1"]), { reverse: true }).split("\n").slice(0, 3)).toEqual(["diff --git a/new name.txt b/new name.txt", "--- a/new name.txt\t", "+++ b/new name.txt\t"]);
  expect(() => parseUnifiedPatch("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n a\n")).toThrow("ended inside a hunk");
});

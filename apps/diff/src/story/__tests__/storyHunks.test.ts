import { createHash } from "node:crypto";
import type { DiffOpenSource } from "../../diffFiles";
import { normalizeStoryDiff, storyHash } from "../storyHash";
import { buildStoryInput, classifyStoryFile, storyInputContext } from "../storyHunks";
import { getStoryCwd, getStoryScope, getStorySource } from "../storySource";
import { fixtureDocument, fixtureInput, patchSource, repoSource } from "./storyFixtures";

it.each(["", "abc", "a".repeat(1000), "Unicode 🐈 é\n".repeat(100)])("hashes UTF-8 with SHA-256", text => {
  expect(storyHash(text)).toBe(createHash("sha256").update(text).digest("hex"));
});
it("indexes native hunks in document order with stable IDs and row/line ranges", () => {
  const input = fixtureInput();
  expect(input.hunks.map(hunk => hunk.id)).toEqual(["h1", "h2", "h3"]);
  expect(input.hunks[0]).toMatchObject({ file: "src/a.ts", fileIndex: 0, hunkIndex: 0, oldStart: 40, oldLines: 2, newStart: 40, newLines: 2, rowStart: 1, rowCount: 3 });
  expect(fixtureInput()).toEqual(input);
  expect(input.diffText).toContain("@@ -40,2 +40,2 @@\n context\n-before\n+after");
  expect(input.diffHash).toBe(`sha256:${storyHash(normalizeStoryDiff(input.diffText))}`);
  expect(storyInputContext(input).hunks[0]).not.toHaveProperty("rows");
});
it("keeps hunk content hashes across reloads, offset shifts and earlier file insertions", () => {
  const first = fixtureInput().hunks[0], shifted = fixtureInput({ shift: 5, extra: true }).hunks[1];
  expect(shifted.id).not.toBe(first.id);
  expect(shifted.hash).toBe(first.hash);
  expect(fixtureInput({ text: "different" }).hunks[0].hash).not.toBe(first.hash);
});
it("normalizes CRLF without losing meaningful trailing spaces", () => {
  expect(fixtureInput({ crlf: true }).diffHash).toBe(fixtureInput().diffHash);
  expect(fixtureInput({ text: "after " }).diffHash).not.toBe(fixtureInput().diffHash);
  expect(normalizeStoryDiff("a\r\n\n\n")).toBe("a\n");
});
it("handles insertion/deletion-only and binary files without dropping file coverage", () => {
  const document = fixtureDocument();
  document.rows.splice(1, 3, { ...document.rows[3], index: 1, newLineNumber: 1 });
  document.files[0].rowCount = 2;
  document.files[0].status = "added";
  document.files.splice(1);
  document.files.push({ ...document.files[0], index: 1, rowStart: 2, rowCount: 0, path: "image.png", isBinary: true });
  const input = buildStoryInput(document, patchSource);
  expect(input.hunks[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1 });
  expect(input.files[1].hunks).toEqual([]);
  expect(input.diffText).toContain("Binary files differ");
});
it("preserves the previous line offset for zero-context insertion and deletion hunks", () => {
  const document = fixtureDocument();
  document.files.splice(1);
  document.rows.splice(0);
  const append = (hunkIndex: number, oldLineNumber: number, newLineNumber: number) => document.rows.push({ index: document.rows.length,
    kind: 2, fileIndex: 0, hunkIndex, oldLineNumber, newLineNumber, changeType: oldLineNumber < 0 ? 1 : 2, text: "line", tokens: [] });
  append(0, -1, 1); append(0, -1, 2);
  append(1, -1, 10);
  append(2, 20, -1);
  document.files[0].rowStart = 0; document.files[0].rowCount = 4;
  const input = buildStoryInput(document, patchSource);
  expect(input.hunks.map(({ oldStart, oldLines, newStart, newLines }) => ({ oldStart, oldLines, newStart, newLines }))).toEqual([
    { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2 },
    { oldStart: 7, oldLines: 0, newStart: 10, newLines: 1 },
    { oldStart: 20, oldLines: 1, newStart: 22, newLines: 0 },
  ]);
});
it.each([
  ["src/a.ts", "source"], ["package-lock.json", "lockfile"], ["bun.lock", "lockfile"], ["yarn.lock", "lockfile"], ["ios/Podfile.lock", "lockfile"],
  ["vendor/lib/a.c", "vendored"], ["third_party/a.c", "vendored"], ["node_modules/a/b.ts", "vendored"], ["generated/api.ts", "generated"], ["src/a.generated.ts", "generated"],
])("classifies %s for summary-only prompts", (path, classification) => expect(classifyStoryFile(path)).toBe(classification));

it.each<[DiffOpenSource, ReturnType<typeof getStorySource>]>([
  [repoSource, { type: "working_tree", base: "HEAD", head: "WORKTREE" }],
  [{ ...repoSource, kind: "folder", compareBase: { kind: "ref", ref: "develop" } }, { type: "working_tree", base: "develop", head: "WORKTREE" }],
  [{ kind: "index-vs-workdir", cwd: "/repo", value: "worktree", label: "worktree" }, { type: "working_tree", base: "INDEX", head: "WORKTREE" }],
  [{ kind: "head-vs-index", cwd: "/repo", value: "index", label: "index" }, { type: "working_tree", base: "HEAD", head: "INDEX" }],
  [{ kind: "commit", sha: "abc", cwd: "/repo", value: "abc", label: "abc" }, { type: "commit", base: "abc^", head: "abc" }],
  [{ kind: "range", range: "main...topic", cwd: "/repo", value: "range", label: "range" }, { type: "git_range", base: "main", head: "topic" }],
  [{ kind: "git", args: ["--cached", "main", "--", "src/a.ts"], cwd: "/repo", value: "git", label: "git" }, { type: "working_tree", base: "main", head: "INDEX" }],
  [{ kind: "git", args: ["-U", "10", "main", "topic", "--", "path"], cwd: "/repo", value: "git", label: "git" }, { type: "git_range", base: "main", head: "topic" }],
  [{ kind: "git", args: ["main..topic"], cwd: "/repo", value: "git", label: "git" }, { type: "git_range", base: "main", head: "topic" }],
  [{ kind: "github", value: "https://github.com/a/b/pull/1", diffUrl: "https://github.com/a/b/pull/1.diff", label: "PR" }, { type: "pull_request", head: "https://github.com/a/b/pull/1" }],
  [{ kind: "github", value: "https://github.com/a/b/commit/abc", diffUrl: "https://github.com/a/b/commit/abc.diff", label: "Commit" }, { type: "commit", head: "abc" }],
  [{ kind: "filePair", value: "/a\n/b", oldPath: "/a", newPath: "/b", label: "pair" }, { type: "patch", base: "/a", head: "/b" }],
  [patchSource, { type: "patch" }],
])("maps source %#", (source, expected) => expect(getStorySource(source)).toEqual(expected));
it("uses repository roots for local CLI cwd and isolates non-repo cache scopes", () => {
  expect(getStoryCwd(repoSource, "/resolved")).toBe("/resolved");
  expect(getStoryCwd(patchSource, "/resolved")).toBeUndefined();
  expect(getStoryScope(repoSource, "/resolved/")).toBe("repo:/resolved");
  expect(getStoryScope(patchSource)).toBe("source:diffFile:/tmp/sample.patch");
});

it("keeps the same compact hunks and hash for whole-file and hunks-only documents", () => {
  const full = fixtureDocument();
  full.files.splice(1); full.rows.splice(0);
  for (let line = 1; line <= 50; line++) {
    const row = { index: full.rows.length, kind: 2, fileIndex: 0, hunkIndex: 0,
      oldLineNumber: line, newLineNumber: line, changeType: 0, text: `line ${line}`, tokens: [] };
    if (line === 10 || line === 40) {
      full.rows.push({ ...row, newLineNumber: -1, changeType: 2 });
      full.rows.push({ ...row, index: full.rows.length, oldLineNumber: -1, changeType: 1, text: `changed ${line}` });
    } else full.rows.push(row);
  }
  full.files[0].rowStart = 0; full.files[0].rowCount = full.rows.length;
  const compact = fixtureDocument();
  compact.files.splice(1); compact.rows.splice(0);
  for (const row of full.rows) {
    const line = Math.max(row.oldLineNumber, row.newLineNumber);
    if (line >= 7 && line <= 13 || line >= 37 && line <= 43) compact.rows.push({ ...row, index: compact.rows.length, hunkIndex: line < 20 ? 0 : 1 });
  }
  compact.files[0].rowStart = 0; compact.files[0].rowCount = compact.rows.length;
  const whole = buildStoryInput(full, repoSource), hunks = buildStoryInput(compact, repoSource);
  expect(whole.hunks).toHaveLength(2);
  expect(whole.hunks.map(hunk => [hunk.oldStart, hunk.oldLines])).toEqual([[7, 7], [37, 7]]);
  expect(whole.diffHash).toBe(hunks.diffHash);
  expect(whole.hunks.map(hunk => hunk.hash)).toEqual(hunks.hunks.map(hunk => hunk.hash));
  expect(whole.diffText).not.toContain("line 20");
});

it("quotes canonical native paths without JSON-escaping quote or backslash characters", () => {
  const document = fixtureDocument();
  document.files[0].path = document.files[0].oldPath = 'src/a"b\\c.ts';
  const input = buildStoryInput(document, patchSource);
  expect(input.diffText).toContain('--- "a/src/a"b\\c.ts"\n+++ "b/src/a"b\\c.ts"');
});

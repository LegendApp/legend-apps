import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { buildUnifiedPatchSelection, unifiedPatchHunkKeys, UnifiedPatchError } from "../../../diff-parser/src/unifiedPatch";
import { applyPatchSelection, loadFilePatch } from "../../../../apps/git/src/gitPatch";
import { GitService } from "../../src/GitService";
import type { GitStatusEntry } from "../../src/gitStatus";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-patch-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string, files: Record<string, string> = {}) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "core.autocrlf": "false", "core.filemode": "true" })) fixtureGit(path, "config", key, value);
  for (const [file, content] of Object.entries(files)) writeFileSync(join(path, file), content);
  if (Object.keys(files).length) { fixtureGit(path, "add", "-A"); fixtureGit(path, "commit", "-m", "Base"); }
  return { path, git: new GitService(path, realRunner) };
}

const index = (path: string, file: string) => execFileSync("git", ["show", `:${file}`], { cwd: path, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } }).toString("binary");
const cached = (path: string) => fixtureGit(path, "diff", "--cached", "--no-color");
const lines = (count: number, change: Record<number, string> = {}) => Array.from({ length: count }, (_, i) => change[i + 1] ?? `line ${i + 1}`).join("\n") + "\n";

async function entry(git: GitService, path: string): Promise<GitStatusEntry> {
  const found = (await git.status()).entries.find(item => item.path === path);
  if (!found) throw new Error(`${path} is not in status`);
  return found;
}

async function load(git: GitService, path: string, staged: boolean) {
  const patch = await loadFilePatch(git, await entry(git, path), staged);
  if (!patch.file) throw new Error(`No patch for ${path}`);
  return patch.file;
}

async function apply(git: GitService, path: string, staged: boolean, pick: (file: Awaited<ReturnType<typeof load>>) => string[]) {
  const file = await load(git, path, staged);
  await applyPatchSelection(git, file, staged, new Set(pick(file)));
}

it("stages and unstages a single hunk, leaving other hunks unstaged", async () => {
  const { path, git } = repo("hunks", { "file.txt": lines(30) });
  writeFileSync(join(path, "file.txt"), lines(30, { 2: "two", 25: "twenty-five" }));
  await apply(git, "file.txt", false, file => unifiedPatchHunkKeys(file.hunks[1]!));
  expect(index(path, "file.txt")).toBe(lines(30, { 25: "twenty-five" }));
  expect(cached(path)).toContain("+twenty-five");
  expect(cached(path)).not.toContain("+two");
  expect(await entry(git, "file.txt")).toMatchObject({ indexStatus: "M", worktreeStatus: "M" });
  await apply(git, "file.txt", true, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(cached(path)).toBe("");
  expect(readFileSync(join(path, "file.txt"), "utf8")).toBe(lines(30, { 2: "two", 25: "twenty-five" }));
});

it("stages a line selection with consistent context and offsets across hunks, then unstages one line", async () => {
  const { path, git } = repo("lines", { "file.txt": lines(30) });
  const worktree = lines(30, { 3: "three\nextra a\nextra b", 26: "twenty-six" });
  writeFileSync(join(path, "file.txt"), worktree);
  // Hunk 0 replaces line 3 with three lines; keep only "extra b" so the next hunk's start shifts by one.
  await apply(git, "file.txt", false, file => ["+5", "-26", "+28"].filter(key => file.hunks.some(hunk => unifiedPatchHunkKeys(hunk).includes(key))));
  expect(index(path, "file.txt")).toBe(lines(30, { 3: "line 3\nextra b", 26: "twenty-six" }));
  await apply(git, "file.txt", true, () => ["+4"]);
  expect(index(path, "file.txt")).toBe(lines(30, { 26: "twenty-six" }));
  await expect(apply(git, "file.txt", false, () => [])).rejects.toThrow("Select at least one changed line");
});

it("stages next to unrelated staged changes in the same file", async () => {
  const { path, git } = repo("neighbors", { "file.txt": lines(12) });
  writeFileSync(join(path, "file.txt"), lines(12, { 2: "staged two" }));
  await git.stageFile("file.txt");
  writeFileSync(join(path, "file.txt"), lines(12, { 2: "staged two", 4: "four" }));
  await apply(git, "file.txt", false, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(index(path, "file.txt")).toBe(lines(12, { 2: "staged two", 4: "four" }));
  await apply(git, "file.txt", true, () => ["-4", "+4"]);
  expect(index(path, "file.txt")).toBe(lines(12, { 2: "staged two" }));
});

it("handles a missing newline at end of file in both directions", async () => {
  const { path, git } = repo("no-eol", { "file.txt": "a\nb" });
  writeFileSync(join(path, "file.txt"), "a\nb\nc\n");
  await apply(git, "file.txt", false, () => ["+3"]);
  expect(index(path, "file.txt")).toBe("a\nb\nc\n");
  await apply(git, "file.txt", true, () => ["+3"]);
  expect(index(path, "file.txt")).toBe("a\nb\n");
  await apply(git, "file.txt", true, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(index(path, "file.txt")).toBe("a\nb");
  const { path: other, git: otherGit } = repo("no-eol-reverse", { "file.txt": "c" });
  writeFileSync(join(other, "file.txt"), "m8");
  fixtureGit(other, "add", "file.txt");
  await apply(otherGit, "file.txt", true, () => ["-1"]);
  expect(index(other, "file.txt")).toBe("c\nm8");
  writeFileSync(join(path, "file.txt"), "a\nB");
  await apply(git, "file.txt", false, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(index(path, "file.txt")).toBe("a\nB");
});

it("preserves CRLF bytes when staging and unstaging lines", async () => {
  const { path, git } = repo("crlf", { "file.txt": "one\r\ntwo\r\nthree\r\n" });
  writeFileSync(join(path, "file.txt"), "one\r\nTWO\r\nthree\r\nfour\r\n");
  await apply(git, "file.txt", false, () => ["-2", "+2"]);
  expect(index(path, "file.txt")).toBe("one\r\nTWO\r\nthree\r\n");
  await apply(git, "file.txt", false, () => ["+4"]);
  expect(index(path, "file.txt")).toBe("one\r\nTWO\r\nthree\r\nfour\r\n");
  await apply(git, "file.txt", true, () => ["-2", "+2"]);
  expect(index(path, "file.txt")).toBe("one\r\ntwo\r\nthree\r\nfour\r\n");
});

it("partially stages an added file, unstages part of it, and fully unstages it back to untracked", async () => {
  const { path, git } = repo("added", { "base.txt": "base\n" });
  writeFileSync(join(path, "-new file.txt"), "a\nb\nc\n");
  chmodSync(join(path, "-new file.txt"), 0o755);
  await apply(git, "-new file.txt", false, () => ["+1", "+3"]);
  expect(index(path, "-new file.txt")).toBe("a\nc\n");
  expect(fixtureGit(path, "ls-files", "-s", "--", "-new file.txt")).toMatch(/^100755 /);
  expect(await entry(git, "-new file.txt")).toMatchObject({ indexStatus: "A", worktreeStatus: "M" });
  await apply(git, "-new file.txt", true, () => ["+2"]);
  expect(index(path, "-new file.txt")).toBe("a\n");
  await apply(git, "-new file.txt", true, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(await entry(git, "-new file.txt")).toMatchObject({ kind: "untracked" });
  expect(readFileSync(join(path, "-new file.txt"), "utf8")).toBe("a\nb\nc\n");
});

it("partially stages a deleted file, completes the deletion, and partially restores it", async () => {
  const { path, git } = repo("deleted", { "gone.txt": "x\ny\nz\n", "keep.txt": "keep\n" });
  unlinkSync(join(path, "gone.txt"));
  await apply(git, "gone.txt", false, () => ["-2"]);
  expect(index(path, "gone.txt")).toBe("x\nz\n");
  await apply(git, "gone.txt", false, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(await entry(git, "gone.txt")).toMatchObject({ indexStatus: "D", worktreeStatus: "." });
  await apply(git, "gone.txt", true, () => ["-1"]);
  expect(index(path, "gone.txt")).toBe("x\n");
  expect(await entry(git, "gone.txt")).toMatchObject({ indexStatus: "M", worktreeStatus: "D" });
});

it("unstages lines inside a staged rename while keeping the rename staged", async () => {
  const { path, git } = repo("renamed", { "old.txt": lines(10) });
  renameSync(join(path, "old.txt"), join(path, "new name.txt"));
  writeFileSync(join(path, "new name.txt"), lines(10, { 2: "two", 9: "nine" }));
  fixtureGit(path, "add", "-A");
  expect(await entry(git, "new name.txt")).toMatchObject({ kind: "renamed", originalPath: "old.txt" });
  const file = await load(git, "new name.txt", true);
  expect(file).toMatchObject({ oldPath: "old.txt", newPath: "new name.txt" });
  await applyPatchSelection(git, file, true, new Set(["-2", "+2"]));
  expect(await entry(git, "new name.txt")).toMatchObject({ kind: "renamed", originalPath: "old.txt", worktreeStatus: "M" });
  expect(index(path, "new name.txt")).toBe(lines(10, { 9: "nine" }));
});

it("refuses binary hunks and leaves mode changes out of partial patches", async () => {
  const { path, git } = repo("binary-mode", { "data.bin": "\0\x01\x02", "tool.sh": "echo one\n", "only-mode.sh": "echo\n" });
  writeFileSync(join(path, "data.bin"), "\0\x01\x03");
  const binary = await load(git, "data.bin", false);
  expect(binary.binary).toBe(true);
  expect(() => buildUnifiedPatchSelection(binary, new Set())).toThrow(UnifiedPatchError);
  expect(() => buildUnifiedPatchSelection(binary, new Set())).toThrow("whole file");
  chmodSync(join(path, "only-mode.sh"), 0o755);
  const modeOnly = await load(git, "only-mode.sh", false);
  expect(modeOnly.hunks).toEqual([]);
  expect(() => buildUnifiedPatchSelection(modeOnly, new Set())).toThrow("Select at least one changed line");
  chmodSync(join(path, "tool.sh"), 0o755);
  writeFileSync(join(path, "tool.sh"), "echo two\n");
  await apply(git, "tool.sh", false, file => unifiedPatchHunkKeys(file.hunks[0]!));
  expect(index(path, "tool.sh")).toBe("echo two\n");
  expect(fixtureGit(path, "ls-files", "-s", "--", "tool.sh")).toMatch(/^100644 /);
});

it("stages and unstages lines on an unborn HEAD", async () => {
  const { path, git } = repo("unborn");
  writeFileSync(join(path, "file.txt"), "a\nb\n");
  fixtureGit(path, "add", "file.txt");
  writeFileSync(join(path, "file.txt"), "a\nB\nc\n");
  expect((await git.status()).branch.oid).toBe("(initial)");
  await apply(git, "file.txt", false, () => ["+3"]);
  expect(index(path, "file.txt")).toBe("a\nb\nc\n");
  await apply(git, "file.txt", true, () => ["+1"]);
  expect(index(path, "file.txt")).toBe("b\nc\n");
});

it("respects an external index.lock and records the apply operation", async () => {
  const { path, git } = repo("locked", { "file.txt": "a\n" });
  writeFileSync(join(path, "file.txt"), "b\n");
  const file = await load(git, "file.txt", false);
  writeFileSync(join(path, ".git/index.lock"), "");
  await expect(applyPatchSelection(git, file, false, new Set(unifiedPatchHunkKeys(file.hunks[0]!)))).rejects.toMatchObject({ code: "index-locked" });
  unlinkSync(join(path, ".git/index.lock"));
  await applyPatchSelection(git, file, false, new Set(unifiedPatchHunkKeys(file.hunks[0]!)));
  expect(index(path, "file.txt")).toBe("b\n");
  expect(git.getOperationLog().some(log => log.args.includes("apply") && log.args.includes("--cached") && log.exit?.type === "exited")).toBe(true);
});

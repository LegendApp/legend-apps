import { chmodSync, existsSync, readlinkSync, renameSync, symlinkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { unifiedPatchHunkKeys } from "../../../diff-parser/src/unifiedPatch";
import { discardPatchSelection, loadFilePatch } from "../../../../apps/git/src/gitPatch";
import { discardRefPrefix, GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-discard-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string, files: Record<string, string | Buffer> = {}, config: Record<string, string> = {}) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "core.autocrlf": "false", "core.filemode": "true", ...config })) fixtureGit(path, "config", key, value);
  for (const [file, content] of Object.entries(files)) { mkdirSync(dirname(join(path, file)), { recursive: true }); writeFileSync(join(path, file), content); }
  if (Object.keys(files).length) { fixtureGit(path, "add", "-A"); fixtureGit(path, "commit", "-m", "Base"); }
  return { path, git: new GitService(path, realRunner) };
}

const raw = (path: string, ...args: string[]) => execFileSync("git", args, { cwd: path, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });
const bytes = (path: string, file: string) => readFileSync(join(path, file));
const refs = (path: string, prefix = "refs/legend-git/") => fixtureGit(path, "for-each-ref", "--format=%(refname)", prefix).split("\n").filter(Boolean);
const lines = (count: number, change: Record<number, string> = {}, eol = "\n") => Array.from({ length: count }, (_, i) => change[i + 1] ?? `line ${i + 1}`).join(eol) + eol;

async function unstagedFile(git: GitService, path: string) {
  const entry = (await git.status()).entries.find(item => item.path === path)!;
  const patch = await loadFilePatch(git, entry, false);
  return patch.file!;
}

it("discards a whole CRLF file without a final newline, keeps the index, and restores the exact bytes from the backup ref", async () => {
  const base = "one\r\ntwo\r\nthree";
  const { path, git } = repo("whole", { "file.txt": base });
  const edited = Buffer.from("one\r\nTWO\r\nthree\r\nfour", "binary");
  writeFileSync(join(path, "file.txt"), edited);
  const indexBefore = fixtureGit(path, "ls-files", "-s");
  const backup = await git.discardFiles(["file.txt"]);
  expect(bytes(path, "file.txt").toString("binary")).toBe(base);
  expect(fixtureGit(path, "ls-files", "-s")).toBe(indexBefore);
  expect(fixtureGit(path, "status", "--porcelain")).toBe("");
  expect(fixtureGit(path, "stash", "list")).toBe("");
  expect(backup.ref.startsWith(discardRefPrefix)).toBe(true);
  expect(raw(path, "cat-file", "blob", `${backup.ref}:file.txt`).equals(edited)).toBe(true);
  expect(await git.lastDiscard()).toMatchObject({ ref: backup.ref, entries: [{ path: "file.txt", mode: "100644" }] });

  const { replaced } = await git.restoreDiscard(backup.ref);
  expect(bytes(path, "file.txt").equals(edited)).toBe(true);
  expect(fixtureGit(path, "ls-files", "-s")).toBe(indexBefore);
  expect(raw(path, "cat-file", "blob", `${replaced.ref}:file.txt`).toString("binary")).toBe(base);
  expect(refs(path, discardRefPrefix)).toEqual([]);
  expect(refs(path, "refs/legend-git/restored/")).toHaveLength(1);
  expect(await git.lastDiscard()).toBeNull();
});

it("discards one hunk next to staged changes without touching the index", async () => {
  const { path, git } = repo("hunk", { "file.txt": lines(30) });
  writeFileSync(join(path, "file.txt"), lines(30, { 2: "staged two" }));
  await git.stageFile("file.txt");
  const index = fixtureGit(path, "ls-files", "-s");
  writeFileSync(join(path, "file.txt"), lines(30, { 2: "staged two", 4: "four", 26: "twenty-six" }));
  const file = await unstagedFile(git, "file.txt");
  expect(file.hunks).toHaveLength(2);
  await discardPatchSelection(git, "file.txt", file, new Set(unifiedPatchHunkKeys(file.hunks[1]!)));
  expect(bytes(path, "file.txt").toString()).toBe(lines(30, { 2: "staged two", 4: "four" }));
  expect(fixtureGit(path, "ls-files", "-s")).toBe(index);
  expect(fixtureGit(path, "diff", "--cached", "--no-color")).toContain("+staged two");
  const backup = (await git.lastDiscard())!;
  expect(raw(path, "cat-file", "blob", `${backup.ref}:file.txt`).toString()).toBe(lines(30, { 2: "staged two", 4: "four", 26: "twenty-six" }));
});

it("discards a line selection in a CRLF file without a final newline, keeping the other changes byte-exact", async () => {
  const base = "a\r\nb\r\nc\r\nd";
  const { path, git } = repo("lines", { "crlf.txt": base });
  writeFileSync(join(path, "crlf.txt"), "a\r\nB\r\nc\r\nD");
  const file = await unstagedFile(git, "crlf.txt");
  // Revert only the last line's change, which has no newline on either side.
  const first = await discardPatchSelection(git, "crlf.txt", file, new Set(["-4", "+4"]));
  expect(bytes(path, "crlf.txt").toString("binary")).toBe("a\r\nB\r\nc\r\nd");
  const again = await unstagedFile(git, "crlf.txt");
  await discardPatchSelection(git, "crlf.txt", again, new Set(["+2"]));
  expect(bytes(path, "crlf.txt").toString("binary")).toBe("a\r\nc\r\nd");
  expect(fixtureGit(path, "diff", "--cached")).toBe("");
  await git.restoreDiscard((await git.lastDiscard())!.ref);
  expect(bytes(path, "crlf.txt").toString("binary")).toBe("a\r\nB\r\nc\r\nd");
  // Older discards are no longer offered once the newest is restored, but their refs still restore exactly.
  expect(await git.lastDiscard()).toBeNull();
  await git.restoreDiscard(first.ref);
  expect(bytes(path, "crlf.txt").toString("binary")).toBe("a\r\nB\r\nc\r\nD");
});

it("backs up and deletes untracked files, and restores them with their mode", async () => {
  const { path, git } = repo("untracked", { "keep.txt": "keep\n" });
  mkdirSync(join(path, "-dir/sub"), { recursive: true });
  const script = Buffer.from([0x23, 0x21, 0x00, 0xff, 0x0d, 0x0a]);
  writeFileSync(join(path, "-dir/sub/tool"), script);
  chmodSync(join(path, "-dir/sub/tool"), 0o755);
  const backup = await git.discardFiles(["-dir/sub/tool"]);
  expect(existsSync(join(path, "-dir/sub/tool"))).toBe(false);
  expect(fixtureGit(path, "status", "--porcelain")).toBe("");
  expect(fixtureGit(path, "ls-tree", "-r", backup.ref)).toMatch(/^100755 blob [0-9a-f]+\t-dir\/sub\/tool$/);
  await git.restoreDiscard(backup.ref);
  expect(bytes(path, "-dir/sub/tool").equals(script)).toBe(true);
  expect(statSync(join(path, "-dir/sub/tool")).mode & 0o111).not.toBe(0);
});

it("restores a deleted tracked file, and restoring the backup deletes it again", async () => {
  const { path, git } = repo("deleted", { "gone.txt": "content\n" });
  unlinkSync(join(path, "gone.txt"));
  const backup = await git.discardFiles(["gone.txt"]);
  expect(backup.entries).toEqual([{ path: "gone.txt", mode: null }]);
  expect(bytes(path, "gone.txt").toString()).toBe("content\n");
  await git.restoreDiscard(backup.ref);
  expect(existsSync(join(path, "gone.txt"))).toBe(false);
});

it("discards binary files whole only", async () => {
  const { path, git } = repo("binary", { "image.bin": Buffer.from([0, 1, 2, 3]) });
  writeFileSync(join(path, "image.bin"), Buffer.from([0, 9, 9, 3, 4]));
  const file = await unstagedFile(git, "image.bin");
  expect(() => discardPatchSelection(git, "image.bin", file, new Set())).toThrow("Binary files");
  const backup = await git.discardFiles(["image.bin"]);
  expect(bytes(path, "image.bin").equals(Buffer.from([0, 1, 2, 3]))).toBe(true);
  expect(raw(path, "cat-file", "blob", `${backup.ref}:image.bin`).equals(Buffer.from([0, 9, 9, 3, 4]))).toBe(true);
});

it("refuses to discard while index.lock exists, before writing a backup", async () => {
  const { path, git } = repo("locked", { "file.txt": "a\n" });
  writeFileSync(join(path, "file.txt"), "b\n");
  writeFileSync(join(path, ".git/index.lock"), "");
  await expect(git.discardFiles(["file.txt"])).rejects.toMatchObject({ code: "index-locked" });
  expect(bytes(path, "file.txt").toString()).toBe("b\n");
  expect(refs(path)).toEqual([]);
  unlinkSync(join(path, ".git/index.lock"));
});

function conflict(name: string) {
  const { path, git } = repo(name, { "file.txt": "base\n", "other.txt": "x\n" });
  fixtureGit(path, "checkout", "-q", "-b", "side");
  writeFileSync(join(path, "file.txt"), "side\n"); fixtureGit(path, "commit", "-qam", "Side");
  fixtureGit(path, "checkout", "-q", "main");
  writeFileSync(join(path, "file.txt"), "main\n"); fixtureGit(path, "commit", "-qam", "Main");
  expect(() => fixtureGit(path, "merge", "side")).toThrow();
  return { path, git };
}

it("refuses to discard conflicted files", async () => {
  const { path, git } = conflict("conflict-discard");
  const content = bytes(path, "file.txt").toString();
  await expect(git.discardFiles(["file.txt"])).rejects.toThrow("merge conflicts");
  expect(bytes(path, "file.txt").toString()).toBe(content);
  expect(refs(path)).toEqual([]);
});

it("refuses to restore through a folder that became a symbolic link, leaving files outside the repository alone", async () => {
  const { path, git } = repo("symlink-parent", { "d/a": "base\n" });
  writeFileSync(join(path, "d/a"), "edited\n");
  const backup = await git.discardFiles(["d/a"]);
  const outside = mkdtempSync(join(root, "outside-"));
  writeFileSync(join(outside, "a"), "precious\n");
  renameSync(join(path, "d"), join(path, "d-moved"));
  symlinkSync(outside, join(path, "d"));
  await expect(git.restoreDiscard(backup.ref)).rejects.toThrow("symbolic link");
  expect(readFileSync(join(outside, "a"), "utf8")).toBe("precious\n");
});

it("offers only the newest discard, and drops the backup when the worktree write fails", async () => {
  const { path, git } = repo("stale", { "a.txt": "base\n" });
  writeFileSync(join(path, "a.txt"), "v1\n"); await git.discardFiles(["a.txt"]);
  writeFileSync(join(path, "a.txt"), "v2\n"); const second = await git.discardFiles(["a.txt"]);
  expect((await git.lastDiscard())?.ref).toBe(second.ref);
  await git.restoreDiscard(second.ref);
  expect(await git.lastDiscard()).toBeNull();
  expect(bytes(path, "a.txt").toString()).toBe("v2\n");
  const before = refs(path);
  const file = await unstagedFile(git, "a.txt");
  writeFileSync(join(path, "a.txt"), "v3\n");
  await expect(discardPatchSelection(git, "a.txt", file, new Set(unifiedPatchHunkKeys(file.hunks[0]!)))).rejects.toThrow();
  expect(refs(path)).toEqual(before);
  expect(bytes(path, "a.txt").toString()).toBe("v3\n");
});

it("refuses a partial discard that line-ending conversion would spread to other lines", async () => {
  const { path, git } = repo("autocrlf", { "file.txt": lines(20) }, { "core.autocrlf": "true" });
  const worktree = lines(20, { 1: "X1", 20: "X20" }).replace("line 11\n", "line 11\r\n");
  writeFileSync(join(path, "file.txt"), worktree);
  const file = await unstagedFile(git, "file.txt");
  await expect(discardPatchSelection(git, "file.txt", file, new Set(unifiedPatchHunkKeys(file.hunks[0]!)))).rejects.toThrow("Discard the whole file");
  expect(bytes(path, "file.txt").toString()).toBe(worktree);
  expect(refs(path)).toEqual([]);
});

it("restores a symbolic link whose target ends with a newline", async () => {
  const { path, git } = repo("link", { "keep.txt": "k\n" });
  symlinkSync("target\n", join(path, "link"));
  const backup = await git.discardFiles(["link"]);
  expect(existsSync(join(path, "link"))).toBe(false);
  await git.restoreDiscard(backup.ref);
  expect(readlinkSync(join(path, "link"))).toBe("target\n");
});

describe("commit", () => {
  function hooks(path: string, scripts: Record<string, string>) {
    const dir = join(path, ".hooks");
    mkdirSync(dir);
    for (const [name, body] of Object.entries(scripts)) { writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`); chmodSync(join(dir, name), 0o755); }
    fixtureGit(path, "config", "core.hooksPath", dir);
  }

  it("reports a failing pre-commit hook and commits nothing", async () => {
    const { path, git } = repo("hook-fail", { "file.txt": "a\n" });
    hooks(path, { "pre-commit": "echo 'lint failed: file.txt' >&2; exit 1" });
    writeFileSync(join(path, "file.txt"), "b\n"); fixtureGit(path, "add", "file.txt");
    const head = fixtureGit(path, "rev-parse", "HEAD");
    await expect(git.commit({ message: "Change\n" })).rejects.toThrow("lint failed: file.txt");
    expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(head);
    expect(fixtureGit(path, "diff", "--cached", "--name-only")).toBe("file.txt");
  });

  it("passes the message on stdin byte-exact, runs commit-msg hooks and adds a sign-off", async () => {
    const { path, git } = repo("message", { "file.txt": "a\n" });
    hooks(path, { "commit-msg": "printf '\\nHook-Edited: yes\\n' >> \"$1\"" });
    writeFileSync(join(path, "file.txt"), "b\n"); fixtureGit(path, "add", "file.txt");
    const message = "-n --amend ünïcödé ✓ $(touch pwned)\n\n# not a comment\nBody with `backticks` and \"quotes\"\n";
    await git.commit({ message, signoff: true });
    expect(fixtureGit(path, "log", "-1", "--format=%B")).toBe("-n --amend ünïcödé ✓ $(touch pwned)\n\n# not a comment\nBody with `backticks` and \"quotes\"\n\nSigned-off-by: Git Test <git@example.test>\n\nHook-Edited: yes");
    expect(existsSync(join(path, "pwned"))).toBe(false);
    expect(await git.headMessage()).toContain("Hook-Edited: yes");
  });

  it("amends HEAD, including a message-only amend with nothing staged", async () => {
    const { path, git } = repo("amend", { "file.txt": "a\n" });
    const parent = fixtureGit(path, "rev-parse", "HEAD");
    writeFileSync(join(path, "file.txt"), "b\n"); fixtureGit(path, "add", "file.txt");
    await git.commit({ message: "First\n" });
    await expect(git.commit({ message: "Again\n" })).rejects.toThrow("Nothing is staged");
    await git.commit({ message: "First, reworded\n\nWith a body\n", amend: true });
    expect(fixtureGit(path, "rev-parse", "HEAD^")).toBe(parent);
    expect(fixtureGit(path, "log", "-2", "--format=%s")).toBe("First, reworded\nBase");
    expect(fixtureGit(path, "show", "--stat", "--format=", "HEAD")).toContain("file.txt");
  });

  it("refuses to amend on an unborn HEAD and makes the first commit", async () => {
    const { path, git } = repo("unborn");
    writeFileSync(join(path, "file.txt"), "a\n"); fixtureGit(path, "add", "file.txt");
    await expect(git.commit({ message: "First\n", amend: true })).rejects.toThrow("no commit to amend");
    await expect(git.commit({ message: "  \n" })).rejects.toThrow("Enter a commit message");
    await git.commit({ message: "First\n" });
    expect(fixtureGit(path, "log", "--format=%s")).toBe("First");
  });

  it("blocks committing while a file is conflicted", async () => {
    const { path, git } = conflict("conflict-commit");
    const head = fixtureGit(path, "rev-parse", "HEAD");
    await expect(git.commit({ message: "Merge\n" })).rejects.toThrow("Resolve the merge conflicts in 1 file");
    expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(head);
  });

  it("concludes a merge whose result matches HEAD", async () => {
    const { path, git } = repo("merge-ours", { "file.txt": "base\n" });
    fixtureGit(path, "checkout", "-q", "-b", "side");
    writeFileSync(join(path, "file.txt"), "side\n"); fixtureGit(path, "commit", "-qam", "Side");
    fixtureGit(path, "checkout", "-q", "main");
    fixtureGit(path, "merge", "--no-commit", "--no-ff", "-s", "ours", "side");
    await git.commit({ message: "Merge side\n" });
    expect(fixtureGit(path, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
  });

  it("signs through the repository's SSH signing configuration", async () => {
    const { path, git } = repo("signed", { "file.txt": "a\n" });
    const key = join(path, ".key");
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f", key]);
    for (const [name, value] of [["gpg.format", "ssh"], ["user.signingkey", key], ["commit.gpgsign", "true"]]) fixtureGit(path, "config", name!, value!);
    writeFileSync(join(path, "file.txt"), "b\n"); fixtureGit(path, "add", "file.txt");
    await git.commit({ message: "Signed\n" });
    expect(fixtureGit(path, "cat-file", "commit", "HEAD")).toContain("-----BEGIN SSH SIGNATURE-----");
  });
});

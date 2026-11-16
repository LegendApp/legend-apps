import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GitIndexLockedError, GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-staged-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string, files: Record<string, string | Buffer> = {}) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "core.autocrlf": "false", "diff.noprefix": "true", "diff.external": "false", "color.diff": "always" })) fixtureGit(path, "config", key, value);
  write(path, files);
  if (Object.keys(files).length) { fixtureGit(path, "add", "-A"); fixtureGit(path, "commit", "-m", "Base"); }
  return { path, git: new GitService(path, realRunner) };
}
function write(path: string, files: Record<string, string | Buffer>) {
  for (const [file, content] of Object.entries(files)) { mkdirSync(dirname(join(path, file)), { recursive: true }); writeFileSync(join(path, file), content); }
}
const lines = (count: number, prefix = "line") => Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}\n`).join("");

it("reads only the staged changes, with renames, CRLF and unicode paths, binary files by name, and leaves the index alone", async () => {
  const { path, git } = repo("mixed", { "a.txt": lines(5), "old name.txt": lines(20), "crlf.txt": "one\r\ntwo\r\n", "logo.bin": Buffer.from([0, 1, 2, 3]) });
  write(path, { "a.txt": lines(5).replace("line 3", "LINE 3"), "crlf.txt": "one\r\nTWO\r\n", "logo.bin": Buffer.from([0, 9, 9, 9]), "ünï côdé.txt": "hi\n" });
  renameSync(join(path, "old name.txt"), join(path, "new name.txt"));
  fixtureGit(path, "add", "-A");
  write(path, { "a.txt": "unstaged edit\n", "untracked.txt": "not staged\n" });
  const before = fixtureGit(path, "ls-files", "--stage");

  const staged = await git.stagedDiff();

  expect(staged.files).toEqual([
    { path: "a.txt", originalPath: null, binary: false, added: 1, deleted: 1 },
    { path: "crlf.txt", originalPath: null, binary: false, added: 1, deleted: 1 },
    { path: "logo.bin", originalPath: null, binary: true, added: 0, deleted: 0 },
    { path: "new name.txt", originalPath: "old name.txt", binary: false, added: 0, deleted: 0 },
    { path: "ünï côdé.txt", originalPath: null, binary: false, added: 1, deleted: 0 },
  ]);
  expect(staged).toMatchObject({ truncated: false, omitted: [] });
  // The user's diff.noprefix, external diff and color settings do not leak into the stable format.
  expect(staged.patch).toContain("diff --git a/a.txt b/a.txt\n");
  expect(staged.patch).toContain("-line 3\n+LINE 3\n");
  expect(staged.patch).not.toContain("unstaged edit");
  expect(staged.patch).not.toContain("untracked");
  expect(staged.patch).toContain("-two\r\n+TWO\r\n");
  expect(staged.patch).toContain("rename from old name.txt\nrename to new name.txt\n");
  expect(staged.patch).toContain("+++ b/ünï côdé.txt\t\n");
  expect(staged.patch).not.toContain("logo.bin");
  expect(staged.patch).not.toContain("\u001b[");
  expect(fixtureGit(path, "ls-files", "--stage")).toBe(before);
});

it("caps the patch on a line boundary and lists every file it left out", async () => {
  const { path, git } = repo("cap", { "a.txt": lines(50), "b.txt": lines(50), "c.txt": lines(50) });
  write(path, { "a.txt": lines(50, "A"), "b.txt": lines(50, "B"), "c.txt": lines(50, "C") });
  fixtureGit(path, "add", "-A");
  const full = await git.stagedDiff();
  expect(full).toMatchObject({ truncated: false, omitted: [] });

  const byChars = await git.stagedDiff({ maxChars: full.patch.indexOf("diff --git a/b.txt") + 200 });
  expect(byChars.patch.endsWith("\n")).toBe(true);
  expect(full.patch.startsWith(byChars.patch)).toBe(true);
  expect(byChars.patch).toContain("diff --git a/b.txt");
  expect(byChars).toMatchObject({ truncated: true, omitted: ["b.txt", "c.txt"] });
  expect(byChars.files.map(file => file.path)).toEqual(["a.txt", "b.txt", "c.txt"]);

  // A file with more changed lines than the per-file limit is listed but not read.
  expect(await git.stagedDiff({ maxFileLines: 99 })).toMatchObject({ patch: "", truncated: true, omitted: ["a.txt", "b.txt", "c.txt"] });
});

it("reads the first commit's staged files on an unborn branch and reports an empty staged diff", async () => {
  const { path, git } = repo("unborn");
  expect(await git.stagedDiff()).toEqual({ files: [], patch: "", truncated: false, omitted: [] });
  write(path, { "first.txt": "first\n" });
  fixtureGit(path, "add", "first.txt");
  const staged = await git.stagedDiff();
  expect(staged.files).toEqual([{ path: "first.txt", originalPath: null, binary: false, added: 1, deleted: 0 }]);
  expect(staged.patch).toContain("new file mode 100644\n");
  expect(staged.patch).toContain("+first\n");
});

it("refuses while index.lock is present", async () => {
  const { path, git } = repo("locked", { "a.txt": "a\n" });
  writeFileSync(join(path, ".git", "index.lock"), "");
  await expect(git.stagedDiff()).rejects.toBeInstanceOf(GitIndexLockedError);
});

it("accounts for type changes, tab paths, submodules shown as logs and NUL bytes in text files", async () => {
  const { path, git } = repo("edge", { "tf": "regular\n", "z.txt": lines(400) });
  const sub = fixtureGit(path, "rev-parse", "HEAD");
  fixtureGit(path, "update-index", "--add", "--cacheinfo", `160000,${sub},sub`);
  fixtureGit(path, "commit", "-qm", "Add submodule");
  mkdirSync(join(path, "sub"));
  fixtureGit(path, "config", "diff.submodule", "log");
  unlinkSync(join(path, "tf"));
  symlinkSync("z.txt", join(path, "tf"));
  write(path, { "z.txt": lines(400, "Z"), "tab\tname.txt": "tabbed\n", "nul.txt": `${"a".repeat(9000)}\0tail\n` });
  fixtureGit(path, "add", "-A");
  fixtureGit(path, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},sub`);

  const full = await git.stagedDiff();
  expect(full.files.map(file => [file.path, file.binary])).toEqual([["nul.txt", false], ["sub", false], ["tab\tname.txt", false], ["tf", false], ["z.txt", false]]);
  expect(full).toMatchObject({ truncated: false, omitted: [] });
  expect(full.patch).toContain("+tabbed\n");
  expect(full.patch).toContain(`-Subproject commit ${sub}\n+Subproject commit ${"1".repeat(40)}\n`);
  expect(full.patch).toContain("\\0tail");
  expect(full.patch).not.toContain("\0");
  expect(full.patch).toContain("new file mode 120000");

  // The type change prints two sections; the cut still lands in z.txt and reports it.
  const cut = await git.stagedDiff({ maxChars: full.patch.indexOf("diff --git a/z.txt") + 500 });
  expect(cut).toMatchObject({ truncated: true, omitted: ["z.txt"] });
  expect(cut.patch).toContain("new file mode 120000");
});

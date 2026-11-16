import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitIndexLockedError, GitLocalChangesError, GitService, parseStashList } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-stashes-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" })) fixtureGit(path, "config", key, value);
  return { path, git: new GitService(path, realRunner) };
}
function commit(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}
const read = (path: string, file: string) => readFileSync(join(path, file), "utf8");
const stashSubjects = (path: string) => fixtureGit(path, "stash", "list", "--format=%gs").split("\n").filter(Boolean);
const status = (path: string) => fixtureGit(path, "status", "--porcelain");

it("pushes tracked changes only, or untracked files too, and lists stashes newest first with unicode messages", async () => {
  const { path, git } = repo("push");
  commit(path, "a.txt", "1\n", "First");
  writeFileSync(join(path, "a.txt"), "2\n");
  writeFileSync(join(path, "new.txt"), "untracked\n");
  const first = await git.stashPush("ünïcode ✓ message");
  expect(read(path, "a.txt")).toBe("1\n");
  expect(read(path, "new.txt")).toBe("untracked\n");
  writeFileSync(join(path, "a.txt"), "3\n");
  const second = await git.stashPush(undefined, { includeUntracked: true });
  expect(existsSync(join(path, "new.txt"))).toBe(false);
  expect(status(path)).toBe("");

  const list = await git.listStashes();
  expect(list.map(({ oid, index, message }) => ({ oid, index, message }))).toEqual([
    { oid: second, index: 0, message: expect.stringMatching(/^WIP on main: [0-9a-f]+ First$/) },
    { oid: first, index: 1, message: "On main: ünïcode ✓ message" },
  ]);
  expect(list[0]!.time).toBeGreaterThan(0);
  expect(list).toEqual(parseStashList(fixtureGit(path, "stash", "list", "-z", "--format=%H%x00%gd%x00%gs%x00%ct")));

  const tracked = await git.stashPatch(first);
  expect(tracked).toContain("diff --git a/a.txt b/a.txt");
  expect(tracked).not.toContain("new.txt");
  const withUntracked = await git.stashPatch(second);
  expect(withUntracked).toContain("+3");
  expect(withUntracked).toContain("diff --git a/new.txt b/new.txt\nnew file mode 100644");
  await expect(git.stashPush("nothing")).rejects.toThrow("There are no local changes to stash.");
});

it("applies cleanly and keeps the stash; a conflicting apply keeps the stash and the work and reports Git's message", async () => {
  const { path, git } = repo("apply");
  commit(path, "a.txt", "1\n", "First");
  writeFileSync(join(path, "a.txt"), "stashed\n");
  const oid = await git.stashPush("change");
  await git.stashApply(oid);
  expect(read(path, "a.txt")).toBe("stashed\n");
  expect((await git.listStashes()).map(stash => stash.oid)).toEqual([oid]);

  // Uncommitted work in the same file: Git refuses and changes nothing.
  writeFileSync(join(path, "a.txt"), "mine\n");
  await expect(git.stashApply(oid)).rejects.toThrow(/would be overwritten/);
  expect(read(path, "a.txt")).toBe("mine\n");
  await expect(git.stashPop(oid)).rejects.toThrow(/would be overwritten/);
  expect((await git.listStashes()).map(stash => stash.oid)).toEqual([oid]);

  // A committed change in the same lines: a real conflict, reported, stash kept even by Pop.
  fixtureGit(path, "commit", "-q", "-am", "Mine");
  await expect(git.stashPop(oid)).rejects.toThrow(/CONFLICT \(content\): Merge conflict in a\.txt/);
  expect(read(path, "a.txt")).toContain("<<<<<<<");
  expect((await git.listStashes()).map(stash => stash.oid)).toEqual([oid]);
});

it("pops cleanly (the stash is gone) and drops by oid after another push shifted the indexes", async () => {
  const { path, git } = repo("pop");
  commit(path, "a.txt", "1\n", "First");
  writeFileSync(join(path, "a.txt"), "one\n");
  const one = await git.stashPush("one");
  writeFileSync(join(path, "a.txt"), "two\n");
  const two = await git.stashPush("two");
  writeFileSync(join(path, "a.txt"), "three\n");
  const three = await git.stashPush("three");
  // `one` was stash@{0} when pushed; now it is stash@{2}.
  await git.stashDrop(one);
  expect(stashSubjects(path)).toEqual(["On main: three", "On main: two"]);
  await git.stashPop(two);
  expect(read(path, "a.txt")).toBe("two\n");
  expect((await git.listStashes()).map(stash => stash.oid)).toEqual([three]);
  await expect(git.stashDrop(two)).rejects.toThrow("That stash is no longer in the stash list.");
});

it("stashes and switches when the switch was refused, and the auto-stash is listed", async () => {
  const { path, git } = repo("switch");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "other");
  commit(path, "a.txt", "2\n", "Second");
  writeFileSync(join(path, "a.txt"), "dirty\n");
  writeFileSync(join(path, "u.txt"), "untracked\n");
  const refused = git.checkoutBranch("other");
  await expect(refused).rejects.toBeInstanceOf(GitLocalChangesError);
  await expect(refused).rejects.toThrow(/would be overwritten/);
  expect(read(path, "a.txt")).toBe("dirty\n");

  const result = await git.stashAndSwitch("other");
  expect(result.branch).toBe("other");
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("other");
  expect(read(path, "a.txt")).toBe("1\n");
  expect(existsSync(join(path, "u.txt"))).toBe(false);
  expect(await git.listStashes()).toEqual([expect.objectContaining({ oid: result.stash, message: "On main: auto-stash before switching to other" })]);
});

it("doesn't offer Stash and Switch when the branch is checked out in another worktree", async () => {
  const { path, git } = repo("worktree-busy");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "other");
  fixtureGit(path, "worktree", "add", "-q", join(root, "worktree-busy-other"), "other");
  writeFileSync(join(path, "a.txt"), "dirty\n");
  const refused = git.checkoutBranch("other");
  await expect(refused).rejects.toThrow(/already (checked out|used by worktree)/);
  await expect(refused).rejects.not.toBeInstanceOf(GitLocalChangesError);
});

it("pops the auto-stash back, staged changes included, when the switch still fails", async () => {
  const { path, git } = repo("switch-fails");
  commit(path, "a.txt", "1\n", "First");
  commit(path, "b.txt", "1\n", "Second");
  writeFileSync(join(path, "a.txt"), "staged\n");
  fixtureGit(path, "add", "a.txt");
  writeFileSync(join(path, "b.txt"), "unstaged\n");
  writeFileSync(join(path, "u.txt"), "untracked\n");
  const before = status(path);
  await expect(git.stashAndSwitch("missing")).rejects.toThrow(/missing/);
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("main");
  expect(status(path)).toBe(before);
  expect(read(path, "u.txt")).toBe("untracked\n");
  expect(await git.listStashes()).toEqual([]);
});

it("refuses to stash on an unborn HEAD and while index.lock is held", async () => {
  const { path, git } = repo("unborn");
  writeFileSync(join(path, "a.txt"), "1\n");
  fixtureGit(path, "add", "a.txt");
  expect(await git.listStashes()).toEqual([]);
  await expect(git.stashPush("x", { includeUntracked: true })).rejects.toThrow("Stashing needs a first commit.");
  fixtureGit(path, "commit", "-q", "-m", "First");
  writeFileSync(join(path, "a.txt"), "2\n");
  const oid = await git.stashPush("x");
  writeFileSync(join(path, ".git", "index.lock"), "");
  await expect(git.stashPush("y")).rejects.toBeInstanceOf(GitIndexLockedError);
  await expect(git.stashApply(oid)).rejects.toBeInstanceOf(GitIndexLockedError);
  await expect(git.stashDrop(oid)).rejects.toBeInstanceOf(GitIndexLockedError);
  await expect(git.stashAndSwitch("main")).rejects.toBeInstanceOf(GitIndexLockedError);
  expect(existsSync(join(path, ".git", "index.lock"))).toBe(true);
  expect(stashSubjects(path)).toEqual(["On main: x"]);
});

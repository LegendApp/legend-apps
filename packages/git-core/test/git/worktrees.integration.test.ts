import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitIndexLockedError, GitService, parseWorktreeList } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-worktrees-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string) {
  const path = join(root, name, "repo");
  mkdirSync(path, { recursive: true });
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" })) fixtureGit(path, "config", key, value);
  writeFileSync(join(path, "a.txt"), "1\n");
  fixtureGit(path, "add", "--", "a.txt");
  fixtureGit(path, "commit", "-q", "-m", "First");
  return { path, parent: join(root, name), git: new GitService(path, realRunner) };
}
const listed = (path: string) => fixtureGit(path, "worktree", "list", "--porcelain").split("\n").filter(line => line.startsWith("worktree ")).map(line => line.slice(9));

it("lists the main worktree first, then linked ones with spaces and unicode, detached, locked and prunable", async () => {
  const { path, parent, git } = repo("list");
  fixtureGit(path, "branch", "other");
  fixtureGit(path, "branch", "gone");
  const spaced = join(parent, "wört tree ✓");
  fixtureGit(path, "worktree", "add", "-q", "--", spaced, "other");
  fixtureGit(path, "worktree", "add", "-q", "--detach", "--", join(parent, "detached"));
  fixtureGit(path, "worktree", "lock", "--reason", "on a disk", "--", join(parent, "detached"));
  fixtureGit(path, "worktree", "add", "-q", "--", join(parent, "missing"), "gone");
  rmSync(join(parent, "missing"), { recursive: true });
  const head = fixtureGit(path, "rev-parse", "HEAD");
  const worktrees = await git.listWorktrees();
  expect(worktrees.map(({ path, head, branch, detached, locked, main }) => ({ path, head, branch, detached, locked, main }))).toEqual([
    { path, head, branch: "main", detached: false, locked: null, main: true },
    { path: join(parent, "detached"), head, branch: null, detached: true, locked: "on a disk", main: false },
    { path: join(parent, "missing"), head, branch: "gone", detached: false, locked: null, main: false },
    { path: spaced, head, branch: "other", detached: false, locked: null, main: false },
  ]);
  expect(worktrees[2]!.prunable).toMatch(/non-existent/);
  expect(worktrees.map(entry => entry.path)).toEqual(listed(path));
  // A linked worktree's own service lists the same worktrees.
  expect(await new GitService(spaced, realRunner).listWorktrees()).toEqual(worktrees);
  expect(parseWorktreeList("worktree /bare\0bare\0\0")).toEqual([{ path: "/bare", head: null, branch: null, detached: false, bare: true, locked: null, prunable: null, main: true }]);
});

it("adds a worktree for an existing branch and for a new branch from a start point, and refuses a branch checked out elsewhere", async () => {
  const { path, parent, git } = repo("add");
  const first = fixtureGit(path, "rev-parse", "HEAD");
  fixtureGit(path, "branch", "feature");
  writeFileSync(join(path, "a.txt"), "2\n");
  fixtureGit(path, "commit", "-qam", "Second");

  const existing = join(parent, "feature tree ü");
  expect(await git.addWorktree(existing, { branch: "feature" })).toBe(existing);
  expect(fixtureGit(existing, "symbolic-ref", "--short", "HEAD")).toBe("feature");
  expect(readFileSync(join(existing, "a.txt"), "utf8")).toBe("1\n");

  const created = join(parent, "new");
  await git.addWorktree(created, { newBranch: "topic/new", startPoint: first });
  expect(fixtureGit(created, "symbolic-ref", "--short", "HEAD")).toBe("topic/new");
  expect(fixtureGit(path, "rev-parse", "topic/new")).toBe(first);

  await expect(git.addWorktree(join(parent, "again"), { branch: "feature" })).rejects.toThrow(/already (used|checked out)/);
  expect(existsSync(join(parent, "again"))).toBe(false);
  await expect(git.addWorktree(join(parent, "missing-branch"), { branch: "nope" })).rejects.toThrow("There’s no local branch named “nope”.");
  await expect(git.addWorktree(join(parent, "bad"), { newBranch: "bad..name" })).rejects.toThrow("isn’t a valid branch name");
  await expect(git.addWorktree("relative", { branch: "feature" })).rejects.toThrow("Expected an absolute folder path.");
  expect(listed(path)).toEqual([path, existing, created]);
});

it("removes a clean worktree, refuses a dirty one leaving its files, removes it when forced, and unregisters a missing one", async () => {
  const { path, parent, git } = repo("remove");
  for (const name of ["clean", "dirty", "missing"]) fixtureGit(path, "worktree", "add", "-q", "-b", name, "--", join(parent, name));
  await git.removeWorktree(join(parent, "clean"));
  expect(existsSync(join(parent, "clean"))).toBe(false);

  writeFileSync(join(parent, "dirty", "a.txt"), "changed\n");
  writeFileSync(join(parent, "dirty", "new.txt"), "new\n");
  await expect(git.removeWorktree(join(parent, "dirty"))).rejects.toThrow(/modified or untracked files/);
  expect(readFileSync(join(parent, "dirty", "a.txt"), "utf8")).toBe("changed\n");
  expect(readFileSync(join(parent, "dirty", "new.txt"), "utf8")).toBe("new\n");
  await git.removeWorktree(join(parent, "dirty"), { force: true });
  expect(existsSync(join(parent, "dirty"))).toBe(false);

  rmSync(join(parent, "missing"), { recursive: true });
  await git.removeWorktree(join(parent, "missing"));
  expect(listed(path)).toEqual([path]);
  // Branches stay.
  expect(fixtureGit(path, "branch", "--format=%(refname:short)").split("\n").sort()).toEqual(["clean", "dirty", "main", "missing"]);
});

it("refuses a locked worktree until forced, and waits for no one while index.lock is present", async () => {
  const { path, parent, git } = repo("locked");
  const locked = join(parent, "locked");
  fixtureGit(path, "worktree", "add", "-q", "-b", "locked", "--", locked);
  fixtureGit(path, "worktree", "lock", "--", locked);
  await expect(git.removeWorktree(locked)).rejects.toThrow(/locked working tree/);
  expect(existsSync(locked)).toBe(true);

  const lock = join(path, ".git", "index.lock");
  writeFileSync(lock, "");
  await expect(git.addWorktree(join(parent, "blocked"), { newBranch: "blocked" })).rejects.toBeInstanceOf(GitIndexLockedError);
  expect(existsSync(join(parent, "blocked"))).toBe(false);
  rmSync(lock);
  const lockedIndex = fixtureGit(locked, "rev-parse", "--path-format=absolute", "--git-path", "index.lock");
  writeFileSync(lockedIndex, "");
  await expect(git.removeWorktree(locked, { force: true })).rejects.toBeInstanceOf(GitIndexLockedError);
  rmSync(lockedIndex);
  await git.removeWorktree(locked, { force: true });
  expect(existsSync(locked)).toBe(false);
});

it("counts each worktree's changed paths and reads its files' diffs from HEAD, untracked files against /dev/null", async () => {
  const { path, parent, git } = repo("counts");
  const linked = join(parent, "linked ✓");
  fixtureGit(path, "worktree", "add", "-q", "-b", "linked", "--", linked);
  expect(await git.worktreeChangeCount(linked)).toBe(0);
  fixtureGit(linked, "mv", "a.txt", "moved.txt");
  writeFileSync(join(linked, "moved.txt"), "1\nand more\n");
  writeFileSync(join(linked, "b c.txt"), "untracked\n");
  mkdirSync(join(linked, "dir"));
  writeFileSync(join(linked, "dir", "x.txt"), "x\n");
  writeFileSync(join(linked, "dir", "y.txt"), "y\n");
  expect(fixtureGit(linked, "status", "--porcelain")).toMatch(/^RM a.txt -> moved.txt$/m);
  // moved.txt (rename), "b c.txt" and dir/ (one untracked folder).
  expect(await git.worktreeChangeCount(linked)).toBe(3);
  expect(await git.worktreeChangeCount(path)).toBe(0);

  const status = await git.worktreeStatus(linked);
  expect(status.branch.head).toBe("linked");
  expect(status.entries.map(entry => entry.path).sort()).toEqual(["b c.txt", "dir/x.txt", "dir/y.txt", "moved.txt"]);
  expect(await git.worktreeFileDiff(linked, { path: "b c.txt", untracked: true })).toContain("+untracked");
  const moved = await git.worktreeFileDiff(linked, { path: "moved.txt" });
  expect(moved).toContain("new file mode 100644");
  expect(moved).toContain("+and more");
  await expect(git.worktreeChangeCount(join(parent, "nowhere"))).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(git.worktreeChangeCount(linked, { signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
});

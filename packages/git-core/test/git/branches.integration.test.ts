import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitBranchNotMergedError, GitIndexLockedError, GitService, parseRefList } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-branches-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "tag.gpgsign": "false", "advice.detachedHead": "false" })) fixtureGit(path, "config", key, value);
  return { path, git: new GitService(path, realRunner) };
}
function commit(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}
const head = (path: string) => fixtureGit(path, "symbolic-ref", "-q", "--short", "HEAD");
const branches = (path: string) => fixtureGit(path, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n").filter(Boolean);

it("lists branches, remote branches by remote and peeled tags, with slashes and unicode in names", async () => {
  const { path, git } = repo("list");
  const first = commit(path, "a.txt", "1\n", "First");
  const second = commit(path, "a.txt", "2\n", "Second");
  fixtureGit(path, "branch", "feature/ünï-✓", first);
  fixtureGit(path, "branch", "--set-upstream-to=main", "feature/ünï-✓");
  fixtureGit(path, "remote", "add", "origin", "https://example.test/a.git");
  fixtureGit(path, "remote", "add", "up/stream", "https://example.test/b.git");
  fixtureGit(path, "update-ref", "refs/remotes/origin/main", second);
  fixtureGit(path, "update-ref", "refs/remotes/origin/fix/x", first);
  fixtureGit(path, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  fixtureGit(path, "update-ref", "refs/remotes/up/stream/dev", first);
  fixtureGit(path, "tag", "-a", "-m", "Release", "v1.0", first);
  fixtureGit(path, "tag", "light", second);

  const list = await git.listRefs();
  expect(list.branches.map(({ name, current, upstream, oid }) => ({ name, current, upstream, oid }))).toEqual([
    { name: "feature/ünï-✓", current: false, upstream: "main", oid: first },
    { name: "main", current: true, upstream: null, oid: second },
  ]);
  expect(list.branches[0]!.ref).toBe("refs/heads/feature/ünï-✓");
  expect(list.branches[1]!.time).toBeGreaterThan(0);
  expect(list.remotes).toEqual([
    { name: "origin", branches: [
      { name: "origin/fix/x", ref: "refs/remotes/origin/fix/x", oid: first, remote: "origin", branch: "fix/x" },
      { name: "origin/main", ref: "refs/remotes/origin/main", oid: second, remote: "origin", branch: "main" },
    ] },
    { name: "up/stream", branches: [{ name: "up/stream/dev", ref: "refs/remotes/up/stream/dev", oid: first, remote: "up/stream", branch: "dev" }] },
  ]);
  expect(list.tags).toEqual([{ name: "light", ref: "refs/tags/light", oid: second }, { name: "v1.0", ref: "refs/tags/v1.0", oid: first }]);
  expect(list).toEqual(parseRefList(fixtureGit(path, "for-each-ref", "--format=%(refname)%00%(objectname)%00%(*objectname)%00%(HEAD)%00%(upstream:short)%00%(symref)%00%(committerdate:unix)%00%(upstream:track,nobracket)", "refs/heads", "refs/remotes", "refs/tags"), ["origin", "up/stream"]));
});

it("lists no branches on an unborn HEAD and marks none current on a detached HEAD", async () => {
  const { path, git } = repo("unborn");
  expect(await git.listRefs()).toEqual({ branches: [], remotes: [], tags: [], defaultBranch: null });
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "switch", "-q", "--detach");
  expect((await git.listRefs()).branches).toEqual([expect.objectContaining({ name: "main", current: false })]);
});

it("checks out a branch on a clean tree and carries changes that don't conflict", async () => {
  const { path, git } = repo("checkout");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "other");
  commit(path, "a.txt", "2\n", "Second");
  await git.checkoutBranch("other");
  expect(head(path)).toBe("other");
  expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("1\n");
  writeFileSync(join(path, "new.txt"), "untracked\n");
  await git.checkoutBranch("main");
  expect(head(path)).toBe("main");
  expect(readFileSync(join(path, "new.txt"), "utf8")).toBe("untracked\n");
});

it("refuses a checkout that would overwrite uncommitted changes and loses nothing", async () => {
  const { path, git } = repo("dirty");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "other");
  commit(path, "a.txt", "2\n", "Second");
  writeFileSync(join(path, "a.txt"), "my work\n");
  await expect(git.checkoutBranch("other")).rejects.toThrow(/would be overwritten/);
  expect(head(path)).toBe("main");
  expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("my work\n");
  // Creating a branch at a commit where the file differs is refused the same way, and nothing is created.
  await expect(git.createBranch("from-first", fixtureGit(path, "rev-parse", "HEAD~1"))).rejects.toThrow(/would be overwritten/);
  expect(branches(path)).toEqual(["main", "other"]);
  expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("my work\n");
});

it("checks out a remote branch as a tracking local branch, or the existing local branch", async () => {
  const origin = repo("origin");
  commit(origin.path, "a.txt", "1\n", "First");
  fixtureGit(origin.path, "branch", "feature/ü");
  const { git, path } = (() => {
    const path = join(root, "clone");
    fixtureGit(root, "clone", "-q", origin.path, path);
    return { path, git: new GitService(path, realRunner) };
  })();
  const remote = (await git.listRefs()).remotes[0]!.branches.find(branch => branch.branch === "feature/ü")!;
  expect(await git.checkoutRemoteBranch(remote)).toBe("feature/ü");
  expect(head(path)).toBe("feature/ü");
  expect(fixtureGit(path, "rev-parse", "--abbrev-ref", "feature/ü@{upstream}")).toBe("origin/feature/ü");
  fixtureGit(path, "switch", "-q", "main");
  expect(await git.checkoutRemoteBranch(remote)).toBe("feature/ü");
  expect(head(path)).toBe("feature/ü");
});

it("creates a branch from HEAD and from a commit and checks it out", async () => {
  const { path, git } = repo("create");
  const first = commit(path, "a.txt", "1\n", "First");
  const second = commit(path, "a.txt", "2\n", "Second");
  await git.createBranch("topic/ünï");
  expect(head(path)).toBe("topic/ünï");
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(second);
  await git.createBranch("old", first);
  expect(head(path)).toBe("old");
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(first);
  await expect(git.createBranch("old")).rejects.toThrow(/already exists/);
});

it("creates a branch from a detached HEAD", async () => {
  const { path, git } = repo("detached");
  const first = commit(path, "a.txt", "1\n", "First");
  commit(path, "a.txt", "2\n", "Second");
  fixtureGit(path, "switch", "-q", "--detach", first);
  await git.createBranch("rescued");
  expect(head(path)).toBe("rescued");
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(first);
});

it("rejects invalid branch names before running a write", async () => {
  const { path, git } = repo("names");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "other");
  for (const name of ["", " padded", "-flag", "a..b", "a b", "ends.lock", "a/", "@{-1}", "HEAD~1", "x:y", "a\\b"]) {
    await expect(git.createBranch(name)).rejects.toThrow("isn’t a valid branch name");
  }
  await expect(git.renameBranch("other", "bad name")).rejects.toThrow("isn’t a valid branch name");
  expect(branches(path)).toEqual(["main", "other"]);
  await expect(git.validateBranchName("feature/ünï-✓")).resolves.toBeUndefined();
});

it("renames the current branch and keeps HEAD on it", async () => {
  const { path, git } = repo("rename");
  commit(path, "a.txt", "1\n", "First");
  await git.renameBranch("main", "trunk/✓");
  expect(head(path)).toBe("trunk/✓");
  expect(branches(path)).toEqual(["trunk/✓"]);
  fixtureGit(path, "branch", "other");
  await expect(git.renameBranch("other", "trunk/✓")).rejects.toThrow(/already exists/);
});

it("deletes a merged branch, refuses an unmerged one without force and deletes it with force", async () => {
  const { path, git } = repo("delete");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "merged");
  fixtureGit(path, "switch", "-q", "-c", "unmerged");
  commit(path, "b.txt", "b\n", "Only here");
  fixtureGit(path, "switch", "-q", "main");
  await git.deleteBranch("merged");
  expect(branches(path)).toEqual(["main", "unmerged"]);
  const refusal = git.deleteBranch("unmerged");
  await expect(refusal).rejects.toBeInstanceOf(GitBranchNotMergedError);
  await expect(refusal).rejects.toMatchObject({ branch: "unmerged" });
  expect(branches(path)).toEqual(["main", "unmerged"]);
  await git.deleteBranch("unmerged", { force: true });
  expect(branches(path)).toEqual(["main"]);
  await expect(git.deleteBranch("main", { force: true })).rejects.toThrow(/cannot delete|used by worktree|checked out/i);
});

it("leaves branches alone while index.lock exists", async () => {
  const { path, git } = repo("locked");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "branch", "other");
  writeFileSync(join(path, ".git", "index.lock"), "");
  await expect(git.checkoutBranch("other")).rejects.toBeInstanceOf(GitIndexLockedError);
  await expect(git.deleteBranch("other")).rejects.toBeInstanceOf(GitIndexLockedError);
  expect(head(path)).toBe("main");
  expect(branches(path)).toEqual(["main", "other"]);
});

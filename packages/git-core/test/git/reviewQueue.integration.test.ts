import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitIndexLockedError, GitNoUpstreamError, GitPushRejectedError, GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-queue-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = { "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" };
function commitFile(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}

/** A bare remote and a clone with `ahead` (tracking origin/ahead, one commit ahead), `fresh` (unpublished, one commit off main) and two linked worktrees. */
function setup(name: string) {
  const base = join(root, name);
  const remote = join(base, "remote.git");
  const path = join(base, "repo");
  mkdirSync(path, { recursive: true });
  fixtureGit(base, "init", "-q", "--bare", "--initial-branch=main", remote);
  fixtureGit(path, "init", "-q", "--initial-branch=main");
  for (const [key, value] of Object.entries(identity)) fixtureGit(path, "config", key, value);
  commitFile(path, "a.txt", "1\n", "First");
  fixtureGit(path, "remote", "add", "origin", `file://${remote}`);
  fixtureGit(path, "push", "-q", "-u", "origin", "main");
  fixtureGit(path, "remote", "set-head", "origin", "main");
  fixtureGit(path, "branch", "ahead");
  fixtureGit(path, "push", "-q", "-u", "origin", "ahead");
  fixtureGit(path, "branch", "fresh");
  fixtureGit(path, "branch", "same");
  const dirty = join(base, "dirty"), clean = join(base, "clean");
  fixtureGit(path, "worktree", "add", "-q", "-b", "dirty", "--", dirty);
  fixtureGit(path, "worktree", "add", "-q", "-b", "clean", "--", clean);
  fixtureGit(path, "switch", "-q", "ahead");
  commitFile(path, "b.txt", "2\n", "Ahead");
  fixtureGit(path, "switch", "-q", "fresh");
  commitFile(path, "c.txt", "3\n", "Fresh");
  fixtureGit(path, "switch", "-q", "main");
  writeFileSync(join(dirty, "a.txt"), "changed\n");
  writeFileSync(join(dirty, "new.txt"), "new\n");
  return { remote, path, dirty, clean, git: new GitService(path, realRunner) };
}

it("reads each branch's ahead count against its upstream, the default branch, and commits ahead of it in one command", async () => {
  const { path, git } = setup("counts");
  const refs = await git.listRefs();
  expect(refs.defaultBranch).toBe("refs/remotes/origin/main");
  const branch = (name: string) => refs.branches.find(entry => entry.name === name)!;
  expect(branch("ahead")).toMatchObject({ upstream: "origin/ahead", ahead: 1, behind: 0, gone: false });
  expect(branch("main")).toMatchObject({ upstream: "origin/main", ahead: 0, behind: 0 });
  expect(branch("fresh")).toMatchObject({ upstream: null, ahead: 0 });
  const before = git.getOperationLog().length;
  expect(await git.branchesAhead("refs/remotes/origin/main")).toMatchObject({ "refs/heads/fresh": 1, "refs/heads/same": 0, "refs/heads/dirty": 0, "refs/heads/ahead": 1, "refs/heads/main": 0 });
  expect(git.getOperationLog().slice(before).map(entry => entry.args.find(arg => !arg.startsWith("-") && !arg.includes("=")))).toEqual(["for-each-ref"]);
  expect((await git.logRange("refs/remotes/origin/ahead", "refs/heads/ahead")).commits.map(commit => commit.summary)).toEqual(["Ahead"]);
  expect((await git.logRange("refs/remotes/origin/main", "refs/heads/fresh")).commits.map(commit => commit.summary)).toEqual(["Fresh"]);
  await expect(git.logRange("main", "refs/heads/fresh")).rejects.toThrow(/full ref names/);
  // A deleted upstream reads as gone; without a remote HEAD the default falls back to origin/main.
  fixtureGit(path, "push", "-q", "origin", ":ahead");
  fixtureGit(path, "fetch", "-q", "--prune", "origin");
  fixtureGit(path, "remote", "set-head", "origin", "-d");
  const after = await git.listRefs();
  expect(after.branches.find(entry => entry.name === "ahead")).toMatchObject({ upstream: "origin/ahead", gone: true, ahead: 0 });
  expect(after.defaultBranch).toBe("refs/remotes/origin/main");
});

it("pushes a branch that isn't checked out to its upstream, updating the remote and the tracking ref, and publishes another", async () => {
  const { remote, path, git } = setup("push");
  const head = fixtureGit(path, "rev-parse", "HEAD");
  const ahead = fixtureGit(path, "rev-parse", "refs/heads/ahead");
  await git.pushBranch("ahead");
  expect(fixtureGit(remote, "rev-parse", "refs/heads/ahead")).toBe(ahead);
  expect(fixtureGit(path, "rev-parse", "refs/remotes/origin/ahead")).toBe(ahead);
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(head);
  expect((await git.listRefs()).branches.find(entry => entry.name === "ahead")).toMatchObject({ ahead: 0 });

  await expect(git.pushBranch("fresh")).rejects.toBeInstanceOf(GitNoUpstreamError);
  await git.pushBranch("fresh", { setUpstream: "origin" });
  expect(fixtureGit(remote, "rev-parse", "refs/heads/fresh")).toBe(fixtureGit(path, "rev-parse", "refs/heads/fresh"));
  expect(fixtureGit(path, "rev-parse", "--abbrev-ref", "fresh@{u}")).toBe("origin/fresh");
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("main");

  // Never forced: a rewritten branch is rejected and the remote keeps its commit.
  fixtureGit(path, "branch", "-f", "ahead", "main");
  commitFile(path, "x.txt", "x\n", "Unrelated");
  fixtureGit(path, "branch", "-f", "ahead", "HEAD");
  await expect(git.pushBranch("ahead")).rejects.toBeInstanceOf(GitPushRejectedError);
  expect(fixtureGit(remote, "rev-parse", "refs/heads/ahead")).toBe(ahead);
  await expect(git.pushBranch("-f")).rejects.toThrow(/isn’t a branch name/);
});

it("stages and commits in a linked worktree through its own service, touching only that worktree, and refuses its index.lock", async () => {
  const { path, dirty, clean, git } = setup("worktree");
  expect(await git.worktreeChangeCount(dirty)).toBe(2);
  expect(await git.worktreeChangeCount(clean)).toBe(0);
  const mainHead = fixtureGit(path, "rev-parse", "HEAD");
  const worktree = new GitService(dirty, realRunner);
  await worktree.stageFile("a.txt");
  expect(fixtureGit(dirty, "diff", "--cached", "--name-only")).toBe("a.txt");
  expect(fixtureGit(path, "diff", "--cached", "--name-only")).toBe("");
  await worktree.unstageFile("a.txt");
  await worktree.stageFile("new.txt");
  await worktree.commit({ message: "Review\n" });
  expect(fixtureGit(dirty, "log", "-1", "--format=%s", "dirty")).toBe("Review");
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(mainHead);
  expect(await git.worktreeChangeCount(dirty)).toBe(1);
  expect((await git.branchesAhead("refs/remotes/origin/main"))["refs/heads/dirty"]).toBe(1);

  const lock = fixtureGit(dirty, "rev-parse", "--path-format=absolute", "--git-path", "index.lock");
  writeFileSync(lock, "");
  try {
    await expect(worktree.stageFile("a.txt")).rejects.toBeInstanceOf(GitIndexLockedError);
    await expect(worktree.commit({ message: "Locked\n" })).rejects.toBeInstanceOf(GitIndexLockedError);
    // The main worktree's index is not locked by the linked one's lock.
    writeFileSync(join(path, "m.txt"), "m\n");
    await git.stageFile("m.txt");
  } finally { rmSync(lock); }
  expect(fixtureGit(dirty, "diff", "--cached", "--name-only")).toBe("");

  // A removed worktree leaves the list.
  fixtureGit(path, "worktree", "remove", "--force", "--", dirty);
  expect((await git.listWorktrees()).map(entry => entry.path)).not.toContain(dirty);
});

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitIndexLockedError, GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-operations-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = { "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" };
function commitFile(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}
/** Fails like a conflicting Git command does; the fixture state is what matters. */
const conflicting = (path: string, ...args: string[]) => { expect(() => fixtureGit(path, ...args)).toThrow(); };

/** `main` and `feature` both change a.txt and b.txt from one base; `feature` has two commits. */
function setup(name: string) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  fixtureGit(path, "init", "-q", "--initial-branch=main");
  for (const [key, value] of Object.entries(identity)) fixtureGit(path, "config", key, value);
  commitFile(path, "a.txt", "base\n", "Base");
  commitFile(path, "b.txt", "base\n", "Base b");
  fixtureGit(path, "switch", "-q", "-c", "feature");
  commitFile(path, "a.txt", "feature\n", "Feature a");
  const pick = commitFile(path, "b.txt", "feature\n", "Feature b");
  fixtureGit(path, "switch", "-q", "main");
  commitFile(path, "a.txt", "main\n", "Main a");
  const head = commitFile(path, "b.txt", "main\n", "Main b");
  return { path, head, pick, git: new GitService(path, realRunner) };
}

it("reports no operation in a clean repository", async () => {
  const { git } = setup("clean");
  expect(await git.operationState()).toBeNull();
});

it("describes a conflicted merge, refuses Abort while index.lock exists, then aborts back to HEAD", async () => {
  const { path, head, git } = setup("merge");
  conflicting(path, "merge", "--no-edit", "feature");
  expect(await git.operationState()).toEqual({ kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 2, mergeHead: true });
  writeFileSync(join(path, ".git/index.lock"), "");
  await expect(git.abortOperation("merge")).rejects.toBeInstanceOf(GitIndexLockedError);
  // Reading the state doesn't need the index, and the refused abort changed nothing.
  expect((await git.operationState())?.kind).toBe("merge");
  rmSync(join(path, ".git/index.lock"));
  await git.abortOperation("merge");
  expect(await git.operationState()).toBeNull();
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(head);
  expect(fixtureGit(path, "status", "--porcelain")).toBe("");
});

it("describes a paused rebase with its step, and aborts to the branch's original commit", async () => {
  const { path, git } = setup("rebase");
  fixtureGit(path, "switch", "-q", "feature");
  const before = fixtureGit(path, "rev-parse", "HEAD");
  conflicting(path, "rebase", "main");
  expect(await git.operationState()).toEqual({ kind: "rebase", branch: "feature", target: "main", commit: null, step: { current: 1, total: 2 }, conflicts: 1, mergeHead: false });
  // A merge isn't in progress, so aborting one changes nothing.
  await expect(git.abortOperation("merge")).rejects.toThrow("There’s no merge in progress.");
  await git.abortOperation("rebase");
  expect(await git.operationState()).toBeNull();
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("feature");
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(before);
});

it("describes a conflicted cherry-pick and continues it once resolved", async () => {
  const { path, head, pick, git } = setup("cherry-pick");
  conflicting(path, "cherry-pick", pick);
  expect(await git.operationState()).toEqual({ kind: "cherry-pick", branch: "main", target: null, commit: { oid: pick.slice(0, 7), subject: "Feature b" }, step: null, conflicts: 1, mergeHead: false });
  writeFileSync(join(path, "b.txt"), "resolved\n");
  fixtureGit(path, "add", "b.txt");
  expect((await git.operationState())?.conflicts).toBe(0);
  await git.continueOperation("cherry-pick");
  expect(await git.operationState()).toBeNull();
  expect(fixtureGit(path, "rev-parse", "HEAD~1")).toBe(head);
  expect(fixtureGit(path, "log", "-1", "--format=%s")).toBe("Feature b");
});

it("describes a revert and a bisect, and aborts each", async () => {
  const { path, head, git } = setup("revert");
  commitFile(path, "b.txt", "later\n", "Later b");
  const later = fixtureGit(path, "rev-parse", "HEAD");
  conflicting(path, "revert", "--no-edit", head);
  expect(await git.operationState()).toMatchObject({ kind: "revert", branch: "main", commit: { oid: head.slice(0, 7), subject: "Main b" }, conflicts: 1 });
  await git.abortOperation("revert");
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(later);
  fixtureGit(path, "bisect", "start", "HEAD", "HEAD~3");
  expect(await git.operationState()).toMatchObject({ kind: "bisect", branch: "main", conflicts: 0 });
  await git.abortOperation("bisect");
  expect(await git.operationState()).toBeNull();
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("main");
});

it("reports the end of an operation finished outside the app", async () => {
  const { path, git } = setup("outside");
  conflicting(path, "merge", "--no-edit", "feature");
  expect((await git.operationState())?.kind).toBe("merge");
  fixtureGit(path, "merge", "--abort");
  expect(await git.operationState()).toBeNull();
});

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-merge-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = { "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" };
function commitFile(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}

/**
 * From one base: `ahead` adds c.txt (main can fast-forward to it), `side` adds d.txt (merges cleanly once main moves on),
 * `feature` changes a.txt and b.txt, which main changes too (conflicts).
 */
function setup(name: string) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  fixtureGit(path, "init", "-q", "--initial-branch=main");
  for (const [key, value] of Object.entries(identity)) fixtureGit(path, "config", key, value);
  commitFile(path, "a.txt", "base\n", "Base");
  commitFile(path, "b.txt", "base\n", "Base b");
  fixtureGit(path, "switch", "-q", "-c", "ahead");
  const ahead = commitFile(path, "c.txt", "ahead\n", "Ahead");
  fixtureGit(path, "switch", "-q", "-c", "side", "main");
  commitFile(path, "d.txt", "side\n", "Side");
  fixtureGit(path, "switch", "-q", "-c", "feature", "main");
  commitFile(path, "a.txt", "feature\n", "Feature a");
  commitFile(path, "b.txt", "feature\n", "Feature b");
  fixtureGit(path, "switch", "-q", "main");
  return { path, ahead, git: new GitService(path, realRunner) };
}
const head = (path: string) => fixtureGit(path, "rev-parse", "HEAD");
const parents = (path: string) => fixtureGit(path, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length - 1;

it("fast-forwards when the current branch has no commits of its own", async () => {
  const { path, ahead, git } = setup("fast-forward");
  expect(await git.mergeKind("refs/heads/ahead")).toBe("fast-forward");
  expect(await git.merge("refs/heads/ahead")).toBe("fast-forward");
  expect(head(path)).toBe(ahead);
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("main");
});

it("reports a fast-forward to a merge commit as a fast-forward, and a merge when merge.ff is false", async () => {
  const { path, git } = setup("fast-forward-merge-tip");
  fixtureGit(path, "switch", "-q", "ahead");
  fixtureGit(path, "merge", "-q", "--no-edit", "--no-ff", "side");
  const tip = head(path);
  fixtureGit(path, "switch", "-q", "main");
  fixtureGit(path, "config", "merge.ff", "false");
  expect(await git.mergeKind("refs/heads/ahead")).toBe("merge");
  fixtureGit(path, "config", "--unset", "merge.ff");
  expect(await git.mergeKind("refs/heads/ahead")).toBe("fast-forward");
  expect(await git.merge("refs/heads/ahead", { branch: "main" })).toBe("fast-forward");
  expect(head(path)).toBe(tip);
});

it("refuses when the branch it was asked to merge into isn't checked out anymore", async () => {
  const { path, git } = setup("moved-head");
  const before = head(path);
  fixtureGit(path, "switch", "-q", "side");
  await expect(git.merge("refs/heads/ahead", { branch: "main" })).rejects.toThrow("“main” is no longer the current branch. Nothing was merged.");
  expect(fixtureGit(path, "rev-parse", "main")).toBe(before);
});

it("makes a merge commit with Git's default message when both branches moved on", async () => {
  const { path, git } = setup("merge-commit");
  commitFile(path, "e.txt", "main\n", "Main e");
  const before = head(path);
  expect(await git.mergeKind("refs/heads/side")).toBe("merge");
  expect(await git.merge("refs/heads/side")).toBe("merge");
  expect(parents(path)).toBe(2);
  expect(fixtureGit(path, "rev-parse", "HEAD^1")).toBe(before);
  expect(fixtureGit(path, "log", "-1", "--format=%s")).toBe("Merge branch 'side'");
  expect(await git.operationState()).toBeNull();
});

it("changes nothing when the branch is merged already", async () => {
  const { path, git } = setup("up-to-date");
  fixtureGit(path, "merge", "-q", "--ff-only", "ahead");
  const before = head(path);
  expect(await git.mergeKind("refs/heads/ahead")).toBe("up-to-date");
  expect(await git.merge("refs/heads/ahead")).toBe("up-to-date");
  expect(head(path)).toBe(before);
});

it("refuses with Git's message when uncommitted changes are in the way, changing nothing", async () => {
  const { path, git } = setup("dirty");
  writeFileSync(join(path, "a.txt"), "local edit\n");
  const before = head(path);
  await expect(git.merge("refs/heads/feature")).rejects.toThrow(/would be overwritten by merge[\s\S]*commit your changes or stash them/);
  expect(head(path)).toBe(before);
  expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("local edit\n");
  expect(await git.operationState()).toBeNull();
  expect(fixtureGit(path, "stash", "list")).toBe("");
});

it("refuses unrelated histories with Git's message", async () => {
  const { path, git } = setup("unrelated");
  fixtureGit(path, "switch", "-q", "--orphan", "other");
  commitFile(path, "z.txt", "z\n", "Other root");
  fixtureGit(path, "switch", "-q", "main");
  const before = head(path);
  await expect(git.merge("refs/heads/other")).rejects.toThrow("refusing to merge unrelated histories");
  expect(head(path)).toBe(before);
});

it("stops on conflicts with the merge in progress, and Abort restores HEAD and the worktree", async () => {
  const { path, git } = setup("conflict-abort");
  commitFile(path, "a.txt", "main\n", "Main a");
  const before = commitFile(path, "b.txt", "main\n", "Main b");
  expect(await git.merge("refs/heads/feature")).toBe("stopped");
  expect(await git.operationState()).toEqual({ kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 2, mergeHead: true });
  expect(await git.hasConflictMarkers("a.txt")).toBe(true);
  // A merge can’t start while one is in progress, and the one in progress is left as it is.
  await expect(git.merge("refs/heads/side")).rejects.toThrow(/unmerged files|MERGE_HEAD exists|not concluded your merge/);
  expect((await git.operationState())?.conflicts).toBe(2);
  await git.abortOperation("merge");
  expect(await git.operationState()).toBeNull();
  expect(head(path)).toBe(before);
  expect(fixtureGit(path, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("main\n");
});

it("resolves conflicts, marks them resolved and continues into a two-parent commit with the prepared message", async () => {
  const { path, git } = setup("conflict-continue");
  commitFile(path, "a.txt", "main\n", "Main a");
  const before = commitFile(path, "b.txt", "main\n", "Main b");
  const feature = fixtureGit(path, "rev-parse", "feature");
  expect(await git.merge("refs/heads/feature")).toBe("stopped");
  expect(await git.mergeMessage()).toBe("Merge branch 'feature'");
  writeFileSync(join(path, "a.txt"), "resolved\n");
  expect(await git.hasConflictMarkers("a.txt")).toBe(false);
  expect(await git.hasConflictMarkers("b.txt")).toBe(true);
  await git.stageFile("a.txt");
  expect((await git.operationState())?.conflicts).toBe(1);
  // Git refuses to continue while a conflict remains.
  await expect(git.continueOperation("merge")).rejects.toThrow();
  await git.stageFile("b.txt");
  expect((await git.operationState())?.conflicts).toBe(0);
  await git.continueOperation("merge");
  expect(await git.operationState()).toBeNull();
  expect(fixtureGit(path, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").slice(1)).toEqual([before, feature]);
  expect(fixtureGit(path, "log", "-1", "--format=%s")).toBe("Merge branch 'feature'");
  expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("resolved\n");
  expect(await git.mergeMessage()).toBeNull();
});

it("merges a remote branch by its remote-tracking ref", async () => {
  const { path, git } = setup("remote");
  fixtureGit(path, "update-ref", "refs/remotes/origin/topic", fixtureGit(path, "rev-parse", "side"));
  commitFile(path, "e.txt", "main\n", "Main e");
  expect(await git.merge("refs/remotes/origin/topic")).toBe("merge");
  expect(fixtureGit(path, "log", "-1", "--format=%s")).toBe("Merge remote-tracking branch 'origin/topic'");
  expect(readFileSync(join(path, "d.txt"), "utf8")).toBe("side\n");
});

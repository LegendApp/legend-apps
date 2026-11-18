import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-rebase-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = { "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" };
function commitFile(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}

/**
 * From one base: main adds m.txt and changes a.txt; `topic` adds t1.txt, t2.txt, t3.txt (rebases cleanly);
 * `clash` changes a.txt then adds x.txt and y.txt (conflicts at step 1 of 3); `behind` has no commits of its own.
 */
function setup(name: string) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  fixtureGit(path, "init", "-q", "--initial-branch=main");
  for (const [key, value] of Object.entries(identity)) fixtureGit(path, "config", key, value);
  commitFile(path, "a.txt", "base\n", "Base");
  fixtureGit(path, "branch", "behind");
  fixtureGit(path, "switch", "-q", "-c", "topic");
  for (const n of [1, 2, 3]) commitFile(path, `t${n}.txt`, `${n}\n`, `Topic ${n}`);
  fixtureGit(path, "switch", "-q", "-c", "clash", "main");
  commitFile(path, "a.txt", "clash\n", "Clash a");
  commitFile(path, "x.txt", "x\n", "Clash x");
  commitFile(path, "y.txt", "y\n", "Clash y");
  fixtureGit(path, "switch", "-q", "main");
  commitFile(path, "m.txt", "main\n", "Main m");
  const main = commitFile(path, "a.txt", "main\n", "Main a");
  return { path, main, git: new GitService(path, realRunner) };
}
const head = (path: string) => fixtureGit(path, "rev-parse", "HEAD");
const subjects = (path: string, range: string) => fixtureGit(path, "log", "--format=%s", range).split("\n").filter(Boolean);
const status = (path: string) => fixtureGit(path, "status", "--porcelain");

describe("rebase", () => {
  it("replays the branch's commits onto the ref", async () => {
    const { path, main, git } = setup("rebase");
    fixtureGit(path, "switch", "-q", "topic");
    expect(await git.rebasePlan("refs/heads/main")).toEqual({ branch: "topic", commits: 3, behind: 2, pushed: false });
    expect(await git.rebase("refs/heads/main", { branch: "topic" })).toBe("rebased");
    expect(fixtureGit(path, "merge-base", "HEAD", "main")).toBe(main);
    expect(subjects(path, "main..HEAD")).toEqual(["Topic 3", "Topic 2", "Topic 1"]);
    expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("topic");
    expect(await git.operationState()).toBeNull();
  });

  it("fast-forwards a branch with no commits of its own, and reports one that is up to date", async () => {
    const { path, main, git } = setup("rebase-ff");
    fixtureGit(path, "switch", "-q", "behind");
    expect(await git.rebasePlan("refs/heads/main")).toMatchObject({ commits: 0, behind: 2 });
    expect(await git.rebase("refs/heads/main")).toBe("fast-forward");
    expect(head(path)).toBe(main);
    expect(await git.rebasePlan("refs/heads/main")).toMatchObject({ commits: 0, behind: 0 });
    expect(await git.rebase("refs/heads/main")).toBe("up-to-date");
    expect(head(path)).toBe(main);
  });

  it("warns that pushed commits are rewritten", async () => {
    const { path, git } = setup("rebase-pushed");
    fixtureGit(path, "init", "-q", "--bare", join(root, "rebase-pushed-origin.git"));
    fixtureGit(path, "remote", "add", "origin", join(root, "rebase-pushed-origin.git"));
    fixtureGit(path, "switch", "-q", "topic");
    fixtureGit(path, "push", "-q", "-u", "origin", "topic");
    expect(await git.rebasePlan("refs/heads/main")).toMatchObject({ commits: 3, pushed: true });
    fixtureGit(path, "switch", "-q", "clash");
    expect(await git.rebasePlan("refs/heads/main")).toMatchObject({ commits: 3, pushed: false });
    // An upstream whose ref is gone counts as not pushed.
    fixtureGit(path, "switch", "-q", "topic");
    fixtureGit(path, "update-ref", "-d", "refs/remotes/origin/topic");
    expect(await git.rebasePlan("refs/heads/main")).toMatchObject({ commits: 3, pushed: false });
  });

  it("refuses with a dirty worktree and changes nothing", async () => {
    const { path, git } = setup("rebase-dirty");
    fixtureGit(path, "switch", "-q", "topic");
    const before = head(path);
    writeFileSync(join(path, "t1.txt"), "edited\n");
    await expect(git.rebase("refs/heads/main")).rejects.toThrow(/unstaged changes|commit or stash/i);
    expect(head(path)).toBe(before);
    expect(readFileSync(join(path, "t1.txt"), "utf8")).toBe("edited\n");
    expect(fixtureGit(path, "stash", "list")).toBe("");
    expect(await git.operationState()).toBeNull();
  });

  it("stops at a conflict on step 1 of 3, and aborting restores the branch tip", async () => {
    const { path, git } = setup("rebase-abort");
    fixtureGit(path, "switch", "-q", "clash");
    const before = head(path);
    expect(await git.rebase("refs/heads/main", { branch: "clash" })).toBe("stopped");
    expect(await git.operationState()).toMatchObject({ kind: "rebase", branch: "clash", target: "main", step: { current: 1, total: 3 }, conflicts: 1 });
    await expect(git.rebase("refs/heads/main")).rejects.toThrow();
    await git.abortOperation("rebase");
    expect(head(path)).toBe(before);
    expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("clash");
    expect(status(path)).toBe("");
  });

  it("continues through every step once the conflict is resolved and staged", async () => {
    const { path, main, git } = setup("rebase-continue");
    fixtureGit(path, "switch", "-q", "clash");
    expect(await git.rebase("refs/heads/main")).toBe("stopped");
    writeFileSync(join(path, "a.txt"), "resolved\n");
    expect(await git.hasConflictMarkers("a.txt")).toBe(false);
    await git.stageFile("a.txt");
    expect(await git.operationState()).toMatchObject({ kind: "rebase", conflicts: 0 });
    await git.continueOperation("rebase");
    expect(await git.operationState()).toBeNull();
    expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("clash");
    expect(fixtureGit(path, "merge-base", "HEAD", "main")).toBe(main);
    expect(subjects(path, "main..HEAD")).toEqual(["Clash y", "Clash x", "Clash a"]);
    expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("resolved\n");
  });

  it("refuses when the branch moved meanwhile", async () => {
    const { path, git } = setup("rebase-moved");
    const before = head(path);
    await expect(git.rebase("refs/heads/topic", { branch: "topic" })).rejects.toThrow("“topic” is no longer the current branch. Nothing was rebased.");
    expect(head(path)).toBe(before);
  });
});

describe("cherry-pick and revert", () => {
  it("cherry-picks a commit onto the current branch", async () => {
    const { path, git } = setup("pick");
    const oid = fixtureGit(path, "rev-parse", "topic~1");
    expect(await git.cherryPick(oid, { branch: "main" })).toBe("committed");
    expect(subjects(path, "-1")).toEqual(["Topic 2"]);
    expect(readFileSync(join(path, "t2.txt"), "utf8")).toBe("2\n");
    expect(await git.operationState()).toBeNull();
  });

  it("reports a pick the branch already has as empty and makes no commit", async () => {
    const { path, git } = setup("pick-empty");
    const oid = fixtureGit(path, "rev-parse", "topic~2");
    expect(await git.cherryPick(oid)).toBe("committed");
    const before = head(path);
    expect(await git.cherryPick(oid)).toBe("empty");
    expect(head(path)).toBe(before);
    expect(await git.operationState()).toBeNull();
    expect(status(path)).toBe("");
    // So is an empty commit.
    fixtureGit(path, "commit", "-q", "--allow-empty", "-m", "Nothing");
    const empty = head(path);
    fixtureGit(path, "reset", "-q", "--hard", "HEAD~1");
    expect(await git.cherryPick(empty)).toBe("empty");
    expect(head(path)).toBe(before);
    expect(await git.operationState()).toBeNull();
  });

  it("stops at a conflicting pick with Git's message prepared, then continues", async () => {
    const { path, git } = setup("pick-conflict");
    const oid = fixtureGit(path, "rev-parse", "clash~2");
    const before = head(path);
    expect(await git.cherryPick(oid, { branch: "main" })).toBe("stopped");
    expect(await git.operationState()).toMatchObject({ kind: "cherry-pick", branch: "main", commit: { subject: "Clash a" }, conflicts: 1 });
    expect(await git.mergeMessage()).toMatch(/^Clash a/);
    writeFileSync(join(path, "a.txt"), "both\n");
    await git.stageFile("a.txt");
    await git.continueOperation("cherry-pick");
    expect(await git.operationState()).toBeNull();
    expect(fixtureGit(path, "rev-parse", "HEAD~1")).toBe(before);
    expect(subjects(path, "-1")).toEqual(["Clash a"]);
  });

  it("reverts a commit, and stops at a conflicting revert that aborts back", async () => {
    const { path, git } = setup("revert");
    const m = fixtureGit(path, "rev-parse", "HEAD~1");
    expect(await git.revert(m, { branch: "main" })).toBe("committed");
    expect(subjects(path, "-1")).toEqual(['Revert "Main m"']);
    expect(status(path)).toBe("");
    commitFile(path, "a.txt", "later\n", "Later a");
    const before = head(path);
    const mainA = fixtureGit(path, "rev-parse", "HEAD~2");
    expect(await git.revert(mainA)).toBe("stopped");
    expect(await git.operationState()).toMatchObject({ kind: "revert", commit: { subject: "Main a" }, conflicts: 1 });
    expect(await git.mergeMessage()).toMatch(/^Revert "Main a"/);
    await git.abortOperation("revert");
    expect(head(path)).toBe(before);
    expect(status(path)).toBe("");
  });

  it("refuses merge commits before running, and a branch that moved", async () => {
    const { path, git } = setup("pick-merge");
    fixtureGit(path, "merge", "-q", "--no-edit", "--no-ff", "topic");
    const before = head(path);
    await expect(git.cherryPick("HEAD")).rejects.toThrow("Cherry-picking a merge commit isn’t supported yet.");
    await expect(git.revert("HEAD")).rejects.toThrow("Reverting a merge commit isn’t supported yet.");
    await expect(git.cherryPick("topic", { branch: "topic" })).rejects.toThrow("“topic” is no longer the current branch. Nothing was cherry-picked.");
    expect(head(path)).toBe(before);
    expect(await git.operationState()).toBeNull();
  });
});

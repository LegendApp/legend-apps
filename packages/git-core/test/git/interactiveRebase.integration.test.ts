import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitPushedCommitsError, GitService, type GitTodoEntry } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

jest.setTimeout(30_000);

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-irebase-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "advice.detachedHead": "false", "core.editor": "false", "sequence.editor": "false" })) fixtureGit(path, "config", key, value);
  return { path, git: new GitService(path, realRunner) };
}
function commit(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}
const rev = (path: string, ref = "HEAD") => fixtureGit(path, "rev-parse", ref);
const log = (path: string, ref = "HEAD") => fixtureGit(path, "log", "--format=%s", "--reverse", `main..${ref}`).split("\n").filter(Boolean);
const message = (path: string, ref = "HEAD") => fixtureGit(path, "log", "-1", "--format=%B", ref);
const read = (path: string, file: string) => readFileSync(join(path, file), "utf8");

/** main: Base; feature: One (a.txt), Two (b.txt), Three (c.txt). */
function stack(name: string) {
  const r = repo(name);
  commit(r.path, "base.txt", "base\n", "Base");
  fixtureGit(r.path, "switch", "-q", "-c", "feature");
  const one = commit(r.path, "a.txt", "a\n", "One");
  const two = commit(r.path, "b.txt", "b\n", "Two");
  const three = commit(r.path, "c.txt", "c\n", "Three");
  return { ...r, one, two, three };
}
const todo = (...entries: [string, GitTodoEntry["action"], string?][]): GitTodoEntry[] => entries.map(([oid, action, text]) => ({ oid, action, ...text === undefined ? {} : { message: text } }));

it("plans the branch's commits oldest first, with stacked branches and pushed commits", async () => {
  const { path, git, one, two, three } = stack("plan");
  fixtureGit(path, "branch", "lower", one);
  fixtureGit(path, "update-ref", "refs/remotes/origin/feature", one);
  const plan = await git.interactiveRebasePlan("main");
  expect(plan).toEqual({
    branch: "feature", base: rev(path, "main"), head: three, stacked: ["lower"], refusal: null,
    commits: [
      { oid: one, subject: "One", message: "One\n", pushed: true },
      { oid: two, subject: "Two", message: "Two\n", pushed: false },
      { oid: three, subject: "Three", message: "Three\n", pushed: false },
    ],
  });
});

it("reorders commits and drops one", async () => {
  const { path, git, one, two, three } = stack("reorder");
  const plan = await git.interactiveRebasePlan("main");
  expect(await git.interactiveRebase(plan, todo([three, "pick"], [one, "pick"], [two, "drop"]))).toBe("rebased");
  expect(log(path)).toEqual(["Three", "One"]);
  expect(fixtureGit(path, "ls-files")).toBe("a.txt\nbase.txt\nc.txt");
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("feature");
  expect(fixtureGit(path, "status", "--porcelain")).toBe("");
});

it("rewords a commit, also when it is the only change", async () => {
  const { path, git, one, two, three } = stack("reword");
  const plan = await git.interactiveRebasePlan("main");
  expect(await git.interactiveRebase(plan, todo([one, "pick"], [two, "reword", "Two, reworded\n\nWith a body"], [three, "pick"]))).toBe("rebased");
  expect(log(path)).toEqual(["One", "Two, reworded", "Three"]);
  expect(message(path, "HEAD~1")).toBe("Two, reworded\n\nWith a body");
  // Commits before the first change keep their ids.
  expect(rev(path, "HEAD~2")).toBe(one);
});

it("squashes with the given message, and fixes up keeping the first message", async () => {
  const { path, git, one, two, three } = stack("squash");
  const plan = await git.interactiveRebasePlan("main");
  expect(await git.interactiveRebase(plan, todo([one, "pick", "One and two and three"], [two, "squash"], [three, "fixup"]))).toBe("rebased");
  expect(log(path)).toEqual(["One and two and three"]);
  expect(message(path)).toBe("One and two and three");
  expect(fixtureGit(path, "ls-tree", "--name-only", "HEAD")).toBe("a.txt\nb.txt\nbase.txt\nc.txt");

  const other = stack("fixup");
  const otherPlan = await other.git.interactiveRebasePlan("main");
  expect(await other.git.interactiveRebase(otherPlan, todo([other.one, "pick"], [other.two, "fixup"], [other.three, "pick"]))).toBe("rebased");
  expect(log(other.path)).toEqual(["One", "Three"]);
  expect(fixtureGit(other.path, "ls-tree", "--name-only", "HEAD~1")).toBe("a.txt\nb.txt\nbase.txt");
});

it("joins the messages when a squash has no message of its own", async () => {
  const { path, git, one, two, three } = stack("squash-default");
  const plan = await git.interactiveRebasePlan("main");
  await git.interactiveRebase(plan, todo([one, "pick"], [two, "pick"], [three, "squash"]));
  expect(message(path)).toBe("Two\n\nThree");
});

it("moves stacked branches along with update-refs, and leaves them without it", async () => {
  const { path, git, one, two, three } = stack("update-refs");
  fixtureGit(path, "branch", "lower", two);
  const plan = await git.interactiveRebasePlan("main");
  await git.interactiveRebase(plan, todo([one, "reword", "One, reworded"], [two, "pick"], [three, "pick"]), { updateRefs: true });
  expect(rev(path, "lower")).toBe(rev(path, "HEAD~1"));
  expect(log(path, "lower")).toEqual(["One, reworded", "Two"]);

  const other = stack("no-update-refs");
  fixtureGit(other.path, "branch", "lower", other.two);
  await other.git.interactiveRebase(await other.git.interactiveRebasePlan("main"), todo([other.one, "reword", "One, reworded"], [other.two, "pick"], [other.three, "pick"]));
  expect(rev(other.path, "lower")).toBe(other.two);
});

it("stops at a conflict, then continues with the saved messages or aborts", async () => {
  const make = (name: string) => {
    const r = repo(name);
    commit(r.path, "a.txt", "base\n", "Base");
    fixtureGit(r.path, "switch", "-q", "-c", "feature");
    const one = commit(r.path, "a.txt", "one\n", "One");
    const two = commit(r.path, "a.txt", "two\n", "Two");
    const three = commit(r.path, "b.txt", "b\n", "Three");
    return { ...r, one, two, three };
  };
  const { path, git, one, two, three } = make("conflict");
  const plan = await git.interactiveRebasePlan("main");
  expect(await git.interactiveRebase(plan, todo([two, "pick"], [one, "pick"], [three, "reword", "Three, reworded"]))).toBe("stopped");
  expect(await git.operationState()).toEqual(expect.objectContaining({ kind: "rebase", branch: "feature", conflicts: 1 }));
  writeFileSync(join(path, "a.txt"), "two\n");
  fixtureGit(path, "add", "a.txt");
  // Resolved to "two", the second pick (One) conflicts again: Git stops there and continue rejects with its message.
  await expect(git.continueOperation("rebase")).rejects.toThrow("Merge conflict in a.txt");
  expect(await git.operationState()).toEqual(expect.objectContaining({ kind: "rebase", step: { current: 2, total: 3 } }));
  writeFileSync(join(path, "a.txt"), "one\n");
  fixtureGit(path, "add", "a.txt");
  await git.continueOperation("rebase");
  expect(await git.operationState()).toBeNull();
  expect(log(path)).toEqual(["Two", "One", "Three, reworded"]);

  const other = make("conflict-abort");
  const before = rev(other.path);
  expect(await other.git.interactiveRebase(await other.git.interactiveRebasePlan("main"), todo([other.two, "pick"], [other.one, "pick"], [other.three, "pick"]))).toBe("stopped");
  await other.git.abortOperation("rebase");
  expect(rev(other.path)).toBe(before);
  expect(fixtureGit(other.path, "status", "--porcelain")).toBe("");
  expect(fixtureGit(other.path, "rev-parse", "--git-path", "legend-git-rebase")).toBeTruthy();
  expect(() => readFileSync(join(other.path, ".git", "legend-git-rebase", "todo"))).toThrow();
});

it("refuses changes, an operation in progress, merge commits and an empty range", async () => {
  const { path, git } = stack("refusals");
  writeFileSync(join(path, "a.txt"), "changed\n");
  expect((await git.interactiveRebasePlan("main")).refusal).toBe("“a.txt” has uncommitted changes. Commit or stash them first.");
  fixtureGit(path, "checkout", "--", "a.txt");
  writeFileSync(join(path, "untracked.txt"), "new\n");
  expect((await git.interactiveRebasePlan("main")).refusal).toBeNull();
  expect((await git.interactiveRebasePlan("feature")).refusal).toBe("“feature” has no commits that “feature” doesn’t have.");

  fixtureGit(path, "switch", "-q", "main");
  commit(path, "a.txt", "main\n", "Main");
  fixtureGit(path, "switch", "-q", "feature");
  expect(() => fixtureGit(path, "merge", "-q", "--no-edit", "main")).toThrow();
  expect((await git.interactiveRebasePlan("main~1")).refusal).toBe("A merge is in progress. Continue or abort it first.");
  fixtureGit(path, "add", "a.txt");
  fixtureGit(path, "commit", "-q", "--no-edit");
  expect((await git.interactiveRebasePlan("main~1")).refusal).toBe("“feature” has merge commits since “main~1”. Rebasing interactively would flatten them, so Legend Git doesn’t.");
  await expect(git.interactiveRebase(await git.interactiveRebasePlan("main~1"), [])).rejects.toThrow("merge commits");
});

it("refuses to rewrite pushed commits unless they are allowed by name", async () => {
  const { path, git, one, two, three } = stack("pushed");
  fixtureGit(path, "update-ref", "refs/remotes/origin/feature", two);
  const plan = await git.interactiveRebasePlan("main");
  // Rewording only the unpushed commit is fine.
  await git.interactiveRebase(plan, todo([one, "pick"], [two, "pick"], [three, "reword", "Three, reworded"]));
  expect(rev(path, "HEAD~1")).toBe(two);
  const again = await git.interactiveRebasePlan("main");
  const reorder = todo([two, "pick"], [one, "pick"], [again.commits[2]!.oid, "pick"]);
  const refused = await git.interactiveRebase(again, reorder).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(GitPushedCommitsError);
  expect((refused as GitPushedCommitsError).commits).toEqual([{ oid: two, subject: "Two" }, { oid: one, subject: "One" }]);
  expect((refused as Error).message).toBe(`These commits were already pushed: ${two.slice(0, 7)} “Two”, ${one.slice(0, 7)} “One”. Rewriting them means pushing with force, which rewrites the remote branch for everyone.`);
  expect(rev(path)).toBe(again.head);
  await expect(git.interactiveRebase(again, reorder, { allowPushed: [two] })).rejects.toBeInstanceOf(GitPushedCommitsError);
  expect(await git.interactiveRebase(again, reorder, { allowPushed: [one, two] })).toBe("rebased");
  expect(log(path)).toEqual(["Two", "One", "Three, reworded"]);
});

it("refuses a stale plan, a todo that isn't the plan's commits, and a squash first; an unchanged todo does nothing", async () => {
  const { path, git, one, two, three } = stack("invalid");
  const plan = await git.interactiveRebasePlan("main");
  await expect(git.interactiveRebase(plan, todo([one, "pick"], [two, "pick"]))).rejects.toThrow("each of the branch’s commits once");
  await expect(git.interactiveRebase(plan, todo([one, "pick"], [one, "pick"], [three, "pick"]))).rejects.toThrow("each of the branch’s commits once");
  await expect(git.interactiveRebase(plan, todo([one, "drop"], [two, "squash"], [three, "pick"]))).rejects.toThrow("can’t be squashed or fixed up");
  expect(await git.interactiveRebase(plan, todo([one, "pick"], [two, "pick", "Two\n"], [three, "pick"]))).toBe("unchanged");
  expect(rev(path)).toBe(three);
  commit(path, "d.txt", "d\n", "Four");
  await expect(git.interactiveRebase(plan, todo([one, "pick"], [two, "drop"], [three, "pick"]))).rejects.toThrow("changed since the rebase was set up");
  expect(log(path)).toEqual(["One", "Two", "Three", "Four"]);
});

it("is offered to Undo once it finishes, and undo puts the branch back", async () => {
  const { path, git, one, two, three } = stack("undo");
  const plan = await git.interactiveRebasePlan("main");
  await git.interactiveRebase(plan, todo([three, "pick"], [two, "pick"], [one, "squash", "Squashed"]));
  const undo = await git.undoPlan();
  expect(undo).toEqual(expect.objectContaining({ kind: "rebase", branch: "feature", to: { oid: three, subject: "Three" }, refusal: null }));
  await git.undo(undo!);
  expect(rev(path)).toBe(three);
  expect(read(path, "c.txt")).toBe("c\n");
});

it("undoes a rebase that moved stacked branches, moving them back too", async () => {
  const { path, git, one, two, three } = stack("undo-stacked");
  fixtureGit(path, "branch", "lower", two);
  fixtureGit(path, "branch", "unrelated", one);
  await git.interactiveRebase(await git.interactiveRebasePlan("main"), todo([one, "pick"], [two, "reword", "Two, reworded"], [three, "pick"]), { updateRefs: true });
  const undo = await git.undoPlan();
  expect(undo).toEqual(expect.objectContaining({ kind: "rebase", to: { oid: three, subject: "Three" }, stacked: [{ name: "lower", from: rev(path, "lower"), to: two }] }));
  await git.undo(undo!);
  expect([rev(path), rev(path, "lower"), rev(path, "unrelated")]).toEqual([three, two, one]);
});

it("undoes stacked branches whose commit was dropped or that sat at the old tip", async () => {
  const { path, git, one, two, three } = stack("undo-stacked-dropped");
  fixtureGit(path, "branch", "dropped", two);
  fixtureGit(path, "branch", "tip", three);
  await git.interactiveRebase(await git.interactiveRebasePlan("main"), todo([one, "pick"], [two, "drop"], [three, "pick"]), { updateRefs: true });
  expect(rev(path, "dropped")).toBe(one);
  expect(rev(path, "tip")).toBe(rev(path));
  const undo = await git.undoPlan();
  expect(undo?.stacked?.map(entry => entry.name).sort()).toEqual(["dropped", "tip"]);
  await git.undo(undo!);
  expect([rev(path), rev(path, "dropped"), rev(path, "tip")]).toEqual([three, two, three]);
});

it("rebases every commit onto a base that moved on, and asks for pushed ones there", async () => {
  const { path, git, one, two, three } = stack("moved-base");
  fixtureGit(path, "switch", "-q", "main");
  commit(path, "main.txt", "main\n", "Main moved");
  fixtureGit(path, "switch", "-q", "feature");
  fixtureGit(path, "update-ref", "refs/remotes/origin/feature", one);
  const plan = await git.interactiveRebasePlan("main");
  const keep = todo([one, "pick"], [two, "pick"], [three, "pick"]);
  await expect(git.interactiveRebase(plan, keep)).rejects.toBeInstanceOf(GitPushedCommitsError);
  expect(await git.interactiveRebase(plan, keep, { allowPushed: [one] })).toBe("rebased");
  expect(rev(path, "HEAD~3")).toBe(rev(path, "main"));
  expect(log(path)).toEqual(["One", "Two", "Three"]);
});

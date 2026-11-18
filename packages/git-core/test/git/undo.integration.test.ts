import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

jest.setTimeout(30_000);

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-undo-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "advice.detachedHead": "false" })) fixtureGit(path, "config", key, value);
  return { path, git: new GitService(path, realRunner) };
}
function commit(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}
const rev = (path: string, ref = "HEAD") => fixtureGit(path, "rev-parse", ref);
const head = (path: string) => fixtureGit(path, "symbolic-ref", "-q", "--short", "HEAD");
const status = (path: string) => fixtureGit(path, "status", "--porcelain");
const read = (path: string, file: string) => readFileSync(join(path, file), "utf8");

/** main: First, Second; feature (from First): Feature. */
function forked(name: string) {
  const r = repo(name);
  const first = commit(r.path, "a.txt", "1\n", "First");
  fixtureGit(r.path, "switch", "-q", "-c", "feature");
  const feature = commit(r.path, "b.txt", "feature\n", "Feature");
  fixtureGit(r.path, "switch", "-q", "main");
  const second = commit(r.path, "a.txt", "2\n", "Second");
  return { ...r, first, feature, second };
}

it("offers nothing on an unborn HEAD, after the first commit, or for an undo", async () => {
  const { path, git } = repo("nothing");
  expect(await git.undoPlan()).toBeNull();
  const first = commit(path, "a.txt", "1\n", "First");
  expect(await git.undoPlan()).toBeNull();
  commit(path, "a.txt", "2\n", "Second");
  await git.undo((await git.undoPlan())!);
  expect(rev(path)).toBe(first);
  expect(await git.undoPlan()).toBeNull();
});

it("undoes a commit, keeping its changes staged and other changes in place", async () => {
  const { path, git } = repo("commit");
  const first = commit(path, "a.txt", "1\n", "First");
  const second = commit(path, "a.txt", "2\n", "Second");
  writeFileSync(join(path, "a.txt"), "3\n");
  const plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "commit", branch: "main", from: { oid: second, subject: "Second" }, to: { oid: first, subject: "First" }, keepsChanges: true, refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(first);
  expect(head(path)).toBe("main");
  expect(status(path)).toBe("MM a.txt");
  expect(fixtureGit(path, "show", ":a.txt")).toBe("2");
  expect(read(path, "a.txt")).toBe("3\n");
});

it("undoes an amend back to the commit before it", async () => {
  const { path, git } = repo("amend");
  commit(path, "a.txt", "1\n", "First");
  const before = commit(path, "a.txt", "2\n", "Second");
  writeFileSync(join(path, "b.txt"), "b\n");
  fixtureGit(path, "add", "b.txt");
  fixtureGit(path, "commit", "-q", "--amend", "-m", "Second, amended");
  const plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "amend", from: expect.objectContaining({ subject: "Second, amended" }), to: { oid: before, subject: "Second" } }));
  await git.undo(plan!);
  expect(rev(path)).toBe(before);
  expect(status(path)).toBe("A  b.txt");
});

it("undoes a merge commit, a fast-forward and a merge concluded after conflicts", async () => {
  const { path, git, first, second } = forked("merge");
  fixtureGit(path, "merge", "-q", "--no-edit", "feature");
  let plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "merge", name: "feature", to: { oid: second, subject: "Second" }, keepsChanges: false, refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(second);
  expect(status(path)).toBe("");

  fixtureGit(path, "switch", "-q", "-c", "behind", first);
  fixtureGit(path, "merge", "-q", "--ff-only", "main");
  plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "merge", branch: "behind", name: "main", to: expect.objectContaining({ oid: first }) }));
  await git.undo(plan!);
  expect(rev(path)).toBe(first);

  fixtureGit(path, "switch", "-q", "main");
  commit(path, "b.txt", "main\n", "Clash");
  const before = rev(path);
  expect(() => fixtureGit(path, "merge", "-q", "--no-edit", "feature")).toThrow();
  expect((await git.undoPlan())?.refusal).toMatch(/merge is in progress/);
  writeFileSync(join(path, "b.txt"), "both\n");
  fixtureGit(path, "add", "b.txt");
  fixtureGit(path, "commit", "-q", "--no-edit");
  plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "merge", to: expect.objectContaining({ oid: before }), refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(before);
  expect(read(path, "b.txt")).toBe("main\n");
});

it("undoes a rebase back to the branch's tip before it", async () => {
  const { path, git, feature } = forked("rebase");
  fixtureGit(path, "switch", "-q", "feature");
  fixtureGit(path, "rebase", "-q", "main");
  expect(rev(path)).not.toBe(feature);
  const plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "rebase", branch: "feature", name: "main", to: { oid: feature, subject: "Feature" }, refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(feature);
  expect(head(path)).toBe("feature");
  expect(read(path, "a.txt")).toBe("1\n");
});

it("undoes a cherry-pick and a revert", async () => {
  const { path, git, second, feature } = forked("pick");
  await git.cherryPick(feature, { branch: "main" });
  let plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "cherry-pick", from: expect.objectContaining({ subject: "Feature" }), to: expect.objectContaining({ oid: second }) }));
  await git.undo(plan!);
  expect(rev(path)).toBe(second);
  expect(status(path)).toBe("");

  await git.revert(second, { branch: "main" });
  plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "revert", from: expect.objectContaining({ subject: 'Revert "Second"' }), to: expect.objectContaining({ oid: second }) }));
  await git.undo(plan!);
  expect(rev(path)).toBe(second);
  expect(read(path, "a.txt")).toBe("2\n");
});

it("undoes a reset by moving back to where it started", async () => {
  const { path, git, first, second } = forked("reset");
  fixtureGit(path, "reset", "-q", "--hard", first);
  const plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "reset", from: expect.objectContaining({ oid: first }), to: { oid: second, subject: "Second" }, refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(second);
  expect(read(path, "a.txt")).toBe("2\n");
});

it("undoes a checkout by switching back to the branch, or to the detached commit", async () => {
  const { path, git, first, feature } = forked("checkout");
  await git.checkoutBranch("feature");
  let plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "checkout", branch: "feature", toBranch: "main", name: "feature", from: expect.objectContaining({ oid: feature }) }));
  await git.undo(plan!);
  expect(head(path)).toBe("main");

  fixtureGit(path, "switch", "-q", "--detach", first);
  fixtureGit(path, "switch", "-q", "feature");
  plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "checkout", toBranch: null, to: expect.objectContaining({ oid: first }) }));
  await git.undo(plan!);
  expect(() => head(path)).toThrow();
  expect(rev(path)).toBe(first);
});

it("brings deleted branches back, newest first, until an older operation is next", async () => {
  const { path, git, feature } = forked("delete");
  fixtureGit(path, "branch", "other", feature);
  await git.deleteBranch("feature", { force: true });
  await git.deleteBranch("other", { force: true });
  let plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "branch-delete", branch: "other", to: { oid: feature, subject: "Feature" }, refusal: null }));
  await git.undo(plan!);
  expect(rev(path, "other")).toBe(feature);
  plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "branch-delete", branch: "feature" }));
  // A branch made under the same name meanwhile hides the deletion: Undo goes on to HEAD's operation.
  fixtureGit(path, "branch", "feature");
  expect((await git.undoPlan())?.kind).toBe("commit");
  await expect(git.undo(plan!)).rejects.toThrow(/changed since/);
  fixtureGit(path, "branch", "-D", "feature");
  await git.undo(plan!);
  expect(rev(path, "feature")).toBe(feature);
  expect(fixtureGit(path, "for-each-ref", "refs/legend-git")).toBe("");
  expect((await git.undoPlan())?.kind).toBe("commit");
});

it("doesn't offer a deleted branch once a newer operation moved HEAD", async () => {
  const { path, git } = forked("delete-then-commit");
  await git.deleteBranch("feature", { force: true });
  commit(path, "c.txt", "c\n", "Third");
  expect((await git.undoPlan())?.kind).toBe("commit");
});

it("refuses when the worktree has changes the undo would overwrite, changing nothing", async () => {
  const { path, git } = forked("dirty");
  fixtureGit(path, "merge", "-q", "--no-edit", "feature");
  const merged = rev(path);
  writeFileSync(join(path, "b.txt"), "edited\n");
  writeFileSync(join(path, "c.txt"), "unrelated\n");
  const plan = await git.undoPlan();
  expect(plan?.refusal).toBe("“b.txt” has changes that undoing would overwrite. Commit, stash or discard them first.");
  await expect(git.undo(plan!)).rejects.toThrow(/b\.txt/);
  expect(rev(path)).toBe(merged);
  expect(read(path, "b.txt")).toBe("edited\n");
  // Unrelated changes don't block it and are kept.
  fixtureGit(path, "checkout", "--", "b.txt");
  await git.undo((await git.undoPlan())!);
  expect(read(path, "c.txt")).toBe("unrelated\n");
});

it("refuses once the operation was pushed to the branch's upstream or a same-named remote branch", async () => {
  const { path, git } = forked("pushed");
  const third = commit(path, "c.txt", "c\n", "Third");
  fixtureGit(path, "update-ref", "refs/remotes/origin/main", third);
  expect((await git.undoPlan())?.refusal).toBe("“main” was already pushed to “origin/main” with this commit. Undoing it here would leave the remote ahead and need a force push, so Legend Git doesn’t undo it.");
  fixtureGit(path, "update-ref", "refs/remotes/origin/main", rev(path, "HEAD~1"));
  expect((await git.undoPlan())?.refusal).toBeNull();
  fixtureGit(path, "remote", "add", "fork", "https://example.test/fork.git");
  fixtureGit(path, "update-ref", "refs/remotes/fork/topic", third);
  fixtureGit(path, "config", "branch.main.remote", "fork");
  fixtureGit(path, "config", "branch.main.merge", "refs/heads/topic");
  expect((await git.undoPlan())?.refusal).toMatch(/pushed to “fork\/topic”/);
});

it("rejects a plan that a newer operation replaced", async () => {
  const { path, git } = forked("stale");
  const plan = (await git.undoPlan())!;
  const third = commit(path, "c.txt", "c\n", "Third");
  await expect(git.undo(plan)).rejects.toThrow(/changed since this undo was offered/);
  expect(rev(path)).toBe(third);
});

it("brings a deleted branch back with its upstream, and drops records a newer operation hid", async () => {
  const { path, git, feature } = forked("delete-upstream");
  fixtureGit(path, "remote", "add", "origin", "https://example.test/a.git");
  fixtureGit(path, "update-ref", "refs/remotes/origin/feature", feature);
  fixtureGit(path, "branch", "--set-upstream-to=origin/feature", "feature");
  fixtureGit(path, "branch", "gone", feature);
  await git.deleteBranch("gone", { force: true });
  commit(path, "c.txt", "c\n", "Third");
  await git.deleteBranch("feature", { force: true });
  // Only the newest record is kept; "gone" was hidden by the commit.
  expect(fixtureGit(path, "log", "-1", "--format=%P", "refs/legend-git/deleted-branches").split(" ")).toEqual([feature]);
  await git.undo((await git.undoPlan())!);
  expect(fixtureGit(path, "rev-parse", "--abbrev-ref", "feature@{upstream}")).toBe("origin/feature");
  expect((await git.undoPlan())?.kind).toBe("commit");
});

it("refuses an undo that would overwrite an ignored file", async () => {
  const { path, git } = repo("ignored");
  commit(path, "a.txt", "1\n", "First");
  fixtureGit(path, "switch", "-q", "-c", "untrack");
  fixtureGit(path, "rm", "-q", "--cached", "a.txt");
  writeFileSync(join(path, ".gitignore"), "a.txt\n");
  fixtureGit(path, "add", ".gitignore");
  fixtureGit(path, "commit", "-q", "-m", "Untrack a.txt");
  fixtureGit(path, "switch", "-q", "main");
  fixtureGit(path, "merge", "-q", "--ff-only", "untrack");
  writeFileSync(join(path, "a.txt"), "precious\n");
  expect((await git.undoPlan())?.refusal).toMatch(/^“a\.txt” has changes/);
});

it("undoes a pull's fast-forward under the upstream's name, though the upstream has it", async () => {
  const { path, git, first, second } = forked("pull");
  fixtureGit(path, "remote", "add", "origin", "https://example.test/a.git");
  fixtureGit(path, "update-ref", "refs/remotes/origin/main", second);
  fixtureGit(path, "branch", "-f", "behind", first);
  fixtureGit(path, "switch", "-q", "behind");
  fixtureGit(path, "branch", "--set-upstream-to=origin/main");
  fixtureGit(path, "merge", "-q", "--ff-only", "@{u}");
  const plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "merge", name: "origin/main", to: expect.objectContaining({ oid: first }), refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(first);
});

it("undoes a soft or mixed reset, whose changes are the commits it left", async () => {
  const { path, git } = repo("uncommit");
  commit(path, "a.txt", "1\n", "First");
  const second = commit(path, "a.txt", "2\n", "Second");
  writeFileSync(join(path, "new.txt"), "new\n");
  fixtureGit(path, "add", "new.txt");
  fixtureGit(path, "commit", "-q", "-m", "Third");
  const third = rev(path);
  writeFileSync(join(path, "other.txt"), "other\n");
  fixtureGit(path, "reset", "-q", "HEAD~2");
  let plan = await git.undoPlan();
  expect(plan).toEqual(expect.objectContaining({ kind: "reset", to: expect.objectContaining({ oid: third }), refusal: null }));
  await git.undo(plan!);
  expect(rev(path)).toBe(third);
  expect(status(path)).toBe("?? other.txt");

  fixtureGit(path, "reset", "-q", "--soft", second);
  plan = await git.undoPlan();
  expect(plan?.refusal).toBeNull();
  await git.undo(plan!);
  expect(rev(path)).toBe(third);
  expect(status(path)).toBe("?? other.txt");
  // Edited after the reset: refused, and the edit stays.
  fixtureGit(path, "reset", "-q", "HEAD~1");
  writeFileSync(join(path, "new.txt"), "edited\n");
  expect((await git.undoPlan())?.refusal).toMatch(/^“new\.txt” has changes/);
});

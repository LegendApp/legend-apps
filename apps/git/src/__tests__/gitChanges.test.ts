import { GitIndexLockedError, GitServiceError, type GitCommitInput, type GitDiscardBackup, type GitOperation, type GitService, type GitStatus, type GitReadOptions, type GitDirectoryChangeEvent } from "@legend-apps/git-core";
import { conflictedEntries, createGitChanges, stagedEntries, unstagedEntries, type ChangesState } from "../gitChanges";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const status = (xy = "MM"): GitStatus => ({ entries: [{ kind: "ordinary", path: "both.txt", indexStatus: xy[0]!, worktreeStatus: xy[1]! }], branch: { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 } });
const unstagedPatch = "diff --git a/both.txt b/both.txt\n--- a/both.txt\n+++ b/both.txt\n@@ -1,2 +1,2 @@\n-index\n+worktree\n keep\n";
const stagedPatch = "diff --git a/both.txt b/both.txt\n--- a/both.txt\n+++ b/both.txt\n@@ -1 +1 @@\n-head\n+index\n";
const backup: GitDiscardBackup = { ref: "refs/legend-git/discarded/000001763300000000-0", oid: "f".repeat(40), entries: [{ path: "both.txt", mode: "100644", oid: "e".repeat(40) }] };
function setup() {
  let state!: ChangesState, notify!: (event: GitDirectoryChangeEvent) => void;
  const remove = jest.fn();
  const git = {
    resolveRoot: jest.fn(async (_options: GitReadOptions) => "/repo"),
    watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git/worktrees/linked", commonDir: "/repo/.git", ignoredPaths: ["ignored/"] })),
    status: jest.fn(async () => status()), stageFile: jest.fn(async () => {}), unstageFile: jest.fn(async () => {}),
    fileDiff: jest.fn(async (_file: { path: string }, staged: boolean) => staged ? stagedPatch : unstagedPatch), applyPatch: jest.fn(async (_patch: string, _options: GitReadOptions & { reverse?: boolean }) => {}),
    operationState: jest.fn(async (_options?: GitReadOptions) => null as GitOperation | null),
    lastDiscard: jest.fn(async (_options?: GitReadOptions): Promise<GitDiscardBackup | null> => null),
    discardFiles: jest.fn(async (_paths: readonly string[], _options?: GitReadOptions) => backup), discardPatch: jest.fn(async (_path: string, _patch: string, _options?: GitReadOptions) => backup),
    restoreDiscard: jest.fn(async (_ref: string, _options?: GitReadOptions) => ({ restored: backup, replaced: backup })),
    conflictFile: jest.fn(async (_path: string, _options?: GitReadOptions) => ({ ours: true, theirs: true, binary: true, edited: false })),
    commit: jest.fn(async (_input: GitCommitInput, _options?: GitReadOptions) => {}), headMessage: jest.fn(async (_options?: GitReadOptions) => "Subject\n\nBody"),
  };
  const watch = jest.fn((_paths: string[], listener: typeof notify) => { notify = listener; return { remove }; });
  const serviceFor = jest.fn((_path: string) => git as unknown as GitService);
  const change = jest.fn((next: ChangesState) => { state = next; });
  const controller = createGitChanges(change, watch, serviceFor);
  return { controller, git, watch, change, serviceFor, remove, state: () => state, notify: (filePath: string, contentChanged = true) => notify({ filePath, path: "/repo", contentChanged, type: "change" }) };
}

it("resolves nested repository roots, watches all locations, and refreshes both lists after each write", async () => {
  const t = setup(); await t.controller.open("/repo/nested");
  expect(t.serviceFor.mock.calls).toEqual([["/repo/nested"], ["/repo"]]);
  expect(t.watch.mock.calls[0][0]).toEqual(["/repo", "/repo/.git/worktrees/linked", "/repo/.git"]);
  expect(t.state().status?.entries[0]).toMatchObject({ indexStatus: "M", worktreeStatus: "M" });
  t.git.status.mockResolvedValueOnce(status("M."));
  await t.controller.changeFile("both.txt", true);
  expect(t.git.stageFile).toHaveBeenCalledWith("both.txt", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(t.state().status?.entries[0].worktreeStatus).toBe(".");
  t.git.status.mockResolvedValueOnce(status(".M"));
  await t.controller.changeFile("both.txt", false);
  expect(t.git.unstageFile).toHaveBeenCalledTimes(1);
  expect(t.state().status?.entries[0].indexStatus).toBe(".");
  t.controller.dispose(); expect(t.remove).toHaveBeenCalledTimes(1);
});

it("cancels stale discovery and reads; an old result cannot overwrite a new repository or a closed window", async () => {
  const t = setup(), discovery = deferred<string>();
  t.git.resolveRoot.mockReturnValueOnce(discovery.promise);
  const first = t.controller.open("/old");
  const firstSignal = t.git.resolveRoot.mock.calls[0][0].signal!;
  await t.controller.open("/new");
  expect(firstSignal.aborted).toBe(true);
  discovery.resolve("/old"); await first;
  expect(t.state().root).toBe("/repo");
  const pending = deferred<GitStatus>(); t.git.status.mockReturnValueOnce(pending.promise);
  const refresh = t.controller.refresh();
  const calls = t.change.mock.calls.length; t.controller.dispose();
  pending.resolve(status("A.")); await refresh;
  expect(t.change).toHaveBeenCalledTimes(calls);
  expect(t.remove).toHaveBeenCalledTimes(1);
});

it("does not publish a late write or read after switching repositories, and prevents duplicate actions", async () => {
  const t = setup(); await t.controller.open("/repo");
  const pending = deferred<void>(); t.git.stageFile.mockReturnValueOnce(pending.promise);
  const writing = t.controller.changeFile("both.txt", true);
  await t.controller.changeFile("both.txt", true);
  expect(t.git.stageFile).toHaveBeenCalledTimes(1);
  await t.controller.open("/new");
  const calls = t.change.mock.calls.length;
  pending.resolve(); await writing;
  expect(t.change).toHaveBeenCalledTimes(calls);
  expect(t.state().writing).toBe(false);
  t.controller.dispose();
});

it("reports invalid selections and index.lock errors while preserving the latest list", async () => {
  const t = setup(); t.git.resolveRoot.mockRejectedValueOnce(new Error("Not a repository"));
  await t.controller.open("/invalid"); expect(t.state()).toMatchObject({ root: null, loading: false, error: null, openError: { path: "/invalid", message: "Not a repository" } });
  t.controller.dismissOpenError(); expect(t.state().openError).toBeNull();
  await t.controller.open("/repo");
  // A folder outside any repository leaves the open one as it was.
  t.git.resolveRoot.mockRejectedValueOnce(new Error("Not a repository"));
  await t.controller.open("/gone"); expect(t.state()).toMatchObject({ root: "/repo", openError: { path: "/gone" } });
  expect(t.state().status).not.toBeNull();
  t.git.stageFile.mockRejectedValueOnce(new GitIndexLockedError("/repo/.git/index.lock"));
  await t.controller.changeFile("both.txt", true);
  expect(t.state()).toMatchObject({ writing: false, status: status(), error: expect.stringContaining("index is locked") });
  t.controller.dispose();
});

it("coalesces watcher bursts, ignores irrelevant changes, and stops registrations on repository change", async () => {
  jest.useFakeTimers();
  const t = setup();
  try {
    await t.controller.open("/repo");
    t.notify("/repo/ignored/file"); t.notify("/repo/.git/objects/a"); t.notify("/repo/file", false);
    await jest.advanceTimersByTimeAsync(1000); expect(t.git.status).toHaveBeenCalledTimes(1);
    t.notify("/repo/both.txt"); t.notify("/repo/.git/index");
    await jest.advanceTimersByTimeAsync(300); expect(t.git.status).toHaveBeenCalledTimes(2);
    t.notify("/repo/both.txt");
    await t.controller.open("/next"); expect(t.remove).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000); expect(t.git.status).toHaveBeenCalledTimes(3);
    t.controller.dispose(); expect(t.remove).toHaveBeenCalledTimes(2);
  } finally { t.controller.dispose(); jest.useRealTimers(); }
});

it("loads the selected side's patch, applies line selections forward or reversed, and re-reads status and patch after each write", async () => {
  const t = setup(); await t.controller.open("/repo");
  expect(t.git.fileDiff).not.toHaveBeenCalled();
  await t.controller.select({ section: "unstaged", path: "both.txt" });
  expect(t.git.fileDiff).toHaveBeenLastCalledWith({ path: "both.txt", originalPath: undefined, untracked: false }, false, expect.anything());
  expect(t.state().patch).toMatchObject({ section: "unstaged", path: "both.txt", text: unstagedPatch, file: { newPath: "both.txt" } });
  const statusReads = t.git.status.mock.calls.length;
  await t.controller.changeLines(new Set(["+1"]), "stale patch");
  expect(t.git.applyPatch).not.toHaveBeenCalled();
  expect(t.state().error).toContain("The diff changed");
  await t.controller.changeLines(new Set(["+1"]), unstagedPatch);
  expect(t.git.applyPatch).toHaveBeenLastCalledWith("diff --git a/both.txt b/both.txt\n--- a/both.txt\n+++ b/both.txt\n@@ -1,2 +1,3 @@\n index\n+worktree\n keep\n", expect.objectContaining({ reverse: false }));
  expect(t.git.status.mock.calls.length).toBe(statusReads + 1);
  expect(t.git.fileDiff).toHaveBeenCalledTimes(2);
  await t.controller.select({ section: "staged", path: "both.txt" });
  expect(t.state().patch).toMatchObject({ section: "staged", text: stagedPatch });
  await t.controller.changeLines(new Set(["-1", "+1"]), stagedPatch);
  expect(t.git.applyPatch).toHaveBeenLastCalledWith(expect.stringContaining("@@ -1,1 +1,1 @@"), expect.objectContaining({ reverse: true }));
  t.git.status.mockResolvedValue(status(".M"));
  await t.controller.refresh();
  expect(t.state()).toMatchObject({ selection: null, patch: null });
  t.controller.dispose();
});

it("reports a failed patch write and still refreshes from authoritative status", async () => {
  const t = setup(); await t.controller.open("/repo");
  await t.controller.select({ section: "unstaged", path: "both.txt" });
  t.git.applyPatch.mockRejectedValueOnce(new GitIndexLockedError("/repo/.git/index.lock"));
  const reads = t.git.status.mock.calls.length;
  await t.controller.changeLines(new Set(["+1"]), unstagedPatch);
  expect(t.state()).toMatchObject({ writing: false, error: expect.stringContaining("index is locked") });
  expect(t.git.status.mock.calls.length).toBe(reads + 1);
  t.controller.dispose();
});

it("discards whole files and reversed line selections, then exposes and restores the last backup", async () => {
  const t = setup(); await t.controller.open("/repo");
  t.git.lastDiscard.mockResolvedValue(backup);
  await t.controller.discardFile("both.txt");
  expect(t.git.discardFiles).toHaveBeenCalledWith(["both.txt"], expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(t.state()).toMatchObject({ writing: false, error: null, lastDiscard: backup });
  await t.controller.select({ section: "unstaged", path: "both.txt" });
  expect(await t.controller.discardLines(new Set(["+1"]), "stale")).toBe(false);
  expect(t.git.discardPatch).not.toHaveBeenCalled();
  expect(await t.controller.discardLines(new Set(["+1"]), unstagedPatch)).toBe(true);
  // Reversed onto the worktree: the selected addition is undone, the unselected removal stays out of the patch.
  expect(t.git.discardPatch).toHaveBeenCalledWith("both.txt", "diff --git a/both.txt b/both.txt\n--- a/both.txt\n+++ b/both.txt\n@@ -1,1 +1,2 @@\n+worktree\n keep\n", expect.anything());
  await t.controller.select({ section: "staged", path: "both.txt" });
  expect(await t.controller.discardLines(new Set(["+1"]), stagedPatch)).toBe(false);
  expect(t.state().error).toBe("Only unstaged changes can be discarded.");
  expect(await t.controller.restoreLastDiscard()).toBe(true);
  expect(t.git.restoreDiscard).toHaveBeenCalledWith(backup.ref, expect.anything());
  t.controller.dispose();
});

it("lists conflicts once without loading their patch, and reports commit failures with Git's stderr", async () => {
  const t = setup();
  const conflicted: GitStatus = { ...status(), entries: [...status().entries, { kind: "unmerged", path: "conflict.txt", indexStatus: "U", worktreeStatus: "U" }] };
  t.git.status.mockResolvedValue(conflicted);
  await t.controller.open("/repo");
  expect(conflictedEntries(t.state().status).map(entry => entry.path)).toEqual(["conflict.txt"]);
  expect(unstagedEntries(t.state().status).map(entry => entry.path)).toEqual(["conflict.txt", "both.txt"]);
  expect(stagedEntries(t.state().status).map(entry => entry.path)).toEqual(["both.txt"]);
  await t.controller.select({ section: "unstaged", path: "conflict.txt" });
  expect(t.state().patch).toMatchObject({ conflicted: true, file: null, conflict: { binary: true } });
  expect(t.git.fileDiff).not.toHaveBeenCalled();
  t.git.commit.mockRejectedValueOnce(new GitServiceError("command-failed", "pre-commit: lint failed"));
  expect(await t.controller.commit({ message: "Subject\n" })).toBe(false);
  expect(t.state().error).toBe("pre-commit: lint failed");
  expect(await t.controller.commit({ message: "Subject\n", signoff: true })).toBe(true);
  expect(t.git.commit).toHaveBeenLastCalledWith({ message: "Subject\n", signoff: true }, expect.anything());
  expect(await t.controller.headMessage()).toBe("Subject\n\nBody");
  t.git.status.mockResolvedValue({ ...status(), branch: { ...status().branch, oid: "(initial)" } });
  await t.controller.refresh();
  expect(await t.controller.headMessage()).toBeNull();
  expect(t.git.headMessage).toHaveBeenCalledTimes(1);
  t.controller.dispose();
});

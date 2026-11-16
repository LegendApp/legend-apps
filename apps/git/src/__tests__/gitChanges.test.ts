import { GitIndexLockedError, type GitService, type GitStatus, type GitReadOptions, type GitDirectoryChangeEvent } from "@legend-apps/git-core";
import { createGitChanges, type ChangesState } from "../gitChanges";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const status = (xy = "MM"): GitStatus => ({ entries: [{ kind: "ordinary", path: "both.txt", indexStatus: xy[0]!, worktreeStatus: xy[1]! }], branch: { oid: "abc", head: "main", upstream: null, ahead: 0, behind: 0 } });
const unstagedPatch = "diff --git a/both.txt b/both.txt\n--- a/both.txt\n+++ b/both.txt\n@@ -1,2 +1,2 @@\n-index\n+worktree\n keep\n";
const stagedPatch = "diff --git a/both.txt b/both.txt\n--- a/both.txt\n+++ b/both.txt\n@@ -1 +1 @@\n-head\n+index\n";
function setup() {
  let state!: ChangesState, notify!: (event: GitDirectoryChangeEvent) => void;
  const remove = jest.fn();
  const git = {
    resolveRoot: jest.fn(async (_options: GitReadOptions) => "/repo"),
    watchLocations: jest.fn(async () => ({ root: "/repo", gitDir: "/repo/.git/worktrees/linked", commonDir: "/repo/.git", ignoredPaths: ["ignored/"] })),
    status: jest.fn(async () => status()), stageFile: jest.fn(async () => {}), unstageFile: jest.fn(async () => {}),
    fileDiff: jest.fn(async (_file: { path: string }, staged: boolean) => staged ? stagedPatch : unstagedPatch), applyPatch: jest.fn(async (_patch: string, _options: GitReadOptions & { reverse?: boolean }) => {}),
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
  await t.controller.open("/invalid"); expect(t.state()).toMatchObject({ root: null, loading: false, error: "Not a repository" });
  await t.controller.open("/repo");
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

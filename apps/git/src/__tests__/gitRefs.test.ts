import type { GitRefList, GitService } from "@legend-apps/git-core";
import { createGitRefs, findRef, recentBranches, resolveBranchName, type RefsState } from "../gitRefs";

const list = (...names: string[]): GitRefList => ({
  branches: names.map((name, index) => ({ name, ref: `refs/heads/${name}`, oid: "a".repeat(40), current: index === 0, upstream: null, time: index, ahead: 0, behind: 0, gone: false })),
  remotes: [{ name: "origin", branches: [{ name: "origin/fix/x", ref: "refs/remotes/origin/fix/x", oid: "b".repeat(40), remote: "origin", branch: "fix/x" }] }, { name: "up", branches: [{ name: "up/fix/x", ref: "refs/remotes/up/fix/x", oid: "b".repeat(40), remote: "up", branch: "fix/x" }, { name: "up/only", ref: "refs/remotes/up/only", oid: "b".repeat(40), remote: "up", branch: "only" }] }],
  tags: [{ name: "v1", ref: "refs/tags/v1", oid: "c".repeat(40) }], defaultBranch: null,
});

it("finds refs by full name and typed branch names, and orders recent branches by commit time", () => {
  const refs = list("main", "old", "new");
  expect(findRef(refs, "refs/remotes/up/only")).toMatchObject({ kind: "remote", ref: { branch: "only" } });
  expect(findRef(refs, "refs/tags/v1")?.kind).toBe("tag");
  expect(findRef(refs, "refs/heads/missing")).toBeNull();
  expect(resolveBranchName(refs, "old")).toMatchObject({ kind: "branch", ref: { name: "old" } });
  expect(resolveBranchName(refs, "up/fix/x")).toMatchObject({ kind: "remote", ref: { name: "up/fix/x" } });
  expect(resolveBranchName(refs, "only")).toMatchObject({ kind: "remote", ref: { name: "up/only" } });
  // Two remotes have "fix/x", so the bare name is ambiguous.
  expect(resolveBranchName(refs, "fix/x")).toBeNull();
  expect(recentBranches(refs, 2).map(branch => branch.name)).toEqual(["new", "old"]);
});

it("resolves a write only after the newest ref read lands, also one started by the watcher meanwhile", async () => {
  const reads: ((refs: GitRefList) => void)[] = [];
  const git = {
    listRefs: jest.fn(() => new Promise<GitRefList>(resolve => reads.push(resolve))), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []),
    renameBranch: jest.fn(async () => {}),
  };
  let state!: RefsState;
  const refs = createGitRefs(next => { state = next; }, () => git as unknown as GitService);
  refs.setRoot("/repo");
  reads.shift()!(list("main", "old"));
  await Promise.resolve();
  let renamed = false;
  const rename = refs.rename("old", "newer").then(() => { renamed = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  // The write's own read is still running when Changes' refresh starts another one.
  expect(reads).toHaveLength(1);
  void refs.refresh();
  reads.shift()!(list("main", "old"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(renamed).toBe(false);
  reads.shift()!(list("main", "newer"));
  await rename;
  expect(state.refs?.branches.map(branch => branch.name)).toEqual(["main", "newer"]);
  expect(state.writing).toBe(false);
  refs.dispose();
});

it("runs one write at a time and re-reads the refs after a failed write", async () => {
  const git = { listRefs: jest.fn(async () => list("main")), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []), deleteBranch: jest.fn(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("refused")), 5))) };
  const refs = createGitRefs(() => {}, () => git as unknown as GitService);
  refs.setRoot("/repo");
  const first = refs.delete("a");
  await expect(refs.delete("b")).rejects.toThrow("Another branch or stash operation is still running.");
  await expect(first).rejects.toThrow("refused");
  expect(git.listRefs).toHaveBeenCalledTimes(2);
  refs.dispose();
});

it("counts a large repository's worktrees a few at a time, publishes the counts together, and stops counting for a closed repository", async () => {
  const worktrees = Array.from({ length: 30 }, (_, index) => ({ path: `/wt/${index}`, head: "a".repeat(40), branch: `b${index}`, bare: false, detached: false, locked: null, prunable: null }));
  const pending: { path: string; signal: AbortSignal; resolve: (count: number) => void }[] = [];
  let running = 0, most = 0;
  const git = {
    listRefs: jest.fn(async () => list("main")), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => worktrees),
    worktreeChangeCount: jest.fn((path: string, { signal }: { signal: AbortSignal }) => new Promise<number>(resolve => {
      running += 1; most = Math.max(most, running);
      pending.push({ path, signal, resolve: count => { running -= 1; resolve(count); } });
    })),
  };
  let state!: RefsState;
  const refs = createGitRefs(next => { state = next; }, () => git as unknown as GitService);
  refs.setRoot("/repo");
  await new Promise(resolve => setTimeout(resolve, 0));
  // The refs and worktrees are shown at once; the counts follow.
  expect(state.worktrees).toHaveLength(30);
  expect(state.worktrees!.every(entry => entry.changes === null)).toBe(true);
  expect(pending).toHaveLength(4);
  for (let done = 0; done < 20; done += 1) { pending.shift()!.resolve(done === 3 ? 7 : 0); await new Promise(resolve => setTimeout(resolve, 0)); }
  expect(most).toBe(4);
  expect(state.worktrees!.every(entry => entry.changes === null)).toBe(true);
  // Opening another repository aborts the counts in flight and starts no more for the old one.
  refs.setRoot(null);
  expect(pending.every(entry => entry.signal.aborted)).toBe(true);
  const started = git.worktreeChangeCount.mock.calls.length;
  for (const entry of pending.splice(0)) entry.resolve(0);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(git.worktreeChangeCount).toHaveBeenCalledTimes(started);
  expect(state.worktrees).toBeNull();
  refs.dispose();
});

it("publishes every worktree's count once all are read", async () => {
  const worktrees = Array.from({ length: 9 }, (_, index) => ({ path: `/wt/${index}`, head: "a".repeat(40), branch: `b${index}`, bare: false, detached: false, locked: null, prunable: null }));
  const git = { listRefs: jest.fn(async () => list("main")), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => worktrees),
    worktreeChangeCount: jest.fn(async (path: string) => path === "/wt/5" ? 3 : 0) };
  let state!: RefsState;
  const refs = createGitRefs(next => { state = next; }, () => git as unknown as GitService);
  refs.setRoot("/repo");
  for (let tick = 0; tick < 10; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.worktrees!.map(entry => entry.changes)).toEqual([0, 0, 0, 0, 0, 3, 0, 0, 0]);
  refs.dispose();
});

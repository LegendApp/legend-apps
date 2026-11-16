import type { GitRefList, GitService } from "@legend-apps/git-core";
import { createGitRefs, findRef, recentBranches, resolveBranchName, type RefsState } from "../gitRefs";

const list = (...names: string[]): GitRefList => ({
  branches: names.map((name, index) => ({ name, ref: `refs/heads/${name}`, oid: "a".repeat(40), current: index === 0, upstream: null, time: index })),
  remotes: [{ name: "origin", branches: [{ name: "origin/fix/x", ref: "refs/remotes/origin/fix/x", oid: "b".repeat(40), remote: "origin", branch: "fix/x" }] }, { name: "up", branches: [{ name: "up/fix/x", ref: "refs/remotes/up/fix/x", oid: "b".repeat(40), remote: "up", branch: "fix/x" }, { name: "up/only", ref: "refs/remotes/up/only", oid: "b".repeat(40), remote: "up", branch: "only" }] }],
  tags: [{ name: "v1", ref: "refs/tags/v1", oid: "c".repeat(40) }],
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
    listRefs: jest.fn(() => new Promise<GitRefList>(resolve => reads.push(resolve))),
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
  const git = { listRefs: jest.fn(async () => list("main")), deleteBranch: jest.fn(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("refused")), 5))) };
  const refs = createGitRefs(() => {}, () => git as unknown as GitService);
  refs.setRoot("/repo");
  const first = refs.delete("a");
  await expect(refs.delete("b")).rejects.toThrow("Another branch operation is still running.");
  await expect(first).rejects.toThrow("refused");
  expect(git.listRefs).toHaveBeenCalledTimes(2);
  refs.dispose();
});

import type { GitRefList } from "@legend-apps/git-core";
import { canPushQueueEntry, queueDetail, queuePushTarget, reviewQueue } from "../gitQueue";
import { emptyRefs, type RefsState, type WorktreeEntry } from "../gitRefs";

const oid = "a".repeat(40);
const branch = (name: string, upstream: string | null, ahead = 0, gone = false) => ({ name, ref: `refs/heads/${name}`, oid, current: false, upstream, time: 1, ahead, behind: 0, gone });
const worktree = (path: string, branchName: string | null, changes: number | null, extra: Partial<WorktreeEntry> = {}): WorktreeEntry =>
  ({ path, head: oid, branch: branchName, detached: !branchName, bare: false, locked: null, prunable: null, main: path === "/repo", changes, ...extra });
const refs = (defaultBranch: string | null): GitRefList => ({
  branches: [branch("main", "origin/main"), branch("ahead", "origin/ahead", 2), branch("local-up", "main", 1), branch("gone", "origin/gone", 0, true), branch("fresh", null), branch("level", null), branch("wt", null)],
  remotes: [{ name: "origin", branches: [{ name: "origin/main", ref: "refs/remotes/origin/main", oid, remote: "origin", branch: "main" }, { name: "origin/ahead", ref: "refs/remotes/origin/ahead", oid, remote: "origin", branch: "ahead" }] }],
  tags: [], defaultBranch,
});
const state = (patch: Partial<RefsState>): RefsState => ({ ...emptyRefs, root: "/repo", refs: refs("refs/remotes/origin/main"), worktrees: [worktree("/repo", "main", 3)], ...patch });

it("queues other dirty worktrees, then branches ahead of their upstream or of the default branch", () => {
  const queue = reviewQueue(state({
    worktrees: [worktree("/repo", "main", 3), worktree("/w/wt", "wt", 2), worktree("/w/clean", "level", 0), worktree("/w/unread", null, null), worktree("/w/gone", "x", 4, { prunable: "gone" }), worktree("/w/bare", null, 1, { bare: true })],
    outgoing: { "refs/heads/fresh": 1, "refs/heads/level": 0, "refs/heads/wt": 5, "refs/heads/gone": 3, "refs/heads/main": 0 },
  }));
  // This window's worktree (Changes covers it), clean, unread, missing and bare worktrees are left out; wt's branch shows on its worktree.
  // A gone upstream (merged and deleted) and a local upstream have nothing to push, so they aren't queued.
  expect(queue.map(entry => entry.id)).toEqual(["worktree:/w/wt", "branch:refs/heads/ahead", "branch:refs/heads/fresh"]);
  expect(queue.map(queueDetail)).toEqual(["2 files · ↑5", "↑2", "↑1"]);
  expect(queue.map(entry => entry.kind === "branch" ? entry.base : null)).toEqual([null, "refs/remotes/origin/ahead", "refs/remotes/origin/main"]);
  // A detached worktree has nothing to push.
  expect(queue.map(entry => queuePushTarget(entry))).toEqual([{ branch: "wt", publish: true }, { branch: "ahead", publish: false }, { branch: "fresh", publish: true }]);
  // A worktree on a merged branch whose upstream is gone has files to commit but nothing to push or publish.
  const merged = reviewQueue(state({ worktrees: [worktree("/repo", "main", 0), worktree("/w/m", "gone", 1)], outgoing: { "refs/heads/gone": 3 } }))[0]!;
  expect([queueDetail(merged), queuePushTarget(merged), canPushQueueEntry(merged)]).toEqual(["1 file", null, false]);
  const detached = reviewQueue(state({ worktrees: [worktree("/repo", "main", 0), worktree("/w/d", null, 1)] }))[0]!;
  expect([queueDetail(detached), queuePushTarget(detached), canPushQueueEntry(detached)]).toEqual(["1 file", null, false]);
});

it("is empty until refs and worktrees are read, and without a default branch counts only upstreams", () => {
  expect(reviewQueue({ ...emptyRefs, root: "/repo" })).toEqual([]);
  expect(reviewQueue(state({ refs: refs(null), outgoing: { "refs/heads/fresh": 1 } })).map(entry => entry.id)).toEqual(["branch:refs/heads/ahead"]);
});

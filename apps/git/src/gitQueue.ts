import type { GitBranch, GitRefList } from "@legend-apps/git-core";
import type { RefsState } from "./gitRefs";
import { worktreeName } from "./gitWorktrees";

/**
 * One Review Queue entry: another worktree with changes (and its branch's outgoing commits), or a local branch with
 * commits to push: ahead of its upstream, or without one and with commits the default branch doesn't have.
 * `upstream` is the branch's live remote upstream; `push` is what Push does: "push" to it, "publish" a branch that never had
 * one, or null (detached, a gone or local upstream). `base` is what its outgoing commits are counted against (a full ref).
 */
export type QueueEntry =
  | { kind: "worktree"; id: `worktree:${string}`; path: string; name: string; branch: string | null; upstream: string | null; push: "push" | "publish" | null; files: number; ahead: number }
  | { kind: "branch"; id: `branch:${string}`; ref: string; name: string; upstream: string | null; push: "push" | "publish"; base: string; ahead: number };

/** The remote-tracking ref of a branch's upstream ("origin/x" → refs/remotes/origin/x), or null for a local upstream. */
function upstreamRef(refs: GitRefList, upstream: string) {
  const remote = `refs/remotes/${upstream}`;
  return refs.remotes.some(entry => entry.branches.some(branch => branch.ref === remote)) ? remote : null;
}

/**
 * Commits `branch` would push, and the ref they're counted against; null when it has nothing to push here: a gone
 * upstream (usually merged and deleted, so publishing it again would be wrong), a local upstream, or an unknown count.
 */
function outgoing(state: RefsState, branch: GitBranch) {
  const refs = state.refs!;
  if (branch.upstream) {
    const base = !branch.gone && upstreamRef(refs, branch.upstream);
    return base ? { ahead: branch.ahead, base } : null;
  }
  if (!refs.defaultBranch || refs.defaultBranch === branch.ref) return null;
  return { ahead: state.outgoing?.[branch.ref] ?? 0, base: refs.defaultBranch };
}

/**
 * The queue, from what the refs controller already read: worktrees other than this window's with changes, then branches
 * with outgoing commits that aren't checked out in one of those worktrees (that worktree's entry shows them).
 */
export function reviewQueue(state: RefsState): QueueEntry[] {
  const { refs, root } = state;
  if (!refs || !state.worktrees) return [];
  const branches = new Map(refs.branches.map(branch => [branch.name, branch]));
  const worktrees: QueueEntry[] = state.worktrees.filter(entry => !entry.bare && entry.prunable === null && entry.path !== root && (entry.changes ?? 0) > 0).map(entry => {
    const branch = entry.branch ? branches.get(entry.branch) : undefined;
    const count = branch && outgoing(state, branch);
    const upstream = branch?.upstream && count ? branch.upstream : null;
    return {
      kind: "worktree", id: `worktree:${entry.path}`, path: entry.path, name: worktreeName(entry.path), branch: entry.branch,
      upstream, push: !branch ? null : upstream ? "push" : branch.upstream ? null : "publish", files: entry.changes ?? 0, ahead: count?.ahead ?? 0,
    };
  });
  const listed = new Set(worktrees.map(entry => entry.kind === "worktree" ? entry.branch : null));
  const pending: QueueEntry[] = refs.branches.flatMap(branch => {
    const count = listed.has(branch.name) ? null : outgoing(state, branch);
    return count && count.ahead > 0 ? [{ kind: "branch" as const, id: `branch:${branch.ref}` as const, ref: branch.ref, name: branch.name, upstream: branch.upstream, push: branch.upstream ? "push" as const : "publish" as const, base: count.base, ahead: count.ahead }] : [];
  });
  return [...worktrees, ...pending];
}

/** A queue row's secondary text: "3 files", "↑2", or both. */
export function queueDetail(entry: QueueEntry) {
  const files = entry.kind === "worktree" ? entry.files === 1 ? "1 file" : `${entry.files} files` : "";
  return [files, entry.ahead ? `↑${entry.ahead}` : ""].filter(Boolean).join(" · ");
}

/** The branch a queue entry's Push sends (null for a detached worktree), and whether it publishes it. */
export function queuePushTarget(entry: QueueEntry) {
  const branch = entry.kind === "branch" ? entry.name : entry.branch;
  return branch && entry.push ? { branch, publish: entry.push === "publish" } : null;
}

/** Push is there for a branch with commits to send, or one without an upstream yet (Publish). */
export const canPushQueueEntry = (entry: QueueEntry) => {
  const target = queuePushTarget(entry);
  return !!target && (target.publish || entry.ahead > 0);
};

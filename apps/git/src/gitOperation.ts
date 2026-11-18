import type { GitOperation, GitOperationKind } from "@legend-apps/git-core";

const quoted = (value: string | null, fallback: string) => value ? `“${value}”` : fallback;
const conflictText = (count: number) => count === 1 ? "1 conflicted file" : `${count} conflicted files`;

/** The state bar's line, e.g. "Merging “feature” into “main” — 2 conflicted files". */
export function operationText(operation: GitOperation) {
  const branch = quoted(operation.branch, "the detached HEAD");
  const commit = operation.commit ? `“${operation.commit.subject || operation.commit.oid}” (${operation.commit.oid})` : "a commit";
  const text = {
    merge: () => `Merging ${quoted(operation.target, "a commit")} into ${branch}`,
    rebase: () => `Rebasing ${branch} onto ${quoted(operation.target, "a commit")}${operation.step ? `, commit ${operation.step.current} of ${operation.step.total}` : ""}`,
    "cherry-pick": () => `Cherry-picking ${commit} onto ${branch}`,
    revert: () => `Reverting ${commit} on ${branch}`,
    bisect: () => `Bisecting${operation.branch ? `, started on ${branch}` : ""}`,
  }[operation.kind]();
  return operation.conflicts ? `${text} — ${conflictText(operation.conflicts)}` : text;
}

const nouns: Record<GitOperationKind, string> = { merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-Pick", revert: "Revert", bisect: "Bisect" };
export const abortLabel = (kind: GitOperationKind) => kind === "bisect" ? "Stop Bisecting" : `Abort ${nouns[kind]}`;
export const continueLabel = (kind: GitOperationKind) => `Continue ${nouns[kind]}`;
export const canContinue = (operation: GitOperation | null): operation is GitOperation & { kind: Exclude<GitOperationKind, "bisect"> } =>
  !!operation && operation.kind !== "bisect" && !operation.conflicts;

/** The warning sheet's title and message before an abort. */
export function abortWarning(operation: GitOperation) {
  const branch = quoted(operation.branch, "HEAD");
  return {
    merge: { title: "Abort the merge?", message: `${branch} goes back to its commit before the merge. Changes from the merge, including conflicts you resolved, are discarded.` },
    rebase: { title: "Abort the rebase?", message: `${branch} goes back to where it was before the rebase. Commits rebased so far and conflicts you resolved are discarded.` },
    "cherry-pick": { title: "Abort the cherry-pick?", message: `${branch} goes back to its commit before the cherry-pick. Changes from the cherry-pick, including conflicts you resolved, are discarded.` },
    revert: { title: "Abort the revert?", message: `${branch} goes back to its commit before the revert. Changes from the revert, including conflicts you resolved, are discarded.` },
    bisect: { title: "Stop bisecting?", message: `Git checks out ${branch} again and forgets the commits marked good and bad.` },
  }[operation.kind];
}

/** A conflicted file's sides, from its index stages: a side that deleted the file doesn't have it. */
export type ConflictEntry = { path: string; ours: boolean; theirs: boolean; binary: boolean };

const shortName = (text: string) => text.length > 32 ? `${text.slice(0, 31)}…` : text;
/**
 * What Git's "ours" or "theirs" is in the paused operation, quoted: a merge's current branch and the branch merged in; for a
 * rebase, the branch rebased onto (ours) and the branch being rebased (theirs); a cherry-pick's branch and the commit picked.
 */
export function conflictSideName(operation: GitOperation | null, side: "ours" | "theirs") {
  const ours = side === "ours";
  const name = !operation ? null : {
    merge: () => ours ? operation.branch : operation.target,
    // A rebase that recreates a merge (MERGE_HEAD) has that merge's sides, not the rebase's.
    rebase: () => operation.mergeHead ? null : ours ? operation.target : operation.branch,
    "cherry-pick": () => ours ? operation.branch : operation.commit && shortName(operation.commit.subject || operation.commit.oid),
    revert: () => ours ? operation.branch : null,
    bisect: () => null,
  }[operation.kind]();
  if (name) return `“${name}”`;
  return operation?.kind === "revert" && !ours ? "the Revert" : ours ? "Ours" : "Theirs";
}

/** A conflict pick's label: "Use “main”", "Use Both", or for a file one side deleted, "Keep File from …" / "Delete File as on …". */
export function conflictPickLabel(operation: GitOperation | null, entry: ConflictEntry | null, side: "ours" | "theirs" | "both") {
  if (side === "both") return "Use Both";
  const name = conflictSideName(operation, side);
  if (entry && !(side === "ours" ? entry.ours : entry.theirs)) return `Delete File as on ${name}`;
  if (entry && !(side === "ours" ? entry.theirs : entry.ours)) return `Keep File from ${name}`;
  return `Use ${name}`;
}

/** Whether a pick applies: a side is offered unless neither side has the file; Both needs two text versions. */
export const conflictPickable = (entry: ConflictEntry, side: "ours" | "theirs" | "both") =>
  side === "both" ? entry.ours && entry.theirs && !entry.binary : entry.ours || entry.theirs;

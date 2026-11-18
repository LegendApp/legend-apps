import type { GitUndo, GitUndoCommit, GitUndoKind } from "@legend-apps/git-core";

const names: Record<GitUndoKind, string> = {
  commit: "Commit", amend: "Amend", merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-Pick", revert: "Revert", reset: "Reset", checkout: "Checkout", "branch-delete": "Delete Branch",
};

/** Edit ▸ Undo's label: "Undo Commit…", or "Undo" when there is nothing to undo. */
export const undoLabel = (undo: GitUndo | null) => undo ? `Undo ${names[undo.kind]}…` : "Undo";

const commitName = (commit: GitUndoCommit) => commit.subject ? `${commit.oid.slice(0, 7)} “${commit.subject}”` : commit.oid.slice(0, 7);

/** The confirmation sheet: what moves where, and what happens to the worktree. */
export function undoSheet(undo: GitUndo) {
  const button = `Undo ${names[undo.kind]}`;
  const to = commitName(undo.to), from = undo.from ? commitName(undo.from) : "";
  const moved = undo.branch ? `“${undo.branch}”` : "HEAD";
  if (undo.kind === "branch-delete") {
    return { title: `Bring back the branch “${undo.branch}”?`, button, message: `“${undo.branch}” is created again at ${to}, where it was when it was deleted. Nothing else changes.` };
  }
  if (undo.kind === "checkout") {
    const back = undo.toBranch ? `the branch “${undo.toBranch}” (at ${to})` : `${to}, detached`;
    return { title: `Switch back from “${undo.name}”?`, button, message: `HEAD switches back to ${back}. Changes that don’t clash come along, as with any checkout.` };
  }
  const what = {
    commit: `the commit ${from}`, amend: `the amend of ${from}`, merge: undo.name ? `the merge of “${undo.name}”` : `the merge ${from}`,
    rebase: undo.name ? `the rebase onto “${undo.name}”` : "the rebase", "cherry-pick": `the cherry-pick ${from}`, revert: `the revert ${from}`, reset: `the reset to ${from}`,
  }[undo.kind];
  const effect = undo.keepsChanges
    ? "Its changes stay staged, and the rest of the worktree is left as it is."
    : "The worktree and index follow; changes to other files are kept.";
  return { title: `Undo ${what}?`, button, message: `${moved} moves ${undo.kind === "reset" ? "" : "back "}from ${from} to ${to}. ${effect}` };
}

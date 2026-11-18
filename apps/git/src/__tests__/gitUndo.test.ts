import type { GitUndo } from "@legend-apps/git-core";
import { undoLabel, undoSheet } from "../gitUndo";

const a = "a".repeat(40), b = "b".repeat(40);
const plan = (patch: Partial<GitUndo>): GitUndo => ({ kind: "commit", branch: "main", from: { oid: a, subject: "Second" }, to: { oid: b, subject: "First" }, toBranch: null, name: null, keepsChanges: true, refusal: null, entry: "x", ...patch });

it("labels Edit ▸ Undo after the operation", () => {
  expect(undoLabel(null)).toBe("Undo");
  expect(["commit", "amend", "merge", "rebase", "cherry-pick", "revert", "reset", "checkout", "branch-delete"].map(kind => undoLabel(plan({ kind: kind as GitUndo["kind"] })))).toEqual([
    "Undo Commit…", "Undo Amend…", "Undo Merge…", "Undo Rebase…", "Undo Cherry-Pick…", "Undo Revert…", "Undo Reset…", "Undo Checkout…", "Undo Delete Branch…"]);
});

it("names what moves where in the confirmation sheet", () => {
  expect(undoSheet(plan({}))).toEqual({ title: "Undo the commit aaaaaaa “Second”?", button: "Undo Commit",
    message: "“main” moves back from aaaaaaa “Second” to bbbbbbb “First”. Its changes stay staged, and the rest of the worktree is left as it is." });
  expect(undoSheet(plan({ kind: "rebase", branch: "feature", name: "main", keepsChanges: false })).message).toBe("“feature” moves back from aaaaaaa “Second” to bbbbbbb “First”. The worktree and index follow; changes to other files are kept.");
  expect(undoSheet(plan({ kind: "reset", branch: null, keepsChanges: false })).message).toMatch(/^HEAD moves from aaaaaaa “Second” to bbbbbbb “First”/);
  expect(undoSheet(plan({ kind: "checkout", name: "feature", toBranch: "main" }))).toMatchObject({ title: "Switch back from “feature”?", message: expect.stringMatching(/^HEAD switches back to the branch “main” \(at bbbbbbb “First”\)/) });
  expect(undoSheet(plan({ kind: "branch-delete", branch: "old", from: null }))).toEqual({ title: "Bring back the branch “old”?", button: "Undo Delete Branch",
    message: "“old” is created again at bbbbbbb “First”, where it was when it was deleted. Nothing else changes." });
});

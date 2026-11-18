import type { GitOperation } from "@legend-apps/git-core";
import { abortLabel, abortWarning, canContinue, conflictPickable, conflictPickLabel, continueLabel, operationText } from "../gitOperation";

const base: GitOperation = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 0, mergeHead: true };

it("describes each operation in one line with its conflicts", () => {
  expect(operationText({ ...base, conflicts: 2 })).toBe("Merging “feature” into “main” — 2 conflicted files");
  expect(operationText({ ...base, kind: "rebase", branch: "feature", target: "main", step: { current: 1, total: 2 }, conflicts: 1 })).toBe("Rebasing “feature” onto “main”, commit 1 of 2 — 1 conflicted file");
  expect(operationText({ ...base, kind: "cherry-pick", target: null, commit: { oid: "abc1234", subject: "Fix it" } })).toBe("Cherry-picking “Fix it” (abc1234) onto “main”");
  expect(operationText({ ...base, kind: "revert", target: null, branch: null, commit: { oid: "abc1234", subject: "Fix it" } })).toBe("Reverting “Fix it” (abc1234) on the detached HEAD");
  expect(operationText({ ...base, kind: "bisect", target: null })).toBe("Bisecting, started on “main”");
});

it("labels Abort and Continue, and continues only without conflicts and never a bisect", () => {
  expect(abortLabel("cherry-pick")).toBe("Abort Cherry-Pick");
  expect(abortLabel("bisect")).toBe("Stop Bisecting");
  expect(continueLabel("rebase")).toBe("Continue Rebase");
  expect(canContinue(base)).toBe(true);
  expect(canContinue({ ...base, conflicts: 1 })).toBe(false);
  expect(canContinue({ ...base, kind: "bisect" })).toBe(false);
  expect(canContinue(null)).toBe(false);
  expect(abortWarning(base).title).toBe("Abort the merge?");
});

it("names the conflict sides for each operation, and labels picks for a file one side deleted", () => {
  const merge = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 1, mergeHead: true } as const;
  const both = { path: "a.txt", ours: true, theirs: true, binary: false };
  const labels = (operation: GitOperation | null, entry = both) => (["ours", "theirs", "both"] as const).map(side => conflictPickLabel(operation, entry, side));
  expect(labels(merge)).toEqual(["Use “main”", "Use “feature”", "Use Both"]);
  // A rebase replays the branch's commits onto the target, so Git's "ours" is the target.
  expect(labels({ ...merge, kind: "rebase", branch: "topic", target: "main", mergeHead: false })).toEqual(["Use “main”", "Use “topic”", "Use Both"]);
  expect(labels({ ...merge, kind: "rebase", branch: "topic", target: "main", mergeHead: true })).toEqual(["Use Ours", "Use Theirs", "Use Both"]);
  expect(labels({ ...merge, kind: "cherry-pick", target: null, commit: { oid: "e594f77", subject: "Make it purple and also much more than that" } }))
    .toEqual(["Use “main”", "Use “Make it purple and also much mo…”", "Use Both"]);
  expect(labels({ ...merge, kind: "revert", target: null, commit: { oid: "e594f77", subject: "Make it purple" } })).toEqual(["Use “main”", "Use the Revert", "Use Both"]);
  // Detached, or conflicts with no operation (a stash apply): Git's own names.
  expect(labels({ ...merge, branch: null, target: null })).toEqual(["Use Ours", "Use Theirs", "Use Both"]);
  expect(labels(null)).toEqual(["Use Ours", "Use Theirs", "Use Both"]);
  expect(labels(merge, { ...both, theirs: false })).toEqual(["Keep File from “main”", "Delete File as on “feature”", "Use Both"]);
  expect(conflictPickable({ ...both, theirs: false }, "both")).toBe(false);
  expect(conflictPickable({ ...both, binary: true }, "both")).toBe(false);
  expect(conflictPickable({ ...both, binary: true }, "theirs")).toBe(true);
  expect(conflictPickable({ ...both, ours: false, theirs: false }, "ours")).toBe(false);
});

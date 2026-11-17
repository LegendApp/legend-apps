import type { GitOperation } from "@legend-apps/git-core";
import { abortLabel, abortWarning, canContinue, continueLabel, operationText } from "../gitOperation";

const base: GitOperation = { kind: "merge", branch: "main", target: "feature", commit: null, step: null, conflicts: 0, mergeHead: true };

it("describes each operation in one line with its conflicts", () => {
  expect(operationText({ ...base, conflicts: 2 })).toBe("Merging “feature” into “main” — 2 conflicts");
  expect(operationText({ ...base, kind: "rebase", branch: "feature", target: "main", step: { current: 1, total: 2 }, conflicts: 1 })).toBe("Rebasing “feature” onto “main”, commit 1 of 2 — 1 conflict");
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

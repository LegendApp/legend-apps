import { commitBlocker, composeMessage, splitMessage } from "../commitMessage";

it("joins and splits commit messages around the blank line, keeping # lines and leading dashes", () => {
  expect(composeMessage({ subject: "  -Fix ✓\n", body: "" })).toBe("-Fix ✓\n");
  expect(composeMessage({ subject: "Fix", body: "\n# kept\nBody  \n\n" })).toBe("Fix\n\n# kept\nBody\n");
  expect(splitMessage("Fix\n\n\n# kept\nBody")).toEqual({ subject: "Fix", body: "# kept\nBody" });
  expect(splitMessage("Fix")).toEqual({ subject: "Fix", body: "" });
});

it("explains why committing is blocked: conflicts first, then nothing staged, then a missing summary", () => {
  expect(commitBlocker({ subject: "Fix", amend: false, stagedCount: 1, conflictCount: 2 })).toContain("2 conflicted files");
  expect(commitBlocker({ subject: "Fix", amend: false, stagedCount: 0, conflictCount: 0 })).toBe("Stage changes to commit them.");
  expect(commitBlocker({ subject: "Fix", amend: true, stagedCount: 0, conflictCount: 0 })).toBeNull();
  expect(commitBlocker({ subject: "Merge", amend: false, merging: true, stagedCount: 0, conflictCount: 0 })).toBeNull();
  expect(commitBlocker({ subject: " ", amend: false, stagedCount: 1, conflictCount: 0 })).toBe("Enter a summary to commit.");
});

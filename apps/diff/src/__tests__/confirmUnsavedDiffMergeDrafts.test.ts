import { getUnsavedDiffMergeDraftPrompt } from "../confirmUnsavedDiffMergeDrafts";

describe("confirmUnsavedDiffMergeDrafts", () => {
  it("describes the transition that would discard merge drafts", () => {
    expect(getUnsavedDiffMergeDraftPrompt("close")).toBe("before closing?");
    expect(getUnsavedDiffMergeDraftPrompt("quit")).toBe("before quitting Legend Diff?");
    expect(getUnsavedDiffMergeDraftPrompt("source")).toBe("before opening another comparison?");
  });
});

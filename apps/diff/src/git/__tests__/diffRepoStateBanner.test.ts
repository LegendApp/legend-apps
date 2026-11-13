import type { GitRepoState } from "../GitService";
import { getDiffRepoStateBanner } from "../diffRepoStateBanner";

const normal: GitRepoState = {
  gitDir: "/repo/.git", branch: "feature", detachedCommit: null, detached: false,
  merging: false, rebasing: null, cherryPicking: false, reverting: false, bisecting: false,
};
it("hides the banner for a normal or unborn branch", () => {
  expect(getDiffRepoStateBanner(normal)).toBeNull();
});
it.each([
  [{ merging: true }, "Merging — feature"],
  [{ rebasing: "merge" }, "Rebasing — feature"],
  [{ rebasing: "apply" }, "Rebasing — feature"],
  [{ cherryPicking: true }, "Cherry-picking — feature"],
  [{ reverting: true }, "Reverting — feature"],
  [{ bisecting: true }, "Bisecting — feature"],
  [{ branch: null, detached: true, detachedCommit: "1234567890abcdef" }, "Detached HEAD — 12345678"],
  [{ branch: null, rebasing: "merge", detached: true, detachedCommit: "1234567890abcdef" }, "Rebasing · Detached HEAD — 12345678"],
] as const)("maps %s to text and branch/commit", (state, expected) => {
  expect(getDiffRepoStateBanner({ ...normal, ...state })).toBe(expected);
});

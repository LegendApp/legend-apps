import type { RecentDiffSource } from "../../diffAppMetadata";
import { normalizeDiffOpenSource } from "../../diffFiles";
import {
  formatRecentDiffSourceOpenedAt,
  getGroupedRecentDiffSources,
  getRecentDiffSourceKind,
  getRecentDiffSourceTypeLabel,
} from "../diffStartScreenModel";

function recentSource(value: string, lastOpenedAt: number): RecentDiffSource {
  const source = normalizeDiffOpenSource(value, "/tmp/repo");
  if (!source) {
    throw new Error(`Unable to normalize ${value}`);
  }
  return {
    id: value,
    lastOpenedAt,
    source,
  };
}

describe("diffStartScreenModel", () => {
  it("classifies folders, GitHub pull requests, GitHub commits, and git args", () => {
    expect(getRecentDiffSourceKind(recentSource("/tmp/repo", 1).source)).toBe("folder");
    expect(getRecentDiffSourceKind(recentSource("github.com/owner/repo/pull/7", 1).source)).toBe("pullRequest");
    expect(getRecentDiffSourceKind(recentSource("github.com/owner/repo/commit/abcdef123456", 1).source)).toBe("commit");
    expect(getRecentDiffSourceKind(recentSource("main...HEAD", 1).source)).toBe("git");
  });

  it("returns compact type labels", () => {
    expect(getRecentDiffSourceTypeLabel(recentSource("/tmp/repo", 1).source)).toBe("Folder");
    expect(getRecentDiffSourceTypeLabel(recentSource("github.com/owner/repo/pull/7", 1).source)).toBe("PR");
    expect(getRecentDiffSourceTypeLabel(recentSource("github.com/owner/repo/commit/abcdef123456", 1).source)).toBe("Commit");
    expect(getRecentDiffSourceTypeLabel(recentSource("main...HEAD", 1).source)).toBe("Git diff");
  });

  it("groups recent sources by start-screen section", () => {
    const recentSources = [
      recentSource("/tmp/repo", 100),
      recentSource("github.com/owner/repo/pull/7", 90),
      recentSource("github.com/owner/repo/commit/abcdef123456", 80),
      recentSource("main...HEAD", 70),
    ];

    expect(getGroupedRecentDiffSources(recentSources, "all").map((group) => group.title)).toEqual([
      "Folders",
      "Pull requests",
      "Commits",
      "Git diffs",
    ]);
    expect(getGroupedRecentDiffSources(recentSources, "prs")).toEqual([
      {
        key: "pullRequests",
        recentSources: [recentSources[1]],
        title: "Pull requests",
      },
    ]);
    expect(getGroupedRecentDiffSources(recentSources, "commits")).toEqual([
      {
        key: "commits",
        recentSources: [recentSources[2]],
        title: "Commits",
      },
    ]);
  });

  it("formats last-opened times", () => {
    const now = Date.UTC(2026, 6, 5, 12);
    expect(formatRecentDiffSourceOpenedAt(now - 30_000, now)).toBe("Just now");
    expect(formatRecentDiffSourceOpenedAt(now - 12 * 60_000, now)).toBe("12m ago");
    expect(formatRecentDiffSourceOpenedAt(now - 4 * 60 * 60_000, now)).toBe("4h ago");
    expect(formatRecentDiffSourceOpenedAt(now - 26 * 60 * 60_000, now)).toBe("Yesterday");
    expect(formatRecentDiffSourceOpenedAt(now - 4 * 24 * 60 * 60_000, now)).toBe("4d ago");
  });
});

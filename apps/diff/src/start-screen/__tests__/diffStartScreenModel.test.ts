import type { RecentDiffSource } from "../../diffAppMetadata";
import { createDiffFilePairSource, createDiffFileSource, normalizeDiffOpenSource, type DiffOpenSource } from "../../diffFiles";
import {
  formatRecentDiffSourceOpenedAt,
  getGroupedRecentDiffSources,
  getRecentDiffSourceDetail,
  getRecentDiffSourceKind,
  getRecentDiffSourceTypeLabel,
} from "../diffStartScreenModel";

function recentSource(value: string | DiffOpenSource, lastOpenedAt: number): RecentDiffSource {
  const source = typeof value === "string" ? normalizeDiffOpenSource(value, "/tmp/repo") : value;
  if (!source) {
    throw new Error(`Unable to normalize ${value}`);
  }
  return {
    id: typeof value === "string" ? value : value.value,
    lastOpenedAt,
    source,
  };
}

describe("diffStartScreenModel", () => {
  it("classifies folders, GitHub pull requests, GitHub commits, and git args", () => {
    expect(getRecentDiffSourceKind(recentSource("/tmp/repo", 1).source)).toBe("folder");
    expect(getRecentDiffSourceKind(recentSource(createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts"), 1).source)).toBe("filePair");
    expect(getRecentDiffSourceKind(recentSource(createDiffFileSource("/tmp/change.diff"), 1).source)).toBe("diffFile");
    expect(getRecentDiffSourceKind(recentSource("github.com/owner/repo/pull/7", 1).source)).toBe("pullRequest");
    expect(getRecentDiffSourceKind(recentSource("github.com/owner/repo/commit/abcdef123456", 1).source)).toBe("commit");
    expect(getRecentDiffSourceKind(recentSource("main...HEAD", 1).source)).toBe("git");
  });

  it("returns compact type labels", () => {
    expect(getRecentDiffSourceTypeLabel(recentSource("/tmp/repo", 1).source)).toBe("Folder");
    expect(getRecentDiffSourceTypeLabel(recentSource(createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts"), 1).source)).toBe("Files");
    expect(getRecentDiffSourceTypeLabel(recentSource(createDiffFileSource("/tmp/change.diff"), 1).source)).toBe("Diff file");
    expect(getRecentDiffSourceTypeLabel(recentSource("github.com/owner/repo/pull/7", 1).source)).toBe("PR");
    expect(getRecentDiffSourceTypeLabel(recentSource("github.com/owner/repo/commit/abcdef123456", 1).source)).toBe("Commit");
    expect(getRecentDiffSourceTypeLabel(recentSource("main...HEAD", 1).source)).toBe("Git diff");
  });

  it("groups recent sources by start-screen section", () => {
    const recentSources = [
      recentSource("/tmp/repo", 100),
      recentSource(createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts"), 95),
      recentSource(createDiffFileSource("/tmp/change.diff"), 92),
      recentSource("github.com/owner/repo/pull/7", 90),
      recentSource("github.com/owner/repo/commit/abcdef123456", 80),
      recentSource("main...HEAD", 70),
    ];

    expect(getGroupedRecentDiffSources(recentSources, "all").map((group) => group.title)).toEqual([
      "Folders",
      "File compares",
      "Diff files",
      "Pull requests",
      "Commits",
      "Git diffs",
    ]);
    expect(getGroupedRecentDiffSources(recentSources, "prs")).toEqual([
      {
        key: "pullRequests",
        recentSources: [recentSources[3]],
        title: "Pull requests",
      },
    ]);
    expect(getGroupedRecentDiffSources(recentSources, "files")).toEqual([
      {
        key: "filePairs",
        recentSources: [recentSources[1]],
        title: "File compares",
      },
      {
        key: "diffFiles",
        recentSources: [recentSources[2]],
        title: "Diff files",
      },
    ]);
    expect(getGroupedRecentDiffSources(recentSources, "commits")).toEqual([
      {
        key: "commits",
        recentSources: [recentSources[4]],
        title: "Commits",
      },
    ]);
  });

  it("formats file pair details", () => {
    const source = createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts");
    expect(getRecentDiffSourceDetail(source)).toBe("/tmp/old.ts vs /tmp/new.ts");
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

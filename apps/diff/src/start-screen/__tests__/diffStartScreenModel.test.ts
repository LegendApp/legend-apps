import type { RecentDiffSource } from "../../diffAppMetadata";
import { createDiffFilePairSource, createDiffFileSource, normalizeDiffOpenSource, type DiffOpenSource } from "../../diffFiles";
import {
  formatRecentDiffSourceOpenedAt,
  getFilteredRecentDiffSources,
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

  it("filters recent sources by selected segment and sorts by recency", () => {
    const recentSources = [
      recentSource("/tmp/repo", 100),
      recentSource(createDiffFilePairSource("/tmp/old.ts", "/tmp/new.ts"), 95),
      recentSource(createDiffFileSource("/tmp/change.diff"), 92),
      recentSource("github.com/owner/repo/pull/7", 90),
      recentSource("github.com/owner/repo/commit/abcdef123456", 80),
      recentSource("main...HEAD", 110),
    ];

    expect(getFilteredRecentDiffSources(recentSources, "all")).toEqual([
      recentSources[5],
      recentSources[0],
      recentSources[1],
      recentSources[2],
      recentSources[3],
      recentSources[4],
    ]);
    expect(getFilteredRecentDiffSources(recentSources, "prs")).toEqual([recentSources[3]]);
    expect(getFilteredRecentDiffSources(recentSources, "files")).toEqual([recentSources[1], recentSources[2]]);
    expect(getFilteredRecentDiffSources(recentSources, "commits")).toEqual([recentSources[4]]);
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

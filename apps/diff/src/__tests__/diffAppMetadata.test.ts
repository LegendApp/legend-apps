import {
  addRecentDiffSource,
  diffAppMetadata$,
  getDiffSourceRecentId,
  getRecentDiffSources,
  getSavedDiffWindows,
  removeSavedDiffWindow,
  updateSavedDiffWindowFrame,
  updateSavedDiffWindowSource,
  upsertSavedDiffWindow,
} from "../diffAppMetadata";
import { createDiffFilePairSource, createDiffFileSource, normalizeDiffOpenSource } from "../diffFiles";

describe("diffAppMetadata", () => {
  beforeEach(() => {
    diffAppMetadata$.recentSources.set([]);
    diffAppMetadata$.savedWindows.set([]);
  });

  it("stores recent folders and remote sources with newest first", () => {
    const folderSource = normalizeDiffOpenSource("/tmp/repo");
    const githubSource = normalizeDiffOpenSource("github.com/owner/repo/pull/7");
    expect(folderSource).not.toBeNull();
    expect(githubSource).not.toBeNull();

    if (folderSource && githubSource) {
      addRecentDiffSource(folderSource);
      addRecentDiffSource(githubSource);
      expect(getRecentDiffSources().map((item) => item.source)).toEqual([
        githubSource,
        folderSource,
      ]);
    }
  });

  it("moves duplicate sources to the front", () => {
    const folderSource = normalizeDiffOpenSource("/tmp/repo");
    const githubSource = normalizeDiffOpenSource("github.com/owner/repo/pull/7");
    expect(folderSource).not.toBeNull();
    expect(githubSource).not.toBeNull();

    if (folderSource && githubSource) {
      addRecentDiffSource(folderSource);
      addRecentDiffSource(githubSource);
      addRecentDiffSource(folderSource);
      expect(getRecentDiffSources().map((item) => item.id)).toEqual([
        getDiffSourceRecentId(folderSource),
        getDiffSourceRecentId(githubSource),
      ]);
    }
  });

  it("uses both file paths for file pair recent IDs", () => {
    const source = createDiffFilePairSource("/tmp/old/App.tsx", "/tmp/new/App.tsx");
    const sameSource = createDiffFilePairSource("/tmp/old/App.tsx", "/tmp/new/App.tsx");
    const reversedSource = createDiffFilePairSource("/tmp/new/App.tsx", "/tmp/old/App.tsx");

    expect(getDiffSourceRecentId(source)).toBe(getDiffSourceRecentId(sameSource));
    expect(getDiffSourceRecentId(source)).not.toBe(getDiffSourceRecentId(reversedSource));
  });

  it("uses the diff file path for diff file recent IDs", () => {
    const source = createDiffFileSource("/tmp/change.diff");
    const sameSource = createDiffFileSource("/tmp/change.diff");
    const otherSource = createDiffFileSource("/tmp/other.diff");

    expect(getDiffSourceRecentId(source)).toBe(getDiffSourceRecentId(sameSource));
    expect(getDiffSourceRecentId(source)).not.toBe(getDiffSourceRecentId(otherSource));
  });

  it("uses only the folder path for folder recent IDs", () => {
    const source = normalizeDiffOpenSource("/tmp/repo");
    expect(source?.kind).toBe("folder");

    if (source?.kind === "folder") {
      const branchSource = {
        ...source,
        compareBase: {
          kind: "ref" as const,
          ref: "origin/main",
          useMergeBase: true,
        },
      };

      expect(getDiffSourceRecentId(source)).toBe(getDiffSourceRecentId(branchSource));

      addRecentDiffSource(source);
      addRecentDiffSource(branchSource);

      expect(getRecentDiffSources()).toHaveLength(1);
      expect(getRecentDiffSources()[0]?.id).toBe(getDiffSourceRecentId(source));
    }
  });

  it("keeps the recent source list bounded", () => {
    for (let index = 0; index < 14; index += 1) {
      const source = normalizeDiffOpenSource(`/tmp/repo-${index}`);
      if (source) {
        addRecentDiffSource(source);
      }
    }

    const recentSources = getRecentDiffSources();
    expect(recentSources).toHaveLength(12);
    expect(recentSources[0]?.source.value).toBe("/tmp/repo-13");
    expect(recentSources.at(-1)?.source.value).toBe("/tmp/repo-2");
  });

  it("updates and removes saved diff windows", () => {
    const source = normalizeDiffOpenSource("/tmp/repo");
    expect(source).not.toBeNull();

    if (source) {
      upsertSavedDiffWindow({
        frame: { height: 600, width: 800, x: 10, y: 20 },
        id: "diff-viewer-folder",
      });
      updateSavedDiffWindowSource("diff-viewer-folder", source);
      updateSavedDiffWindowFrame("diff-viewer-folder", { height: 700, width: 900, x: 30, y: 40 });

      expect(getSavedDiffWindows()).toMatchObject([
        {
          frame: { height: 700, width: 900, x: 30, y: 40 },
          id: "diff-viewer-folder",
          source,
        },
      ]);

      removeSavedDiffWindow("diff-viewer-folder");
      expect(getSavedDiffWindows()).toEqual([]);
    }
  });
});

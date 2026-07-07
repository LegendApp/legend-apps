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
import { normalizeDiffOpenSource } from "../diffFiles";

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

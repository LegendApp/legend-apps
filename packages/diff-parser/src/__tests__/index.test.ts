function createParser() {
  return {
    loadGitFolderDiff: jest.fn(async () => ({ ok: "git" })),
    loadUnifiedDiff: jest.fn(async () => ({ ok: "unified" })),
    loadUnifiedDiffFromUrl: jest.fn(async () => ({ ok: "url" })),
    startGitFolderDiff: jest.fn(() => ({ ok: "session" })),
    startUnifiedDiffFromUrl: jest.fn(() => ({ ok: "url-session" })),
  };
}

function loadModuleWithParser(parser = createParser()) {
  jest.resetModules();
  const nitroModules = {
    createHybridObject: jest.fn((name: string) => {
      if (name !== "DiffParser") {
        throw new Error(`Unexpected hybrid object ${name}`);
      }
      return parser;
    }),
  };
  jest.doMock("react-native-nitro-modules", () => ({
    __esModule: true,
    NitroModules: nitroModules,
  }));
  jest.doMock("../DiffNativeRowConfigNativeComponent", () => ({
    __esModule: true,
    default: "DiffNativeRowConfig",
  }));
  jest.doMock("../DiffHorizontalScrollerNativeComponent", () => ({
    __esModule: true,
    default: "DiffHorizontalScroller",
  }));
  jest.doMock("../DiffNativeRowNativeComponent", () => ({
    __esModule: true,
    default: "DiffNativeRow",
  }));
  jest.doMock("../DiffMergeNativePaneNativeComponent", () => ({
    __esModule: true,
    default: "DiffMergeNativePane",
  }));
  const diffParser = require("../index") as typeof import("../index");
  return { diffParser, nitroModules, parser };
}

describe("@legend-apps/diff-parser", () => {
  it("exports the native diff rendering surfaces", () => {
    const { diffParser } = loadModuleWithParser();

    expect(diffParser.DiffHorizontalScroller).toBe("DiffHorizontalScroller");
    expect(diffParser.DiffMergeNativePane).toBe("DiffMergeNativePane");
    expect(diffParser.DiffNativeRow).toBe("DiffNativeRow");
    expect(diffParser.DiffNativeRowConfig).toBe("DiffNativeRowConfig");
  });

  it("loads git folder diffs with default row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadGitFolderDiff("/tmp/repo")).resolves.toEqual({ ok: "git" });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 200, true, "head", "", true, false);
  });

  it("passes explicit git folder diff row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25);

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, true, "head", "", true, false);
  });

  it("passes git folder diff load options", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25, {
      ignoreWhitespaceChanges: true,
      showOnlyHunks: false,
    });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, false, "head", "", true, true);
  });

  it("passes git folder compare base options", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25, {
      compareBaseKind: "ref",
      compareBaseRef: "origin/main",
      compareUseMergeBase: false,
    });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, true, "ref", "origin/main", false, false);
  });

  it("starts progressive git folder diff sessions", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo")).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", true, "head", "", true, false);
  });

  it("starts progressive git folder diff sessions with options", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo", {
      ignoreWhitespaceChanges: true,
      showOnlyHunks: false,
    })).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", false, "head", "", true, true);
  });

  it("passes progressive git folder compare base options", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo", {
      compareBaseKind: "ref",
      compareBaseRef: "origin/main",
      compareUseMergeBase: false,
    })).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", true, "ref", "origin/main", false, false);
  });

  it("starts progressive unified diff URL sessions", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startUnifiedDiffFromUrl("https://github.com/owner/repo/pull/1.diff", "owner/repo#1")).toEqual({ ok: "url-session" });

    expect(parser.startUnifiedDiffFromUrl).toHaveBeenCalledWith(
      "https://github.com/owner/repo/pull/1.diff",
      "owner/repo#1",
    );
  });

  it("loads unified diff text with default and explicit row counts", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadUnifiedDiff("diff --git a/a b/a", "fixture")).resolves.toEqual({ ok: "unified" });
    await diffParser.loadUnifiedDiff("diff --git a/b b/b", "fixture 2", 10);
    await diffParser.loadUnifiedDiff("diff --git a/c b/c", "fixture 3", 20, true);

    expect(parser.loadUnifiedDiff).toHaveBeenNthCalledWith(1, "diff --git a/a b/a", "fixture", 200, false);
    expect(parser.loadUnifiedDiff).toHaveBeenNthCalledWith(2, "diff --git a/b b/b", "fixture 2", 10, false);
    expect(parser.loadUnifiedDiff).toHaveBeenNthCalledWith(3, "diff --git a/c b/c", "fixture 3", 20, true);
  });

  it("loads unified diffs from URLs", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadUnifiedDiffFromUrl("https://github.com/owner/repo/pull/1.diff", "owner/repo#1")).resolves.toEqual({ ok: "url" });
    await diffParser.loadUnifiedDiffFromUrl("https://github.com/owner/repo/pull/2.diff", "owner/repo#2", 50, true);

    expect(parser.loadUnifiedDiffFromUrl).toHaveBeenCalledWith(
      "https://github.com/owner/repo/pull/1.diff",
      "owner/repo#1",
      200,
      false,
    );
    expect(parser.loadUnifiedDiffFromUrl).toHaveBeenNthCalledWith(
      2,
      "https://github.com/owner/repo/pull/2.diff",
      "owner/repo#2",
      50,
      true,
    );
  });

  it("reuses the native hybrid parser object", async () => {
    const { diffParser, nitroModules } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo");
    await diffParser.loadUnifiedDiff("diff --git a/a b/a", "fixture");
    await diffParser.loadUnifiedDiffFromUrl("https://github.com/owner/repo/pull/1.diff", "owner/repo#1");

    expect(nitroModules.createHybridObject).toHaveBeenCalledTimes(1);
    expect(nitroModules.createHybridObject).toHaveBeenCalledWith("DiffParser");
  });
});

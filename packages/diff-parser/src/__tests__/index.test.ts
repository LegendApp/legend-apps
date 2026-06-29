function createParser() {
  return {
    logTimingMark: jest.fn(() => 1),
    loadGitFolderDiff: jest.fn(async () => ({ ok: "git" })),
    loadUnifiedDiff: jest.fn(async () => ({ ok: "unified" })),
    loadUnifiedDiffFromUrl: jest.fn(async () => ({ ok: "url" })),
    startGitFolderDiff: jest.fn(() => ({ ok: "session" })),
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
  jest.doMock("../DiffNativeRowNativeComponent", () => ({
    __esModule: true,
    default: "DiffNativeRow",
  }));
  const diffParser = require("../index") as typeof import("../index");
  return { diffParser, nitroModules, parser };
}

describe("@legend-desktop/diff-parser", () => {
  it("loads git folder diffs with default row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadGitFolderDiff("/tmp/repo")).resolves.toEqual({ ok: "git" });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 200, true);
  });

  it("passes explicit git folder diff row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25);

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, true);
  });

  it("passes git folder diff load options", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25, { showOnlyHunks: false });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, false);
  });

  it("starts progressive git folder diff sessions", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo")).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", true);
  });

  it("starts progressive git folder diff sessions with options", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo", { showOnlyHunks: false })).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", false);
  });

  it("logs timing diagnostics without throwing", () => {
    const { diffParser, parser } = loadModuleWithParser();

    diffParser.logDiffTimingMark("[DiffOpenTiming] test {}");

    expect(parser.logTimingMark).toHaveBeenCalledWith("[DiffOpenTiming] test {}");
  });

  it("loads unified diff text with default and explicit row counts", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadUnifiedDiff("diff --git a/a b/a", "fixture")).resolves.toEqual({ ok: "unified" });
    await diffParser.loadUnifiedDiff("diff --git a/b b/b", "fixture 2", 10);

    expect(parser.loadUnifiedDiff).toHaveBeenNthCalledWith(1, "diff --git a/a b/a", "fixture", 200);
    expect(parser.loadUnifiedDiff).toHaveBeenNthCalledWith(2, "diff --git a/b b/b", "fixture 2", 10);
  });

  it("loads unified diffs from URLs", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadUnifiedDiffFromUrl("https://github.com/owner/repo/pull/1.diff", "owner/repo#1")).resolves.toEqual({ ok: "url" });

    expect(parser.loadUnifiedDiffFromUrl).toHaveBeenCalledWith(
      "https://github.com/owner/repo/pull/1.diff",
      "owner/repo#1",
      200,
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

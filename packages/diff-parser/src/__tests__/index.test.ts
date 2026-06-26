function createParser() {
  return {
    loadGitFolderDiff: jest.fn(async () => ({ ok: "git" })),
    loadUnifiedDiff: jest.fn(async () => ({ ok: "unified" })),
    loadUnifiedDiffFromUrl: jest.fn(async () => ({ ok: "url" })),
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
  const diffParser = require("../index") as typeof import("../index");
  return { diffParser, nitroModules, parser };
}

describe("@legend-desktop/diff-parser", () => {
  it("loads git folder diffs with default row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadGitFolderDiff("/tmp/repo")).resolves.toEqual({ ok: "git" });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 200);
  });

  it("passes explicit git folder diff row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25);

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25);
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

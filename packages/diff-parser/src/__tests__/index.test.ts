function createParser() {
  return {
    loadGitFolderDiff: jest.fn(async () => ({ ok: "git" })),
    loadUnifiedDiff: jest.fn(async () => ({ ok: "unified" })),
    loadUnifiedDiffFile: jest.fn(async () => ({ ok: "file" })),
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

function historyParser() {
  const head = { handle: 7, headOid: "abc", unborn: false, detached: false };
  let release: (() => void) | undefined;
  return {
    ...createParser(),
    openGitHistory: jest.fn(async () => head),
    readGitHistoryPage: jest.fn((_handle: number, offset: number, count: number) => new Promise((resolve, reject) => {
      release = () => reject(new Error("History read was cancelled."));
      if (offset === 0) resolve({ offset, commits: [{ oid: "abc" }], done: count > 1 });
    })),
    closeGitHistory: jest.fn(() => release?.()),
  };
}

describe("@legend-apps/diff-parser", () => {
  it("pages git history in 500s and releases the native walk once on close", async () => {
    const parser = historyParser();
    const { diffParser } = loadModuleWithParser(parser);
    const reader = await diffParser.openGitHistory("/tmp/repo");

    expect(reader.head.headOid).toBe("abc");
    await expect(reader.page(0)).resolves.toEqual({ offset: 0, commits: [{ oid: "abc" }], done: true });
    expect(parser.readGitHistoryPage).toHaveBeenCalledWith(7, 0, 500);
    const pending = reader.page(500);
    reader.close();
    reader.close();
    await expect(pending).rejects.toThrow(diffParser.GitHistoryCancelledError);
    await expect(reader.page(0)).rejects.toThrow(diffParser.GitHistoryCancelledError);
    await Promise.resolve();
    expect(parser.closeGitHistory).toHaveBeenCalledTimes(1);
    expect(parser.closeGitHistory).toHaveBeenCalledWith(7);
  });

  it("closes a history walk that finishes opening after its signal aborts", async () => {
    const parser = historyParser();
    const { diffParser } = loadModuleWithParser(parser);
    const controller = new AbortController();
    const opening = diffParser.openGitHistory("/tmp/repo", controller.signal);
    controller.abort();

    await expect(opening).rejects.toThrow(diffParser.GitHistoryCancelledError);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(parser.closeGitHistory).toHaveBeenCalledWith(7);
  });

  it("rejects an aborted page without closing the walk", async () => {
    const parser = historyParser();
    const { diffParser } = loadModuleWithParser(parser);
    const reader = await diffParser.openGitHistory("/tmp/repo");
    const controller = new AbortController();
    const pending = reader.page(500, 500, controller.signal);
    controller.abort();

    await expect(pending).rejects.toThrow(diffParser.GitHistoryCancelledError);
    expect(parser.closeGitHistory).not.toHaveBeenCalled();
  });

  it("blames one line through a native blame it always releases, and closes a blame aborted mid-read", async () => {
    let release: (() => void) | undefined;
    const hunk = { oid: "abc", path: "a.txt", startLine: 3, originalStartLine: 2, lineCount: 1, authorName: "Ann", authorEmail: "a@x", time: 1, summary: "Fix" };
    const parser = {
      ...createParser(),
      openGitBlame: jest.fn(async () => 4),
      readGitBlame: jest.fn((_handle: number, startLine: number) => new Promise((resolve, reject) => {
        release = () => reject(new Error("Blame was cancelled."));
        if (startLine === 3) resolve([hunk]);
      })),
      closeGitBlame: jest.fn(() => release?.()),
    };
    const { diffParser } = loadModuleWithParser(parser);

    await expect(diffParser.blameLine("/tmp/repo", "a.txt", "workdir", 3)).resolves.toEqual(hunk);
    expect(parser.openGitBlame).toHaveBeenCalledWith("/tmp/repo", "a.txt", "workdir");
    expect(parser.readGitBlame).toHaveBeenCalledWith(4, 3, 1);
    await Promise.resolve();
    expect(parser.closeGitBlame).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const pending = diffParser.blameLine("/tmp/repo", "a.txt", "HEAD", 9, controller.signal);
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toThrow(diffParser.GitHistoryCancelledError);
    await Promise.resolve();
    expect(parser.closeGitBlame).toHaveBeenCalledTimes(2);
  });

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

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 200, true, "head", "", true, false, []);
  });

  it("passes explicit git folder diff row count", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25);

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, true, "head", "", true, false, []);
  });

  it("passes git folder diff load options", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25, {
      ignoreWhitespaceChanges: true,
      showOnlyHunks: false,
    });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, false, "head", "", true, true, []);
  });

  it("passes git folder compare base options", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25, {
      compareBaseKind: "ref",
      compareBaseRef: "origin/main",
      compareUseMergeBase: false,
    });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, true, "ref", "origin/main", false, false, []);
  });

  it("passes git folder exclude paths to both load paths", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo", 25, { excludePaths: [".review"] });
    diffParser.startGitFolderDiff("/tmp/repo", { excludePaths: [".review", "docs/generated"] });

    expect(parser.loadGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", 25, true, "head", "", true, false, [".review"]);
    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", true, "head", "", true, false, [".review", "docs/generated"]);
  });

  it("starts progressive git folder diff sessions", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo")).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", true, "head", "", true, false, []);
  });

  it("starts progressive git folder diff sessions with options", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo", {
      ignoreWhitespaceChanges: true,
      showOnlyHunks: false,
    })).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", false, "head", "", true, true, []);
  });

  it("passes progressive git folder compare base options", () => {
    const { diffParser, parser } = loadModuleWithParser();

    expect(diffParser.startGitFolderDiff("/tmp/repo", {
      compareBaseKind: "ref",
      compareBaseRef: "origin/main",
      compareUseMergeBase: false,
    })).toEqual({ ok: "session" });

    expect(parser.startGitFolderDiff).toHaveBeenCalledWith("/tmp/repo", true, "ref", "origin/main", false, false, []);
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

  it("loads unified diff files natively", async () => {
    const { diffParser, parser } = loadModuleWithParser();

    await expect(diffParser.loadUnifiedDiffFile("/tmp/large.diff", "large.diff")).resolves.toEqual({ ok: "file" });
    await diffParser.loadUnifiedDiffFile("/tmp/other.patch", "other.patch", 50, true);

    expect(parser.loadUnifiedDiffFile).toHaveBeenNthCalledWith(1, "/tmp/large.diff", "large.diff", 200, false);
    expect(parser.loadUnifiedDiffFile).toHaveBeenNthCalledWith(2, "/tmp/other.patch", "other.patch", 50, true);
  });

  it("reuses the native hybrid parser object", async () => {
    const { diffParser, nitroModules } = loadModuleWithParser();

    await diffParser.loadGitFolderDiff("/tmp/repo");
    await diffParser.loadUnifiedDiff("diff --git a/a b/a", "fixture");
    await diffParser.loadUnifiedDiffFile("/tmp/fixture.diff", "fixture.diff");
    await diffParser.loadUnifiedDiffFromUrl("https://github.com/owner/repo/pull/1.diff", "owner/repo#1");

    expect(nitroModules.createHybridObject).toHaveBeenCalledTimes(1);
    expect(nitroModules.createHybridObject).toHaveBeenCalledWith("DiffParser");
  });
});

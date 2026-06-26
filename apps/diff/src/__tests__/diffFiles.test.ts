import {
  getDiffRecentDocumentPath,
  getDiffSourceLabel,
  getFilename,
  getLaunchDiffFolder,
  getLaunchDiffSource,
  normalizeDiffOpenSource,
  type DiffOpenSource,
} from "../diffFiles";

describe("diffFiles", () => {
  it("uses the last path segment as the filename", () => {
    expect(getFilename("/Users/jay/code/legend-desktop")).toBe("legend-desktop");
    expect(getFilename("legend-desktop")).toBe("legend-desktop");
  });

  it("normalizes local paths and file URLs as folder sources", () => {
    expect(normalizeDiffOpenSource("/Users/jay/code/legend-desktop")).toEqual({
      kind: "folder",
      label: "legend-desktop",
      value: "/Users/jay/code/legend-desktop",
    });
    expect(normalizeDiffOpenSource("file:///Users/jay/My%20Repo")).toEqual({
      kind: "folder",
      label: "My Repo",
      value: "/Users/jay/My Repo",
    });
  });

  it("normalizes supported GitHub pull and commit URLs", () => {
    expect(normalizeDiffOpenSource("github.com/legendapp/legend-desktop/pull/123")).toEqual({
      diffUrl: "https://github.com/legendapp/legend-desktop/pull/123.diff",
      kind: "github",
      label: "legendapp/legend-desktop#123",
      value: "https://github.com/legendapp/legend-desktop/pull/123",
    });
    expect(normalizeDiffOpenSource("https://github.com/legendapp/legend-desktop/commit/abcdef123456.diff")).toEqual({
      diffUrl: "https://github.com/legendapp/legend-desktop/commit/abcdef123456.diff",
      kind: "github",
      label: "legendapp/legend-desktop@abcdef1",
      value: "https://github.com/legendapp/legend-desktop/commit/abcdef123456",
    });
  });

  it("rejects unsupported URL schemes", () => {
    expect(normalizeDiffOpenSource("https://example.com/diff.patch")).toBeNull();
    expect(normalizeDiffOpenSource("mailto:test@example.com")).toBeNull();
  });

  it("preserves already-normalized source objects", () => {
    const source: DiffOpenSource = {
      diffUrl: "https://github.com/legendapp/legend-desktop/pull/1.diff",
      kind: "github",
      label: "legendapp/legend-desktop#1",
      value: "https://github.com/legendapp/legend-desktop/pull/1",
    };
    expect(normalizeDiffOpenSource(source)).toBe(source);
  });

  it("reads explicit launch source arguments before scanning positional URLs", () => {
    expect(getLaunchDiffSource(["--diff-folder", "/tmp/repo", "github.com/owner/repo/pull/7"])).toEqual({
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    });
    expect(getLaunchDiffSource(["--diff-url=https://github.com/owner/repo/pull/7"])).toEqual({
      diffUrl: "https://github.com/owner/repo/pull/7.diff",
      kind: "github",
      label: "owner/repo#7",
      value: "https://github.com/owner/repo/pull/7",
    });
    expect(getLaunchDiffSource(["github.com/owner/repo/pull/8"])).toEqual({
      diffUrl: "https://github.com/owner/repo/pull/8.diff",
      kind: "github",
      label: "owner/repo#8",
      value: "https://github.com/owner/repo/pull/8",
    });
  });

  it("returns recent document paths only for folders", () => {
    const folderSource = normalizeDiffOpenSource("/tmp/repo");
    const githubSource = normalizeDiffOpenSource("github.com/owner/repo/pull/1");
    expect(folderSource && getDiffRecentDocumentPath(folderSource)).toBe("/tmp/repo");
    expect(githubSource && getDiffRecentDocumentPath(githubSource)).toBeNull();
    expect(getDiffSourceLabel(null)).toBe("Legend Diff");
    expect(getLaunchDiffFolder(["--diff-folder=/tmp/repo"])).toBe("/tmp/repo");
  });
});

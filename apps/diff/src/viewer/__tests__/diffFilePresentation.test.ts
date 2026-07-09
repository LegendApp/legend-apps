import type { DiffFileSummary } from "@legend-apps/diff-parser";

import {
  fileMatchesFilter,
  getActiveDiffFile,
  getDirectoryPath,
  getFilePathContext,
  getFileStatusPresentation,
  getJoinedPath,
} from "../diffFilePresentation";

function createFile(overrides: Partial<DiffFileSummary>): DiffFileSummary {
  return {
    additions: 0,
    deletions: 0,
    index: 0,
    isBinary: false,
    oldPath: "",
    path: "src/App.tsx",
    rowCount: 1,
    rowStart: 0,
    status: "modified",
    ...overrides,
  };
}

describe("diffFilePresentation", () => {
  it("extracts directory paths", () => {
    expect(getDirectoryPath("apps/diff/src/App.tsx")).toBe("apps/diff/src");
    expect(getDirectoryPath("App.tsx")).toBe("");
  });

  it("presents known file statuses", () => {
    expect(getFileStatusPresentation(createFile({ status: "added" }))).toMatchObject({
      symbolName: "plus",
      title: "Added",
    });
    expect(getFileStatusPresentation(createFile({ status: "deleted" }))).toMatchObject({
      symbolName: "minus",
      title: "Deleted",
    });
    expect(getFileStatusPresentation(createFile({ status: "renamed" }))).toMatchObject({
      symbolName: "arrow.right",
      title: "Renamed",
    });
    expect(getFileStatusPresentation(createFile({ status: "conflicted" }))).toMatchObject({
      backgroundColor: "#ff453a",
      color: "#ffffff",
      iconYOffset: -0.75,
      symbolName: "exclamationmark.triangle.fill",
      title: "Conflicted",
    });
    expect(getFileStatusPresentation(createFile({ isBinary: true, status: "modified" }))).toMatchObject({
      title: "Modified binary",
    });
    expect(getFileStatusPresentation(createFile({ status: "weird" }))).toMatchObject({
      symbolName: "questionmark",
      title: "weird",
    });
  });

  it("includes old paths for renamed and copied files", () => {
    expect(getFilePathContext(createFile({
      oldPath: "src/Old.tsx",
      path: "src/New.tsx",
      status: "renamed",
    }), "src")).toBe("src/Old.tsx -> src/");
    expect(getFilePathContext(createFile({
      oldPath: "src/Old.tsx",
      path: "src/New.tsx",
      status: "modified",
    }), "src")).toBe("src/");
  });

  it("matches all filter terms against path, old path, and status", () => {
    const file = createFile({
      oldPath: "apps/diff/src/OldViewer.tsx",
      path: "apps/diff/src/DiffViewer.tsx",
      status: "renamed",
    });
    expect(fileMatchesFilter(file, "diff renamed")).toBe(true);
    expect(fileMatchesFilter(file, "oldviewer")).toBe(true);
    expect(fileMatchesFilter(file, "music")).toBe(false);
  });

  it("falls back to the first active file when the requested index is missing", () => {
    const first = createFile({ index: 3, path: "first.ts" });
    const second = createFile({ index: 9, path: "second.ts" });
    expect(getActiveDiffFile([first, second], 9)).toBe(second);
    expect(getActiveDiffFile([first, second], 100)).toBe(first);
    expect(getActiveDiffFile([], null)).toBeNull();
  });

  it("joins paths without duplicate slashes", () => {
    expect(getJoinedPath("/tmp/repo/", "/src/App.tsx")).toBe("/tmp/repo/src/App.tsx");
  });
});

import type { DiffFileSummary, DiffSideBySideFileHeader } from "@legend-desktop/diff-parser";
import {
  createCollapsedFileIndexList,
  createIdentityDiffRowIndexes,
  createSideBySideFileHeaderIndexes,
  createSideBySideListIndexByRowIndex,
  createVisibleDiffRowIndexes,
  findFileIndexForRow,
} from "../diffLoadedDocumentModel";

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

function createSideBySideHeader(overrides: Partial<DiffSideBySideFileHeader>): DiffSideBySideFileHeader {
  return {
    fileIndex: 0,
    listIndex: 0,
    sourceStart: 0,
    ...overrides,
  };
}

describe("diffLoadedDocumentModel", () => {
  it("keeps file headers visible while hiding collapsed file bodies", () => {
    const files = [
      createFile({ index: 0, path: "src/App.tsx", rowCount: 3, rowStart: 0 }),
      createFile({ index: 1, path: "src/Collapsed.ts", rowCount: 4, rowStart: 3 }),
      createFile({ index: 2, path: "src/Next.ts", rowCount: 2, rowStart: 7 }),
    ];

    expect(createVisibleDiffRowIndexes(files, new Set([1]), [])).toEqual([
      0,
      1,
      2,
      3,
      7,
      8,
    ]);
  });

  it("falls back to identity indexes when file summaries are unavailable", () => {
    expect(createVisibleDiffRowIndexes([], new Set([0]), [undefined, 4, undefined])).toEqual([0, 4, 2]);
  });

  it("sorts collapsed file indexes for native document calls", () => {
    expect(createCollapsedFileIndexList(new Set([7, 1, 4]))).toEqual([1, 4, 7]);
  });

  it("creates stable side-by-side identity indexes", () => {
    const indexes = createIdentityDiffRowIndexes(3.8);
    expect(indexes).toHaveLength(3);
    expect(indexes[0]).toBeUndefined();
    expect(indexes[1]).toBeUndefined();
    expect(indexes[2]).toBeUndefined();
    expect(createIdentityDiffRowIndexes(-1)).toEqual([]);
  });

  it("indexes side-by-side file headers by list row and source row", () => {
    const headers = [
      createSideBySideHeader({ fileIndex: 0, listIndex: 0, sourceStart: 0 }),
      createSideBySideHeader({ fileIndex: 2, listIndex: 5, sourceStart: 12 }),
    ];

    expect(createSideBySideFileHeaderIndexes(headers)).toEqual(new Set([0, 5]));
    expect(Array.from(createSideBySideListIndexByRowIndex(headers).entries())).toEqual([
      [0, 0],
      [12, 5],
    ]);
  });

  it("maps source rows to the active file at boundaries and out-of-range edges", () => {
    const files = [
      createFile({ index: 10, rowCount: 3, rowStart: 4 }),
      createFile({ index: 20, rowCount: 2, rowStart: 7 }),
      createFile({ index: 30, rowCount: 5, rowStart: 9 }),
    ];

    expect(findFileIndexForRow(files, 4)).toBe(10);
    expect(findFileIndexForRow(files, 6)).toBe(10);
    expect(findFileIndexForRow(files, 7)).toBe(20);
    expect(findFileIndexForRow(files, 13)).toBe(30);
    expect(findFileIndexForRow(files, 3)).toBe(10);
    expect(findFileIndexForRow(files, 99)).toBe(30);
    expect(findFileIndexForRow([], 0)).toBeNull();
  });
});

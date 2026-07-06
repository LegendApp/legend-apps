import type { DiffFileSummary, DiffRenderRow, DiffSideBySideFileHeader, DiffSideBySideRenderRow } from "@legend-desktop/diff-parser";
import {
  createCollapsedFileIndexList,
  createIdentityDiffRowIndexes,
  createSideBySideFileHeaderIndexes,
  createSideBySideListIndexByRowIndex,
  createVisibleDiffRowIndexes,
  findFileIndexForRow,
  getBoundedSideBySideFileHeaders,
  getBoundedSideBySideRowCount,
} from "../diffLoadedDocumentIndexes";

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

function createRenderRow(overrides: Partial<DiffRenderRow> = {}): DiffRenderRow {
  return {
    changeType: 0,
    fileIndex: overrides.fileIndex ?? 0,
    hunkIndex: -1,
    index: overrides.index ?? 0,
    kind: 0,
    newLineNumber: -1,
    oldLineNumber: -1,
    text: "",
    tokens: [],
    ...overrides,
  };
}

function createSideBySideRow(overrides: {
  fileIndex?: number;
  index: number;
  kind?: string;
  sourceStart?: number;
}): DiffSideBySideRenderRow {
  return {
    fileIndex: overrides.fileIndex ?? 0,
    hunkIndex: -1,
    index: overrides.index,
    kind: overrides.kind ?? "line",
    newRow: createRenderRow(),
    newRowEqualsOldRow: true,
    newRowVisible: true,
    oldRow: createRenderRow(),
    oldRowVisible: true,
    sourceEnd: (overrides.sourceStart ?? overrides.index) + 1,
    sourceStart: overrides.sourceStart ?? overrides.index,
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
    expect(indexes[0]).toBe(0);
    expect(indexes[1]).toBe(1);
    expect(indexes[2]).toBe(2);
    expect(indexes[3]).toBeUndefined();
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

  it("clamps bounded side-by-side row counts to available rows", () => {
    const rows = [
      createSideBySideRow({ index: 0 }),
      createSideBySideRow({ index: 1 }),
      createSideBySideRow({ index: 2 }),
    ];
    const document = {
      getPlainSideBySideRows: (start: number, count: number) => rows.slice(start, start + count),
    };

    expect(getBoundedSideBySideRowCount(document, 8, [])).toBe(3);
    expect(getBoundedSideBySideRowCount(document, 2, [])).toBe(2);
    expect(getBoundedSideBySideRowCount(document, 0, [])).toBe(0);
  });

  it("creates bounded side-by-side file headers from side-by-side list rows", () => {
    const rows = [
      createSideBySideRow({ fileIndex: 0, index: 0, kind: "file-header", sourceStart: 0 }),
      createSideBySideRow({ fileIndex: 0, index: 1, sourceStart: 1 }),
      createSideBySideRow({ fileIndex: 1, index: 2, kind: "file-header", sourceStart: 8 }),
      createSideBySideRow({ fileIndex: 1, index: 3, sourceStart: 9 }),
    ];
    const document = {
      getPlainSideBySideRows: (start: number, count: number) => rows.slice(start, start + count),
    };

    expect(getBoundedSideBySideFileHeaders(document, 3, [])).toEqual([
      { fileIndex: 0, listIndex: 0, sourceStart: 0 },
      { fileIndex: 1, listIndex: 2, sourceStart: 8 },
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

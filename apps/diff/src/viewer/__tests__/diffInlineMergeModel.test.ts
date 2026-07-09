import type { DiffFileSummary, DiffSideBySideFileHeader } from "@legend-apps/diff-parser";
import type { DiffMergeConflictFile, DiffMergeDisplayModel, DiffMergeDisplayRow } from "../../diffMerge";
import { createDiffInlineMergeList } from "../diffInlineMergeModel";

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

function createMergeRow(overrides: Partial<DiffMergeDisplayRow> = {}): DiffMergeDisplayRow {
  return {
    kind: "line",
    leftText: "ours",
    lineNumber: 1,
    rightText: "theirs",
    ...overrides,
  };
}

function createMergeFile(path: string): DiffMergeConflictFile {
  return {
    conflictRanges: [],
    displayRows: [],
    markerBlocks: [],
    path,
    stages: [],
  };
}

function createMergeModel(labels: readonly string[]): DiffMergeDisplayModel {
  return {
    conflictRanges: [],
    rows: labels.map((label, index) => createMergeRow({
      leftText: `${label}:left`,
      lineNumber: index + 1,
      rightText: `${label}:right`,
    })),
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

describe("diffInlineMergeModel", () => {
  it("does not materialize per-row merge indexes when no merge files exist", () => {
    const unifiedItemIndexes = new Array<number | undefined>(1_000);
    const sideBySideItemIndexes = new Array<number | undefined>(500);

    const unifiedModel = createDiffInlineMergeList({
      collapsedFileIndexes: new Set(),
      files: [createFile({ rowCount: unifiedItemIndexes.length, rowStart: 0 })],
      mergeDisplayModelByPath: new Map(),
      mergeFileByPath: new Map(),
      sideBySideFileHeaderByListIndex: new Map(),
      sideBySideItemIndexes: [],
      unifiedItemIndexes,
      viewMode: "unified",
    });
    const sideBySideModel = createDiffInlineMergeList({
      collapsedFileIndexes: new Set(),
      files: [createFile({ rowCount: sideBySideItemIndexes.length, rowStart: 0 })],
      mergeDisplayModelByPath: new Map(),
      mergeFileByPath: new Map(),
      sideBySideFileHeaderByListIndex: new Map(),
      sideBySideItemIndexes,
      unifiedItemIndexes: [],
      viewMode: "blocks",
    });

    expect(unifiedModel.itemIndexes).toBe(unifiedItemIndexes);
    expect(unifiedModel.rowByItemIndex.size).toBe(0);
    expect(unifiedModel.sourceRowByItemIndex.size).toBe(0);
    expect(sideBySideModel.itemIndexes).toBe(sideBySideItemIndexes);
    expect(sideBySideModel.rowByItemIndex.size).toBe(0);
    expect(sideBySideModel.sourceRowByItemIndex.size).toBe(0);
  });

  it("replaces unified conflict bodies with inline merge rows mapped to the source file", () => {
    const files = [
      createFile({ index: 0, path: "src/App.tsx", rowCount: 3, rowStart: 0 }),
      createFile({ index: 1, path: "src/Conflict.ts", rowCount: 4, rowStart: 3 }),
      createFile({ index: 2, path: "src/After.ts", rowCount: 2, rowStart: 7 }),
    ];
    const mergeFile = createMergeFile("src/Conflict.ts");

    const model = createDiffInlineMergeList({
      collapsedFileIndexes: new Set(),
      files,
      mergeDisplayModelByPath: new Map([[mergeFile.path, createMergeModel(["ours", "theirs"])]]),
      mergeFileByPath: new Map([[mergeFile.path, mergeFile]]),
      sideBySideFileHeaderByListIndex: new Map(),
      sideBySideItemIndexes: [],
      unifiedItemIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      viewMode: "unified",
    });

    // Bug caught: active file tracking jumps to the wrong file when inline merge rows replace source rows.
    expect(model.itemIndexes).toEqual([0, 1, 2, 3, -1, -2, 7, 8]);
    expect(model.rowByItemIndex.get(-1)?.sourceFileIndex).toBe(1);
    expect(model.rowByItemIndex.get(-1)?.sourceRowIndex).toBe(3);
    expect(model.sourceRowByItemIndex.get(3)).toBe(3);
    expect(model.sourceRowByItemIndex.has(4)).toBe(false);
  });

  it("keeps collapsed unified conflict files collapsed without merge rows", () => {
    const files = [
      createFile({ index: 0, path: "src/App.tsx", rowCount: 3, rowStart: 0 }),
      createFile({ index: 1, path: "src/Conflict.ts", rowCount: 4, rowStart: 3 }),
      createFile({ index: 2, path: "src/After.ts", rowCount: 2, rowStart: 7 }),
    ];
    const mergeFile = createMergeFile("src/Conflict.ts");

    const model = createDiffInlineMergeList({
      collapsedFileIndexes: new Set([1]),
      files,
      mergeDisplayModelByPath: new Map([[mergeFile.path, createMergeModel(["ours", "theirs"])]]),
      mergeFileByPath: new Map([[mergeFile.path, mergeFile]]),
      sideBySideFileHeaderByListIndex: new Map(),
      sideBySideItemIndexes: [],
      unifiedItemIndexes: [0, 1, 2, 3, 7, 8],
      viewMode: "unified",
    });

    // Bug caught: collapsed conflicted files still render inline merge rows.
    expect(model.itemIndexes).toEqual([0, 1, 2, 3, 7, 8]);
    expect(model.rowByItemIndex.size).toBe(0);
  });

  it("matches renamed unified conflict files by their old path", () => {
    const files = [
      createFile({
        index: 1,
        oldPath: "src/OldConflict.ts",
        path: "src/NewConflict.ts",
        rowCount: 3,
        rowStart: 0,
        status: "renamed",
      }),
    ];
    const mergeFile = createMergeFile("src/OldConflict.ts");

    const model = createDiffInlineMergeList({
      collapsedFileIndexes: new Set(),
      files,
      mergeDisplayModelByPath: new Map([[mergeFile.path, createMergeModel(["renamed"])]]),
      mergeFileByPath: new Map([[mergeFile.path, mergeFile]]),
      sideBySideFileHeaderByListIndex: new Map(),
      sideBySideItemIndexes: [],
      unifiedItemIndexes: [0, 1, 2],
      viewMode: "unified",
    });

    // Bug caught: renamed conflicted files lose inline merge controls when the diff path changes.
    expect(model.itemIndexes).toEqual([0, -1]);
    expect(model.rowByItemIndex.get(-1)?.file.path).toBe("src/OldConflict.ts");
  });

  it("replaces side-by-side conflict blocks with inline merge rows mapped to the header source row", () => {
    const files = [
      createFile({ index: 0, path: "src/Conflict.ts", rowCount: 4, rowStart: 10 }),
      createFile({ index: 1, path: "src/After.ts", rowCount: 2, rowStart: 20 }),
    ];
    const mergeFile = createMergeFile("src/Conflict.ts");

    const model = createDiffInlineMergeList({
      collapsedFileIndexes: new Set(),
      files,
      mergeDisplayModelByPath: new Map([[mergeFile.path, createMergeModel(["ours", "theirs"])]]),
      mergeFileByPath: new Map([[mergeFile.path, mergeFile]]),
      sideBySideFileHeaderByListIndex: new Map([
        [0, createSideBySideHeader({ fileIndex: 0, listIndex: 0, sourceStart: 10 })],
        [4, createSideBySideHeader({ fileIndex: 1, listIndex: 4, sourceStart: 20 })],
      ]),
      sideBySideItemIndexes: [10, 11, 12, 13, 20, 21],
      unifiedItemIndexes: [],
      viewMode: "blocks",
    });

    // Bug caught: side-by-side inline merge rows report the wrong document row for scrolling and active file state.
    expect(model.itemIndexes).toEqual([10, -1, -2, 20, 21]);
    expect(model.rowByItemIndex.get(-1)?.sourceFileIndex).toBe(0);
    expect(model.rowByItemIndex.get(-1)?.sourceRowIndex).toBe(10);
    expect(model.sourceRowByItemIndex.has(11)).toBe(false);
  });
});

import type { DiffFileSummary, DiffSideBySideFileHeader } from "@legend-apps/diff-parser";
import type { DiffViewMode } from "../diffSettings";
import type { DiffMergeConflictFile, DiffMergeDisplayModel, DiffMergeDisplayRow } from "../diffMerge";

export type DiffInlineMergeRow = {
  file: DiffMergeConflictFile;
  itemIndex: number;
  row: DiffMergeDisplayRow;
  rowIndex: number;
  sourceFileIndex: number;
  sourceRowIndex: number;
};

export type DiffInlineMergeList = {
  itemIndexes: Array<number | undefined>;
  listIndexByFileIndex: ReadonlyMap<number, number>;
  rowByItemIndex: Map<number, DiffInlineMergeRow>;
  sourceRowByItemIndex: Map<number, number>;
};

export type DiffInlineMergeItemIndexAllocator = {
  getItemIndex: (filePath: string, rowIndex: number) => number;
  locationByItemIndex: ReadonlyMap<number, { filePath: string; rowIndex: number }>;
};

export function createDiffInlineMergeItemIndexAllocator(): DiffInlineMergeItemIndexAllocator {
  const itemIndexesByFilePath = new Map<string, number[]>();
  const locationByItemIndex = new Map<number, { filePath: string; rowIndex: number }>();
  let nextItemIndex = -1;
  return {
    getItemIndex: (filePath, rowIndex) => {
      let itemIndexes = itemIndexesByFilePath.get(filePath);
      if (!itemIndexes) {
        itemIndexes = [];
        itemIndexesByFilePath.set(filePath, itemIndexes);
      }
      let itemIndex = itemIndexes[rowIndex];
      if (itemIndex === undefined) {
        itemIndex = nextItemIndex;
        nextItemIndex -= 1;
        itemIndexes[rowIndex] = itemIndex;
        locationByItemIndex.set(itemIndex, { filePath, rowIndex });
      }
      return itemIndex;
    },
    locationByItemIndex,
  };
}

type CreateDiffInlineMergeListOptions = {
  collapsedFileIndexes: ReadonlySet<number>;
  files: readonly DiffFileSummary[];
  getMergeItemIndex: (filePath: string, rowIndex: number) => number;
  mergeDisplayModelByPath: ReadonlyMap<string, DiffMergeDisplayModel>;
  mergeFileByPath: ReadonlyMap<string, DiffMergeConflictFile>;
  sideBySideFileHeaderByListIndex: ReadonlyMap<number, DiffSideBySideFileHeader>;
  sideBySideItemIndexes: Array<number | undefined>;
  unifiedItemIndexes: Array<number | undefined>;
  viewMode: DiffViewMode;
};

export function createInlineRowsForFile({
  file,
  getMergeItemIndex,
  model,
  rowByItemIndex,
  sourceFileIndex,
  sourceRowIndex,
}: {
  file: DiffMergeConflictFile;
  getMergeItemIndex: (filePath: string, rowIndex: number) => number;
  model: DiffMergeDisplayModel | undefined;
  rowByItemIndex: Map<number, DiffInlineMergeRow>;
  sourceFileIndex: number;
  sourceRowIndex: number;
}) {
  const itemIndexes: number[] = [];
  if (model && model.rows.length > 0) {
    for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
      const itemIndex = getMergeItemIndex(file.path, rowIndex);
      itemIndexes.push(itemIndex);
      rowByItemIndex.set(itemIndex, {
        file,
        itemIndex,
        row: model.rows[rowIndex],
        rowIndex,
        sourceFileIndex,
        sourceRowIndex,
      });
    }
  }
  return itemIndexes;
}

export function getMergeFileForDiffFile(
  mergeFileByPath: ReadonlyMap<string, DiffMergeConflictFile>,
  file: DiffFileSummary | undefined,
) {
  if (!file) {
    return undefined;
  }
  return mergeFileByPath.get(file.path) ?? (file.oldPath ? mergeFileByPath.get(file.oldPath) : undefined);
}

export function createDiffInlineMergeList({
  collapsedFileIndexes,
  files,
  getMergeItemIndex,
  mergeDisplayModelByPath,
  mergeFileByPath,
  sideBySideFileHeaderByListIndex,
  sideBySideItemIndexes,
  unifiedItemIndexes,
  viewMode,
}: CreateDiffInlineMergeListOptions): DiffInlineMergeList {
  const listIndexByFileIndex = new Map<number, number>();
  const rowByItemIndex = new Map<number, DiffInlineMergeRow>();
  const sourceRowByItemIndex = new Map<number, number>();
  if (mergeFileByPath.size === 0) {
    return {
      itemIndexes: viewMode === "unified" ? unifiedItemIndexes : sideBySideItemIndexes,
      listIndexByFileIndex,
      rowByItemIndex,
      sourceRowByItemIndex,
    };
  }

  const fileByIndex = new Map<number, DiffFileSummary>();
  for (const file of files) {
    fileByIndex.set(file.index, file);
  }
  let itemIndexes: Array<number | undefined>;

  if (viewMode === "unified") {
    itemIndexes = [];
    let fileCursor = 0;
    for (const itemIndex of unifiedItemIndexes) {
      const rowIndex = itemIndex ?? itemIndexes.length;
      while (fileCursor < files.length) {
        const currentFile = files[fileCursor];
        const rowStart = Math.max(0, Math.floor(currentFile.rowStart));
        const rowEnd = rowStart + Math.max(0, Math.floor(currentFile.rowCount));
        if (rowEnd > rowIndex || fileCursor === files.length - 1) {
          break;
        }
        fileCursor += 1;
      }

      const file = files[fileCursor];
      const rowStart = file ? Math.max(0, Math.floor(file.rowStart)) : -1;
      const rowEnd = file ? rowStart + Math.max(0, Math.floor(file.rowCount)) : -1;
      const mergeFile = getMergeFileForDiffFile(mergeFileByPath, file);
      if (file && rowIndex === rowStart) {
        listIndexByFileIndex.set(file.index, itemIndexes.length);
      }
      if (file && mergeFile && rowIndex === rowStart) {
        itemIndexes.push(rowIndex);
        sourceRowByItemIndex.set(rowIndex, rowIndex);
        if (!collapsedFileIndexes.has(file.index)) {
          itemIndexes.push(...createInlineRowsForFile({
            file: mergeFile,
            getMergeItemIndex,
            model: mergeDisplayModelByPath.get(mergeFile.path),
            rowByItemIndex,
            sourceFileIndex: file.index,
            sourceRowIndex: rowStart,
          }));
        }
      } else if (file && mergeFile && !collapsedFileIndexes.has(file.index) && rowIndex > rowStart && rowIndex < rowEnd) {
        // Merge rows replace the original conflicted file body.
      } else {
        itemIndexes.push(rowIndex);
        sourceRowByItemIndex.set(rowIndex, rowIndex);
      }
    }
  } else {
    itemIndexes = [];
    const headerListIndexes = [...sideBySideFileHeaderByListIndex.keys()].sort((left, right) => left - right);
    let skipUntil = -1;
    for (let listIndex = 0; listIndex < sideBySideItemIndexes.length; listIndex += 1) {
      if (listIndex < skipUntil) {
        continue;
      }

      const header = sideBySideFileHeaderByListIndex.get(listIndex);
      const file = header ? fileByIndex.get(header.fileIndex) : undefined;
      const mergeFile = getMergeFileForDiffFile(mergeFileByPath, file);
      if (header) {
        listIndexByFileIndex.set(header.fileIndex, itemIndexes.length);
      }
      if (header && file && mergeFile && !collapsedFileIndexes.has(file.index)) {
        const nextHeader = headerListIndexes.find((headerIndex) => headerIndex > listIndex) ?? sideBySideItemIndexes.length;
        const rowIndex = sideBySideItemIndexes[listIndex] ?? listIndex;
        itemIndexes.push(rowIndex);
        sourceRowByItemIndex.set(rowIndex, rowIndex);
        itemIndexes.push(...createInlineRowsForFile({
          file: mergeFile,
          getMergeItemIndex,
          model: mergeDisplayModelByPath.get(mergeFile.path),
          rowByItemIndex,
          sourceFileIndex: file.index,
          sourceRowIndex: header.sourceStart,
        }));
        skipUntil = nextHeader;
      } else {
        const rowIndex = sideBySideItemIndexes[listIndex] ?? listIndex;
        itemIndexes.push(rowIndex);
        sourceRowByItemIndex.set(rowIndex, rowIndex);
      }
    }
  }

  return {
    itemIndexes,
    listIndexByFileIndex,
    rowByItemIndex,
    sourceRowByItemIndex,
  };
}

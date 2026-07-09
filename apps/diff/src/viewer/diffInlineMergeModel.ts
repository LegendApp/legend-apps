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
  rowByItemIndex: Map<number, DiffInlineMergeRow>;
  sourceRowByItemIndex: Map<number, number>;
};

type CreateDiffInlineMergeListOptions = {
  collapsedFileIndexes: ReadonlySet<number>;
  files: readonly DiffFileSummary[];
  mergeDisplayModelByPath: ReadonlyMap<string, DiffMergeDisplayModel>;
  mergeFileByPath: ReadonlyMap<string, DiffMergeConflictFile>;
  sideBySideFileHeaderByListIndex: ReadonlyMap<number, DiffSideBySideFileHeader>;
  sideBySideItemIndexes: Array<number | undefined>;
  unifiedItemIndexes: Array<number | undefined>;
  viewMode: DiffViewMode;
};

function createInlineRowsForFile({
  file,
  model,
  nextItemIndex,
  rowByItemIndex,
  sourceFileIndex,
  sourceRowIndex,
}: {
  file: DiffMergeConflictFile;
  model: DiffMergeDisplayModel | undefined;
  nextItemIndex: { current: number };
  rowByItemIndex: Map<number, DiffInlineMergeRow>;
  sourceFileIndex: number;
  sourceRowIndex: number;
}) {
  const itemIndexes: number[] = [];
  if (model && model.rows.length > 0) {
    for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
      const itemIndex = nextItemIndex.current;
      nextItemIndex.current -= 1;
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

function getMergeFileForDiffFile(
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
  mergeDisplayModelByPath,
  mergeFileByPath,
  sideBySideFileHeaderByListIndex,
  sideBySideItemIndexes,
  unifiedItemIndexes,
  viewMode,
}: CreateDiffInlineMergeListOptions): DiffInlineMergeList {
  const rowByItemIndex = new Map<number, DiffInlineMergeRow>();
  const sourceRowByItemIndex = new Map<number, number>();
  if (mergeFileByPath.size === 0) {
    return {
      itemIndexes: viewMode === "unified" ? unifiedItemIndexes : sideBySideItemIndexes,
      rowByItemIndex,
      sourceRowByItemIndex,
    };
  }

  const nextItemIndex = { current: -1 };
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
      if (file && mergeFile && rowIndex === rowStart) {
        itemIndexes.push(rowIndex);
        sourceRowByItemIndex.set(rowIndex, rowIndex);
        if (!collapsedFileIndexes.has(file.index)) {
          itemIndexes.push(...createInlineRowsForFile({
            file: mergeFile,
            model: mergeDisplayModelByPath.get(mergeFile.path),
            nextItemIndex,
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
      if (header && file && mergeFile && !collapsedFileIndexes.has(file.index)) {
        const nextHeader = headerListIndexes.find((headerIndex) => headerIndex > listIndex) ?? sideBySideItemIndexes.length;
        const rowIndex = sideBySideItemIndexes[listIndex] ?? listIndex;
        itemIndexes.push(rowIndex);
        sourceRowByItemIndex.set(rowIndex, rowIndex);
        itemIndexes.push(...createInlineRowsForFile({
          file: mergeFile,
          model: mergeDisplayModelByPath.get(mergeFile.path),
          nextItemIndex,
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
    rowByItemIndex,
    sourceRowByItemIndex,
  };
}

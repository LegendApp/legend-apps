import type { DiffFileSummary, DiffRenderRow } from "@legend-desktop/diff-parser";

const diffRowKindFileHeader = 0;
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;

export type DiffSideBySideLine = {
  newRowIndex: number | null;
  oldRowIndex: number | null;
};

export type DiffPresentationSegmentKind = "change" | "context" | "file-header";

export type DiffPresentationSegment = {
  fileIndex: number;
  hunkIndex: number;
  index: number;
  kind: DiffPresentationSegmentKind;
  lines: DiffSideBySideLine[];
  sourceEnd: number;
  sourceStart: number;
};

function isFileHeaderRow(row: DiffRenderRow) {
  return row.kind === diffRowKindFileHeader;
}

function isAddRow(row: DiffRenderRow) {
  return row.changeType === diffChangeTypeAdd;
}

function isRemoveRow(row: DiffRenderRow) {
  return row.changeType === diffChangeTypeRemove;
}

function createSegment({
  fileIndex,
  hunkIndex,
  index,
  kind,
  lines,
  sourceEnd,
  sourceStart,
}: Omit<DiffPresentationSegment, "sourceEnd" | "sourceStart"> & {
  sourceEnd?: number;
  sourceStart?: number;
}): DiffPresentationSegment {
  const rowIndexes = lines.flatMap((line) => [line.oldRowIndex, line.newRowIndex]).filter((rowIndex): rowIndex is number => rowIndex !== null);
  const firstRowIndex = rowIndexes.length > 0 ? Math.min(...rowIndexes) : index;
  const lastRowIndex = rowIndexes.length > 0 ? Math.max(...rowIndexes) : index;

  return {
    fileIndex,
    hunkIndex,
    index,
    kind,
    lines,
    sourceEnd: sourceEnd ?? lastRowIndex + 1,
    sourceStart: sourceStart ?? firstRowIndex,
  };
}

export function createDiffPresentationSegments({
  collapsedFileIndexes,
  files,
  rows,
}: {
  collapsedFileIndexes: ReadonlySet<number>;
  files: readonly DiffFileSummary[];
  rows: readonly DiffRenderRow[];
}) {
  const segments: DiffPresentationSegment[] = [];
  const fileByIndex = new Map(files.map((file) => [file.index, file]));
  let contextRows: DiffRenderRow[] = [];
  let removedRows: DiffRenderRow[] = [];
  let addedRows: DiffRenderRow[] = [];
  let currentFileIndex: number | null = null;
  let currentHunkIndex: number | null = null;

  const pushSegment = (segment: DiffPresentationSegment) => {
    segments.push({
      ...segment,
      index: segments.length,
    });
  };

  const flushContextRows = () => {
    if (contextRows.length > 0) {
      pushSegment(createSegment({
        fileIndex: contextRows[0].fileIndex,
        hunkIndex: contextRows[0].hunkIndex,
        index: segments.length,
        kind: "context",
        lines: contextRows.map((row) => ({
          newRowIndex: row.index,
          oldRowIndex: row.index,
        })),
      }));
      contextRows = [];
    }
  };

  const flushChangedRows = () => {
    if (removedRows.length > 0 || addedRows.length > 0) {
      const maxCount = Math.max(removedRows.length, addedRows.length);
      const lines: DiffSideBySideLine[] = [];
      for (let index = 0; index < maxCount; index += 1) {
        lines.push({
          oldRowIndex: removedRows[index]?.index ?? null,
          newRowIndex: addedRows[index]?.index ?? null,
        });
      }
      const firstRow = removedRows[0] ?? addedRows[0];
      pushSegment(createSegment({
        fileIndex: firstRow.fileIndex,
        hunkIndex: firstRow.hunkIndex,
        index: segments.length,
        kind: "change",
        lines,
      }));
      removedRows = [];
      addedRows = [];
    }
  };

  const flushRows = () => {
    flushContextRows();
    flushChangedRows();
  };

  for (const row of rows) {
    if (isFileHeaderRow(row)) {
      flushRows();
      currentFileIndex = row.fileIndex;
      currentHunkIndex = row.hunkIndex;
      pushSegment({
        fileIndex: row.fileIndex,
        hunkIndex: row.hunkIndex,
        index: segments.length,
        kind: "file-header",
        lines: [],
        sourceEnd: row.index + 1,
        sourceStart: row.index,
      });
      continue;
    }

    const file = fileByIndex.get(row.fileIndex);
    if (file && collapsedFileIndexes.has(file.index)) {
      continue;
    }

    if (currentFileIndex !== row.fileIndex || currentHunkIndex !== row.hunkIndex) {
      flushRows();
      currentFileIndex = row.fileIndex;
      currentHunkIndex = row.hunkIndex;
    }

    if (isRemoveRow(row)) {
      flushContextRows();
      if (addedRows.length > 0) {
        flushChangedRows();
      }
      removedRows.push(row);
    } else if (isAddRow(row)) {
      flushContextRows();
      addedRows.push(row);
    } else {
      flushChangedRows();
      contextRows.push(row);
    }
  }

  flushRows();

  return segments;
}

export function createSegmentListIndexByRowIndex(segments: readonly DiffPresentationSegment[]) {
  const listIndexByRowIndex = new Map<number, number>();

  segments.forEach((segment, listIndex) => {
    for (let rowIndex = segment.sourceStart; rowIndex < segment.sourceEnd; rowIndex += 1) {
      if (!listIndexByRowIndex.has(rowIndex)) {
        listIndexByRowIndex.set(rowIndex, listIndex);
      }
    }
  });

  return listIndexByRowIndex;
}

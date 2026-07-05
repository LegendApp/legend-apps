import type { DiffFileSummary, DiffSideBySideFileHeader } from "@legend-desktop/diff-parser";

export function createVisibleDiffRowIndexes(
  files: readonly DiffFileSummary[],
  collapsedFileIndexes: ReadonlySet<number>,
  fallbackItemIndexes: readonly (number | undefined)[],
) {
  const indexes: number[] = [];

  if (files.length > 0) {
    for (const file of files) {
      const rowStart = Math.max(0, Math.floor(file.rowStart));
      const rowCount = Math.max(0, Math.floor(file.rowCount));

      if (rowCount > 0) {
        indexes.push(rowStart);

        if (!collapsedFileIndexes.has(file.index)) {
          const rowEnd = rowStart + rowCount;
          for (let rowIndex = rowStart + 1; rowIndex < rowEnd; rowIndex += 1) {
            indexes.push(rowIndex);
          }
        }
      }
    }
  } else {
    for (let listIndex = 0; listIndex < fallbackItemIndexes.length; listIndex += 1) {
      const rowIndex = fallbackItemIndexes[listIndex];
      indexes.push(rowIndex ?? listIndex);
    }
  }

  return indexes;
}

export function createIdentityDiffRowIndexes(length: number) {
  const count = Math.max(0, Math.floor(length));
  return new Array<number | undefined>(count);
}

export function createCollapsedFileIndexList(collapsedFileIndexes: ReadonlySet<number>) {
  return Array.from(collapsedFileIndexes).sort((left, right) => left - right);
}

export function createSideBySideFileHeaderIndexes(fileHeaders: readonly DiffSideBySideFileHeader[]) {
  return new Set(fileHeaders.map((header) => header.listIndex));
}

export function createSideBySideListIndexByRowIndex(fileHeaders: readonly DiffSideBySideFileHeader[]) {
  const indexes = new Map<number, number>();
  fileHeaders.forEach((header) => {
    indexes.set(header.sourceStart, header.listIndex);
  });
  return indexes;
}

export function findFileIndexForRow(files: readonly DiffFileSummary[], rowIndex: number) {
  let low = 0;
  let high = files.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const file = files[middle];
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const rowEnd = rowStart + Math.max(0, Math.floor(file.rowCount));

    if (rowIndex < rowStart) {
      high = middle - 1;
    } else if (rowIndex >= rowEnd) {
      low = middle + 1;
    } else {
      return file.index;
    }
  }

  return files.length > 0 ? files[Math.max(0, Math.min(files.length - 1, high))].index : null;
}

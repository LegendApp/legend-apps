import type { DiffDocument, DiffFileSummary, DiffRenderRow } from "@legend-apps/diff-parser";
import { diffRowKindFileHeader } from "./diffViewerConstants";

export type DiffSearchMode = "content" | "file";

export type DiffSearchQuery = {
  mode: DiffSearchMode;
  raw: string;
  term: string;
};

export type DiffSearchRange = {
  length: number;
  startColumn: number;
};

export type DiffSearchResult =
  | {
      detail: string;
      fileIndex: number;
      id: string;
      kind: "file";
      label: string;
      ranges: readonly DiffSearchRange[];
      rowIndex: number;
    }
  | {
      fileIndex: number;
      id: string;
      kind: "line";
      label: string;
      range: DiffSearchRange;
      ranges: readonly DiffSearchRange[];
      rowIndex: number;
      text: string;
    };

const defaultSearchResultLimit = 1000;
const searchRowChunkSize = 1000;

export function parseDiffSearchQuery(rawQuery: string): DiffSearchQuery {
  const raw = rawQuery;
  const trimmed = rawQuery.trim();
  if (trimmed.startsWith("@")) {
    return {
      mode: "file",
      raw,
      term: trimmed.slice(1).trim(),
    };
  }
  return {
    mode: "content",
    raw,
    term: trimmed,
  };
}

export function findDiffSearchRanges(text: string, term: string): DiffSearchRange[] {
  const normalizedTerm = term.toLowerCase();
  if (!normalizedTerm) {
    return [];
  }

  const ranges: DiffSearchRange[] = [];
  const normalizedText = text.toLowerCase();
  let searchStart = 0;
  while (searchStart < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedTerm, searchStart);
    if (matchIndex < 0) {
      break;
    }
    ranges.push({
      length: normalizedTerm.length,
      startColumn: matchIndex,
    });
    searchStart = matchIndex + normalizedTerm.length;
  }
  return ranges;
}

export function encodeDiffSearchRanges(ranges: readonly DiffSearchRange[]) {
  return ranges
    .filter((range) => range.length > 0 && range.startColumn >= 0)
    .map((range) => `${range.startColumn},${range.length}`)
    .join(";");
}

export function createDiffSearchHighlightMap(results: readonly DiffSearchResult[]) {
  const rangesByRowIndex = new Map<number, DiffSearchRange[]>();
  for (const result of results) {
    if (result.kind === "line") {
      const ranges = rangesByRowIndex.get(result.rowIndex);
      if (ranges) {
        ranges.push(...result.ranges);
      } else {
        rangesByRowIndex.set(result.rowIndex, [...result.ranges]);
      }
    }
  }

  const highlights = new Map<number, string>();
  for (const [rowIndex, ranges] of rangesByRowIndex) {
    highlights.set(rowIndex, encodeDiffSearchRanges(ranges));
  }
  return highlights;
}

export function createActiveDiffSearchHighlightMap(result: DiffSearchResult | null | undefined) {
  const highlights = new Map<number, string>();
  if (result?.kind === "line") {
    highlights.set(result.rowIndex, encodeDiffSearchRanges([result.range]));
  }
  return highlights;
}

export function getDiffSearchSubmitIndex({
  activeIndex,
  direction,
  repeatedQuery,
  resultCount,
}: {
  activeIndex: number;
  direction: 1 | -1;
  repeatedQuery: boolean;
  resultCount: number;
}) {
  if (resultCount <= 0) {
    return 0;
  }
  if (!repeatedQuery) {
    return direction < 0 ? resultCount - 1 : 0;
  }
  return ((activeIndex + direction) % resultCount + resultCount) % resultCount;
}

function getDiffSearchLineLabel(file: DiffFileSummary | undefined, row: DiffRenderRow) {
  const lineNumber = row.newLineNumber >= 0 ? row.newLineNumber : row.oldLineNumber;
  const path = file?.path ?? "Diff";
  return lineNumber >= 0 ? `${path}:${lineNumber}` : path;
}

function createFileSearchResult(file: DiffFileSummary, term: string): DiffSearchResult | null {
  const pathRanges = findDiffSearchRanges(file.path, term);
  const oldPathRanges = file.oldPath ? findDiffSearchRanges(file.oldPath, term) : [];
  const ranges = pathRanges.length > 0 ? pathRanges : oldPathRanges;
  if (ranges.length === 0) {
    return null;
  }

  return {
    detail: file.oldPath && file.oldPath !== file.path ? file.oldPath : "",
    fileIndex: file.index,
    id: `file:${file.index}`,
    kind: "file",
    label: file.path,
    ranges,
    rowIndex: file.rowStart,
  };
}

function createLineSearchResults(row: DiffRenderRow, file: DiffFileSummary | undefined, term: string): DiffSearchResult[] {
  if (row.kind === diffRowKindFileHeader) {
    return [];
  }

  const ranges = findDiffSearchRanges(row.text, term);
  if (ranges.length === 0) {
    return [];
  }

  return ranges.map((range, rangeIndex) => ({
    fileIndex: row.fileIndex,
    id: `line:${row.index}:${range.startColumn}:${range.length}:${rangeIndex}`,
    kind: "line",
    label: getDiffSearchLineLabel(file, row),
    range,
    ranges: [range],
    rowIndex: row.index,
    text: row.text,
  }));
}

export function createDiffSearchResults(
  document: DiffDocument,
  files: readonly DiffFileSummary[],
  rawQuery: string,
  limit = defaultSearchResultLimit,
): DiffSearchResult[] {
  const query = parseDiffSearchQuery(rawQuery);
  if (!query.term) {
    return [];
  }

  const results: DiffSearchResult[] = [];
  if (query.mode === "file") {
    for (const file of files) {
      const result = createFileSearchResult(file, query.term);
      if (result) {
        results.push(result);
      }
      if (results.length >= limit) {
        break;
      }
    }
    return results;
  }

  const fileByIndex = new Map(files.map((file) => [file.index, file]));
  for (let rowStart = 0; rowStart < document.rowCount && results.length < limit; rowStart += searchRowChunkSize) {
    const rows = document.getPlainRows(rowStart, Math.min(searchRowChunkSize, document.rowCount - rowStart));
    for (const row of rows) {
      const rowResults = createLineSearchResults(row, fileByIndex.get(row.fileIndex), query.term);
      results.push(...rowResults.slice(0, limit - results.length));
      if (results.length >= limit) {
        break;
      }
    }
  }
  return results;
}

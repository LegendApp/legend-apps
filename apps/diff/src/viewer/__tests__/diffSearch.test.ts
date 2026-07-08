import type { DiffDocument, DiffFileSummary, DiffRenderRow } from "@legend-desktop/diff-parser";
import {
  createActiveDiffSearchHighlightMap,
  createDiffSearchHighlightMap,
  createDiffSearchResults,
  encodeDiffSearchRanges,
  findDiffSearchRanges,
  getDiffSearchSubmitIndex,
  parseDiffSearchQuery,
} from "../diffSearch";
import { diffRowKindFileHeader } from "../diffViewerConstants";

function createFile(overrides: Partial<DiffFileSummary> = {}): DiffFileSummary {
  return {
    additions: 1,
    deletions: 1,
    index: 0,
    isBinary: false,
    oldPath: "",
    path: "src/App.tsx",
    rowCount: 4,
    rowStart: 0,
    status: "modified",
    ...overrides,
  };
}

function createRow(overrides: Partial<DiffRenderRow> = {}): DiffRenderRow {
  return {
    changeType: 0,
    fileIndex: 0,
    hunkIndex: 0,
    index: 1,
    kind: 2,
    newLineNumber: 1,
    oldLineNumber: 1,
    text: "const value = true;",
    tokens: [],
    ...overrides,
  };
}

function createDocument(rows: DiffRenderRow[]): DiffDocument {
  return {
    rowCount: rows.length,
    getPlainRows: (start: number, count: number) => rows.slice(start, start + count),
  } as DiffDocument;
}

describe("diffSearch", () => {
  it("parses content and file-prefixed queries", () => {
    expect(parseDiffSearchQuery("value")).toEqual({
      mode: "content",
      raw: "value",
      term: "value",
    });
    expect(parseDiffSearchQuery(" @ src/app ")).toEqual({
      mode: "file",
      raw: " @ src/app ",
      term: "src/app",
    });
  });

  it("finds and encodes case-insensitive ranges", () => {
    expect(findDiffSearchRanges("Value value other", "value")).toEqual([
      { length: 5, startColumn: 0 },
      { length: 5, startColumn: 6 },
    ]);
    expect(encodeDiffSearchRanges([
      { length: 5, startColumn: 0 },
      { length: 5, startColumn: 6 },
    ])).toBe("0,5;6,5");
  });

  it("searches diff content without treating file headers as content matches", () => {
    const rows = [
      createRow({
        index: 0,
        kind: diffRowKindFileHeader,
        text: "src/App.tsx",
      }),
      createRow({
        index: 1,
        newLineNumber: 4,
        text: "const App = createApp();",
      }),
      createRow({
        fileIndex: 1,
        index: 2,
        newLineNumber: 9,
        text: "renderOtherThing();",
      }),
    ];
    const results = createDiffSearchResults(createDocument(rows), [
      createFile(),
      createFile({ index: 1, path: "src/Other.ts", rowStart: 2 }),
    ], "app");

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      fileIndex: 0,
      kind: "line",
      label: "src/App.tsx:4",
      range: { length: 3, startColumn: 6 },
      rowIndex: 1,
    });
    expect(results[1]).toMatchObject({
      fileIndex: 0,
      kind: "line",
      label: "src/App.tsx:4",
      range: { length: 3, startColumn: 18 },
      rowIndex: 1,
    });
    expect(createDiffSearchHighlightMap(results).get(1)).toBe("6,3;18,3");
    expect(createActiveDiffSearchHighlightMap(results[1]).get(1)).toBe("18,3");
  });

  it("uses @ queries for file paths", () => {
    const results = createDiffSearchResults(createDocument([]), [
      createFile({ path: "src/App.tsx" }),
      createFile({ index: 1, oldPath: "lib/OldPanel.tsx", path: "src/NewPanel.tsx", rowStart: 10 }),
    ], "@panel");

    expect(results).toEqual([
      {
        detail: "lib/OldPanel.tsx",
        fileIndex: 1,
        id: "file:1",
        kind: "file",
        label: "src/NewPanel.tsx",
        ranges: [{ length: 5, startColumn: 7 }],
        rowIndex: 10,
      },
    ]);
  });

  it("chooses next submit result indexes for enter and shift-enter", () => {
    expect(getDiffSearchSubmitIndex({
      activeIndex: 0,
      direction: 1,
      repeatedQuery: false,
      resultCount: 3,
    })).toBe(0);
    expect(getDiffSearchSubmitIndex({
      activeIndex: 0,
      direction: 1,
      repeatedQuery: true,
      resultCount: 3,
    })).toBe(1);
    expect(getDiffSearchSubmitIndex({
      activeIndex: 2,
      direction: 1,
      repeatedQuery: true,
      resultCount: 3,
    })).toBe(0);
    expect(getDiffSearchSubmitIndex({
      activeIndex: 0,
      direction: -1,
      repeatedQuery: true,
      resultCount: 3,
    })).toBe(2);
    expect(getDiffSearchSubmitIndex({
      activeIndex: 0,
      direction: -1,
      repeatedQuery: false,
      resultCount: 3,
    })).toBe(2);
  });
});

import type { DiffFileSummary, DiffRenderRow, DiffSideBySideRenderRow } from "@legend-desktop/diff-parser";
import { observable } from "@legendapp/state";
import { render } from "@testing-library/react-native";
import React from "react";
import { DiffSideBySideRow, DiffUnifiedRow, type DiffRenderFields } from "../DiffRows";
import { diffChangeTypeAdd, diffChangeTypeRemove, diffRowKindFileHeader } from "../diffViewerConstants";

function createFile(overrides: Partial<DiffFileSummary> = {}): DiffFileSummary {
  return {
    additions: 2,
    deletions: 1,
    index: 0,
    isBinary: false,
    oldPath: "",
    path: "src/App.tsx",
    rowCount: 3,
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
    kind: 1,
    newLineNumber: 2,
    oldLineNumber: 2,
    text: "const value = true;",
    tokens: [],
    ...overrides,
  };
}

function createRenderFields(overrides: Partial<DiffRenderFields> = {}): DiffRenderFields {
  const file = createFile();
  return {
    borderColor: "#30363d",
    document: null,
    fileByIndex: new Map([[file.index, file]]),
    fileByRowStart: new Map([[file.rowStart, file]]),
    fileHeaderBackgroundColor: "#161b22",
    fileHeaderRowIndexes: new Set([file.rowStart]),
    fontFamily: "Menlo",
    fontSize: 12,
    foregroundColor: "#f0f6fc",
    mutedColor: "#8b949e",
    rowRenderer: "react-native",
    rowHeight: 22,
    sideBySideTokenStyleById: new Map(),
    syntaxAppearance: "dark",
    syntaxHighlightingEnabled: true,
    syntaxStyleStore: {
      current: new Map(),
      getSnapshot: () => 0,
      refresh: () => {
      },
      subscribe: () => () => {
      },
    },
    syntaxThemeName: "dark-plus",
    toggleFileCollapsed: jest.fn(),
    tokenStyleById: new Map(),
    ...overrides,
  };
}

describe("DiffRows", () => {
  it("renders unified file headers with status and counts", async () => {
    const renderFields = createRenderFields();
    const view = await render(
      <DiffUnifiedRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={0}
        renderFields={renderFields}
        row={createRow({
          fileIndex: 0,
          index: 0,
          kind: diffRowKindFileHeader,
          newLineNumber: -1,
          oldLineNumber: -1,
          text: "src/App.tsx",
        })}
      />,
    );

    expect(view.getByText("src/")).toBeTruthy();
    expect(view.getByText("App.tsx")).toBeTruthy();
    expect(view.getByText("+2")).toBeTruthy();
    expect(view.getByText("-1")).toBeTruthy();
  });

  it("renders unified changed rows with line numbers and markers", async () => {
    const view = await render(
      <DiffUnifiedRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={1}
        renderFields={createRenderFields({ fileHeaderRowIndexes: new Set() })}
        row={createRow({
          changeType: diffChangeTypeAdd,
          newLineNumber: 11,
          oldLineNumber: -1,
          text: "const added = true;",
        })}
      />,
    );

    expect(view.getByText("11")).toBeTruthy();
    expect(view.getByText("+")).toBeTruthy();
    expect(view.getByText("const added = true;")).toBeTruthy();
  });

  it("renders side-by-side changed rows", async () => {
    const oldRow = createRow({
      changeType: diffChangeTypeRemove,
      index: 1,
      newLineNumber: -1,
      oldLineNumber: 4,
      text: "const value = false;",
    });
    const newRow = createRow({
      changeType: diffChangeTypeAdd,
      index: 2,
      newLineNumber: 4,
      oldLineNumber: -1,
      text: "const value = true;",
    });
    const sideBySideRow: DiffSideBySideRenderRow = {
      fileIndex: 0,
      hunkIndex: 0,
      index: 0,
      kind: "changed",
      newRow,
      newRowEqualsOldRow: false,
      newRowVisible: true,
      oldRow,
      oldRowVisible: true,
      sourceEnd: 3,
      sourceStart: 1,
    };

    const view = await render(
      <DiffSideBySideRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={0}
        renderFields={createRenderFields()}
        row={sideBySideRow}
      />,
    );

    expect(view.getByText("const value = false;")).toBeTruthy();
    expect(view.getByText("const value = true;")).toBeTruthy();
    expect(view.getByText("-")).toBeTruthy();
    expect(view.getByText("+")).toBeTruthy();
  });
});

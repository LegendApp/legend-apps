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
    collapsedFileIndexList: [],
    document: null,
    fileByIndex: new Map([[file.index, file]]),
    fileByRowStart: new Map([[file.rowStart, file]]),
    fileHeaderBackgroundColor: "#161b22",
    fileHeaderRowIndexes: new Set([file.rowStart]),
    fontFamily: "Menlo",
    fontSize: 12,
    foregroundColor: "#f0f6fc",
    hunkHeaderBackgroundColor: "#0d1117",
    mutedColor: "#8b949e",
    nativeSideBySideRowConfigId: "test:blocks",
    nativeSideBySideRowConfigVersion: 1,
    nativeUnifiedRowConfigId: "test:unified",
    nativeUnifiedRowConfigVersion: 1,
    rowHeight: 22,
    showOnlyHunks: true,
    sideBySideFileHeaderByListIndex: new Map(),
    sideBySideRowCount: 0,
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
    ...overrides,
  };
}

function renderedTreeHasProps(node: unknown, expectedProps: Record<string, unknown>): boolean {
  let found = false;
  if (node && typeof node === "object") {
    if (Array.isArray(node)) {
      found = node.some((child) => renderedTreeHasProps(child, expectedProps));
    } else {
      const current = node as { children?: unknown; props?: Record<string, unknown> };
      found = Boolean(current.props && Object.entries(expectedProps).every(([key, value]) => current.props?.[key] === value));
      if (!found && current.children) {
        found = renderedTreeHasProps(current.children, expectedProps);
      }
    }
  }
  return found;
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

  it("renders unified changed rows with the native row component", async () => {
    const view = await render(
      <DiffUnifiedRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={1}
        renderFields={createRenderFields({
          document: {} as never,
          fileHeaderRowIndexes: new Set(),
          showOnlyHunks: false,
        })}
        row={createRow({
          changeType: diffChangeTypeAdd,
          newLineNumber: 11,
          oldLineNumber: -1,
          text: "const added = true;",
        })}
      />,
    );

    expect(renderedTreeHasProps(view.toJSON(), {
      adaptiveRender: "normal",
      configId: "test:unified",
      configVersion: 1,
      rowIndex: 1,
    })).toBe(true);
  });

  it("renders side-by-side changed rows with the native row component", async () => {
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
        renderFields={createRenderFields({
          document: {} as never,
          showOnlyHunks: false,
        })}
        row={sideBySideRow}
      />,
    );

    expect(renderedTreeHasProps(view.toJSON(), {
      adaptiveRender: "normal",
      configId: "test:blocks",
      configVersion: 1,
      rowIndex: 0,
    })).toBe(true);
  });
});

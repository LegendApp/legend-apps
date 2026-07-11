import type { DiffFileSummary, DiffRenderRow, DiffSideBySideRenderRow } from "@legend-apps/diff-parser";
import { observable } from "@legendapp/state";
import { render } from "@testing-library/react-native";
import React from "react";
import { DiffSideBySideRow, DiffUnifiedRow, type DiffRowRenderState } from "../DiffRows";
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

function createRowRenderState(overrides: Partial<DiffRowRenderState> = {}): DiffRowRenderState {
  const file = createFile();
  return {
    document: {
      collapsedFileIndexList: [],
      current: null,
      fileByIndex: new Map([[file.index, file]]),
      fileByRowStart: new Map([[file.rowStart, file]]),
      fileHeaderRowIndexes: new Set([file.rowStart]),
      sideBySideFileHeaderByListIndex: new Map(),
      sideBySideRowCount: 0,
    },
    nativeRows: {
      sideBySideConfigId: "test:blocks",
      sideBySideConfigVersion: 1,
      unifiedConfigId: "test:unified",
      unifiedConfigVersion: 1,
    },
    presentation: {
      borderColor: "#30363d",
      fileHeaderBackgroundColor: "#161b22",
      fontFamily: "Menlo",
      fontSize: 12,
      foregroundColor: "#f0f6fc",
      hunkHeaderBackgroundColor: "#0d1117",
      mutedColor: "#8b949e",
      rowHeight: 22,
      showOnlyHunks: true,
      syntaxAppearance: "dark",
      syntaxHighlightingEnabled: true,
      syntaxThemeName: "dark-plus",
    },
    ...overrides,
  };
}

function createRowRender$(overrides: Partial<DiffRowRenderState> = {}) {
  return observable(createRowRenderState(overrides));
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
    const rowRender$ = createRowRender$();
    const view = await render(
      <DiffUnifiedRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={0}
        onToggleFileCollapsed={jest.fn()}
        rowRender$={rowRender$}
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

  it("explains when binary file previews are unavailable", async () => {
    const binaryFile = createFile({
      isBinary: true,
      path: "assets/logo.bin",
    });
    const view = await render(
      <DiffUnifiedRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={0}
        onToggleFileCollapsed={jest.fn()}
        rowRender$={createRowRender$({
          document: {
            ...createRowRenderState().document,
            fileByIndex: new Map([[binaryFile.index, binaryFile]]),
            fileByRowStart: new Map([[binaryFile.rowStart, binaryFile]]),
          },
        })}
        row={createRow({
          fileIndex: 0,
          index: 0,
          kind: diffRowKindFileHeader,
          newLineNumber: -1,
          oldLineNumber: -1,
          text: binaryFile.path,
        })}
      />,
    );

    expect(view.getByText("Binary file - preview unavailable")).toBeTruthy();
    expect(view.queryByText("+2")).toBeNull();
  });

  it("renders unified changed rows with the native row component", async () => {
    const view = await render(
      <DiffUnifiedRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={1}
        onToggleFileCollapsed={jest.fn()}
        rowRender$={createRowRender$({
          document: {
            ...createRowRenderState().document,
            current: {} as never,
            fileHeaderRowIndexes: new Set(),
          },
          presentation: {
            ...createRowRenderState().presentation,
            showOnlyHunks: false,
          },
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
        onToggleFileCollapsed={jest.fn()}
        rowRender$={createRowRender$({
          document: {
            ...createRowRenderState().document,
            current: {} as never,
          },
          presentation: {
            ...createRowRenderState().presentation,
            showOnlyHunks: false,
          },
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

  it("uses the file index when progressive file summaries share a row start", async () => {
    const firstFile = createFile({
      index: 0,
      path: "macos/LegendMusic-macOS/Sidebar/SidebarView.swift",
      rowStart: 0,
    });
    const unresolvedFile = createFile({
      index: 39,
      path: "src/windows/index.ts",
      rowCount: 0,
      rowStart: 0,
    });
    const view = await render(
      <DiffSideBySideRow
        adaptiveRender="normal"
        collapsedFileIndexes$={observable(new Set<number>())}
        index={0}
        onToggleFileCollapsed={jest.fn()}
        rowRender$={createRowRender$({
          document: {
            ...createRowRenderState().document,
            fileByIndex: new Map([
              [firstFile.index, firstFile],
              [unresolvedFile.index, unresolvedFile],
            ]),
            fileByRowStart: new Map([[unresolvedFile.rowStart, unresolvedFile]]),
            sideBySideFileHeaderByListIndex: new Map([[0, {
              fileIndex: firstFile.index,
              listIndex: 0,
              sourceStart: 0,
            }]]),
          },
        })}
        row={undefined}
      />,
    );

    expect(view.getByText("macos/LegendMusic-macOS/Sidebar/")).toBeTruthy();
    expect(view.getByText("SidebarView.swift")).toBeTruthy();
    expect(view.queryByText("src/windows/")).toBeNull();
    expect(view.queryByText("index.ts")).toBeNull();
  });
});

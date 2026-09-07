import { VirtualizedFixedDocumentList } from "@legend-apps/virtualized-document";
import { render } from "@testing-library/react-native";
import React, { useCallback } from "react";
import { Text } from "react-native";
import { DiffUnifiedInlineMergeDataSource } from "../diffUnifiedInlineMergeDataSource";

type Mode = "blocks" | "unified";

const { __legendListTestHooks } = jest.requireMock("@legendapp/list/react-native") as {
  __legendListTestHooks: {
    renderItems: Array<unknown>;
    reset: () => void;
  };
};

const ActiveModeContext = React.createContext<Mode>("unified");

function NativeModeRow({ configMode, row }: { configMode: Mode; row: string | undefined }) {
  const activeMode = React.useContext(ActiveModeContext);
  return configMode === activeMode ? <Text>{row}</Text> : null;
}

function ModeList({
  dataKey,
  mode,
  onRenderRow,
}: {
  dataKey?: string;
  mode: Mode;
  onRenderRow: (row: string | undefined) => void;
}) {
  return (
    <ActiveModeContext.Provider value={mode}>
      <VirtualizedFixedDocumentList
        dataKey={dataKey ?? mode}
        getRow={() => `${mode}-row`}
        itemIndexes={[0]}
        renderRow={({ row }) => {
          onRenderRow(row);
          return <NativeModeRow configMode={mode} row={row} />;
        }}
        requestRange={() => {}}
        rowHeight={20}
      />
    </ActiveModeContext.Provider>
  );
}

function ManyRowModeList({ itemCount, mode }: { itemCount: number; mode: Mode }) {
  return (
    <ActiveModeContext.Provider value={mode}>
      <VirtualizedFixedDocumentList
        dataKey="diff"
        getRow={(index) => `${mode}-row-${index}`}
        itemIndexes={Array.from({ length: itemCount }, (_, index) => index)}
        renderRow={({ row }) => <NativeModeRow configMode={mode} row={row} />}
        requestRange={() => {}}
        rowHeight={20}
      />
    </ActiveModeContext.Provider>
  );
}

function HydratingList({
  dataVersion,
  itemCount,
  rows,
}: {
  dataVersion: number;
  itemCount: number;
  rows: { current: string[] };
}) {
  const getRow = useCallback((index: number) => rows.current[index], [rows]);
  const renderRow = useCallback(({ index, row }: { index: number; row: string | undefined }) => (
    <Text>{row ?? `missing-${index}`}</Text>
  ), []);

  return (
    <VirtualizedFixedDocumentList
      dataKey="progressive-diff"
      dataVersion={dataVersion}
      getRow={getRow}
      itemIndexes={Array.from({ length: itemCount }, (_, index) => index)}
      renderRow={renderRow}
      requestRange={() => {}}
      rowHeight={20}
    />
  );
}

function DataSourceList({ dataSource }: { dataSource: DiffUnifiedInlineMergeDataSource }) {
  return (
    <VirtualizedFixedDocumentList
      dataKey="diff-data-source"
      dataSource={dataSource}
      getRow={(index) => `source-row-${index}`}
      renderRow={({ row }) => <Text>{row}</Text>}
      requestRange={() => {}}
      rowHeight={20}
    />
  );
}

describe("VirtualizedFixedDocumentList", () => {
  beforeEach(() => {
    __legendListTestHooks.reset();
  });

  it("does not render rows with stale native configuration after the dataset changes", async () => {
    const renderedRows: Array<string | undefined> = [];
    const view = await render(
      <ModeList mode="unified" onRenderRow={(row) => renderedRows.push(row)} />,
    );

    expect(view.getByText("unified-row")).toBeTruthy();
    renderedRows.length = 0;

    await view.rerender(
      <ModeList mode="blocks" onRenderRow={(row) => renderedRows.push(row)} />,
    );

    expect(view.getByText("blocks-row")).toBeTruthy();
    expect(renderedRows).toEqual(["blocks-row"]);
    expect(new Set(__legendListTestHooks.renderItems).size).toBe(1);
  });

  it("updates mounted rows through renderer context without replacing the list callback", async () => {
    const renderedRows: Array<string | undefined> = [];
    const view = await render(
      <ModeList dataKey="diff" mode="unified" onRenderRow={(row) => renderedRows.push(row)} />,
    );

    expect(view.getByText("unified-row")).toBeTruthy();
    renderedRows.length = 0;

    await view.rerender(
      <ModeList dataKey="diff" mode="blocks" onRenderRow={(row) => renderedRows.push(row)} />,
    );

    expect(view.getByText("blocks-row")).toBeTruthy();
    expect(renderedRows).toEqual(["blocks-row"]);
    expect(new Set(__legendListTestHooks.renderItems).size).toBe(1);
  });

  it("keeps every mounted row populated through repeated view-mode switches", async () => {
    const itemCount = 64;
    const view = await render(<ManyRowModeList itemCount={itemCount} mode="unified" />);

    expect(view.getAllByText(/^unified-row-/)).toHaveLength(itemCount);

    for (const mode of ["blocks", "unified", "blocks"] as const) {
      await view.rerender(<ManyRowModeList itemCount={itemCount} mode={mode} />);

      expect(view.getAllByText(new RegExp(`^${mode}-row-`))).toHaveLength(itemCount);
      expect(view.queryAllByText(new RegExp(`^${mode === "blocks" ? "unified" : "blocks"}-row-`))).toHaveLength(0);
    }

    expect(new Set(__legendListTestHooks.renderItems).size).toBe(1);
  });

  it("rechecks initially missing row data when the document version advances", async () => {
    const itemCount = 32;
    const rows = { current: [] as string[] };
    const view = await render(
      <HydratingList dataVersion={0} itemCount={itemCount} rows={rows} />,
    );

    expect(view.getAllByText(/^missing-/)).toHaveLength(itemCount);

    rows.current = Array.from({ length: itemCount }, (_, index) => `hydrated-${index}`);
    await view.rerender(
      <HydratingList dataVersion={1} itemCount={itemCount} rows={rows} />,
    );

    expect(view.getAllByText(/^hydrated-/)).toHaveLength(itemCount);
    expect(view.queryAllByText(/^missing-/)).toHaveLength(0);
  });

  it("keeps all rows rendered across structural data-source updates", async () => {
    const dataSource = new DiffUnifiedInlineMergeDataSource([0, 1, 2, 3]);
    const view = await render(<DataSourceList dataSource={dataSource} />);

    expect(view.getAllByText(/^source-row-/)).toHaveLength(4);

    await React.act(async () => {
      dataSource.update([10, 11, 0, 1, 2, 3]);
    });

    expect(view.getAllByText(/^source-row-/)).toHaveLength(6);
    expect(view.getByText("source-row-10")).toBeTruthy();
    expect(view.getByText("source-row-11")).toBeTruthy();
    expect(new Set(__legendListTestHooks.renderItems).size).toBe(1);
  });
});

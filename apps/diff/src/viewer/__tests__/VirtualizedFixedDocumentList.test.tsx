import { VirtualizedFixedDocumentList } from "@legend-apps/virtualized-document";
import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

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
});

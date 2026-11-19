import { act, render } from "@testing-library/react-native";
import React from "react";
import type { DiffDocument, DiffFileSummary } from "@legend-apps/diff-parser";
import { DiffViewerModelProvider, useDiffViewerModel, type DiffViewerModel } from "../../viewer/diffViewerModel";
import { DiffSearchStatusPanel } from "../DiffWindowChrome";

jest.mock("@legendapp/spark/drag-drop", () => ({}));

it("exposes the current file search result to accessibility", async () => {
  let model!: DiffViewerModel;
  function Status() {
    model = useDiffViewerModel();
    return <DiffSearchStatusPanel borderColor="#000" foregroundColor="#fff" mutedColor="#aaa" syntaxAppearance="dark" />;
  }
  const screen = await render(<DiffViewerModelProvider><Status /></DiffViewerModelProvider>);
  const document = { rowCount: 0 } as DiffDocument;
  const file = { index: 0, path: "src/NewFile.ts", rowStart: 0, rowCount: 0 } as DiffFileSummary;

  await act(() => {
    model.setViewerState({
      status: "loaded",
      document,
      files: [file],
      folderPath: "/repo",
      source: { kind: "folder", label: "repo", value: "/repo" },
      initialRows: [],
      timing: {} as never,
    });
    model.setSearchQuery("@NewFile.ts");
  });
  expect(screen.getByLabelText("Files, 1 of 1").props.accessible).toBe(true);

  await act(() => model.setSearchQuery("@miss"));
  expect(screen.getByLabelText("Files, No results").props.accessible).toBe(true);

  await act(() => model.setSearchQuery(""));
  expect(screen.queryByLabelText("Files, No results")).toBeNull();
});

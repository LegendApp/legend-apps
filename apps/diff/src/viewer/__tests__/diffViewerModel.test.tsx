import { act, render } from "@testing-library/react-native";
import { useValue } from "@legendapp/state/react";
import React from "react";
import { Text } from "react-native";
import type { DiffDocument, DiffFileSummary } from "@legend-apps/diff-parser";
import { DiffViewerModelProvider, useDiffViewerModel, type DiffViewerModel } from "../diffViewerModel";

it("isolates compare typing and search from the viewer owner", async () => {
  let model!: DiffViewerModel;
  let ownerRenders = 0;
  let promptRenders = 0;
  let searchRenders = 0;
  function Prompt() {
    promptRenders++;
    return <Text>{useValue(useDiffViewerModel().compareRefInput$)}</Text>;
  }
  function Search() {
    searchRenders++;
    const { searchResults$ } = useDiffViewerModel();
    return <Text>{useValue(() => searchResults$.get().length)}</Text>;
  }
  function Owner() {
    ownerRenders++;
    model = useDiffViewerModel();
    return <><Prompt /><Search /></>;
  }
  await render(<DiffViewerModelProvider><Owner /></DiffViewerModelProvider>);
  const initial = [ownerRenders, promptRenders, searchRenders];
  await act(() => model.compareRefInput$.set("main~2"));
  expect([ownerRenders, promptRenders, searchRenders]).toEqual([initial[0], initial[1] + 1, initial[2]]);
  const document = { rowCount: 0 } as DiffDocument;
  const file = { index: 0, path: "src/App.tsx", rowStart: 0, rowCount: 0 } as DiffFileSummary;
  await act(() => {
    model.setViewerState({ status: "loaded", document, files: [file], folderPath: "/repo", source: { kind: "folder", label: "repo", value: "/repo" }, initialRows: [], timing: {} as never });
    model.setSearchQuery("@App");
  });
  expect(model.searchResults$.peek()).toHaveLength(1);
  expect(ownerRenders).toBe(initial[0]);
  expect(promptRenders).toBe(initial[1] + 1);
  await act(() => {
    model.activeSearchResultIndex$.set(4);
    model.setSearchQuery("@missing");
  });
  expect(model.activeSearchResultIndex$.peek()).toBe(0);
  expect(model.searchResults$.peek()).toEqual([]);
});

import type { DiffDocument, DiffSideBySideProjection } from "@legend-apps/diff-parser";
import { render } from "@testing-library/react-native";
import React from "react";
import { useDiffLoadedModel } from "../diffLoadedDocumentModel";
import type { DiffViewerState } from "../diffViewerModel";

jest.mock("@legend-apps/virtualized-document", () => ({
  useVirtualizedDocumentRows: () => ({ itemIndexes: [0, 1, 2] }),
}));

function createDocument() {
  const disposed = jest.fn();
  const createProjection = jest.fn((initialCollapsed: number[]) => {
    const collapsed = new Set(initialCollapsed);
    let revision = 0;
    return {
      get revision() { return revision; },
      get rowCount() { return collapsed.has(0) ? 1 : 3; },
      getFileLocation: () => ({ itemId: 0, listIndex: 0 }),
      getItem: () => ({ sourceStart: 0 }),
      getHunkLocations: () => [],
      isFileCollapsed: (index: number) => collapsed.has(index),
      refresh: () => ({ previousRevision: revision, revision, splices: [] }),
      setFileCollapsed(index: number, value: boolean) {
        const previousRevision = revision++;
        if (value) collapsed.add(index);
        else collapsed.delete(index);
        return { changed: true, previousRevision, revision, splices: [] };
      },
      releaseNativeResources: disposed,
    } as unknown as DiffSideBySideProjection;
  });
  const document = { rowCount: 3, getTiming: () => ({}), createSideBySideProjection: createProjection } as unknown as DiffDocument;
  const state = {
    status: "loaded",
    document,
    files: [{ index: 0, path: "file.ts", rowStart: 0, rowCount: 3 }],
    initialRows: [],
  } as unknown as DiffViewerState;
  return { state, createProjection, disposed };
}

it("owns the projection by document and view mode while applying collapse updates in place", async () => {
  const first = createDocument();
  let model!: ReturnType<typeof useDiffLoadedModel>;
  function Owner({ state, collapsed, unified = false }: { state: DiffViewerState; collapsed: number[]; unified?: boolean }) {
    model = useDiffLoadedModel({
      state, collapsedFileIndexes: new Set(collapsed), viewMode: unified ? "unified" : "blocks",
      fontFamily: "monospace", fontSize: 12, rowHeight: 20, nativeUnifiedRows: true,
    });
    return null;
  }
  const screen = await render(<Owner state={first.state} collapsed={[0]} />);
  const source = model.sideBySideDataSource;
  expect(first.createProjection).toHaveBeenCalledWith([0]);
  expect(model.sideBySideRowCount).toBe(1);
  await screen.rerender(<Owner state={{ ...first.state }} collapsed={[]} />);
  expect(model.sideBySideDataSource).toBe(source);
  expect(model.sideBySideRowCount).toBe(3);
  expect(first.createProjection).toHaveBeenCalledTimes(1);
  const second = createDocument();
  await screen.rerender(<Owner state={second.state} collapsed={[0]} />);
  expect(model.sideBySideDataSource).not.toBe(source);
  expect(second.createProjection).toHaveBeenCalledWith([0]);
  expect(first.disposed).toHaveBeenCalledTimes(1);
  expect(model.sideBySideRowCount).toBe(1);
  await screen.rerender(<Owner state={second.state} collapsed={[0]} unified />);
  expect(model.sideBySideDataSource).toBeNull();
  expect(second.disposed).toHaveBeenCalledTimes(1);
  await screen.rerender(<Owner state={second.state} collapsed={[]} />);
  expect(second.createProjection).toHaveBeenCalledTimes(2);
  expect(model.sideBySideRowCount).toBe(3);
  await screen.unmount();
  expect(second.disposed).toHaveBeenCalledTimes(2);
});

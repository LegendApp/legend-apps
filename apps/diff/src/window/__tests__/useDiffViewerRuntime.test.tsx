import { observable } from "@legendapp/state";
import { renderHook } from "@testing-library/react-native";
import type { DiffDocument } from "@legend-apps/diff-parser";
import type { VirtualizedFixedDocumentListRef } from "@legend-apps/virtualized-document";
import type { DiffViewerState } from "../../viewer/diffViewerModel";
import type { DiffRefreshViewState } from "../diffWindowTypes";
import { useDiffViewerRuntime } from "../useDiffViewerRuntime";

jest.mock("../../viewer/DiffRows", () => ({ createDiffUnifiedHunkRowIndexSet: () => new Set() }));
jest.mock("../../viewer/diffLoadedDocumentModel", () => ({
  useDiffLoadedModel: () => ({}),
  useDiffSideBySideRuntime: () => ({ resetSideBySideRuntime: mockResetSideBySideRuntime }),
  useVisibleDiffFileTokenizationScheduler: () => jest.fn(),
}));

const mockResetSideBySideRuntime = jest.fn();

function state(id: number): DiffViewerState {
  return {
    status: "loaded", document: { documentId: id, rowCount: 10, stopBackgroundTokenization: jest.fn(), cancelTokenizationRequests: jest.fn(), releaseNativeResources: jest.fn() } as unknown as DiffDocument,
    files: [{ index: 0, path: "a.ts", oldPath: "a.ts" }, { index: 2, path: "renamed-z.ts", oldPath: "z.ts" }], initialRows: [],
  } as unknown as DiffViewerState;
}

it("restores selection and scroll after replacement without resetting collapsed files or sidebar folders", async () => {
  const first = state(1);
  const state$ = observable(first);
  const scrollToOffset = jest.fn(async () => {});
  const preserveViewStateRef = { current: null as DiffRefreshViewState | null };
  const setCollapsedSidebarFolders = jest.fn();
  const setCollapsedFileIndexesValue = jest.fn();
  const activeFileIndex$ = observable<number | null>(null);
  const options: Parameters<typeof useDiffViewerRuntime>[0] = {
    state: first, state$, setCollapsedSidebarFolders, collapsedFileIndexes: new Set([2]),
    fontFamily: "Menlo", fontSize: 12, nativeUnifiedRows: true, rowHeight: 20, renderViewMode: "unified", syntaxHighlightingEnabled: false,
    loadedCacheRef: { current: new Map() }, activeFileIndex$, diffPaneHeight$: observable(500), nativeSideBySideRows: false,
    syntaxTokenizationState$: observable({ ranges: "", version: 0 }), preserveViewStateRef,
    listRef: { current: { scrollToOffset } as unknown as VirtualizedFixedDocumentListRef }, setCollapsedFileIndexesValue,
  };
  let current = first;
  const hook = await renderHook(() => useDiffViewerRuntime({ ...options, state: current }));
  jest.clearAllMocks();
  preserveViewStateRef.current = { activeFilePath: "z.ts", scrollOffset: 640 };
  const second = state(2);
  state$.set(second);
  current = second;
  await hook.rerender(undefined);
  expect(activeFileIndex$.peek()).toBe(2);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 640, animated: false });
  expect(setCollapsedFileIndexesValue).not.toHaveBeenCalled();
  expect(setCollapsedSidebarFolders).not.toHaveBeenCalled();
  expect(preserveViewStateRef.current).toBeNull();
  await hook.unmount();
});

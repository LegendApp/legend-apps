import { observable } from "@legendapp/state";
import { renderHook } from "@testing-library/react-native";
import type { DiffDocument, DiffFileSummary } from "@legend-apps/diff-parser";
import type { VirtualizedFixedDocumentListRef } from "@legend-apps/virtualized-document";
import { findFileIndexForRow } from "../../viewer/diffLoadedDocumentIndexes";
import { diffTitlebarTopInset } from "../../viewer/diffViewerConstants";
import type { DiffViewerModel } from "../../viewer/diffViewerModel";
import { useDiffViewerNavigation } from "../useDiffViewerNavigation";

const rowHeight = 20;
const files = [
  { index: 0, path: "a.ts", rowStart: 0, rowCount: 10 },
  { index: 1, path: "b.ts", rowStart: 10, rowCount: 10 },
] as unknown as DiffFileSummary[];

// A list whose first unobscured row sits `obscuredTop` px below its top edge. Like the real list,
// it reports the first unobscured row as the top item, which drives the sidebar highlight.
async function renderNavigation(obscuredTop: number) {
  const activeFileIndex$ = observable<number | null>(null);
  const scrollToIndex = jest.fn(async ({ index, viewOffset = 0 }: { index: number; viewOffset?: number }) => {
    const topRow = Math.floor((index * rowHeight - viewOffset + obscuredTop) / rowHeight);
    activeFileIndex$.set(findFileIndexForRow(files, topRow));
  });
  const options = {
    loadedDocument: {} as DiffDocument, viewMode: "unified", unifiedHunkRowIndexSet: new Set<number>(),
    getVisibleListIndex: (rowIndex: number) => rowIndex, sideBySideHunkHeaderIndexes: new Set<number>(),
    listRef: { current: { scrollToIndex } as unknown as VirtualizedFixedDocumentListRef }, listTopInset: obscuredTop,
    sideBySideListIndexByRowIndex: new Map(), inlineListIndexByFileIndexRef: { current: new Map() },
    collapsedFileIndexList: [], sideBySideRowCount: 0, state$: observable({ status: "empty" }) as unknown as DiffViewerModel["state$"],
    activeFileIndex$, setCollapsedFileIndexesValue: jest.fn(), searchResults$: observable([]) as unknown as DiffViewerModel["searchResults$"],
    setActiveSearchResultIndex: jest.fn(), activeSearchResultIndex$: observable(-1) as unknown as DiffViewerModel["activeSearchResultIndex$"],
    searchQuery$: observable("") as unknown as DiffViewerModel["searchQuery$"], lastSubmittedSearchQueryRef: { current: "" }, setSearchQuery: jest.fn(),
  } as unknown as Parameters<typeof useDiffViewerNavigation>[0];
  return { activeFileIndex$, ...await renderHook(() => useDiffViewerNavigation(options)) };
}

it.each([
  ["content scrolls under the titlebar", diffTitlebarTopInset],
  ["a repository banner sits above the list", 0],
])("a sidebar file click keeps that file highlighted when %s", async (_case, obscuredTop) => {
  const { activeFileIndex$, result, unmount } = await renderNavigation(obscuredTop);
  activeFileIndex$.set(1);
  result.current.scrollToFile(files[1]);
  expect(activeFileIndex$.peek()).toBe(1);
  await unmount();
});

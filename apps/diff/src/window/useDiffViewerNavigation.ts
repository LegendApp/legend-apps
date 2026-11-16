import { type DiffDocument, type DiffFileSummary } from "@legend-apps/diff-parser";
import { type VirtualizedFixedDocumentListRef } from "@legend-apps/virtualized-document";
import type { RefObject } from "react";
import { useCallback, useMemo } from "react";
import { getDiffViewModeSetting } from "../diffSettings";
import { getAdjacentDiffHunkIndex } from "../viewer/diffHunkNavigation";
import { type DiffSearchResult, getDiffSearchSubmitIndex } from "../viewer/diffSearch";
import { diffTitlebarTopInset } from "../viewer/diffViewerConstants";
import type { DiffRecoverableError, DiffViewerModel } from "../viewer/diffViewerModel";

export function useDiffViewerNavigation({
    loadedDocument,
    viewMode,
    unifiedHunkRowIndexSet,
    getVisibleListIndex,
    sideBySideHunkHeaderIndexes,
    listRef,
    documentError,
    sideBySideListIndexByRowIndex,
    inlineListIndexByFileIndexRef,
    collapsedFileIndexList,
    sideBySideRowCount,
    state$,
    activeFileIndex$,
    setCollapsedFileIndexesValue,
    searchResults$,
    setActiveSearchResultIndex,
    activeSearchResultIndex$,
    searchQuery$,
    lastSubmittedSearchQueryRef,
    setSearchQuery,
}: {
    loadedDocument: DiffDocument | null;
    viewMode: ReturnType<typeof getDiffViewModeSetting>;
    unifiedHunkRowIndexSet: Set<number>;
    getVisibleListIndex: (rowIndex: number) => number | undefined;
    sideBySideHunkHeaderIndexes: Set<number>;
    listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
    documentError: DiffRecoverableError | null;
    sideBySideListIndexByRowIndex: Map<number, number>;
    inlineListIndexByFileIndexRef: RefObject<ReadonlyMap<number, number>>;
    collapsedFileIndexList: number[];
    sideBySideRowCount: number;
    state$: DiffViewerModel["state$"];
    activeFileIndex$: DiffViewerModel["activeFileIndex$"];
    setCollapsedFileIndexesValue: DiffViewerModel["setCollapsedFileIndexesValue"];
    searchResults$: DiffViewerModel["searchResults$"];
    setActiveSearchResultIndex: DiffViewerModel["activeSearchResultIndex$"]["set"];
    activeSearchResultIndex$: DiffViewerModel["activeSearchResultIndex$"];
    searchQuery$: DiffViewerModel["searchQuery$"];
    lastSubmittedSearchQueryRef: RefObject<string>;
    setSearchQuery: DiffViewerModel["setSearchQuery"];
}) {
    "use no memo";
    const hunkListIndexes = useMemo(() => {
        let indexes: number[] = [];
        if (loadedDocument) {
            if (viewMode === "unified") {
                indexes = [...unifiedHunkRowIndexSet]
                    .map((rowIndex) => getVisibleListIndex(rowIndex))
                    .filter((index): index is number => index !== undefined);
            }
            else {
                indexes = [...sideBySideHunkHeaderIndexes].sort((left, right) => left - right);
            }
        }
        return indexes;
    }, [getVisibleListIndex, loadedDocument, sideBySideHunkHeaderIndexes, unifiedHunkRowIndexSet, viewMode]);
    const navigateToHunk = useCallback((direction: -1 | 1) => {
        const list = listRef.current;
        const listState = list?.getState();
        const currentPosition = listState
            ? listState.scroll + (documentError ? diffTitlebarTopInset : 0)
            : 0;
        const targetIndex = getAdjacentDiffHunkIndex(hunkListIndexes, currentPosition, direction, listState?.positionAtIndex);
        let didNavigate = false;
        if (list && targetIndex !== null) {
            list.scrollToIndex({
                animated: true,
                index: targetIndex,
                viewOffset: diffTitlebarTopInset,
                viewPosition: 0,
            }).catch((error: unknown) => {
                console.error(error instanceof Error ? error.message : String(error));
            });
            didNavigate = true;
        }
        return didNavigate;
    }, [documentError, hunkListIndexes]);
    const navigateToNextHunk = useCallback(() => navigateToHunk(1), [navigateToHunk]);
    const navigateToPreviousHunk = useCallback(() => navigateToHunk(-1), [navigateToHunk]);
    const scrollToFile = useCallback((file: DiffFileSummary) => {
        const rowStart = Math.max(0, Math.floor(file.rowStart));
        const sourceListIndex = viewMode === "unified"
            ? getVisibleListIndex(rowStart)
            : sideBySideListIndexByRowIndex.get(rowStart);
        const listIndex = inlineListIndexByFileIndexRef.current.get(file.index) ?? sourceListIndex;
        if (listIndex !== undefined) {
            listRef.current?.scrollToIndex({
                animated: false,
                index: listIndex,
                viewOffset: diffTitlebarTopInset,
                viewPosition: 0,
            }).catch((error: unknown) => {
                console.error(error instanceof Error ? error.message : String(error));
            });
        }
    }, [getVisibleListIndex, sideBySideListIndexByRowIndex, viewMode]);
    const handleInlineListIndexesChanged = useCallback((indexes: ReadonlyMap<number, number>) => {
        inlineListIndexByFileIndexRef.current = indexes;
    }, []);
    const scrollToSearchListIndex = useCallback((listIndex: number) => {
        listRef.current?.scrollToIndex({
            animated: true,
            index: listIndex,
            viewOffset: diffTitlebarTopInset,
            viewPosition: 0.5,
        }).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
    }, []);
    const getSearchResultListIndex = useCallback((result: DiffSearchResult) => {
        if (viewMode === "unified") {
            return getVisibleListIndex(result.rowIndex);
        }
        if (!loadedDocument) {
            return undefined;
        }
        const collapsedIndexes = [...collapsedFileIndexList];
        const startIndex = sideBySideListIndexByRowIndex.get(result.rowIndex) ?? 0;
        for (let listIndex = startIndex; listIndex < sideBySideRowCount; listIndex += 1) {
            const row = loadedDocument.getPlainSideBySideRow(listIndex, collapsedIndexes);
            if (row.kind === "file-header") {
                if (row.sourceStart > result.rowIndex) {
                    break;
                }
            }
            else if (row.sourceStart <= result.rowIndex && result.rowIndex < row.sourceEnd) {
                return listIndex;
            }
        }
        return undefined;
    }, [
        collapsedFileIndexList,
        getVisibleListIndex,
        loadedDocument,
        sideBySideListIndexByRowIndex,
        sideBySideRowCount,
        viewMode,
    ]);
    const scrollToSearchResult = useCallback((result: DiffSearchResult) => {
        const currentState = state$.peek();
        if (currentState.status !== "loaded") {
            return;
        }
        const file = currentState.files.find((candidate) => candidate.index === result.fileIndex);
        if (!file) {
            return;
        }
        activeFileIndex$.set(result.fileIndex);
        if (result.kind === "file") {
            scrollToFile(file);
            return;
        }
        setCollapsedFileIndexesValue((currentIndexes) => {
            if (!currentIndexes.has(result.fileIndex)) {
                return currentIndexes;
            }
            const nextIndexes = new Set(currentIndexes);
            nextIndexes.delete(result.fileIndex);
            return nextIndexes;
        });
        const listIndex = getSearchResultListIndex(result);
        if (listIndex !== undefined) {
            scrollToSearchListIndex(listIndex);
        }
    }, [
        activeFileIndex$,
        getSearchResultListIndex,
        scrollToFile,
        scrollToSearchListIndex,
        setCollapsedFileIndexesValue,
        state$,
    ]);
    const activateSearchResult = useCallback((index: number, results: readonly DiffSearchResult[] = searchResults$.peek()) => {
        const resultCount = results.length;
        if (resultCount === 0) {
            return false;
        }
        const nextIndex = ((index % resultCount) + resultCount) % resultCount;
        setActiveSearchResultIndex(nextIndex);
        const result = results[nextIndex];
        if (result) {
            scrollToSearchResult(result);
        }
        return true;
    }, [scrollToSearchResult, searchResults$, setActiveSearchResultIndex]);
    const advanceSearchResult = useCallback((delta: number) => {
        return activateSearchResult(Math.min(activeSearchResultIndex$.peek(), Math.max(0, searchResults$.peek().length - 1)) + delta);
    }, [activateSearchResult, activeSearchResultIndex$, searchResults$]);
    const handleSearchChange = useCallback((value: string) => {
        if (value !== searchQuery$.peek()) {
            lastSubmittedSearchQueryRef.current = "";
        }
        setSearchQuery(value);
    }, [searchQuery$, setSearchQuery]);
    const handleSearchSubmit = useCallback((value: string, direction: 1 | -1) => {
        const existingQuery = value === lastSubmittedSearchQueryRef.current;
        lastSubmittedSearchQueryRef.current = value;
        setSearchQuery(value);
        const results = searchResults$.peek();
        const nextIndex = getDiffSearchSubmitIndex({
            activeIndex: Math.min(activeSearchResultIndex$.peek(), Math.max(0, searchResults$.peek().length - 1)),
            direction,
            repeatedQuery: existingQuery,
            resultCount: results.length,
        });
        return activateSearchResult(nextIndex, results);
    }, [activateSearchResult, setSearchQuery, searchResults$, activeSearchResultIndex$]);
    return { navigateToNextHunk, navigateToPreviousHunk, scrollToFile, handleInlineListIndexesChanged, handleSearchChange, handleSearchSubmit, advanceSearchResult };
}

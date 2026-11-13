import { nowMs } from "@legend-apps/source-viewer";
import { ensureTreeGrammarsForPaths } from "@legend-apps/syntax-parser";
import { type VirtualizedFixedDocumentListRef, type VirtualizedDocumentVisibleRangeInfo } from "@legend-apps/virtualized-document";
import { type Observable } from "@legendapp/state";
import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { DiffFontFamilySetting } from "../diffSettings";
import { getDiffViewModeSetting } from "../diffSettings";
import { findFileIndexForRow, getFilesForSourceRowRange, useDiffLoadedModel, useDiffSideBySideRuntime, useVisibleDiffFileTokenizationScheduler } from "../viewer/diffLoadedDocumentModel";
import { createDiffUnifiedHunkRowIndexSet } from "../viewer/DiffRows";
import { diffBackgroundTokenizeChunkBudgetMs, diffBackgroundTokenizeChunkRowCount, diffBackgroundTokenizePollMs, diffBackgroundTokenizeStartDelayMs, diffProgressiveInitialPaintRowCount, diffProgressiveItemCountExpandChunkRowCount, diffProgressiveItemCountExpandThresholdRows } from "../viewer/diffViewerConstants";
import type { DiffViewerModel, DiffViewerState } from "../viewer/diffViewerModel";
import { getErrorMessage } from "../viewer/diffViewerSupport";
import { getBackgroundTokenizationPlan } from "./diffWindowRendering";
import { type DiffItemCountLimitState, type DiffRefreshViewState, type DiffLoadedCacheEntry } from "./diffWindowTypes";
import { disposeDiffDocument } from "./useDiffSourceLoader";

export function useDiffViewerRuntime({
    state,
    setCollapsedSidebarFolders,
    collapsedFileIndexes,
    fontFamily,
    fontSize,
    nativeUnifiedRows,
    rowHeight,
    renderViewMode,
    syntaxHighlightingEnabled,
    loadedCacheRef,
    state$,
    activeFileIndex$,
    diffPaneHeight$,
    nativeSideBySideRows,
    syntaxTokenizationState$,
    preserveViewStateRef,
    listRef,
    setCollapsedFileIndexesValue,
}: {
    state: DiffViewerState;
    setCollapsedSidebarFolders: (next: Set<string> | ((current: Set<string>) => Set<string>)) => void;
    collapsedFileIndexes: Set<number>;
    fontFamily: DiffFontFamilySetting;
    fontSize: number;
    nativeUnifiedRows: boolean;
    rowHeight: number;
    renderViewMode: ReturnType<typeof getDiffViewModeSetting>;
    syntaxHighlightingEnabled: boolean;
    loadedCacheRef: RefObject<Map<string, DiffLoadedCacheEntry>>;
    state$: DiffViewerModel["state$"];
    activeFileIndex$: DiffViewerModel["activeFileIndex$"];
    diffPaneHeight$: DiffViewerModel["diffPaneHeight$"];
    nativeSideBySideRows: boolean;
    syntaxTokenizationState$: Observable<{ ranges: string; version: number; }>;
    preserveViewStateRef: RefObject<DiffRefreshViewState | null>;
    listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
    setCollapsedFileIndexesValue: DiffViewerModel["setCollapsedFileIndexesValue"];
}) {
    "use no memo";
    const loadedDocument = state.status === "loaded" ? state.document : null;
    const loadedDocumentId = loadedDocument?.documentId ?? 0;
    const loadedDocumentRowCount = loadedDocument ? Math.max(0, Math.floor(loadedDocument.rowCount)) : 0;
    const [itemCountLimitState, setItemCountLimitState] = useState<DiffItemCountLimitState | null>(null);
    const currentItemCountLimit = itemCountLimitState?.documentId === loadedDocumentId
        ? itemCountLimitState.limit
        : diffProgressiveInitialPaintRowCount;
    const isProgressiveLoadIncomplete = state.status === "loaded" && state.loadComplete === false;
    const initialItemCountLimit = loadedDocument !== null &&
        isProgressiveLoadIncomplete &&
        loadedDocumentRowCount > diffProgressiveInitialPaintRowCount
        ? Math.min(loadedDocumentRowCount, currentItemCountLimit)
        : null;
    const { collapsedFileIndexList, diffRows, fileHeaderRowIndexes, getRow, getVisibleListIndex, sideBySideFileHeaderByListIndex, sideBySideHunkHeaderIndexes, sideBySideDataSource, sideBySideListIndexByRowIndex, sideBySideRowCount, visibleItemIndexes, } = useDiffLoadedModel({
        collapsedFileIndexes,
        fontFamily,
        fontSize,
        initialItemCountLimit,
        nativeUnifiedRows,
        rowHeight,
        state,
        viewMode: renderViewMode,
    });
    // Progressive documents append hunk indexes without changing identity, so row count invalidates this snapshot.
    const unifiedHunkRowIndexSet = useMemo(() => createDiffUnifiedHunkRowIndexSet(renderViewMode === "unified" ? loadedDocument : null), [loadedDocument, loadedDocumentRowCount, renderViewMode]);
    const scheduleVisibleFileTokenization = useVisibleDiffFileTokenizationScheduler(syntaxHighlightingEnabled);
    useEffect(() => {
        if (loadedDocument) {
            return () => {
                const isCached = [...loadedCacheRef.current.values()].some((entry) => entry.loaded.document === loadedDocument);
                const currentState = state$.peek();
                const isCurrent = currentState.status === "loaded" && currentState.document === loadedDocument;
                if (isCached || isCurrent) {
                    loadedDocument.cancelTokenizationRequests("viewer.cleanup");
                }
                else {
                    disposeDiffDocument(loadedDocument, "viewer.cleanup");
                }
            };
        }
        return undefined;
    }, [loadedDocument, state$]);
    const { getSideBySideRow, handleSideBySideTopItemChanged, handleSideBySideVisibleRowsRequested, requestSideBySideRange, resetSideBySideRuntime, } = useDiffSideBySideRuntime({
        activeFileIndex$,
        diffPaneHeight$,
        nativeSideBySideRows,
        rowHeight,
        sideBySideDataSource,
        sideBySideRowCount,
        state$,
        syntaxHighlightingEnabled,
        viewMode: renderViewMode,
    });
    const expandItemCountLimit = useCallback((documentId: number, requestedMinimum: number, reason: string) => {
        setItemCountLimitState((current) => {
            let nextState = current;
            if (loadedDocument !== null && loadedDocumentId === documentId && loadedDocumentRowCount > diffProgressiveInitialPaintRowCount) {
                const currentLimit = current?.documentId === documentId
                    ? current.limit
                    : diffProgressiveInitialPaintRowCount;
                const nextLimit = Math.min(loadedDocumentRowCount, Math.max(Math.ceil(requestedMinimum), currentLimit + diffProgressiveItemCountExpandChunkRowCount));
                if (nextLimit > currentLimit) {
                    nextState = {
                        documentId,
                        limit: nextLimit,
                    };
                }
            }
            return nextState;
        });
    }, [loadedDocument, loadedDocumentId, loadedDocumentRowCount]);
    const maybeExpandItemCountLimitForVisibleRange = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo, viewKind: string) => {
        const isDemandRequest = info.reason === "scroll" || info.reason === "highlight";
        if (isDemandRequest && loadedDocument !== null && initialItemCountLimit !== null) {
            const visibleEnd = Math.max(0, Math.floor(start)) + Math.max(0, Math.ceil(count));
            const requestedMinimum = visibleEnd + diffProgressiveItemCountExpandThresholdRows;
            if (requestedMinimum >= initialItemCountLimit) {
                const reason = `${viewKind}:${info.reason}`;
                expandItemCountLimit(loadedDocumentId, requestedMinimum, reason);
            }
        }
    }, [expandItemCountLimit, initialItemCountLimit, loadedDocument, loadedDocumentId]);
    useEffect(() => {
        if (state.status === "loaded" && state.loadComplete !== false) {
            const document = state.document;
            if (syntaxHighlightingEnabled) {
                let cancelled = false;
                let startTimeout: ReturnType<typeof setTimeout> | undefined;
                const startedAt = nowMs();
                startTimeout = setTimeout(() => {
                    const backgroundPlan = getBackgroundTokenizationPlan(state.files);
                    if (backgroundPlan.files.length > 0 && backgroundPlan.rowLimit > 0) {
                        const backgroundFiles = backgroundPlan.files;
                        const filePaths = backgroundFiles.map((file) => file.path);
                        ensureTreeGrammarsForPaths(filePaths)
                            .then(() => {
                            if (!cancelled) {
                                document.startBackgroundTokenization(diffBackgroundTokenizeChunkRowCount, diffBackgroundTokenizeChunkBudgetMs, backgroundPlan.rowLimit, backgroundPlan.sourceLineCount);
                            }
                        })
                            .catch((error: unknown) => {
                            console.error(getErrorMessage(error));
                        });
                    }
                    else {
                    }
                }, diffBackgroundTokenizeStartDelayMs);
                return () => {
                    cancelled = true;
                    if (startTimeout) {
                        clearTimeout(startTimeout);
                    }
                    document.stopBackgroundTokenization();
                };
            }
            document.stopBackgroundTokenization();
        }
        return undefined;
    }, [
        state.status === "loaded" ? state.document : null,
        state.status === "loaded" ? state.loadComplete : true,
        syntaxHighlightingEnabled,
    ]);
    useEffect(() => {
        if (state.status === "loaded" && state.loadComplete !== false && syntaxHighlightingEnabled) {
            const document = state.document;
            const updateTokenizationVersion = () => {
                const tokenizationVersion = document.getTokenizedRowVersion();
                if (syntaxTokenizationState$.version.peek() !== tokenizationVersion) {
                    const ranges = document.consumeTokenizedRowRanges()
                        .map((range) => `${Math.floor(range.start)}:${Math.ceil(range.end)}`)
                        .join(",");
                    syntaxTokenizationState$.set({ ranges, version: tokenizationVersion });
                }
            };
            updateTokenizationVersion();
            const intervalHandle = setInterval(updateTokenizationVersion, diffBackgroundTokenizePollMs);
            return () => {
                clearInterval(intervalHandle);
            };
        }
        if (syntaxTokenizationState$.version.peek() !== 0) {
            syntaxTokenizationState$.set({ ranges: "", version: 0 });
        }
        return undefined;
    }, [
        state.status === "loaded" ? state.document : null,
        state.status === "loaded" ? state.loadComplete : true,
        syntaxHighlightingEnabled,
        syntaxTokenizationState$,
    ]);
    useLayoutEffect(() => {
        resetSideBySideRuntime();
        if (state.status === "loaded") {
            const preserved = preserveViewStateRef.current;
            preserveViewStateRef.current = null;
            if (preserved) {
                const preservedFile = state.files.find((file) => file.path === preserved.activeFilePath || file.oldPath === preserved.activeFilePath);
                activeFileIndex$.set(preservedFile?.index ?? state.files[0]?.index ?? null);
                if (preserved.scrollOffset !== undefined) listRef.current?.scrollToOffset({ offset: preserved.scrollOffset, animated: false });
            }
            else {
                setCollapsedSidebarFolders(new Set());
                activeFileIndex$.set(state.files[0]?.index ?? null);
                setCollapsedFileIndexesValue((current) => current.size > 0 ? new Set() : current);
            }
        }
        else {
            activeFileIndex$.set(null);
        }
    }, [
        activeFileIndex$,
        resetSideBySideRuntime,
        setCollapsedFileIndexesValue,
        setCollapsedSidebarFolders,
        listRef,
        preserveViewStateRef,
        state.status === "loaded" ? state.document : null,
    ]);
    const handleVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
        maybeExpandItemCountLimitForVisibleRange(start, count, info, "unified");
        const currentState = state$.peek();
        if (syntaxHighlightingEnabled && currentState.status === "loaded" && currentState.loadComplete !== false) {
            const files = getFilesForSourceRowRange(currentState.files, start, count);
            scheduleVisibleFileTokenization(currentState.document, files, info);
        }
    }, [maybeExpandItemCountLimitForVisibleRange, scheduleVisibleFileTokenization, state$, syntaxHighlightingEnabled]);
    const handleLimitedSideBySideVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
        maybeExpandItemCountLimitForVisibleRange(start, count, info, "side-by-side");
        handleSideBySideVisibleRowsRequested(start, count, info);
    }, [handleSideBySideVisibleRowsRequested, maybeExpandItemCountLimitForVisibleRange]);
    const handleTopItemChanged = useCallback((rowIndex: number) => {
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
            const nextFileIndex = findFileIndexForRow(currentState.files, rowIndex);
            if (activeFileIndex$.peek() !== nextFileIndex) {
                activeFileIndex$.set(nextFileIndex);
            }
        }
    }, [activeFileIndex$, state$]);
    return { loadedDocument, loadedDocumentId, unifiedHunkRowIndexSet, collapsedFileIndexList, diffRows, fileHeaderRowIndexes, getRow, getVisibleListIndex, sideBySideFileHeaderByListIndex, sideBySideHunkHeaderIndexes, sideBySideDataSource, sideBySideListIndexByRowIndex, sideBySideRowCount, visibleItemIndexes, getSideBySideRow, handleSideBySideTopItemChanged, requestSideBySideRange, handleVisibleRowsRequested, handleLimitedSideBySideVisibleRowsRequested, handleTopItemChanged };
}

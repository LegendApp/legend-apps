import {
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSideBySideFileHeader,
  type DiffSideBySideRenderRow,
  type DiffSyntaxStyle,
} from "@legend-apps/diff-parser";
import { nowMs } from "@legend-apps/source-viewer";
import { ensureSyntaxGrammarsForPaths } from "@legend-apps/syntax-parser";
import {
  useVirtualizedDocumentRows,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedDocumentSnapshot,
  type VirtualizedDocumentVisibleRangeInfo,
} from "@legend-apps/virtualized-document";
import type { Observable } from "@legendapp/state";
import { useObserveEffect } from "@legendapp/state/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { DiffSettingsFile } from "../diffSettings";
import {
  diffProgressiveInitialPaintRowCount,
  diffVisibleFileTokenizeIdleMs,
  diffVisibleFileTokenizeMaxScrollVelocity,
} from "./diffViewerConstants";
import {
  createCollapsedFileIndexList,
  createSideBySideFileHeaderIndexes,
  createSideBySideListIndexByRowIndex,
  createVisibleDiffRowIndexes,
  findFileIndexForRow,
} from "./diffLoadedDocumentIndexes";
import type { DiffViewerState } from "./diffViewerModel";
import { logDiffOpenTiming } from "./diffViewerSupport";
import { DiffSideBySideDataSource } from "./diffSideBySideDataSource";

export {
  createCollapsedFileIndexList,
  createIdentityDiffRowIndexes,
  createSideBySideFileHeaderIndexes,
  createSideBySideListIndexByRowIndex,
  createVisibleDiffRowIndexes,
  findFileIndexForRow,
  getBoundedSideBySideFileHeaders,
  getBoundedSideBySideLayoutMetadata,
  getBoundedSideBySideRowCount,
} from "./diffLoadedDocumentIndexes";

const emptyDiffRenderRows: readonly DiffRenderRow[] = [];

function getSyntaxPathsForFiles(files: readonly DiffFileSummary[]) {
  const paths: string[] = [];
  const seen = new Set<string>();
  files.forEach((file) => {
    [file.path, file.oldPath].forEach((path) => {
      if (path && !seen.has(path)) {
        seen.add(path);
        paths.push(path);
      }
    });
  });
  return paths;
}

export function getFilesForSourceRowRange(files: readonly DiffFileSummary[], start: number, count: number) {
  const rangeStart = Math.max(0, Math.floor(start));
  const rangeEnd = rangeStart + Math.max(0, Math.ceil(count));
  if (rangeStart >= rangeEnd) {
    return [];
  }

  return files.filter((file) => {
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const rowEnd = rowStart + Math.max(0, Math.floor(file.rowCount));
    return rowStart < rangeEnd && rowEnd > rangeStart;
  });
}

function getDiffFileIndexes(files: readonly DiffFileSummary[]) {
  const indexes: number[] = [];
  const seen = new Set<number>();
  for (const file of files) {
    const index = Math.max(0, Math.floor(file.index));
    if (!seen.has(index)) {
      seen.add(index);
      indexes.push(index);
    }
  }
  return indexes;
}

function requestTokenizedFilesAfterGrammarLoad({
  document,
  files,
  reason,
}: {
  document: DiffDocument;
  files: readonly DiffFileSummary[];
  reason: VirtualizedDocumentRequestReason;
}) {
  const fileIndexes = getDiffFileIndexes(files);
  if (fileIndexes.length === 0) {
    return;
  }

  const paths = getSyntaxPathsForFiles(files);
  if (paths.length === 0) {
    document.requestTokenizedFiles(fileIndexes, reason);
    return;
  }

  ensureSyntaxGrammarsForPaths(paths)
    .then(() => {
      document.requestTokenizedFiles(fileIndexes, reason);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
}

export function requestDiffTokenizedFiles(
  document: DiffDocument,
  files: readonly DiffFileSummary[],
  reason: VirtualizedDocumentRequestReason,
) {
  requestTokenizedFilesAfterGrammarLoad({
    document,
    files,
    reason,
  });
}

export function useVisibleDiffFileTokenizationScheduler(syntaxHighlightingEnabled: boolean) {
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRequestRef = useRef<{
    document: DiffDocument;
    files: readonly DiffFileSummary[];
    reason: VirtualizedDocumentRequestReason;
  } | null>(null);

  const flushPendingRequest = useCallback(() => {
    const pendingRequest = pendingRequestRef.current;
    pendingRequestRef.current = null;
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    if (pendingRequest) {
      requestDiffTokenizedFiles(pendingRequest.document, pendingRequest.files, pendingRequest.reason);
    }
  }, []);

  const scheduleVisibleFiles = useCallback((document: DiffDocument, files: readonly DiffFileSummary[], info: VirtualizedDocumentVisibleRangeInfo) => {
    if (syntaxHighlightingEnabled && files.length > 0) {
      pendingRequestRef.current = {
        document,
        files,
        reason: info.reason,
      };

      if (info.reason !== "scroll" || info.scrollVelocity <= diffVisibleFileTokenizeMaxScrollVelocity) {
        flushPendingRequest();
      } else {
        if (idleTimeoutRef.current) {
          clearTimeout(idleTimeoutRef.current);
        }
        idleTimeoutRef.current = setTimeout(flushPendingRequest, diffVisibleFileTokenizeIdleMs);
      }
    }
  }, [flushPendingRequest, syntaxHighlightingEnabled]);

  useEffect(() => () => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    pendingRequestRef.current = null;
  }, []);

  return scheduleVisibleFiles;
}

export function useDiffLoadedModel({
  collapsedFileIndexes,
  initialItemCountLimit,
  nativeUnifiedRows,
  state,
  viewMode,
}: {
  collapsedFileIndexes: ReadonlySet<number>;
  fontFamily: string;
  fontSize: number;
  initialItemCountLimit?: number | null;
  nativeUnifiedRows: boolean;
  rowHeight: number;
  state: DiffViewerState;
  viewMode: DiffSettingsFile["viewMode"];
}) {
  const modelStartedAt = nowMs();
  const snapshotDocument = state.status === "loaded" ? state.document : null;
  const snapshotLoadComplete = state.status === "loaded" ? state.loadComplete !== false : true;
  const snapshotRowCount = snapshotDocument ? Math.max(0, Math.floor(snapshotDocument.rowCount)) : 0;
  const snapshotItemCountLimit = snapshotDocument
    ? initialItemCountLimit ?? (!snapshotLoadComplete ? diffProgressiveInitialPaintRowCount : null)
    : null;
  const snapshotItemCount = snapshotDocument
    ? snapshotItemCountLimit !== null
      ? Math.min(snapshotRowCount, snapshotItemCountLimit)
      : snapshotRowCount
    : 0;
  const snapshotInitialRows = state.status === "loaded" && state.initialRows.length > 0
    ? state.initialRows
    : emptyDiffRenderRows;
  const snapshot = useMemo<VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming> | null>(
    () => {
      const startedAt = nowMs();
      let nextSnapshot: VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming> | null = null;
      if (snapshotDocument) {
        nextSnapshot = {
          document: snapshotDocument,
          initialRows: snapshotInitialRows,
          itemCount: snapshotItemCount,
          styles: [],
          timing: snapshotDocument.getTiming(),
        };
        logDiffOpenTiming("viewer.derive.snapshot", () => ({
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          initialItemCountLimit: snapshotItemCountLimit,
          initialRows: snapshotInitialRows.length,
          itemCount: snapshotItemCount,
          loadComplete: snapshotLoadComplete,
          rows: snapshotRowCount,
          scopes: snapshotDocument.scopeCount,
        }));
      }
      return nextSnapshot;
    },
    [
      snapshotDocument,
      snapshotInitialRows,
      snapshotItemCount,
    ],
  );
  const requestRows = useCallback((document: DiffDocument, start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const startedAt = nowMs();
    logDiffOpenTiming("viewer.rowsFetched", () => ({
      count,
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      reason: options?.reason ?? "unknown",
      rows: count,
      start,
      tokenized: false,
    }));
    return undefined;
  }, []);
  const getTiming = useCallback((document: DiffDocument) => document.getTiming(), []);
  const diffRows = useVirtualizedDocumentRows({
    debugName: "diff",
    getTiming,
    requestRows: nativeUnifiedRows ? undefined : requestRows,
    snapshot,
  });
  const getRow = useCallback((index: number) => {
    if (!nativeUnifiedRows && state.status === "loaded") {
      return state.document.getRow(index).plain;
    }
    return undefined;
  }, [nativeUnifiedRows, state]);
  const fileHeaderRowIndexes = useMemo(() => {
    const startedAt = nowMs();
    if (state.status !== "loaded") {
      return new Set<number>();
    }
    const indexes = new Set<number>();
    for (const file of state.files) {
      indexes.add(Math.max(0, Math.floor(file.rowStart)));
    }
    logDiffOpenTiming("viewer.derive.fileHeaderRowIndexes", () => ({
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      files: state.files.length,
      rows: state.document.rowCount,
    }));
    return indexes;
  }, [state]);
  const visibleItemIndexes = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = state.status === "loaded" && collapsedFileIndexes.size > 0
        ? createVisibleDiffRowIndexes(state.files, collapsedFileIndexes, diffRows.itemIndexes)
        : diffRows.itemIndexes;
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.visibleItemIndexes", () => ({
          collapsedFiles: collapsedFileIndexes.size,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          items: indexes.length,
          rows: state.document.rowCount,
        }));
      }
      return indexes;
    },
    [collapsedFileIndexes, diffRows.itemIndexes, state],
  );
  const visibleListIndexByRowIndex = useMemo(() => {
    const startedAt = nowMs();
    let indexes: Map<number, number> | null = null;
    if (collapsedFileIndexes.size > 0) {
      indexes = new Map<number, number>();
      visibleItemIndexes.forEach((rowIndex, listIndex) => {
        indexes?.set(rowIndex ?? listIndex, listIndex);
      });
    }
    if (state.status === "loaded") {
      logDiffOpenTiming("viewer.derive.visibleListIndexByRowIndex", () => ({
        collapsedFiles: collapsedFileIndexes.size,
        durationMs: Number((nowMs() - startedAt).toFixed(1)),
        eagerMap: indexes !== null,
        items: visibleItemIndexes.length,
        rows: state.document.rowCount,
      }));
    }
    return indexes;
  }, [collapsedFileIndexes, state, visibleItemIndexes]);
  const getVisibleListIndex = useCallback((rowIndex: number) => (
    visibleListIndexByRowIndex
      ? visibleListIndexByRowIndex.get(rowIndex)
      : rowIndex >= 0 && rowIndex < visibleItemIndexes.length
        ? rowIndex
        : undefined
  ), [visibleItemIndexes.length, visibleListIndexByRowIndex]);
  const collapsedFileIndexList = useMemo(
    () => createCollapsedFileIndexList(collapsedFileIndexes),
    [collapsedFileIndexes],
  );
  const sideBySideDataSource = useMemo(
    () => state.status === "loaded" && viewMode !== "unified"
      ? new DiffSideBySideDataSource(state.document, collapsedFileIndexList)
      : null,
    [state.status === "loaded" ? state.document : null, viewMode === "unified"],
  );
  useEffect(() => () => {
    sideBySideDataSource?.dispose();
  }, [sideBySideDataSource]);
  const subscribeToSideBySideDataSource = useCallback(
    (onStoreChange: () => void) => sideBySideDataSource?.subscribe(onStoreChange) ?? (() => {}),
    [sideBySideDataSource],
  );
  const getSideBySideRevision = useCallback(
    () => sideBySideDataSource?.getRevision() ?? 0,
    [sideBySideDataSource],
  );
  const sideBySideRevision = useSyncExternalStore(
    subscribeToSideBySideDataSource,
    getSideBySideRevision,
    getSideBySideRevision,
  );
  useLayoutEffect(() => {
    if (sideBySideDataSource && state.status === "loaded") {
      sideBySideDataSource.refresh();
      for (const file of state.files) {
        const collapsed = collapsedFileIndexes.has(file.index);
        if (sideBySideDataSource.isFileCollapsed(file.index) !== collapsed) {
          sideBySideDataSource.setFileCollapsed(file.index, collapsed);
        }
      }
    }
  }, [collapsedFileIndexes, sideBySideDataSource, state]);
  const sideBySideRowCount = useMemo(
    () => {
      const startedAt = nowMs();
      const isInitialCountLimited = initialItemCountLimit !== null && initialItemCountLimit !== undefined;
      const fullCount = sideBySideDataSource?.getLength() ?? 0;
      const count = state.status === "loaded" && viewMode !== "unified"
        ? isInitialCountLimited
          ? Math.min(fullCount, initialItemCountLimit)
          : fullCount
        : 0;
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideRowCount", () => ({
          collapsedFiles: collapsedFileIndexList.length,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          initialItemCountLimit,
          rows: state.document.rowCount,
          sideBySideRows: count,
          viewMode,
        }));
      }
      return count;
    },
    [initialItemCountLimit, sideBySideDataSource, sideBySideRevision, state, viewMode],
  );
  const sideBySideLayoutMetadata = useMemo(
    () => {
      const startedAt = nowMs();
      const metadata = state.status === "loaded" && viewMode !== "unified" && sideBySideDataSource
        ? {
            fileHeaders: state.files.flatMap((file) => {
              const location = sideBySideDataSource.getFileLocation(file.index);
              if (location.listIndex < 0 || location.listIndex >= sideBySideRowCount) {
                return [];
              }
              const item = sideBySideDataSource.getItemMetadata(location.itemId);
              return [{
                fileIndex: file.index,
                listIndex: location.listIndex,
                sourceStart: item.sourceStart,
              }];
            }),
            hunkHeaderIndexes: new Set(
              sideBySideDataSource.getHunkLocations()
                .map((location) => location.listIndex)
                .filter((index) => index >= 0 && index < sideBySideRowCount),
            ),
          }
        : {
            fileHeaders: [],
            hunkHeaderIndexes: new Set<number>(),
          };
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideLayoutMetadata", () => ({
          collapsedFiles: collapsedFileIndexList.length,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: metadata.fileHeaders.length,
          hunkHeaders: metadata.hunkHeaderIndexes.size,
          initialItemCountLimit,
          rows: state.document.rowCount,
          viewMode,
        }));
      }
      return metadata;
    },
    [initialItemCountLimit, sideBySideDataSource, sideBySideRevision, sideBySideRowCount, state, viewMode],
  );
  const sideBySideFileHeaders = sideBySideLayoutMetadata.fileHeaders;
  const sideBySideHunkHeaderIndexes = sideBySideLayoutMetadata.hunkHeaderIndexes;
  const sideBySideFileHeaderIndexes = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = createSideBySideFileHeaderIndexes(sideBySideFileHeaders);
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideFileHeaderIndexes", () => ({
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: sideBySideFileHeaders.length,
          rows: state.document.rowCount,
        }));
      }
      return indexes;
    },
    [sideBySideFileHeaders, state],
  );
  const sideBySideFileHeaderByListIndex = useMemo(
    () => {
      const map = new Map<number, DiffSideBySideFileHeader>();
      for (const header of sideBySideFileHeaders) {
        map.set(header.listIndex, header);
      }
      return map;
    },
    [sideBySideFileHeaders],
  );
  const sideBySideListIndexByRowIndex = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = createSideBySideListIndexByRowIndex(sideBySideFileHeaders);
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideListIndexByRowIndex", () => ({
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: sideBySideFileHeaders.length,
          rows: state.document.rowCount,
        }));
      }
      return indexes;
    },
    [sideBySideFileHeaders, state],
  );

  if (state.status === "loaded") {
    logDiffOpenTiming("viewer.derive.model.finish", () => ({
      collapsedFiles: collapsedFileIndexList.length,
      durationMs: Number((nowMs() - modelStartedAt).toFixed(1)),
      initialItemCountLimit,
      itemCount: diffRows.itemIndexes.length,
      rows: state.document.rowCount,
      sideBySideRows: sideBySideRowCount,
      visibleItemCount: visibleItemIndexes.length,
      viewMode,
    }));
  }

  return {
    collapsedFileIndexList,
    diffRows,
    fileHeaderRowIndexes,
    getRow,
    getVisibleListIndex,
    sideBySideFileHeaderIndexes,
    sideBySideFileHeaderByListIndex,
    sideBySideHunkHeaderIndexes,
    sideBySideDataSource,
    sideBySideListIndexByRowIndex,
    sideBySideRowCount,
    visibleItemIndexes,
  };
}

export function useDiffSideBySideRuntime({
  activeFileIndex$,
  diffPaneHeight$,
  nativeSideBySideRows,
  rowHeight,
  sideBySideRowCount,
  sideBySideDataSource,
  state$,
  syntaxHighlightingEnabled,
  viewMode,
}: {
  activeFileIndex$: Observable<number | null>;
  diffPaneHeight$: Observable<number>;
  nativeSideBySideRows: boolean;
  rowHeight: number;
  sideBySideRowCount: number;
  sideBySideDataSource: DiffSideBySideDataSource | null;
  state$: Observable<DiffViewerState>;
  syntaxHighlightingEnabled: boolean;
  viewMode: DiffSettingsFile["viewMode"];
}) {
  const sideBySideVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const scheduleVisibleFileTokenization = useVisibleDiffFileTokenizationScheduler(syntaxHighlightingEnabled);
  const resetSideBySideRuntime = useCallback(() => {
    sideBySideVisibleRangeRef.current = null;
  }, []);
  const requestSideBySideRange = useCallback((lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded" && options?.reason !== "scroll") {
      const start = Math.max(0, Math.floor(lineStart));
      const count = Math.max(0, Math.ceil(lineCount));
      if (count > 0) {
        sideBySideDataSource?.requestTokenizedRows(start, count, options?.reason ?? "initial");
      }
    }
    // Scroll-driven requests stay side-effect free so scrolling never updates React state.
  }, [sideBySideDataSource, state$]);
  const getSideBySideRow = useCallback((index: number, listIndex: number) => {
    const currentState = state$.peek();
    return !nativeSideBySideRows && currentState.status === "loaded"
      ? sideBySideDataSource?.getPlainRow(index, listIndex)
      : undefined;
  }, [nativeSideBySideRows, sideBySideDataSource, state$]);
  const handleSideBySideTopItemChanged = useCallback((lineIndex: number) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded" && lineIndex >= 0) {
      const nextFileIndex = sideBySideDataSource?.getItemMetadata(lineIndex).fileIndex ?? -1;
      if (activeFileIndex$.peek() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, [activeFileIndex$, sideBySideDataSource, state$]);
  const handleSideBySideVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      sideBySideVisibleRangeRef.current = {
        count,
        document: currentState.document,
        start,
      };
      if (syntaxHighlightingEnabled) {
        const fileIndexes = new Set<number>();
        for (let index = start; index < start + count; index += 1) {
          const itemId = sideBySideDataSource?.getItem(index);
          if (itemId !== undefined) {
            fileIndexes.add(sideBySideDataSource?.getItemMetadata(itemId).fileIndex ?? -1);
          }
        }
        const files = currentState.files.filter((file) => fileIndexes.has(file.index));
        scheduleVisibleFileTokenization(currentState.document, files, info);
      }
    }
  }, [scheduleVisibleFileTokenization, sideBySideDataSource, state$, syntaxHighlightingEnabled]);

  useObserveEffect(() => {
    const currentDiffPaneHeight = diffPaneHeight$.get();
    const currentState = state$.get();
    if (!nativeSideBySideRows && currentState.status === "loaded" && viewMode !== "unified" && currentDiffPaneHeight > 0 && sideBySideRowCount > 0) {
      const initialCount = Math.min(sideBySideRowCount, Math.max(1, Math.ceil(currentDiffPaneHeight / rowHeight)));
      requestSideBySideRange(0, initialCount, { force: true, reason: "initial" });
    }
  });

  return {
    getSideBySideRow,
    handleSideBySideTopItemChanged,
    handleSideBySideVisibleRowsRequested,
    requestSideBySideRange,
    resetSideBySideRuntime,
  };
}

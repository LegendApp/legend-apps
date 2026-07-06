import {
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSideBySideFileHeader,
  type DiffSideBySideRenderRow,
  type DiffSyntaxStyle,
} from "@legend-desktop/diff-parser";
import {
  nowMs,
  type SyntaxStyleMap,
} from "@legend-desktop/source-viewer";
import { ensureSyntaxGrammarsForPaths } from "@legend-desktop/syntax-parser";
import {
  useVirtualizedDocumentRows,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedDocumentSnapshot,
  type VirtualizedDocumentVisibleRangeInfo,
} from "@legend-desktop/virtualized-document";
import type { Observable } from "@legendapp/state";
import { useObserveEffect } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DiffSettingsFile } from "../diffSettings";
import type { DiffSyntaxStyleStore } from "./DiffRows";
import {
  diffBackgroundTokenizePollMs,
  diffProgressiveInitialPaintRowCount,
  diffVisibleFileTokenizeIdleMs,
  diffVisibleFileTokenizeMaxScrollVelocity,
} from "./diffViewerConstants";
import {
  createCollapsedFileIndexList,
  createIdentityDiffRowIndexes,
  createSideBySideFileHeaderIndexes,
  createSideBySideListIndexByRowIndex,
  createVisibleDiffRowIndexes,
  findFileIndexForRow,
  getBoundedSideBySideFileHeaders,
  getBoundedSideBySideRowCount,
} from "./diffLoadedDocumentIndexes";
import type { DiffViewerState } from "./diffViewerModel";
import { logDiffOpenTiming } from "./diffViewerSupport";

export {
  createCollapsedFileIndexList,
  createIdentityDiffRowIndexes,
  createSideBySideFileHeaderIndexes,
  createSideBySideListIndexByRowIndex,
  createVisibleDiffRowIndexes,
  findFileIndexForRow,
  getBoundedSideBySideFileHeaders,
  getBoundedSideBySideRowCount,
} from "./diffLoadedDocumentIndexes";

const emptyDiffRenderRows: readonly DiffRenderRow[] = [];

function createDiffSyntaxStyleMap(styles: readonly DiffSyntaxStyle[]) {
  const map: SyntaxStyleMap = new Map();
  for (const style of styles) {
    map.set(style.scopeId, {
      fontStyle: style.fontStyle,
      foreground: style.foreground,
      id: style.scopeId,
    });
  }
  return map satisfies SyntaxStyleMap;
}

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

function getFilesForSideBySideRange(
  document: DiffDocument,
  files: readonly DiffFileSummary[],
  start: number,
  count: number,
  collapsedFileIndexes: readonly number[],
) {
  const rows = document.getPlainSideBySideRows(start, count, [...collapsedFileIndexes]);
  const fileIndexes = new Set<number>();
  rows.forEach((row) => {
    if (row.fileIndex >= 0) {
      fileIndexes.add(row.fileIndex);
    }
  });
  return files.filter((file) => fileIndexes.has(file.index));
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
  syntaxHighlightingEnabled,
  syntaxThemeName,
  viewMode,
}: {
  collapsedFileIndexes: ReadonlySet<number>;
  fontFamily: string;
  fontSize: number;
  initialItemCountLimit?: number | null;
  nativeUnifiedRows: boolean;
  rowHeight: number;
  state: DiffViewerState;
  syntaxHighlightingEnabled: boolean;
  syntaxThemeName: string;
  viewMode: DiffSettingsFile["viewMode"];
}) {
  const fileByIndex = useMemo(() => {
    const startedAt = nowMs();
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    const map = new Map<number, DiffFileSummary>();
    for (const file of state.files) {
      map.set(file.index, file);
    }
    logDiffOpenTiming("viewer.derive.fileByIndex", () => ({
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      files: state.files.length,
      rows: state.document.rowCount,
    }));
    return map;
  }, [state]);
  const fileByRowStart = useMemo(() => {
    const startedAt = nowMs();
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    const map = new Map<number, DiffFileSummary>();
    for (const file of state.files) {
      map.set(Math.max(0, Math.floor(file.rowStart)), file);
    }
    logDiffOpenTiming("viewer.derive.fileByRowStart", () => ({
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      files: state.files.length,
      rows: state.document.rowCount,
    }));
    return map;
  }, [state]);
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
  const tokenStyleById = useMemo(() => {
    const startedAt = nowMs();
    const styles = state.status === "loaded" && syntaxHighlightingEnabled
      ? state.document.getScopeStyles(syntaxThemeName, 0)
      : [];
    if (state.status === "loaded" && syntaxHighlightingEnabled) {
      logDiffOpenTiming("viewer.scopeStylesFetched", () => ({
        durationMs: Number((nowMs() - startedAt).toFixed(1)),
        fromScopeId: 0,
        scopes: state.document.scopeCount,
        styles: styles.length,
        theme: syntaxThemeName,
      }));
    }
    return createDiffSyntaxStyleMap(styles);
  }, [state.status === "loaded" ? state.document : null, syntaxHighlightingEnabled, syntaxThemeName]);
  const syntaxStyleStore = useMemo<DiffSyntaxStyleStore>(() => {
    const listeners = new Set<() => void>();
    let scopeCount = state.status === "loaded" && syntaxHighlightingEnabled ? state.document.scopeCount : 0;
    let tokenizedRowVersion = state.status === "loaded" && syntaxHighlightingEnabled ? state.document.getTokenizedRowVersion() : 0;
    let tokenStyleMap = tokenStyleById;
    return {
      get current() {
        return tokenStyleMap;
      },
      getSnapshot() {
        return tokenizedRowVersion;
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      refresh(document: DiffDocument) {
        if (!syntaxHighlightingEnabled) {
          if (scopeCount !== 0 || tokenizedRowVersion !== 0 || tokenStyleMap.size !== 0) {
            scopeCount = 0;
            tokenizedRowVersion = 0;
            tokenStyleMap = new Map();
            listeners.forEach((listener) => listener());
          }
          return;
        }

        const nextScopeCount = document.scopeCount;
        const nextTokenizedRowVersion = document.getTokenizedRowVersion();
        let changed = false;
        if (nextScopeCount !== scopeCount) {
          const styles = document.getScopeStyles(syntaxThemeName, scopeCount);
          tokenStyleMap = new Map(tokenStyleMap);
          styles.forEach((style) => {
            tokenStyleMap.set(style.scopeId, {
              fontStyle: style.fontStyle,
              foreground: style.foreground,
              id: style.scopeId,
            });
          });
          scopeCount = nextScopeCount;
          changed = true;
        }
        if (nextTokenizedRowVersion !== tokenizedRowVersion) {
          tokenizedRowVersion = nextTokenizedRowVersion;
          changed = true;
        }
        if (changed) {
          listeners.forEach((listener) => listener());
        }
      },
    };
  }, [state.status === "loaded" ? state.document : null, syntaxHighlightingEnabled, syntaxThemeName, tokenStyleById]);
  useEffect(() => {
    if (state.status === "loaded" && syntaxHighlightingEnabled) {
      const document = state.document;
      const intervalHandle = setInterval(() => {
        const ranges = document.consumeTokenizedRowRanges();
        if (ranges.length > 0) {
          syntaxStyleStore.refresh(document);
        }
      }, diffBackgroundTokenizePollMs);

      return () => {
        clearInterval(intervalHandle);
      };
    }
    return undefined;
  }, [state.status === "loaded" ? state.document : null, syntaxHighlightingEnabled, syntaxStyleStore]);
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
  const sideBySideRowCount = useMemo(
    () => {
      const startedAt = nowMs();
      const isInitialCountLimited = initialItemCountLimit !== null && initialItemCountLimit !== undefined;
      const count = state.status === "loaded" && viewMode !== "unified"
        ? isInitialCountLimited
          ? getBoundedSideBySideRowCount(state.document, initialItemCountLimit, collapsedFileIndexList)
          : Math.max(0, Math.floor(state.document.getSideBySideRowCount(collapsedFileIndexList)))
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
    [collapsedFileIndexList, initialItemCountLimit, state, viewMode],
  );
  const sideBySideItemIndexes = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = createIdentityDiffRowIndexes(sideBySideRowCount);
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideItemIndexes", () => ({
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          items: indexes.length,
          rows: state.document.rowCount,
        }));
      }
      return indexes;
    },
    [sideBySideRowCount, state],
  );
  const sideBySideFileHeaders = useMemo(
    () => {
      const startedAt = nowMs();
      const isInitialCountLimited = initialItemCountLimit !== null && initialItemCountLimit !== undefined;
      const headers = state.status === "loaded" && viewMode !== "unified"
        ? isInitialCountLimited
          ? getBoundedSideBySideFileHeaders(state.document, sideBySideRowCount, collapsedFileIndexList)
          : state.document.getSideBySideFileHeaders(collapsedFileIndexList)
        : [];
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideFileHeaders", () => ({
          collapsedFiles: collapsedFileIndexList.length,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: headers.length,
          initialItemCountLimit,
          rows: state.document.rowCount,
          viewMode,
        }));
      }
      return headers;
    },
    [collapsedFileIndexList, initialItemCountLimit, sideBySideRowCount, state, viewMode],
  );
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

  return {
    collapsedFileIndexList,
    diffRows,
    fileByIndex,
    fileByRowStart,
    fileHeaderRowIndexes,
    getRow,
    getVisibleListIndex,
    sideBySideFileHeaderIndexes,
    sideBySideFileHeaderByListIndex,
    sideBySideItemIndexes,
    sideBySideListIndexByRowIndex,
    sideBySideRowCount,
    syntaxStyleStore,
    tokenStyleById,
    visibleItemIndexes,
  };
}

export function useDiffSideBySideRuntime({
  activeFileIndex$,
  collapsedFileIndexes$,
  diffPaneHeight$,
  nativeSideBySideRows,
  rowHeight,
  sideBySideRowCount,
  state$,
  syntaxHighlightingEnabled,
  viewMode,
}: {
  activeFileIndex$: Observable<number | null>;
  collapsedFileIndexes$: Observable<Set<number>>;
  diffPaneHeight$: Observable<number>;
  nativeSideBySideRows: boolean;
  rowHeight: number;
  sideBySideRowCount: number;
  state$: Observable<DiffViewerState>;
  syntaxHighlightingEnabled: boolean;
  viewMode: DiffSettingsFile["viewMode"];
}) {
  const sideBySideVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const getCurrentCollapsedFileIndexList = useCallback(
    () => createCollapsedFileIndexList(collapsedFileIndexes$.peek()),
    [collapsedFileIndexes$],
  );
  const scheduleVisibleFileTokenization = useVisibleDiffFileTokenizationScheduler(syntaxHighlightingEnabled);
  const resetSideBySideRuntime = useCallback(() => {
    sideBySideVisibleRangeRef.current = null;
  }, []);
  const requestSideBySideRange = useCallback((lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => {
    const currentState = state$.peek();
    if (!nativeSideBySideRows && currentState.status === "loaded" && options?.reason !== "scroll") {
      const start = Math.max(0, Math.floor(lineStart));
      const count = Math.max(0, Math.ceil(lineCount));
      if (count > 0) {
        const collapsedFileIndexList = getCurrentCollapsedFileIndexList();
        currentState.document.getPlainSideBySideRows(start, count, collapsedFileIndexList);
      }
    }
    // Scroll-driven requests stay side-effect free so scrolling never updates React state.
  }, [getCurrentCollapsedFileIndexList, nativeSideBySideRows, state$]);
  const getSideBySideRow = useCallback((index: number) => {
    const currentState = state$.peek();
    return !nativeSideBySideRows && currentState.status === "loaded"
      ? currentState.document.getPlainSideBySideRow(index, getCurrentCollapsedFileIndexList())
      : undefined;
  }, [getCurrentCollapsedFileIndexList, nativeSideBySideRows, state$]);
  const handleSideBySideTopItemChanged = useCallback((lineIndex: number) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const row = currentState.document.getPlainSideBySideRow(lineIndex, getCurrentCollapsedFileIndexList());
      const nextFileIndex = findFileIndexForRow(currentState.files, row.sourceStart);
      if (activeFileIndex$.peek() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, [activeFileIndex$, getCurrentCollapsedFileIndexList, state$]);
  const handleSideBySideVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      sideBySideVisibleRangeRef.current = {
        count,
        document: currentState.document,
        start,
      };
      if (syntaxHighlightingEnabled) {
        const collapsedFileIndexList = getCurrentCollapsedFileIndexList();
        const files = getFilesForSideBySideRange(currentState.document, currentState.files, start, count, collapsedFileIndexList);
        scheduleVisibleFileTokenization(currentState.document, files, info);
      }
    }
  }, [getCurrentCollapsedFileIndexList, scheduleVisibleFileTokenization, state$, syntaxHighlightingEnabled]);

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

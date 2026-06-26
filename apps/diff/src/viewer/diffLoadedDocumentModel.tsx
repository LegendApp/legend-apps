import {
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSideBySideRenderRow,
  type DiffSyntaxScope,
} from "@legend-desktop/diff-parser";
import { resolveSyntaxScopeStyles } from "@legend-desktop/syntax-parser";
import {
  createSyntaxStyleMap,
  nowMs,
  type SyntaxStyleMap,
} from "@legend-desktop/source-viewer";
import {
  useVirtualizedDocumentRows,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedDocumentSnapshot,
} from "@legend-desktop/virtualized-document";
import type { Observable } from "@legendapp/state";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { DiffSettingsFile } from "../diffSettings";
import type { DiffSyntaxStyleStore } from "./DiffRows";
import {
  diffBackgroundTokenizeChunkBudgetMs,
  diffBackgroundTokenizeChunkRowCount,
  diffBackgroundTokenizeMaxRowCount,
  diffBackgroundTokenizePollMs,
  diffBackgroundTokenizeStartDelayMs,
} from "./diffViewerConstants";
import type { DiffViewerState } from "./diffViewerModel";
import { logDiffOpenTiming } from "./diffViewerSupport";

export function useDiffLoadedModel({
  collapsedFileIndexes,
  state,
  syntaxThemeName,
  viewMode,
}: {
  collapsedFileIndexes: ReadonlySet<number>;
  fontFamily: string;
  fontSize: number;
  rowHeight: number;
  state: DiffViewerState;
  syntaxThemeName: string;
  viewMode: DiffSettingsFile["viewMode"];
}) {
  const fileByIndex = useMemo(() => {
    const startedAt = nowMs();
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    const map = new Map(state.files.map((file) => [file.index, file]));
    logDiffOpenTiming("viewer.derive.fileByIndex", {
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      files: state.files.length,
      rows: state.document.rowCount,
    });
    return map;
  }, [state]);
  const fileByRowStart = useMemo(() => {
    const startedAt = nowMs();
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    const map = new Map(state.files.map((file) => [Math.max(0, Math.floor(file.rowStart)), file]));
    logDiffOpenTiming("viewer.derive.fileByRowStart", {
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      files: state.files.length,
      rows: state.document.rowCount,
    });
    return map;
  }, [state]);
  const snapshot = useMemo<VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxScope, DiffLoadTiming> | null>(
    () => {
      const startedAt = nowMs();
      let nextSnapshot: VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxScope, DiffLoadTiming> | null = null;
      if (state.status === "loaded") {
        nextSnapshot = {
          document: state.document,
          initialRows: state.initialRows,
          itemCount: state.document.rowCount,
          styles: state.scopes,
          timing: state.timing,
        };
        logDiffOpenTiming("viewer.derive.snapshot", {
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          initialRows: state.initialRows.length,
          rows: state.document.rowCount,
          scopes: state.scopes.length,
        });
      }
      return nextSnapshot;
    },
    [state],
  );
  const requestRows = useCallback((document: DiffDocument, start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const startedAt = nowMs();
    logDiffOpenTiming("viewer.rowsFetched", {
      count,
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      reason: options?.reason ?? "unknown",
      rows: count,
      start,
      tokenized: false,
    });
    return undefined;
  }, []);
  const getScopes = useCallback((document: DiffDocument) => {
    const startedAt = nowMs();
    const scopes = document.getScopes();
    logDiffOpenTiming("viewer.scopesFetched", {
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      scopes: scopes.length,
    });
    return scopes;
  }, []);
  const getTiming = useCallback((document: DiffDocument) => document.getTiming(), []);
  const diffRows = useVirtualizedDocumentRows({
    debugName: "diff",
    getStyles: getScopes,
    getTiming,
    requestRows,
    snapshot,
  });
  const getRow = useCallback((index: number) => {
    if (state.status === "loaded") {
      const rows = state.document.getPlainRows(index, 1);
      return rows[0];
    }
    return undefined;
  }, [state]);
  const tokenStyleById = useMemo(
    () => createSyntaxStyleMap(resolveSyntaxScopeStyles(syntaxThemeName, diffRows.styles)),
    [diffRows.styles, syntaxThemeName],
  );
  const syntaxStyleStore = useMemo<DiffSyntaxStyleStore>(() => {
    const listeners = new Set<() => void>();
    let scopeCount = diffRows.styles.length;
    let version = 0;
    let tokenStyleMap = tokenStyleById;
    return {
      get current() {
        return tokenStyleMap;
      },
      getSnapshot() {
        return version;
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      refresh(document: DiffDocument) {
        const scopes = document.getScopes();
        if (scopes.length !== scopeCount) {
          scopeCount = scopes.length;
          tokenStyleMap = createSyntaxStyleMap(resolveSyntaxScopeStyles(syntaxThemeName, scopes));
        }
        version += 1;
        listeners.forEach((listener) => listener());
      },
    };
  }, [syntaxThemeName, tokenStyleById]);
  useEffect(() => {
    if (state.status === "loaded") {
      const document = state.document;
      if (document.rowCount > diffBackgroundTokenizeMaxRowCount) {
        logDiffOpenTiming("viewer.backgroundTokenize.skipped", {
          maxRows: diffBackgroundTokenizeMaxRowCount,
          rows: document.rowCount,
        });
        return undefined;
      }

      let intervalHandle: ReturnType<typeof setInterval> | null = null;
      const startTimeoutHandle = setTimeout(() => {
        document.startBackgroundTokenization(diffBackgroundTokenizeChunkRowCount, diffBackgroundTokenizeChunkBudgetMs);
        intervalHandle = setInterval(() => {
          const ranges = document.consumeTokenizedRowRanges();
          if (ranges.length > 0) {
            syntaxStyleStore.refresh(document);
          }
        }, diffBackgroundTokenizePollMs);
      }, diffBackgroundTokenizeStartDelayMs);

      return () => {
        clearTimeout(startTimeoutHandle);
        if (intervalHandle) {
          clearInterval(intervalHandle);
        }
        document.stopBackgroundTokenization();
      };
    }
    return undefined;
  }, [state.status === "loaded" ? state.document : null, syntaxStyleStore]);
  const fileHeaderRowIndexes = useMemo(() => {
    const startedAt = nowMs();
    if (state.status !== "loaded") {
      return new Set<number>();
    }
    const indexes = new Set(state.files.map((file) => Math.max(0, Math.floor(file.rowStart))));
    logDiffOpenTiming("viewer.derive.fileHeaderRowIndexes", {
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      files: state.files.length,
      rows: state.document.rowCount,
    });
    return indexes;
  }, [state]);
  const visibleItemIndexes = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = state.status === "loaded" && collapsedFileIndexes.size > 0
        ? createVisibleDiffRowIndexes(state.files, collapsedFileIndexes, diffRows.itemIndexes)
        : diffRows.itemIndexes;
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.visibleItemIndexes", {
          collapsedFiles: collapsedFileIndexes.size,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          items: indexes.length,
          rows: state.document.rowCount,
        });
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
      logDiffOpenTiming("viewer.derive.visibleListIndexByRowIndex", {
        collapsedFiles: collapsedFileIndexes.size,
        durationMs: Number((nowMs() - startedAt).toFixed(1)),
        eagerMap: indexes !== null,
        items: visibleItemIndexes.length,
        rows: state.document.rowCount,
      });
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
      const count = state.status === "loaded" && viewMode !== "unified"
        ? Math.max(0, Math.floor(state.document.getSideBySideRowCount(collapsedFileIndexList)))
        : 0;
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideRowCount", {
          collapsedFiles: collapsedFileIndexList.length,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          rows: state.document.rowCount,
          sideBySideRows: count,
          viewMode,
        });
      }
      return count;
    },
    [collapsedFileIndexList, state, viewMode],
  );
  const sideBySideItemIndexes = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = createIdentityDiffRowIndexes(sideBySideRowCount);
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideItemIndexes", {
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          items: indexes.length,
          rows: state.document.rowCount,
        });
      }
      return indexes;
    },
    [sideBySideRowCount, state],
  );
  const sideBySideFileHeaders = useMemo(
    () => {
      const startedAt = nowMs();
      const headers = state.status === "loaded" && viewMode !== "unified"
        ? state.document.getSideBySideFileHeaders(collapsedFileIndexList)
        : [];
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideFileHeaders", {
          collapsedFiles: collapsedFileIndexList.length,
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: headers.length,
          rows: state.document.rowCount,
          viewMode,
        });
      }
      return headers;
    },
    [collapsedFileIndexList, state, viewMode],
  );
  const sideBySideFileHeaderIndexes = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = new Set(sideBySideFileHeaders.map((header) => header.listIndex));
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideFileHeaderIndexes", {
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: sideBySideFileHeaders.length,
          rows: state.document.rowCount,
        });
      }
      return indexes;
    },
    [sideBySideFileHeaders, state],
  );
  const sideBySideListIndexByRowIndex = useMemo(
    () => {
      const startedAt = nowMs();
      const indexes = new Map<number, number>();
      sideBySideFileHeaders.forEach((header) => {
        indexes.set(header.sourceStart, header.listIndex);
      });
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.derive.sideBySideListIndexByRowIndex", {
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          files: sideBySideFileHeaders.length,
          rows: state.document.rowCount,
        });
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
  diffPaneHeight,
  rowHeight,
  sideBySideRowCount,
  state,
  state$,
  viewMode,
}: {
  activeFileIndex$: Observable<number | null>;
  collapsedFileIndexes$: Observable<Set<number>>;
  diffPaneHeight: number;
  rowHeight: number;
  sideBySideRowCount: number;
  state: DiffViewerState;
  state$: Observable<DiffViewerState>;
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
  const resetSideBySideRuntime = useCallback(() => {
    sideBySideVisibleRangeRef.current = null;
  }, []);
  const requestSideBySideRange = useCallback((lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded" && options?.reason !== "scroll") {
      const start = Math.max(0, Math.floor(lineStart));
      const count = Math.max(0, Math.ceil(lineCount));
      if (count > 0) {
        const collapsedFileIndexList = getCurrentCollapsedFileIndexList();
        currentState.document.getPlainSideBySideRows(start, count, collapsedFileIndexList);
      }
    }
    // Scroll-driven requests stay side-effect free so scrolling never updates React state.
  }, [getCurrentCollapsedFileIndexList, state$]);
  const getSideBySideRow = useCallback((index: number) => {
    const currentState = state$.peek();
    return currentState.status === "loaded"
      ? currentState.document.getPlainSideBySideRow(index, getCurrentCollapsedFileIndexList())
      : undefined;
  }, [getCurrentCollapsedFileIndexList, state$]);
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
  const handleSideBySideVisibleRowsRequested = useCallback((start: number, count: number, _reason: VirtualizedDocumentRequestReason) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      sideBySideVisibleRangeRef.current = {
        count,
        document: currentState.document,
        start,
      };
    }
  }, [state$]);

  useEffect(() => {
    if (state.status === "loaded" && viewMode !== "unified" && diffPaneHeight > 0 && sideBySideRowCount > 0) {
      const initialCount = Math.min(sideBySideRowCount, Math.max(1, Math.ceil(diffPaneHeight / rowHeight)));
      requestSideBySideRange(0, initialCount, { force: true, reason: "initial" });
    }
  }, [diffPaneHeight, requestSideBySideRange, rowHeight, sideBySideRowCount, state, viewMode]);

  return {
    getSideBySideRow,
    handleSideBySideTopItemChanged,
    handleSideBySideVisibleRowsRequested,
    requestSideBySideRange,
    resetSideBySideRuntime,
  };
}

function createVisibleDiffRowIndexes(files: readonly DiffFileSummary[], collapsedFileIndexes: ReadonlySet<number>, fallbackItemIndexes: readonly (number | undefined)[]) {
  const indexes: number[] = [];

  if (files.length > 0) {
    for (const file of files) {
      const rowStart = Math.max(0, Math.floor(file.rowStart));
      const rowCount = Math.max(0, Math.floor(file.rowCount));

      if (rowCount > 0) {
        indexes.push(rowStart);

        if (!collapsedFileIndexes.has(file.index)) {
          const rowEnd = rowStart + rowCount;
          for (let rowIndex = rowStart + 1; rowIndex < rowEnd; rowIndex += 1) {
            indexes.push(rowIndex);
          }
        }
      }
    }
  } else {
    fallbackItemIndexes.forEach((rowIndex, listIndex) => {
      indexes.push(rowIndex ?? listIndex);
    });
  }

  return indexes;
}

function createIdentityDiffRowIndexes(length: number) {
  const count = Math.max(0, Math.floor(length));
  return Array.from({ length: count }, (_, index) => index);
}

function createCollapsedFileIndexList(collapsedFileIndexes: ReadonlySet<number>) {
  return Array.from(collapsedFileIndexes).sort((left, right) => left - right);
}

export function findFileIndexForRow(files: readonly DiffFileSummary[], rowIndex: number) {
  let low = 0;
  let high = files.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const file = files[middle];
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const rowEnd = rowStart + Math.max(0, Math.floor(file.rowCount));

    if (rowIndex < rowStart) {
      high = middle - 1;
    } else if (rowIndex >= rowEnd) {
      low = middle + 1;
    } else {
      return file.index;
    }
  }

  return files.length > 0 ? files[Math.max(0, Math.min(files.length - 1, high))].index : null;
}

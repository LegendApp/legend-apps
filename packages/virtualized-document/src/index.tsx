import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from "react-native";

export type VirtualizedDocumentSnapshot<TDocument, TRow, TStyle, TTiming> = {
  document: TDocument;
  initialRows: readonly TRow[];
  itemCount: number;
  styles: readonly TStyle[];
  timing: TTiming;
};

export type VirtualizedDocumentRequestReason = "highlight" | "initial" | "overscan" | "scroll";

export type VirtualizedDocumentRequestOptions = {
  force?: boolean;
  reason?: VirtualizedDocumentRequestReason;
};

export type UseVirtualizedDocumentRowsOptions<TDocument, TRow, TStyle, TTiming> = {
  getRowIndex: (row: TRow) => number;
  getRows: (document: TDocument, start: number, count: number, options?: VirtualizedDocumentRequestOptions) => readonly TRow[];
  getStyles?: (document: TDocument) => readonly TStyle[];
  getTiming?: (document: TDocument) => TTiming;
  debugName?: string;
  snapshot: VirtualizedDocumentSnapshot<TDocument, TRow, TStyle, TTiming> | null;
};

export type VirtualizedDocumentRowsState<TRow, TStyle, TTiming> = {
  itemIndexes: number[];
  itemCount: number;
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
  rowCache: Map<number, TRow>;
  rowsVersion: number;
  styles: readonly TStyle[];
  timing: TTiming | null;
};

type InternalRowsState<TDocument, TRow, TStyle, TTiming> = {
  document: TDocument | null;
  itemCount: number;
  rowCache: Map<number, TRow>;
  rowsVersion: number;
  styles: readonly TStyle[];
  timing: TTiming | null;
};

export type VirtualizedFixedDocumentListRenderRowProps<TRow> = {
  index: number;
  listIndex: number;
  row: TRow | undefined;
};

export type VirtualizedFixedDocumentListProps<TRow> = {
  debugName?: string;
  initialRequestRowCount?: number;
  itemIndexes: number[];
  onInitialRowsRequested?: (start: number, count: number) => void;
  lineOverscan?: number;
  overscanRequestDelayMs?: number;
  recycleItems?: boolean;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
  rowCache: Map<number, TRow>;
  rowsVersion: number;
  rowHeight: number;
  style?: StyleProp<ViewStyle>;
};

const debugPrefix = "[DEBUG-code-cold-v1]";
let debugSequence = 0;

function debugNowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function debugLog(debugName: string | undefined, event: string, payload: Record<string, unknown>) {
  if (__DEV__ && debugName) {
    console.info(`${debugPrefix} ${event} ${JSON.stringify({
      debugName,
      seq: ++debugSequence,
      t: Number(debugNowMs().toFixed(1)),
      ...payload,
    })}`);
  }
}

type RenderItemDebugBatch = {
  count: number;
  first: number | null;
  last: number | null;
  missing: number;
  present: number;
};

function recordRenderItemDebug(debugName: string | undefined, batchRef: { current: RenderItemDebugBatch | null }, index: number, hasRow: boolean) {
  if (__DEV__ && debugName) {
    batchRef.current ??= {
      count: 0,
      first: null,
      last: null,
      missing: 0,
      present: 0,
    };
    const batch = batchRef.current;
    batch.count += 1;
    batch.first = batch.first === null ? index : Math.min(batch.first, index);
    batch.last = batch.last === null ? index : Math.max(batch.last, index);
    if (hasRow) {
      batch.present += 1;
    } else {
      batch.missing += 1;
    }

    if (batch.count === 1) {
      requestAnimationFrame(() => {
        const completedBatch = batchRef.current;
        batchRef.current = null;
        if (completedBatch) {
          debugLog(debugName, "list.renderItemFrame", completedBatch as unknown as Record<string, unknown>);
        }
      });
    }
  }
}

function createRowCache<TRow>(
  rows: readonly TRow[],
  getRowIndex: (row: TRow) => number,
) {
  const rowCache = new Map<number, TRow>();
  for (const row of rows) {
    rowCache.set(getRowIndex(row), row);
  }
  return rowCache;
}

function createRowsState<TDocument, TRow, TStyle, TTiming>(
  snapshot: VirtualizedDocumentSnapshot<TDocument, TRow, TStyle, TTiming> | null,
  getRowIndex: (row: TRow) => number,
): InternalRowsState<TDocument, TRow, TStyle, TTiming> {
  return {
    document: snapshot?.document ?? null,
    itemCount: snapshot?.itemCount ?? 0,
    rowCache: snapshot ? createRowCache(snapshot.initialRows, getRowIndex) : new Map<number, TRow>(),
    rowsVersion: 0,
    styles: snapshot?.styles ?? [],
    timing: snapshot?.timing ?? null,
  };
}

export function useVirtualizedDocumentRows<TDocument, TRow, TStyle, TTiming>({
  debugName,
  getRowIndex,
  getRows,
  getStyles,
  getTiming,
  snapshot,
}: UseVirtualizedDocumentRowsOptions<TDocument, TRow, TStyle, TTiming>): VirtualizedDocumentRowsState<TRow, TStyle, TTiming> {
  const [rowsState, setRowsState] = useState(() => createRowsState(snapshot, getRowIndex));
  const rowsStateRef = useRef(rowsState);
  const snapshotDocument = snapshot?.document ?? null;
  const activeRowsState = rowsState.document === snapshotDocument
    ? rowsState
    : createRowsState(snapshot, getRowIndex);
  rowsStateRef.current = activeRowsState;

  useEffect(() => {
    const nextRowsState = createRowsState(snapshot, getRowIndex);
    rowsStateRef.current = nextRowsState;
    setRowsState(nextRowsState);
    debugLog(debugName, "rows.reset", {
      cacheSize: nextRowsState.rowCache.size,
      itemCount: nextRowsState.itemCount,
      rowsVersion: nextRowsState.rowsVersion,
    });
  }, [getRowIndex, snapshot]);

  useEffect(() => {
    rowsStateRef.current = activeRowsState;
  }, [activeRowsState]);

  const requestRange = useCallback((start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const loadedRowsState = rowsStateRef.current;
    if (loadedRowsState.document) {
      const requestStartedAt = debugNowMs();
      const safeStart = Math.max(0, Math.floor(start));
      const safeEnd = Math.min(loadedRowsState.itemCount, safeStart + Math.max(0, Math.ceil(count)));

      if (safeStart < safeEnd) {
        let hasMissingRow = options?.force === true;
        for (let index = safeStart; index < safeEnd; index += 1) {
          if (!loadedRowsState.rowCache.has(index)) {
            hasMissingRow = true;
            break;
          }
        }

        debugLog(debugName, "rows.request", {
          cacheSize: loadedRowsState.rowCache.size,
          count: safeEnd - safeStart,
          force: options?.force === true,
          hasMissingRow,
          reason: options?.reason ?? "unknown",
          start: safeStart,
        });

        if (hasMissingRow) {
          const fetchedRows = getRows(loadedRowsState.document, safeStart, safeEnd - safeStart, options);
          const styles = getStyles?.(loadedRowsState.document) ?? loadedRowsState.styles;
          const timing = getTiming?.(loadedRowsState.document) ?? loadedRowsState.timing;
          debugLog(debugName, "rows.fetched", {
            count: safeEnd - safeStart,
            fetchedRows: fetchedRows.length,
            getRowsMs: Number((debugNowMs() - requestStartedAt).toFixed(1)),
            reason: options?.reason ?? "unknown",
            start: safeStart,
          });

          setRowsState((currentRowsState) => {
            const isLoadedDocumentCurrent = rowsStateRef.current.document === loadedRowsState.document;
            if (currentRowsState.document !== loadedRowsState.document && !isLoadedDocumentCurrent) {
              debugLog(debugName, "rows.commitSkipped", {
                reason: options?.reason ?? "unknown",
              });
              return currentRowsState;
            }

            const baseRowsState = currentRowsState.document === loadedRowsState.document
              ? currentRowsState
              : loadedRowsState;
            const nextRowCache = new Map(baseRowsState.rowCache);
            for (const row of fetchedRows) {
              nextRowCache.set(getRowIndex(row), row);
            }

            return {
              ...baseRowsState,
              rowCache: nextRowCache,
              rowsVersion: baseRowsState.rowsVersion + 1,
              styles,
              timing,
            };
          });
        }
      }
    }
  }, [debugName, getRowIndex, getRows, getStyles, getTiming]);

  const itemIndexes = useMemo(
    () => Array.from({ length: activeRowsState.itemCount }, (_, index) => index),
    [activeRowsState.itemCount],
  );

  return {
    itemCount: activeRowsState.itemCount,
    itemIndexes,
    requestRange,
    rowCache: activeRowsState.rowCache,
    rowsVersion: activeRowsState.rowsVersion,
    styles: activeRowsState.styles,
    timing: activeRowsState.timing,
  };
}

export function VirtualizedFixedDocumentList<TRow>({
  debugName,
  initialRequestRowCount,
  itemIndexes,
  lineOverscan = 0,
  onInitialRowsRequested,
  overscanRequestDelayMs = 0,
  recycleItems = true,
  renderRow,
  requestRange,
  rowCache,
  rowHeight,
  rowsVersion,
  style,
}: VirtualizedFixedDocumentListProps<TRow>) {
  const hasRequestedInitialRangeRef = useRef(false);
  const overscanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderItemBatchRef = useRef<RenderItemDebugBatch | null>(null);
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;
  debugLog(debugName, "list.render", {
    cacheSize: rowCache.size,
    itemCount: itemIndexes.length,
    renderCount: renderCountRef.current,
    rowsVersion,
  });

  useEffect(() => () => {
    if (overscanTimeoutRef.current) {
      clearTimeout(overscanTimeoutRef.current);
      overscanTimeoutRef.current = null;
    }
  }, []);

  const requestVisibleRange = useCallback((offsetY: number, height: number, includeOverscan: boolean, reason: VirtualizedDocumentRequestReason) => {
    const visibleStart = Math.floor(offsetY / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    const start = includeOverscan ? visibleStart - lineOverscan : visibleStart;
    const initialCount = initialRequestRowCount ?? visibleCount;
    const count = includeOverscan ? visibleCount + lineOverscan * 2 : Math.max(visibleCount, initialCount);
    debugLog(debugName, "list.requestVisibleRange", {
      count,
      height,
      includeOverscan,
      offsetY,
      reason,
      start,
      visibleCount,
      visibleStart,
    });
    requestRange(start, count, { reason });
    return { count, start };
  }, [debugName, initialRequestRowCount, lineOverscan, requestRange, rowHeight]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    debugLog(debugName, "list.layout", {
      height,
      initialAlreadyRequested: hasRequestedInitialRangeRef.current,
      itemCount: itemIndexes.length,
      rowsVersion,
    });

    if (!hasRequestedInitialRangeRef.current) {
      hasRequestedInitialRangeRef.current = true;
      const initialRange = requestVisibleRange(0, height, false, "initial");
      onInitialRowsRequested?.(initialRange.start, initialRange.count);

      if (lineOverscan > 0) {
        if (overscanTimeoutRef.current) {
          clearTimeout(overscanTimeoutRef.current);
        }
        overscanTimeoutRef.current = setTimeout(() => {
          overscanTimeoutRef.current = null;
          requestVisibleRange(0, height, true, "overscan");
        }, overscanRequestDelayMs);
      }
    } else {
      requestVisibleRange(0, height, true, "overscan");
    }
  }, [debugName, itemIndexes.length, lineOverscan, onInitialRowsRequested, overscanRequestDelayMs, requestVisibleRange, rowsVersion]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    debugLog(debugName, "list.scroll", {
      height: layoutMeasurement.height,
      offsetY: contentOffset.y,
    });
    requestVisibleRange(contentOffset.y, layoutMeasurement.height, true, "scroll");
  }, [debugName, requestVisibleRange]);

  const renderItem = useCallback(
    ({ index: listIndex, item: index }: LegendListRenderItemProps<number>) => {
      const row = rowCache.get(index);
      recordRenderItemDebug(debugName, renderItemBatchRef, index, row !== undefined);
      return renderRow({
        index,
        listIndex,
        row,
      });
    },
    [debugName, renderRow, rowCache],
  );

  return (
    <LegendList
      data={itemIndexes}
      extraData={rowsVersion}
      getFixedItemSize={() => rowHeight}
      keyExtractor={(index) => String(index)}
      onLayout={handleLayout}
      onScroll={handleScroll}
      recycleItems={recycleItems}
      renderItem={renderItem}
      style={style}
    />
  );
}

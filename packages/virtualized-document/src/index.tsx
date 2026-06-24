import {
  LegendList,
  type AdaptiveRender,
  type AdaptiveRenderConfig,
  type LegendListRef,
  type LegendListRenderItemProps,
  useAdaptiveRender,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type Ref } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from "react-native";

export type VirtualizedFixedDocumentListRef = LegendListRef;

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
  rowVersions$: Observable<Record<string, number>>;
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
  adaptiveRender: AdaptiveRender;
  index: number;
  listIndex: number;
  row: TRow | undefined;
};

type VirtualizedFixedDocumentListRowProps<TRow> = {
  adaptiveRenderEnabled: boolean;
  debugName?: string;
  getRow?: (index: number) => TRow | undefined;
  index: number;
  listIndex: number;
  renderItemBatchRef: { current: RenderItemDebugBatch | null };
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  rowCache?: Map<number, TRow>;
  rowVersions$?: Observable<Record<string, number>>;
};

export type VirtualizedFixedDocumentListProps<TRow> = {
  adaptiveRender?: AdaptiveRenderConfig;
  debugName?: string;
  extraData?: unknown;
  getItemSize?: (index: number, row: TRow | undefined) => number;
  getItemType?: (index: number, row: TRow | undefined) => string | undefined;
  initialRequestRowCount?: number;
  itemIndexes: number[];
  listRef?: Ref<LegendListRef>;
  onInitialRowsRequested?: (start: number, count: number) => void;
  onTopItemChanged?: (index: number, listIndex: number) => void;
  onVisibleRowsRequested?: (start: number, count: number, reason: VirtualizedDocumentRequestReason) => void;
  lineOverscan?: number;
  overscanRequestDelayMs?: number;
  recycleItems?: boolean;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
  getRow?: (index: number) => TRow | undefined;
  rowCache?: Map<number, TRow>;
  rowVersions$?: Observable<Record<string, number>>;
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

function bumpRowVersion(rowVersions$: Observable<Record<string, number>>, rowIndex: number) {
  const key = String(rowIndex);
  rowVersions$[key].set((rowVersions$[key].peek() ?? 0) + 1);
}

function VirtualizedFixedDocumentListRowContent<TRow>({
  adaptiveRenderEnabled,
  debugName,
  getRow,
  index,
  listIndex,
  renderItemBatchRef,
  renderRow,
  rowCache,
}: Omit<VirtualizedFixedDocumentListRowProps<TRow>, "rowVersions$">) {
  const adaptiveRender = useAdaptiveRender();
  const effectiveAdaptiveRender = adaptiveRenderEnabled ? adaptiveRender : "normal";
  const row = getRow?.(index) ?? rowCache?.get(index);
  recordRenderItemDebug(debugName, renderItemBatchRef, index, row !== undefined);
  return renderRow({
    adaptiveRender: effectiveAdaptiveRender,
    index,
    listIndex,
    row,
  });
}

function VirtualizedFixedDocumentListVersionedRow<TRow>({
  rowVersions$,
  ...props
}: VirtualizedFixedDocumentListRowProps<TRow> & {
  rowVersions$: Observable<Record<string, number>>;
}) {
  useValue(() => rowVersions$[String(props.index)].get() ?? 0);
  return <VirtualizedFixedDocumentListRowContent {...props} />;
}

function getDocumentRangeForListRange(itemIndexes: readonly number[], start: number, count: number) {
  const safeListStart = Math.max(0, Math.floor(start));
  const safeListEnd = Math.min(itemIndexes.length, safeListStart + Math.max(0, Math.ceil(count)));
  let requestStart = Number.POSITIVE_INFINITY;
  let requestEnd = Number.NEGATIVE_INFINITY;

  for (let listIndex = safeListStart; listIndex < safeListEnd; listIndex += 1) {
    const itemIndex = itemIndexes[listIndex];
    if (Number.isFinite(itemIndex)) {
      requestStart = Math.min(requestStart, itemIndex);
      requestEnd = Math.max(requestEnd, itemIndex + 1);
    }
  }

  return requestStart < requestEnd
    ? {
        count: requestEnd - requestStart,
        listCount: safeListEnd - safeListStart,
        listStart: safeListStart,
        start: requestStart,
      }
    : {
        count: 0,
        listCount: 0,
        listStart: safeListStart,
        start: 0,
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
  const rowVersions$ = useObservable<Record<string, number>>({});
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
    rowVersions$.set({});
    setRowsState(nextRowsState);
    debugLog(debugName, "rows.reset", {
      cacheSize: nextRowsState.rowCache.size,
      itemCount: nextRowsState.itemCount,
      rowsVersion: nextRowsState.rowsVersion,
    });
  }, [getRowIndex, rowVersions$, snapshot]);

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

          if (options?.reason === "scroll") {
            for (const row of fetchedRows) {
              const rowIndex = getRowIndex(row);
              if (!loadedRowsState.rowCache.has(rowIndex)) {
                loadedRowsState.rowCache.set(rowIndex, row);
              }
            }
            rowsStateRef.current = {
              ...loadedRowsState,
              styles,
              timing,
            };
          } else {
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
                const rowIndex = getRowIndex(row);
                if (options?.force === true || !nextRowCache.has(rowIndex)) {
                  nextRowCache.set(rowIndex, row);
                }
              }

              return {
                ...baseRowsState,
                rowCache: nextRowCache,
                rowsVersion: baseRowsState.rowsVersion + 1,
                styles,
                timing,
              };
            });
            for (const row of fetchedRows) {
              bumpRowVersion(rowVersions$, getRowIndex(row));
            }
          }
        }
      }
    }
  }, [debugName, getRowIndex, getRows, getStyles, getTiming, rowVersions$]);

  const itemIndexes = useMemo(
    () => Array.from({ length: activeRowsState.itemCount }, (_, index) => index),
    [activeRowsState.itemCount],
  );

  return {
    itemCount: activeRowsState.itemCount,
    itemIndexes,
    requestRange,
    rowCache: activeRowsState.rowCache,
    rowVersions$,
    rowsVersion: activeRowsState.rowsVersion,
    styles: activeRowsState.styles,
    timing: activeRowsState.timing,
  };
}

export function VirtualizedFixedDocumentList<TRow>({
  adaptiveRender,
  debugName,
  extraData,
  getRow,
  getItemSize,
  getItemType,
  initialRequestRowCount,
  itemIndexes,
  listRef,
  lineOverscan = 0,
  onInitialRowsRequested,
  onTopItemChanged,
  onVisibleRowsRequested,
  overscanRequestDelayMs = 0,
  recycleItems = true,
  renderRow,
  requestRange,
  rowCache,
  rowVersions$: rowVersionsProp$,
  rowHeight,
  rowsVersion,
  style,
}: VirtualizedFixedDocumentListProps<TRow>) {
  const hasRequestedInitialRangeRef = useRef(false);
  const overscanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderItemBatchRef = useRef<RenderItemDebugBatch | null>(null);
  const renderCountRef = useRef(0);
  const internalListRef = useRef<LegendListRef | null>(null);
  const lastTopItemRef = useRef<{ index: number; listIndex: number } | null>(null);
  const listExtraData = useMemo(
    () => ({
      extraData,
      rowsVersion,
    }),
    [extraData, rowsVersion],
  );

  renderCountRef.current += 1;
  debugLog(debugName, "list.render", {
    cacheSize: rowCache?.size ?? 0,
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

  const setListRef = useCallback((list: LegendListRef | null) => {
    internalListRef.current = list;
    if (typeof listRef === "function") {
      listRef(list);
    } else if (listRef) {
      listRef.current = list;
    }
  }, [listRef]);

  const emitTopItemChanged = useCallback(() => {
    if (onTopItemChanged) {
      const topListIndex = internalListRef.current?.getState().start;
      if (topListIndex !== undefined && topListIndex >= 0) {
        const topItemIndex = itemIndexes[topListIndex];
        const lastTopItem = lastTopItemRef.current;
        if (
          topItemIndex !== undefined &&
          (lastTopItem?.index !== topItemIndex || lastTopItem.listIndex !== topListIndex)
        ) {
          lastTopItemRef.current = {
            index: topItemIndex,
            listIndex: topListIndex,
          };
          onTopItemChanged(topItemIndex, topListIndex);
        }
      }
    }
  }, [itemIndexes, onTopItemChanged]);

  const requestVisibleRange = useCallback((offsetY: number, height: number, includeOverscan: boolean, reason: VirtualizedDocumentRequestReason) => {
    const visibleStart = Math.floor(offsetY / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    const listStart = includeOverscan ? visibleStart - lineOverscan : visibleStart;
    const initialCount = initialRequestRowCount ?? visibleCount;
    const listCount = includeOverscan ? visibleCount + lineOverscan * 2 : Math.max(visibleCount, initialCount);
    const visibleDocumentRange = getDocumentRangeForListRange(itemIndexes, visibleStart, visibleCount);
    const documentRange = getDocumentRangeForListRange(itemIndexes, listStart, listCount);
    debugLog(debugName, "list.requestVisibleRange", {
      count: documentRange.count,
      height,
      includeOverscan,
      listCount: documentRange.listCount,
      listStart: documentRange.listStart,
      offsetY,
      reason,
      start: documentRange.start,
      visibleCount,
      visibleDocumentCount: visibleDocumentRange.count,
      visibleDocumentStart: visibleDocumentRange.start,
      visibleStart,
    });
    requestRange(documentRange.start, documentRange.count, { reason });
    if (visibleDocumentRange.count > 0) {
      onVisibleRowsRequested?.(visibleDocumentRange.start, visibleDocumentRange.count, reason);
    }
    return documentRange;
  }, [debugName, initialRequestRowCount, itemIndexes, lineOverscan, onVisibleRowsRequested, requestRange, rowHeight]);

  const requestLegendListRange = useCallback((reason: VirtualizedDocumentRequestReason) => {
    const listState = internalListRef.current?.getState();
    if (listState && listState.start >= 0 && listState.end >= listState.start) {
      const requestListStart = listState.startBuffered >= 0 ? listState.startBuffered : listState.start;
      const requestListEnd = listState.endBuffered >= requestListStart ? listState.endBuffered : listState.end;
      const documentRange = getDocumentRangeForListRange(itemIndexes, requestListStart, requestListEnd - requestListStart + 1);
      const visibleDocumentRange = getDocumentRangeForListRange(itemIndexes, listState.start, listState.end - listState.start + 1);
      debugLog(debugName, "list.requestLegendListRange", {
        count: documentRange.count,
        end: listState.end,
        endBuffered: listState.endBuffered,
        listCount: documentRange.listCount,
        listStart: documentRange.listStart,
        offsetY: listState.scroll,
        reason,
        start: documentRange.start,
        startBuffered: listState.startBuffered,
        visibleDocumentCount: visibleDocumentRange.count,
        visibleDocumentStart: visibleDocumentRange.start,
      });
      requestRange(documentRange.start, documentRange.count, { reason });
      if (visibleDocumentRange.count > 0) {
        onVisibleRowsRequested?.(visibleDocumentRange.start, visibleDocumentRange.count, reason);
      }
      return true;
    }

    return false;
  }, [debugName, itemIndexes, onVisibleRowsRequested, requestRange]);

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
          if (!requestLegendListRange("overscan")) {
            requestVisibleRange(0, height, true, "overscan");
          }
        }, overscanRequestDelayMs);
      }
    } else {
      if (!requestLegendListRange("overscan")) {
        requestVisibleRange(0, height, true, "overscan");
      }
    }
    emitTopItemChanged();
  }, [debugName, emitTopItemChanged, itemIndexes.length, lineOverscan, onInitialRowsRequested, overscanRequestDelayMs, requestLegendListRange, requestVisibleRange, rowsVersion]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    debugLog(debugName, "list.scroll", {
      height: layoutMeasurement.height,
      offsetY: contentOffset.y,
    });
    if (!requestLegendListRange("scroll")) {
      requestVisibleRange(contentOffset.y, layoutMeasurement.height, true, "scroll");
    }
    emitTopItemChanged();
  }, [debugName, emitTopItemChanged, requestLegendListRange, requestVisibleRange]);

  const renderItem = useCallback(
    ({ index: listIndex, item: index }: LegendListRenderItemProps<number>) => {
      const rowProps = {
        adaptiveRenderEnabled: adaptiveRender !== undefined,
        debugName,
        getRow,
        index,
        listIndex,
        renderItemBatchRef,
        renderRow,
        rowCache,
      };

      return rowVersionsProp$ ? (
        <VirtualizedFixedDocumentListVersionedRow
          {...rowProps}
          rowVersions$={rowVersionsProp$}
        />
      ) : (
        <VirtualizedFixedDocumentListRowContent {...rowProps} />
      );
    },
    [adaptiveRender, debugName, getRow, renderRow, rowCache, rowVersionsProp$],
  );

  const getFixedItemSize = useCallback((index: number) => (
    getItemSize?.(index, rowCache?.get(index)) ?? rowHeight
  ), [getItemSize, rowCache, rowHeight]);

  const getLegendItemType = useCallback((index: number) => (
    getItemType?.(index, rowCache?.get(index))
  ), [getItemType, rowCache]);

  return (
    <LegendList
      data={itemIndexes}
      extraData={listExtraData}
      experimental_adaptiveRender={adaptiveRender}
      getFixedItemSize={getFixedItemSize}
      getItemType={getLegendItemType}
      keyExtractor={(index) => String(index)}
      ref={setListRef}
      onLayout={handleLayout}
      onScroll={handleScroll}
      recycleItems={recycleItems}
      renderItem={renderItem}
      style={style}
    />
  );
}

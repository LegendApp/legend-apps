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

export type VirtualizedDocumentRowsRequestResult<TStyle, TTiming> = {
  invalidate?: boolean | readonly number[];
  styles?: readonly TStyle[];
  timing?: TTiming;
};

export type UseVirtualizedDocumentRowsOptions<TDocument, TRow, TStyle, TTiming> = {
  requestRows?: (
    document: TDocument,
    start: number,
    count: number,
    options?: VirtualizedDocumentRequestOptions,
  ) => VirtualizedDocumentRowsRequestResult<TStyle, TTiming> | void;
  getStyles?: (document: TDocument) => readonly TStyle[];
  getTiming?: (document: TDocument) => TTiming;
  debugName?: string;
  snapshot: VirtualizedDocumentSnapshot<TDocument, TRow, TStyle, TTiming> | null;
};

export type VirtualizedDocumentRowsState<TRow, TStyle, TTiming> = {
  dataVersion: number;
  itemIndexes: Array<number | undefined>;
  itemCount: number;
  invalidateRange: (start: number, count: number) => void;
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
  rowVersions$: Observable<Record<string, number>>;
  styles: readonly TStyle[];
  timing: TTiming | null;
};

type InternalRowsState<TDocument, TRow, TStyle, TTiming> = {
  dataVersion: number;
  document: TDocument | null;
  itemCount: number;
  styles: readonly TStyle[];
  timing: TTiming | null;
};

export type VirtualizedFixedDocumentListRenderRowProps<TRow> = {
  adaptiveRender: AdaptiveRender;
  index: number;
  listIndex: number;
  row: TRow | undefined;
  rowVersion: number;
};

type VirtualizedFixedDocumentListRowProps<TRow> = {
  adaptiveRenderEnabled: boolean;
  debugName?: string;
  getRow?: (index: number, rowVersion: number) => TRow | undefined;
  index: number;
  listIndex: number;
  renderItemBatchRef: { current: RenderItemDebugBatch | null };
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  rowVersions$?: Observable<Record<string, number>>;
};

export type VirtualizedFixedDocumentListProps<TRow> = {
  adaptiveRender?: AdaptiveRenderConfig;
  dataVersion?: string | number;
  debugName?: string;
  extraData?: unknown;
  getItemSize?: (index: number) => number;
  getItemType?: (index: number) => string | undefined;
  initialRequestRowCount?: number;
  itemIndexes: Array<number | undefined>;
  ListHeaderComponent?: ReactElement;
  listHeaderHeight?: number;
  listRef?: Ref<LegendListRef>;
  onInitialRowsRequested?: (start: number, count: number) => void;
  onTopItemChanged?: (index: number, listIndex: number) => void;
  onVisibleRowsRequested?: (start: number, count: number, reason: VirtualizedDocumentRequestReason) => void;
  lineOverscan?: number;
  overscanRequestDelayMs?: number;
  recycleItems?: boolean;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
  getRow?: (index: number, rowVersion: number) => TRow | undefined;
  rowVersions$?: Observable<Record<string, number>>;
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
    debugSequence += 1;
    console.info(`${debugPrefix} ${event} ${JSON.stringify({
      debugName,
      seq: debugSequence,
      t: Number(debugNowMs().toFixed(1)),
      ...payload,
    })}`);
  }
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

type RenderItemDebugBatch = {
  count: number;
  first: number | null;
  last: number | null;
  missing: number;
  present: number;
};

type CallbackDebugBatch = {
  count: number;
  first: number | null;
  last: number | null;
  totalMs: number;
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

function recordCallbackDebug(debugName: string | undefined, event: string, batchRef: { current: CallbackDebugBatch | null }, index: number, startedAt: number) {
  if (__DEV__ && debugName) {
    batchRef.current ??= {
      count: 0,
      first: null,
      last: null,
      totalMs: 0,
    };
    const batch = batchRef.current;
    batch.count += 1;
    batch.first = batch.first === null ? index : Math.min(batch.first, index);
    batch.last = batch.last === null ? index : Math.max(batch.last, index);
    batch.totalMs += debugNowMs() - startedAt;

    if (batch.count === 1) {
      requestAnimationFrame(() => {
        const completedBatch = batchRef.current;
        batchRef.current = null;
        if (completedBatch) {
          debugLog(debugName, event, {
            count: completedBatch.count,
            first: completedBatch.first,
            last: completedBatch.last,
            totalMs: Number(completedBatch.totalMs.toFixed(1)),
          });
        }
      });
    }
  }
}

function createRowsState<TDocument, TRow, TStyle, TTiming>(
  snapshot: VirtualizedDocumentSnapshot<TDocument, TRow, TStyle, TTiming> | null,
  dataVersion: number,
): InternalRowsState<TDocument, TRow, TStyle, TTiming> {
  return {
    dataVersion,
    document: snapshot?.document ?? null,
    itemCount: snapshot?.itemCount ?? 0,
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
  rowVersion,
}: Omit<VirtualizedFixedDocumentListRowProps<TRow>, "rowVersions$"> & {
  rowVersion: number;
}) {
  const adaptiveRender = useAdaptiveRender();
  const effectiveAdaptiveRender = adaptiveRenderEnabled ? adaptiveRender : "normal";
  const row = useMemo(() => getRow?.(index, rowVersion), [getRow, index, rowVersion]);
  recordRenderItemDebug(debugName, renderItemBatchRef, index, row !== undefined);
  return renderRow({
    adaptiveRender: effectiveAdaptiveRender,
    index,
    listIndex,
    row,
    rowVersion,
  });
}

function VirtualizedFixedDocumentListVersionedRow<TRow>({
  rowVersions$,
  ...props
}: VirtualizedFixedDocumentListRowProps<TRow> & {
  rowVersions$: Observable<Record<string, number>>;
}) {
  const rowVersion = useValue(() => rowVersions$[String(props.index)].get() ?? 0);
  return <VirtualizedFixedDocumentListRowContent {...props} rowVersion={rowVersion} />;
}

function isArrayIndexProperty(property: string | symbol) {
  if (typeof property !== "string" || property.length === 0) {
    return false;
  }

  const index = Number(property);
  return Number.isInteger(index) && index >= 0 && String(index) === property;
}

function createIdentityIndexArray(length: number) {
  const count = Math.max(0, Math.floor(length));
  const target = new Array<number | undefined>(count);

  return new Proxy(target, {
    get(array, property, receiver) {
      if (isArrayIndexProperty(property)) {
        const index = Number(property);
        return index < count ? index : undefined;
      }
      return Reflect.get(array, property, receiver);
    },
  });
}

function getDocumentRangeForListRange(itemIndexes: readonly (number | undefined)[], start: number, count: number) {
  const safeListStart = Math.max(0, Math.floor(start));
  const safeListEnd = Math.min(itemIndexes.length, safeListStart + Math.max(0, Math.ceil(count)));
  let requestStart = Number.POSITIVE_INFINITY;
  let requestEnd = Number.NEGATIVE_INFINITY;

  for (let listIndex = safeListStart; listIndex < safeListEnd; listIndex += 1) {
    const itemIndex = itemIndexes[listIndex] ?? listIndex;
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
  getStyles,
  getTiming,
  requestRows,
  snapshot,
}: UseVirtualizedDocumentRowsOptions<TDocument, TRow, TStyle, TTiming>): VirtualizedDocumentRowsState<TRow, TStyle, TTiming> {
  const rowVersions$ = useObservable<Record<string, number>>({});
  const [rowsState, setRowsState] = useState(() => createRowsState(snapshot, 0));
  const rowsStateRef = useRef(rowsState);
  const snapshotDocument = snapshot?.document ?? null;
  const activeRowsState = rowsState.document === snapshotDocument
    ? rowsState
    : createRowsState(snapshot, rowsState.dataVersion + 1);

  useEffect(() => {
    setRowsState((currentRowsState) => {
      const nextRowsState = createRowsState(snapshot, currentRowsState.dataVersion + 1);
      rowsStateRef.current = nextRowsState;
      rowVersions$.set({});
      debugLog(debugName, "rows.reset", {
        dataVersion: nextRowsState.dataVersion,
        itemCount: nextRowsState.itemCount,
      });
      return nextRowsState;
    });
  }, [debugName, rowVersions$, snapshot]);

  useEffect(() => {
    rowsStateRef.current = activeRowsState;
  }, [activeRowsState]);

  const invalidateRange = useCallback((start: number, count: number) => {
    const loadedRowsState = rowsStateRef.current;
    const safeStart = Math.max(0, Math.floor(start));
    const safeEnd = Math.min(loadedRowsState.itemCount, safeStart + Math.max(0, Math.ceil(count)));
    for (let index = safeStart; index < safeEnd; index += 1) {
      bumpRowVersion(rowVersions$, index);
    }
  }, [rowVersions$]);

  const requestRange = useCallback((start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const loadedRowsState = rowsStateRef.current;
    if (loadedRowsState.document && requestRows) {
      const requestStartedAt = debugNowMs();
      const safeStart = Math.max(0, Math.floor(start));
      const safeEnd = Math.min(loadedRowsState.itemCount, safeStart + Math.max(0, Math.ceil(count)));

      if (safeStart < safeEnd) {
        const result = requestRows(loadedRowsState.document, safeStart, safeEnd - safeStart, options);
        const invalidate = result?.invalidate;
        debugLog(debugName, "rows.request", {
          count: safeEnd - safeStart,
          durationMs: Number((debugNowMs() - requestStartedAt).toFixed(1)),
          force: options?.force === true,
          invalidate: Array.isArray(invalidate) ? invalidate.length : invalidate === true,
          reason: options?.reason ?? "unknown",
          start: safeStart,
        });

        if (result?.styles || result?.timing) {
          setRowsState((currentRowsState) => {
            const isLoadedDocumentCurrent = rowsStateRef.current.document === loadedRowsState.document;
            if (currentRowsState.document !== loadedRowsState.document && !isLoadedDocumentCurrent) {
              debugLog(debugName, "rows.stateSkipped", {
                reason: options?.reason ?? "unknown",
              });
              return currentRowsState;
            }

            const baseRowsState = currentRowsState.document === loadedRowsState.document
              ? currentRowsState
              : loadedRowsState;
            const nextRowsState = {
              ...baseRowsState,
              styles: result.styles ?? baseRowsState.styles,
              timing: result.timing ?? baseRowsState.timing,
            };
            rowsStateRef.current = nextRowsState;
            return nextRowsState;
          });
        }

        if (invalidate === true) {
          invalidateRange(safeStart, safeEnd - safeStart);
        } else if (Array.isArray(invalidate)) {
          for (const rowIndex of invalidate) {
            bumpRowVersion(rowVersions$, rowIndex);
          }
        }
      }
    }
  }, [debugName, invalidateRange, requestRows, rowVersions$]);

  const itemIndexes = useMemo(
    () => createIdentityIndexArray(activeRowsState.itemCount),
    [activeRowsState.itemCount],
  );

  return {
    dataVersion: activeRowsState.dataVersion,
    itemCount: activeRowsState.itemCount,
    itemIndexes,
    invalidateRange,
    requestRange,
    rowVersions$,
    styles: activeRowsState.styles,
    timing: activeRowsState.timing,
  };
}

export function VirtualizedFixedDocumentList<TRow>({
  adaptiveRender,
  dataVersion,
  debugName,
  extraData,
  getRow,
  getItemSize,
  getItemType,
  initialRequestRowCount,
  itemIndexes,
  ListHeaderComponent,
  listHeaderHeight = 0,
  listRef,
  lineOverscan = 0,
  onInitialRowsRequested,
  onTopItemChanged,
  onVisibleRowsRequested,
  overscanRequestDelayMs = 0,
  recycleItems = true,
  renderRow,
  requestRange,
  rowVersions$: rowVersionsProp$,
  rowHeight,
  style,
}: VirtualizedFixedDocumentListProps<TRow>) {
  const hasRequestedInitialRangeRef = useRef(false);
  const overscanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountStartedAtRef = useRef(debugNowMs());
  const hasLoggedFirstCommitRef = useRef(false);
  const hasLoggedFirstLegendListRef = useRef(false);
  const hasLoggedFirstLayoutRef = useRef(false);
  const hasLoggedFirstRenderItemRef = useRef(false);
  const hasLoggedFirstGetItemSizeRef = useRef(false);
  const hasLoggedFirstGetItemTypeRef = useRef(false);
  const hasLoggedFirstKeyExtractorRef = useRef(false);
  const renderItemBatchRef = useRef<RenderItemDebugBatch | null>(null);
  const getItemSizeBatchRef = useRef<CallbackDebugBatch | null>(null);
  const getItemTypeBatchRef = useRef<CallbackDebugBatch | null>(null);
  const keyExtractorBatchRef = useRef<CallbackDebugBatch | null>(null);
  const renderItemCallbackBatchRef = useRef<CallbackDebugBatch | null>(null);
  const renderCountRef = useRef(0);
  const internalListRef = useRef<LegendListRef | null>(null);
  const lastTopItemRef = useRef<{ index: number; listIndex: number } | null>(null);
  const listExtraData = useMemo(
    () => ({
      extraData,
    }),
    [extraData],
  );

  useEffect(() => {
    renderCountRef.current += 1;
    debugLog(debugName, "list.renderCommitted", {
      dataVersion,
      elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
      itemCount: itemIndexes.length,
      renderCount: renderCountRef.current,
    });
  });

  useEffect(() => {
    if (!hasLoggedFirstCommitRef.current) {
      hasLoggedFirstCommitRef.current = true;
      debugLog(debugName, "list.commit.first", {
        dataVersion,
        elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
        itemCount: itemIndexes.length,
      });
    } else {
      debugLog(debugName, "list.commit", {
        dataVersion,
        elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
        itemCount: itemIndexes.length,
        renderCount: renderCountRef.current,
      });
    }
  });

  useEffect(() => () => {
    if (overscanTimeoutRef.current) {
      clearTimeout(overscanTimeoutRef.current);
      overscanTimeoutRef.current = null;
    }
  }, []);

  const setListRef = useCallback((list: LegendListRef | null) => {
    if (list && !hasLoggedFirstLegendListRef.current) {
      hasLoggedFirstLegendListRef.current = true;
      debugLog(debugName, "list.legendRef.first", {
        elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
        itemCount: itemIndexes.length,
      });
    } else {
      debugLog(debugName, "list.legendRef", {
        elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
        hasRef: list !== null,
        itemCount: itemIndexes.length,
      });
    }
    internalListRef.current = list;
    assignRef(listRef, list);
  }, [debugName, itemIndexes.length, listRef]);

  const emitTopItemChanged = useCallback(() => {
    if (onTopItemChanged) {
      const topListIndex = internalListRef.current?.getState().start;
      if (topListIndex !== undefined && topListIndex >= 0) {
        const topItemIndex = itemIndexes[topListIndex] ?? topListIndex;
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
    const rowOffsetY = Math.max(0, offsetY - listHeaderHeight);
    const visibleStart = Math.floor(rowOffsetY / rowHeight);
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
      rowOffsetY,
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
  }, [debugName, initialRequestRowCount, itemIndexes, lineOverscan, listHeaderHeight, onVisibleRowsRequested, requestRange, rowHeight]);

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
    const eventName = hasLoggedFirstLayoutRef.current ? "list.layout" : "list.layout.first";
    hasLoggedFirstLayoutRef.current = true;
    debugLog(debugName, "list.layout", {
      dataVersion,
      elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
      height,
      initialAlreadyRequested: hasRequestedInitialRangeRef.current,
      itemCount: itemIndexes.length,
    });
    debugLog(debugName, eventName, {
      dataVersion,
      elapsedSinceMountMs: Number((debugNowMs() - mountStartedAtRef.current).toFixed(1)),
      height,
      initialAlreadyRequested: hasRequestedInitialRangeRef.current,
      itemCount: itemIndexes.length,
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
  }, [dataVersion, debugName, emitTopItemChanged, itemIndexes.length, lineOverscan, onInitialRowsRequested, overscanRequestDelayMs, requestLegendListRange, requestVisibleRange]);

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
    ({ index: listIndex, item }: LegendListRenderItemProps<number | undefined>) => {
      const renderItemStartedAt = debugNowMs();
      const index = item ?? listIndex;
      if (!hasLoggedFirstRenderItemRef.current) {
        hasLoggedFirstRenderItemRef.current = true;
        debugLog(debugName, "list.renderItemCallback.first", {
          elapsedSinceMountMs: Number((renderItemStartedAt - mountStartedAtRef.current).toFixed(1)),
          index,
          listIndex,
        });
      }
      const rowProps = {
        adaptiveRenderEnabled: adaptiveRender !== undefined,
        debugName,
        getRow,
        index,
        listIndex,
        renderItemBatchRef,
        renderRow,
      };

      const renderedItem = rowVersionsProp$ ? (
        <VirtualizedFixedDocumentListVersionedRow
          {...rowProps}
          rowVersions$={rowVersionsProp$}
        />
      ) : (
        <VirtualizedFixedDocumentListRowContent {...rowProps} rowVersion={0} />
      );
      recordCallbackDebug(debugName, "list.renderItemCallbackFrame", renderItemCallbackBatchRef, index, renderItemStartedAt);
      return renderedItem;
    },
    [adaptiveRender, debugName, getRow, renderRow, rowVersionsProp$],
  );

  const getFixedItemSize = useCallback((item: number | undefined, listIndex: number) => {
    const startedAt = debugNowMs();
    const index = item ?? listIndex;
    if (!hasLoggedFirstGetItemSizeRef.current) {
      hasLoggedFirstGetItemSizeRef.current = true;
      debugLog(debugName, "list.getFixedItemSize.first", {
        elapsedSinceMountMs: Number((startedAt - mountStartedAtRef.current).toFixed(1)),
        index,
        listIndex,
      });
    }
    const size = getItemSize?.(index) ?? rowHeight;
    recordCallbackDebug(debugName, "list.getFixedItemSizeFrame", getItemSizeBatchRef, index, startedAt);
    return size;
  }, [debugName, getItemSize, rowHeight]);

  const getLegendItemType = useCallback((item: number | undefined, listIndex: number) => {
    const startedAt = debugNowMs();
    const index = item ?? listIndex;
    if (!hasLoggedFirstGetItemTypeRef.current) {
      hasLoggedFirstGetItemTypeRef.current = true;
      debugLog(debugName, "list.getItemType.first", {
        elapsedSinceMountMs: Number((startedAt - mountStartedAtRef.current).toFixed(1)),
        index,
        listIndex,
      });
    }
    const itemType = getItemType?.(index);
    recordCallbackDebug(debugName, "list.getItemTypeFrame", getItemTypeBatchRef, index, startedAt);
    return itemType;
  }, [debugName, getItemType]);

  const keyExtractor = useCallback((item: number | undefined, index: number) => {
    const startedAt = debugNowMs();
    const key = String(item ?? index);
    if (!hasLoggedFirstKeyExtractorRef.current) {
      hasLoggedFirstKeyExtractorRef.current = true;
      debugLog(debugName, "list.keyExtractor.first", {
        elapsedSinceMountMs: Number((startedAt - mountStartedAtRef.current).toFixed(1)),
        index: item ?? index,
        listIndex: index,
      });
    }
    recordCallbackDebug(debugName, "list.keyExtractorFrame", keyExtractorBatchRef, item ?? index, startedAt);
    return key;
  }, [debugName]);

  return (
    <LegendList
      data={itemIndexes}
      dataVersion={dataVersion}
      extraData={listExtraData}
      experimental_adaptiveRender={adaptiveRender}
      getFixedItemSize={getFixedItemSize}
      getItemType={getLegendItemType}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeaderComponent}
      ref={setListRef}
      onLayout={handleLayout}
      onScroll={handleScroll}
      recycleItems={recycleItems}
      renderItem={renderItem}
      style={style}
    />
  );
}

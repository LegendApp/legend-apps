import {
  createInstrumentationLogger,
  instrumentationNowMs,
  type InstrumentationLogger,
} from "@legend-apps/instrumentation";
import {
  LegendList,
  type AdaptiveRender,
  type AdaptiveRenderConfig,
  type LegendListRef,
  type LegendListDataSource,
  type ViewabilityConfig,
  useAdaptiveRender,
} from "@legendapp/list/react-native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type Ref } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from "react-native";

declare const __DEV__: boolean | undefined;

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

export type VirtualizedDocumentVisibleRangeInfo = {
  reason: VirtualizedDocumentRequestReason;
  scrollVelocity: number;
};

export type VirtualizedDocumentRowsRequestResult<TStyle, TTiming> = {
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
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
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
};

type VirtualizedFixedDocumentListRowProps<TRow> = {
  adaptiveRenderEnabled: boolean;
  debugName?: string;
  getRow?: (index: number, listIndex: number) => TRow | undefined;
  index: number;
  listIndex: number;
  renderItemBatchRef: { current: RenderItemDebugBatch | null };
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
};

type VirtualizedFixedDocumentListDocumentIndexMapper = (index: number, listIndex: number) => number | undefined;

export type VirtualizedFixedDocumentListProps<TRow> = {
  adaptiveRender?: AdaptiveRenderConfig;
  contentContainerStyle?: StyleProp<ViewStyle>;
  contentInset?: NativeScrollEvent["contentInset"];
  viewabilityConfig?: ViewabilityConfig;
  dataKey?: string | number;
  dataVersion?: string | number;
  debugName?: string;
  estimatedItemSize?: number;
  getItemSize?: (index: number) => number;
  getItemType?: (index: number) => string | undefined;
  getDocumentIndex?: VirtualizedFixedDocumentListDocumentIndexMapper;
  initialRequestRowCount?: number;
  dataSource?: LegendListDataSource<number | undefined>;
  itemIndexes?: Array<number | undefined>;
  itemKeyVersion?: string | number;
  ListHeaderComponent?: ReactElement;
  listHeaderHeight?: number;
  listRef?: Ref<LegendListRef>;
  onInitialRowsRequested?: (start: number, count: number) => void;
  onTopItemChanged?: (index: number, listIndex: number) => void;
  onVisibleRowsRequested?: (start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => void;
  lineOverscan?: number;
  overscanRequestDelayMs?: number;
  recycleItems?: boolean;
  requestRangesOnScroll?: boolean;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  requestRange: (start: number, count: number, options?: VirtualizedDocumentRequestOptions) => void;
  getRow?: (index: number, listIndex: number) => TRow | undefined;
  rowHeight: number;
  style?: StyleProp<ViewStyle>;
};

const debugTimingLabel = "DEBUG-code-cold-v1";
const debugLoggers = new Map<string, InstrumentationLogger>();

function getDebugLogger(debugName: string | undefined) {
  let logger: InstrumentationLogger | undefined;
  if (debugName) {
    logger = debugLoggers.get(debugName);
    if (!logger) {
      logger = createInstrumentationLogger({
        debugId: debugName,
        namespace: debugName,
        timingLabel: debugTimingLabel,
      });
      debugLoggers.set(debugName, logger);
    }
  }
  return logger;
}

function debugLog(debugName: string | undefined, event: string, payload: Record<string, unknown>) {
  getDebugLogger(debugName)?.timing(event, () => ({
    debugName,
    t: Number(instrumentationNowMs().toFixed(1)),
    ...payload,
  }));
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

function useLatestValueRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
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
    batch.totalMs += instrumentationNowMs() - startedAt;

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

function VirtualizedFixedDocumentListRowContent<TRow>({
  adaptiveRenderEnabled,
  debugName,
  getRow,
  index,
  listIndex,
  renderItemBatchRef,
  renderRow,
}: VirtualizedFixedDocumentListRowProps<TRow>) {
  const adaptiveRender = useAdaptiveRender();
  const effectiveAdaptiveRender = adaptiveRenderEnabled ? adaptiveRender : "normal";
  const row = useMemo(() => getRow?.(index, listIndex), [getRow, index, listIndex]);
  recordRenderItemDebug(debugName, renderItemBatchRef, index, row !== undefined);
  return renderRow({
    adaptiveRender: effectiveAdaptiveRender,
    index,
    listIndex,
    row,
  });
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

function getDocumentRangeForListRange(
  itemCount: number,
  getItemIndex: (index: number) => number | undefined,
  start: number,
  count: number,
  getDocumentIndex?: VirtualizedFixedDocumentListDocumentIndexMapper,
) {
  const safeListStart = Math.max(0, Math.floor(start));
  const safeListEnd = Math.min(itemCount, safeListStart + Math.max(0, Math.ceil(count)));
  let requestStart = Number.POSITIVE_INFINITY;
  let requestEnd = Number.NEGATIVE_INFINITY;

  for (let listIndex = safeListStart; listIndex < safeListEnd; listIndex += 1) {
    const itemIndex = getItemIndex(listIndex) ?? listIndex;
    const documentIndex = getDocumentIndex?.(itemIndex, listIndex) ?? itemIndex;
    if (Number.isFinite(documentIndex)) {
      requestStart = Math.min(requestStart, documentIndex);
      requestEnd = Math.max(requestEnd, documentIndex + 1);
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
      debugLog(debugName, "rows.reset", {
        dataVersion: nextRowsState.dataVersion,
        itemCount: nextRowsState.itemCount,
      });
      return nextRowsState;
    });
  }, [debugName, snapshot]);

  useEffect(() => {
    rowsStateRef.current = activeRowsState;
  }, [activeRowsState]);

  const requestRange = useCallback((start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const loadedRowsState = rowsStateRef.current;
    if (loadedRowsState.document && requestRows) {
      const requestStartedAt = instrumentationNowMs();
      const safeStart = Math.max(0, Math.floor(start));
      const safeEnd = Math.min(loadedRowsState.itemCount, safeStart + Math.max(0, Math.ceil(count)));

      if (safeStart < safeEnd) {
        const result = requestRows(loadedRowsState.document, safeStart, safeEnd - safeStart, options);
        debugLog(debugName, "rows.request", {
          count: safeEnd - safeStart,
          durationMs: Number((instrumentationNowMs() - requestStartedAt).toFixed(1)),
          force: options?.force === true,
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

      }
    }
  }, [debugName, requestRows]);

  const itemIndexes = useMemo(
    () => createIdentityIndexArray(activeRowsState.itemCount),
    [activeRowsState.itemCount],
  );

  return {
    dataVersion: activeRowsState.dataVersion,
    itemCount: activeRowsState.itemCount,
    itemIndexes,
    requestRange,
    styles: activeRowsState.styles,
    timing: activeRowsState.timing,
  };
}

export function VirtualizedFixedDocumentList<TRow>({
  adaptiveRender,
  contentInset,
  dataKey,
  dataVersion,
  dataSource,
  debugName,
  estimatedItemSize,
  contentContainerStyle,
  getRow,
  getDocumentIndex,
  getItemSize,
  getItemType,
  initialRequestRowCount,
  itemIndexes,
  itemKeyVersion,
  ListHeaderComponent,
  listHeaderHeight = 0,
  listRef,
  lineOverscan = 0,
  onInitialRowsRequested,
  onTopItemChanged,
  onVisibleRowsRequested,
  overscanRequestDelayMs = 0,
  recycleItems = true,
  requestRangesOnScroll = true,
  renderRow,
  requestRange,
  rowHeight,
  style,
  viewabilityConfig,
}: VirtualizedFixedDocumentListProps<TRow>) {
  const itemCount = dataSource?.getLength() ?? itemIndexes?.length ?? 0;
  const getItemIndex = useCallback(
    (index: number) => dataSource?.getItem(index) ?? itemIndexes?.[index],
    [dataSource, itemIndexes],
  );
  const hasRequestedInitialRangeRef = useRef(false);
  const overscanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountStartedAtRef = useRef(instrumentationNowMs());
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
  const lastScrollSampleRef = useRef<{ offsetY: number; timestamp: number } | null>(null);
  const lastTopItemRef = useRef<{ index: number; listIndex: number } | null>(null);
  const latestPropsRef = useLatestValueRef({
    adaptiveRenderEnabled: adaptiveRender !== undefined,
    dataKey,
    dataVersion,
    debugName,
    getDocumentIndex,
    getItemSize,
    getItemType,
    getRow,
    initialRequestRowCount,
    itemCount,
    getItemIndex,
    itemIndexes,
    itemKeyVersion,
    lineOverscan,
    listHeaderHeight,
    listRef,
    onInitialRowsRequested,
    onTopItemChanged,
    onVisibleRowsRequested,
    overscanRequestDelayMs,
    requestRange,
    requestRangesOnScroll,
    renderRow,
    rowHeight,
  });
  useEffect(() => {
    renderCountRef.current += 1;
    debugLog(debugName, "list.renderCommitted", {
      dataVersion,
      elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
      itemCount,
      renderCount: renderCountRef.current,
    });
  });

  useEffect(() => {
    if (!hasLoggedFirstCommitRef.current) {
      hasLoggedFirstCommitRef.current = true;
      debugLog(debugName, "list.commit.first", {
        dataVersion,
        elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
        itemCount,
      });
    } else {
      debugLog(debugName, "list.commit", {
        dataVersion,
        elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
        itemCount,
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
    const { debugName, itemCount, listRef } = latestPropsRef.current;
    if (list && !hasLoggedFirstLegendListRef.current) {
      hasLoggedFirstLegendListRef.current = true;
      debugLog(debugName, "list.legendRef.first", {
        elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
        itemCount,
      });
    } else {
      debugLog(debugName, "list.legendRef", {
        elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
        hasRef: list !== null,
        itemCount,
      });
    }
    internalListRef.current = list;
    assignRef(listRef, list);
  }, [latestPropsRef]);

  const emitTopItemChanged = useCallback((listIndex: number, itemIndex: number | undefined) => {
    const { getItemIndex, onTopItemChanged } = latestPropsRef.current;
    if (onTopItemChanged && listIndex >= 0) {
      const topItemIndex = itemIndex ?? getItemIndex(listIndex) ?? listIndex;
      const lastTopItem = lastTopItemRef.current;
      if (
        topItemIndex !== undefined &&
        (lastTopItem?.index !== topItemIndex || lastTopItem.listIndex !== listIndex)
      ) {
        lastTopItemRef.current = {
          index: topItemIndex,
          listIndex,
        };
        onTopItemChanged(topItemIndex, listIndex);
      }
    }
  }, [latestPropsRef]);

  const requestVisibleRange = useCallback((offsetY: number, height: number, includeOverscan: boolean, reason: VirtualizedDocumentRequestReason, scrollVelocity = 0) => {
    const {
      debugName,
      getDocumentIndex,
      initialRequestRowCount,
      getItemIndex,
      itemCount,
      lineOverscan,
      listHeaderHeight,
      onVisibleRowsRequested,
      requestRange,
      rowHeight,
    } = latestPropsRef.current;
    const rowOffsetY = Math.max(0, offsetY - listHeaderHeight);
    const visibleStart = Math.floor(rowOffsetY / rowHeight);
    const visibleCount = Math.ceil(height / rowHeight);
    const listStart = includeOverscan ? visibleStart - lineOverscan : visibleStart;
    const initialCount = initialRequestRowCount ?? visibleCount;
    const listCount = includeOverscan ? visibleCount + lineOverscan * 2 : Math.max(visibleCount, initialCount);
    const visibleDocumentRange = getDocumentRangeForListRange(itemCount, getItemIndex, visibleStart, visibleCount, getDocumentIndex);
    const documentRange = getDocumentRangeForListRange(itemCount, getItemIndex, listStart, listCount, getDocumentIndex);
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
      onVisibleRowsRequested?.(visibleDocumentRange.start, visibleDocumentRange.count, { reason, scrollVelocity });
    }
    return documentRange;
  }, [latestPropsRef]);

  const requestLegendListRange = useCallback((reason: VirtualizedDocumentRequestReason, scrollVelocity = 0) => {
    const {
      debugName,
      getDocumentIndex,
      getItemIndex,
      itemCount,
      onVisibleRowsRequested,
      requestRange,
    } = latestPropsRef.current;
    const listState = internalListRef.current?.getState();
    if (listState && listState.start >= 0 && listState.end >= listState.start) {
      const requestListStart = listState.startBuffered >= 0 ? listState.startBuffered : listState.start;
      const requestListEnd = listState.endBuffered >= requestListStart ? listState.endBuffered : listState.end;
      const documentRange = getDocumentRangeForListRange(itemCount, getItemIndex, requestListStart, requestListEnd - requestListStart + 1, getDocumentIndex);
      const visibleDocumentRange = getDocumentRangeForListRange(itemCount, getItemIndex, listState.start, listState.end - listState.start + 1, getDocumentIndex);
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
        onVisibleRowsRequested?.(visibleDocumentRange.start, visibleDocumentRange.count, { reason, scrollVelocity });
      }
      return true;
    }

    return false;
  }, [latestPropsRef]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const {
      dataVersion,
      debugName,
      itemCount,
      lineOverscan,
      onInitialRowsRequested,
      overscanRequestDelayMs,
      requestRangesOnScroll,
    } = latestPropsRef.current;
    const height = event.nativeEvent.layout.height;
    const eventName = hasLoggedFirstLayoutRef.current ? "list.layout" : "list.layout.first";
    hasLoggedFirstLayoutRef.current = true;
    debugLog(debugName, "list.layout", {
      dataVersion,
      elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
      height,
      initialAlreadyRequested: hasRequestedInitialRangeRef.current,
      itemCount,
    });
    debugLog(debugName, eventName, {
      dataVersion,
      elapsedSinceMountMs: Number((instrumentationNowMs() - mountStartedAtRef.current).toFixed(1)),
      height,
      initialAlreadyRequested: hasRequestedInitialRangeRef.current,
      itemCount,
    });

    if (!hasRequestedInitialRangeRef.current) {
      hasRequestedInitialRangeRef.current = true;
      if (requestRangesOnScroll) {
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
      }
    } else if (requestRangesOnScroll) {
      if (!requestLegendListRange("overscan")) {
        requestVisibleRange(0, height, true, "overscan");
      }
    }
  }, [latestPropsRef, requestLegendListRange, requestVisibleRange]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { debugName, requestRangesOnScroll } = latestPropsRef.current;
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const timestamp = instrumentationNowMs();
    const previousSample = lastScrollSampleRef.current;
    const elapsedMs = previousSample ? Math.max(1, timestamp - previousSample.timestamp) : 0;
    const scrollVelocity = previousSample ? Math.abs(contentOffset.y - previousSample.offsetY) / elapsedMs : 0;
    lastScrollSampleRef.current = {
      offsetY: contentOffset.y,
      timestamp,
    };
    debugLog(debugName, "list.scroll", {
      height: layoutMeasurement.height,
      offsetY: contentOffset.y,
      scrollVelocity,
    });
    if (requestRangesOnScroll) {
      if (!requestLegendListRange("scroll", scrollVelocity)) {
        requestVisibleRange(contentOffset.y, layoutMeasurement.height, true, "scroll", scrollVelocity);
      }
    }
  }, [latestPropsRef, requestLegendListRange, requestVisibleRange]);

  const handleFirstVisibleItemChanged = useCallback((info: { index: number; item: number | undefined }) => {
    emitTopItemChanged(info.index, info.item);
  }, [emitTopItemChanged]);

  const renderItem = useCallback(
    ({ index: listIndex, item }: { index: number; item: number | undefined }) => {
      const {
        adaptiveRenderEnabled,
        debugName,
        getRow,
        renderRow,
      } = latestPropsRef.current;
      const renderItemStartedAt = instrumentationNowMs();
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
        adaptiveRenderEnabled,
        debugName,
        getRow,
        index,
        listIndex,
        renderItemBatchRef,
        renderRow,
      };

      const renderedItem = <VirtualizedFixedDocumentListRowContent {...rowProps} />;
      recordCallbackDebug(debugName, "list.renderItemCallbackFrame", renderItemCallbackBatchRef, index, renderItemStartedAt);
      return renderedItem;
    },
    [latestPropsRef],
  );

  const getFixedItemSize = useCallback((item: number | undefined, listIndex: number) => {
    const { debugName, getItemSize, rowHeight } = latestPropsRef.current;
    const startedAt = instrumentationNowMs();
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
  }, [latestPropsRef]);

  const getLegendItemType = useCallback((item: number | undefined, listIndex: number) => {
    const { debugName, getItemType } = latestPropsRef.current;
    const startedAt = instrumentationNowMs();
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
  }, [latestPropsRef]);

  const keyExtractor = useCallback((item: number | undefined, index: number) => {
    const { dataKey, dataVersion, debugName, itemKeyVersion } = latestPropsRef.current;
    const keyVersion = itemKeyVersion ?? dataVersion;
    const dataKeyPrefix = dataKey === undefined ? "" : `${dataKey}:`;
    const startedAt = instrumentationNowMs();
    const rowIndex = item ?? index;
    const key = keyVersion === undefined
      ? `${dataKeyPrefix}${rowIndex}`
      : `${dataKeyPrefix}${keyVersion}:${rowIndex}`;
    if (!hasLoggedFirstKeyExtractorRef.current) {
      hasLoggedFirstKeyExtractorRef.current = true;
      debugLog(debugName, "list.keyExtractor.first", {
        elapsedSinceMountMs: Number((startedAt - mountStartedAtRef.current).toFixed(1)),
        index: rowIndex,
        listIndex: index,
      });
    }
    recordCallbackDebug(debugName, "list.keyExtractorFrame", keyExtractorBatchRef, rowIndex, startedAt);
    return key;
  }, [latestPropsRef]);

  const sharedProps = {
    contentContainerStyle,
    contentInset,
    dataKey,
    dataVersion,
    estimatedItemSize: estimatedItemSize ?? rowHeight,
    experimental_adaptiveRender: adaptiveRender,
    getFixedItemSize,
    getItemType: getLegendItemType,
    ListHeaderComponent,
    ref: setListRef,
    onLayout: handleLayout,
    onFirstVisibleItemChanged: handleFirstVisibleItemChanged,
    onScroll: handleScroll,
    recycleItems,
    renderItem,
    style,
    viewabilityConfig,
  };
  return dataSource ? (
    <LegendList
      {...sharedProps}
      dataSource={dataSource}
    />
  ) : (
    <LegendList
      {...sharedProps}
      data={itemIndexes ?? []}
      keyExtractor={keyExtractor}
    />
  );
}

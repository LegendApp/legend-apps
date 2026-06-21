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

export type UseVirtualizedDocumentRowsOptions<TDocument, TRow, TStyle, TTiming> = {
  getRowIndex: (row: TRow) => number;
  getRows: (document: TDocument, start: number, count: number) => readonly TRow[];
  getStyles?: (document: TDocument) => readonly TStyle[];
  getTiming?: (document: TDocument) => TTiming;
  snapshot: VirtualizedDocumentSnapshot<TDocument, TRow, TStyle, TTiming> | null;
};

export type VirtualizedDocumentRowsState<TRow, TStyle, TTiming> = {
  itemIndexes: number[];
  itemCount: number;
  requestRange: (start: number, count: number) => void;
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
  itemIndexes: number[];
  lineOverscan?: number;
  recycleItems?: boolean;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<TRow>) => ReactElement;
  requestRange: (start: number, count: number) => void;
  rowCache: Map<number, TRow>;
  rowsVersion: number;
  rowHeight: number;
  style?: StyleProp<ViewStyle>;
};

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
  getRowIndex,
  getRows,
  getStyles,
  getTiming,
  snapshot,
}: UseVirtualizedDocumentRowsOptions<TDocument, TRow, TStyle, TTiming>): VirtualizedDocumentRowsState<TRow, TStyle, TTiming> {
  const [rowsState, setRowsState] = useState(() => createRowsState(snapshot, getRowIndex));
  const rowsStateRef = useRef(rowsState);

  useEffect(() => {
    const nextRowsState = createRowsState(snapshot, getRowIndex);
    rowsStateRef.current = nextRowsState;
    setRowsState(nextRowsState);
  }, [getRowIndex, snapshot]);

  useEffect(() => {
    rowsStateRef.current = rowsState;
  }, [rowsState]);

  const requestRange = useCallback((start: number, count: number) => {
    const loadedRowsState = rowsStateRef.current;
    if (loadedRowsState.document) {
      const safeStart = Math.max(0, Math.floor(start));
      const safeEnd = Math.min(loadedRowsState.itemCount, safeStart + Math.max(0, Math.ceil(count)));

      if (safeStart < safeEnd) {
        let hasMissingRow = false;
        for (let index = safeStart; index < safeEnd; index += 1) {
          if (!loadedRowsState.rowCache.has(index)) {
            hasMissingRow = true;
            break;
          }
        }

        if (hasMissingRow) {
          const fetchedRows = getRows(loadedRowsState.document, safeStart, safeEnd - safeStart);
          const styles = getStyles?.(loadedRowsState.document) ?? loadedRowsState.styles;
          const timing = getTiming?.(loadedRowsState.document) ?? loadedRowsState.timing;

          setRowsState((currentRowsState) => {
            if (currentRowsState.document !== loadedRowsState.document) {
              return currentRowsState;
            }

            const nextRowCache = new Map(currentRowsState.rowCache);
            for (const row of fetchedRows) {
              nextRowCache.set(getRowIndex(row), row);
            }

            return {
              ...currentRowsState,
              rowCache: nextRowCache,
              rowsVersion: currentRowsState.rowsVersion + 1,
              styles,
              timing,
            };
          });
        }
      }
    }
  }, [getRowIndex, getRows, getStyles, getTiming]);

  const itemIndexes = useMemo(
    () => Array.from({ length: rowsState.itemCount }, (_, index) => index),
    [rowsState.itemCount],
  );

  return {
    itemCount: rowsState.itemCount,
    itemIndexes,
    requestRange,
    rowCache: rowsState.rowCache,
    rowsVersion: rowsState.rowsVersion,
    styles: rowsState.styles,
    timing: rowsState.timing,
  };
}

export function VirtualizedFixedDocumentList<TRow>({
  itemIndexes,
  lineOverscan = 0,
  recycleItems = true,
  renderRow,
  requestRange,
  rowCache,
  rowHeight,
  rowsVersion,
  style,
}: VirtualizedFixedDocumentListProps<TRow>) {
  const requestVisibleRange = useCallback((offsetY: number, height: number) => {
    const start = Math.floor(offsetY / rowHeight) - lineOverscan;
    const count = Math.ceil(height / rowHeight) + lineOverscan * 2;
    requestRange(start, count);
  }, [lineOverscan, requestRange, rowHeight]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    requestVisibleRange(0, event.nativeEvent.layout.height);
  }, [requestVisibleRange]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    requestVisibleRange(contentOffset.y, layoutMeasurement.height);
  }, [requestVisibleRange]);

  const renderItem = useCallback(
    ({ index: listIndex, item: index }: LegendListRenderItemProps<number>) => renderRow({
      index,
      listIndex,
      row: rowCache.get(index),
    }),
    [renderRow, rowCache],
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

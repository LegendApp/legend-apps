import {
  useCallback,
  useEffect,
  useRef,
  type ReactElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import type { SyntaxDocument, SyntaxHighlightTiming, SyntaxRenderLine, SyntaxStyle } from "@legend-desktop/syntax-parser";
import {
  useVirtualizedDocumentRows,
  VirtualizedFixedDocumentList,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedDocumentRowsState,
  type VirtualizedDocumentSnapshot,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";

export const sourceViewerRowHeight = 22;
export const sourceViewerLineNumberWidth = 72;
export const sourceViewerCodeFontFamily = "Menlo";
export const sourceViewerInitialRequestRowCount = 80;
export const sourceViewerLineOverscan = 160;
export const sourceViewerOverscanRequestDelayMs = 80;

export type SyntaxStyleMap = Map<number, SyntaxStyle>;

// Keep this narrow: source-viewer code rows only, not a general replacement for React Native Text.
export type LightTextProps = {
  allowFontScaling?: boolean;
  children?: ReactNode;
  ellipsizeMode?: TextProps["ellipsizeMode"];
  numberOfLines?: number;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
};

type NativeTextModule = {
  NativeText?: ComponentType<LightTextProps>;
  NativeVirtualText?: ComponentType<LightTextProps>;
};

function resolveNativeTextComponents() {
  try {
    const nativeTextModule = require("react-native/Libraries/Text/TextNativeComponent") as NativeTextModule;
    const NativeTextComponent = nativeTextModule.NativeText ?? Text;
    return {
      NativeTextComponent,
      NativeVirtualTextComponent: nativeTextModule.NativeVirtualText ?? NativeTextComponent,
    };
  } catch {
    return {
      NativeTextComponent: Text,
      NativeVirtualTextComponent: Text,
    };
  }
}

const { NativeTextComponent, NativeVirtualTextComponent } = resolveNativeTextComponents();

function normalizeNumberOfLines(numberOfLines: number | undefined) {
  return numberOfLines != null && !(numberOfLines >= 0) ? 0 : numberOfLines;
}

export function LightText({
  allowFontScaling = true,
  ellipsizeMode = "tail",
  numberOfLines,
  ...props
}: LightTextProps) {
  return (
    <NativeTextComponent
      allowFontScaling={allowFontScaling}
      ellipsizeMode={ellipsizeMode}
      numberOfLines={normalizeNumberOfLines(numberOfLines)}
      {...props}
    />
  );
}

export function LightInlineText({ children, style }: Pick<LightTextProps, "children" | "style">) {
  return (
    <NativeVirtualTextComponent style={style}>
      {children}
    </NativeVirtualTextComponent>
  );
}

export type AfterEffectTiming = {
  frameAt: number;
  microtaskAt: number;
  secondFrameAt: number;
  timeoutAt: number;
};

export function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function elapsedMs(start: number, end = nowMs()) {
  return Math.max(0, end - start);
}

export function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export function measureAfterEffect(callback: (timing: AfterEffectTiming) => void) {
  const timing = {
    frameAt: 0,
    microtaskAt: 0,
    secondFrameAt: 0,
    timeoutAt: 0,
  };

  const maybeComplete = () => {
    if (timing.frameAt > 0 && timing.microtaskAt > 0 && timing.secondFrameAt > 0 && timing.timeoutAt > 0) {
      callback(timing);
    }
  };

  Promise.resolve().then(() => {
    timing.microtaskAt = nowMs();
    maybeComplete();
  });
  setTimeout(() => {
    timing.timeoutAt = nowMs();
    maybeComplete();
  }, 0);
  requestAnimationFrame(() => {
    timing.frameAt = nowMs();
    requestAnimationFrame(() => {
      timing.secondFrameAt = nowMs();
      maybeComplete();
    });
    maybeComplete();
  });
}

export type SourceDocumentTiming = {
  colorCount: number;
  contextMs: number;
  indexLinesMs: number;
  initialLinesMs: number;
  jsLoadMs: number;
  lineCount: number;
  mapFileMs: number;
  nativeTotalMs: number;
  tokenCount: number;
  tokenizeMs: number;
};

export type SourceDocumentSnapshot = VirtualizedDocumentSnapshot<SyntaxDocument, SyntaxRenderLine, SyntaxStyle, SourceDocumentTiming>;

export type SourceDocumentRowsTrace = {
  count: number;
  document: SyntaxDocument;
  finishedAt: number;
  reason: VirtualizedDocumentRequestReason;
  start: number;
  startedAt: number;
};

export type SourceDocumentRowsState = VirtualizedDocumentRowsState<SyntaxRenderLine, SyntaxStyle, SourceDocumentTiming> & {
  handleInitialRowsRequested: (start: number, count: number) => void;
};

export type UseSourceDocumentRowsOptions = {
  backgroundTokenizationChunkLineCount?: number;
  debugName?: string;
  initialHighlightRowCount?: number;
  onBackgroundTokenizationStart?: (event: {
    document: SyntaxDocument;
    tokenizedLineCount: number;
  }) => void;
  onRowsFetched?: (trace: SourceDocumentRowsTrace, rowsVersion: number) => void;
  snapshot: SourceDocumentSnapshot | null;
};

export type SourceDocumentViewProps = {
  debugName?: string;
  initialRequestRowCount?: number;
  lineOverscan?: number;
  overscanRequestDelayMs?: number;
  recycleItems?: boolean;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<SyntaxRenderLine>) => ReactElement;
  rowHeight?: number;
  sourceRows: SourceDocumentRowsState;
  style?: StyleProp<ViewStyle>;
};

export function createSyntaxStyleMap(styles: readonly SyntaxStyle[]) {
  return new Map(styles.map((style) => [style.id, style]));
}

export function toSourceDocumentTiming(timing: SyntaxHighlightTiming, jsLoadMs: number): SourceDocumentTiming {
  return {
    colorCount: timing.colorCount,
    contextMs: timing.contextMs,
    indexLinesMs: timing.indexLinesMs,
    initialLinesMs: timing.initialLinesMs,
    jsLoadMs,
    lineCount: timing.lineCount,
    mapFileMs: timing.mapFileMs,
    nativeTotalMs: timing.totalMs,
    tokenCount: timing.tokenCount,
    tokenizeMs: timing.tokenizeMs,
  };
}

export function useSourceDocumentRows({
  backgroundTokenizationChunkLineCount = 500,
  debugName,
  initialHighlightRowCount = sourceViewerInitialRequestRowCount,
  onBackgroundTokenizationStart,
  onRowsFetched,
  snapshot,
}: UseSourceDocumentRowsOptions): SourceDocumentRowsState {
  const highlightedInitialRangeRef = useRef<string | null>(null);
  const rowsTraceRef = useRef<SourceDocumentRowsTrace | null>(null);
  const backgroundTokenizationDocumentRef = useRef<SyntaxDocument | null>(null);
  const notifiedRowsVersionRef = useRef(-1);
  const getRowIndex = useCallback((line: SyntaxRenderLine) => line.index, []);
  const getRows = useCallback((document: SyntaxDocument, start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const reason = options?.reason ?? "scroll";
    const startedAt = nowMs();
    const rows = reason === "initial"
      ? document.getPlainLines(start, count)
      : document.getRenderLines(start, count);
    rowsTraceRef.current = {
      count,
      document,
      finishedAt: nowMs(),
      reason,
      start,
      startedAt,
    };
    return rows;
  }, []);
  const getStyles = useCallback((document: SyntaxDocument) => document.getStyles(), []);
  const getTiming = useCallback((document: SyntaxDocument) => {
    return toSourceDocumentTiming(document.getTiming(), 0);
  }, []);
  const virtualizedRows = useVirtualizedDocumentRows({
    debugName,
    getRowIndex,
    getRows,
    getStyles,
    getTiming,
    snapshot,
  });
  const currentDocument = snapshot?.document ?? null;
  const startBackgroundTokenization = useCallback((document: SyntaxDocument) => {
    if (backgroundTokenizationDocumentRef.current !== document) {
      backgroundTokenizationDocumentRef.current = document;
      const tokenizedLineCount = document.startBackgroundTokenization(backgroundTokenizationChunkLineCount);
      onBackgroundTokenizationStart?.({
        document,
        tokenizedLineCount,
      });
    }
  }, [backgroundTokenizationChunkLineCount, onBackgroundTokenizationStart]);
  const requestRange = useCallback((start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    virtualizedRows.requestRange(start, count, options);
    if (currentDocument && options?.reason === "overscan") {
      startBackgroundTokenization(currentDocument);
    }
  }, [currentDocument, startBackgroundTokenization, virtualizedRows]);
  const rowsVersion = virtualizedRows.rowsVersion;

  useEffect(() => () => {
    currentDocument?.stopBackgroundTokenization();
    if (backgroundTokenizationDocumentRef.current === currentDocument) {
      backgroundTokenizationDocumentRef.current = null;
    }
  }, [currentDocument]);

  useEffect(() => {
    highlightedInitialRangeRef.current = null;
    backgroundTokenizationDocumentRef.current = null;
    notifiedRowsVersionRef.current = -1;
  }, [currentDocument]);

  useEffect(() => {
    if (currentDocument) {
      const initialHighlightCount = Math.min(initialHighlightRowCount, currentDocument.lineCount);
      const rangeKey = `0:${initialHighlightCount}`;
      if (initialHighlightCount > 0 && highlightedInitialRangeRef.current !== rangeKey) {
        highlightedInitialRangeRef.current = rangeKey;
        requestAnimationFrame(() => {
          requestRange(0, initialHighlightCount, {
            force: true,
            reason: "highlight",
          });
        });
      }
    }
  }, [currentDocument, initialHighlightRowCount, requestRange]);

  useEffect(() => {
    const rowsTrace = rowsTraceRef.current;
    if (currentDocument && rowsTrace?.document === currentDocument && rowsVersion > 0 && notifiedRowsVersionRef.current !== rowsVersion) {
      notifiedRowsVersionRef.current = rowsVersion;
      onRowsFetched?.(rowsTrace, rowsVersion);
      if (rowsTrace.reason === "initial") {
        const rangeKey = `${rowsTrace.start}:${rowsTrace.count}`;
        if (highlightedInitialRangeRef.current !== rangeKey) {
          highlightedInitialRangeRef.current = rangeKey;
          requestRange(rowsTrace.start, rowsTrace.count, {
            force: true,
            reason: "highlight",
          });
        }
      } else if (rowsTrace.reason === "overscan") {
        startBackgroundTokenization(currentDocument);
      }
    }
  }, [currentDocument, onRowsFetched, requestRange, rowsVersion, startBackgroundTokenization]);

  const handleInitialRowsRequested = useCallback((_start: number, _count: number) => {
    highlightedInitialRangeRef.current = null;
  }, []);

  return {
    ...virtualizedRows,
    handleInitialRowsRequested,
    requestRange,
  };
}

export function SourceDocumentView({
  debugName,
  initialRequestRowCount = sourceViewerInitialRequestRowCount,
  lineOverscan = sourceViewerLineOverscan,
  overscanRequestDelayMs = sourceViewerOverscanRequestDelayMs,
  recycleItems,
  renderRow,
  rowHeight = sourceViewerRowHeight,
  sourceRows,
  style,
}: SourceDocumentViewProps) {
  return (
    <VirtualizedFixedDocumentList
      debugName={debugName}
      initialRequestRowCount={initialRequestRowCount}
      itemIndexes={sourceRows.itemIndexes}
      lineOverscan={lineOverscan}
      onInitialRowsRequested={sourceRows.handleInitialRowsRequested}
      overscanRequestDelayMs={overscanRequestDelayMs}
      recycleItems={recycleItems}
      requestRange={sourceRows.requestRange}
      rowCache={sourceRows.rowCache}
      rowVersions$={sourceRows.rowVersions$}
      rowHeight={rowHeight}
      rowsVersion={sourceRows.rowsVersion}
      renderRow={renderRow}
      style={style}
    />
  );
}

export type TokenizedTextProps = {
  adaptiveRender?: "light" | "normal";
  foregroundColor: string;
  line?: SyntaxRenderLine;
  numberOfLines?: number;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
  tokenStyleById: SyntaxStyleMap;
};

export function TokenizedText({
  adaptiveRender = "normal",
  foregroundColor,
  line,
  numberOfLines = 1,
  selectable = true,
  style,
  tokenStyleById,
}: TokenizedTextProps) {
  return (
    <LightText numberOfLines={numberOfLines} selectable={selectable} style={[styles.sourceText, { color: foregroundColor }, style]}>
      {adaptiveRender === "light" || (line && line.tokens.length === 0) ? line?.text : line?.tokens.map((token, tokenIndex) => {
        const tokenStyle = tokenStyleById.get(token.styleId);
        const text = line.text.slice(token.startColumn, token.startColumn + token.length);
        return (
          <LightInlineText
            key={tokenIndex}
            style={{
              color: tokenStyle?.foreground || foregroundColor,
              fontStyle: tokenStyle?.fontStyle === 1 || tokenStyle?.fontStyle === 3 ? "italic" : "normal",
              fontWeight: tokenStyle?.fontStyle === 2 || tokenStyle?.fontStyle === 3 ? "700" : "400",
            }}
          >
            {text}
          </LightInlineText>
        );
      })}
    </LightText>
  );
}

export type SourceLineRowProps = {
  foregroundColor: string;
  index: number;
  line?: SyntaxRenderLine;
  lineNumber?: number | string;
  lineNumberStyle?: StyleProp<TextStyle>;
  mutedColor: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  rowStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tokenStyleById: SyntaxStyleMap;
};

export function SourceLineRow({
  foregroundColor,
  index,
  line,
  lineNumber,
  lineNumberStyle,
  mutedColor,
  onLayout,
  rowStyle,
  textStyle,
  tokenStyleById,
}: SourceLineRowProps) {
  const resolvedLineNumber = lineNumber ?? index + 1;

  return (
    <View onLayout={onLayout} style={[styles.sourceLineRow, rowStyle]}>
      <LightText selectable={false} style={[styles.lineNumber, { color: mutedColor }, lineNumberStyle]}>
        {resolvedLineNumber}
      </LightText>
      <TokenizedText
        foregroundColor={foregroundColor}
        line={line}
        style={textStyle}
        tokenStyleById={tokenStyleById}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingRight: 16,
    textAlign: "right",
    width: sourceViewerLineNumberWidth,
  },
  sourceLineRow: {
    flexDirection: "row",
    height: sourceViewerRowHeight,
    paddingHorizontal: 12,
  },
  sourceText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
  },
});

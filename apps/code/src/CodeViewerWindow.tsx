import { openFileDialog } from "@legend-desktop/file-dialog";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import {
  createSyntaxStyleMap,
  SourceLineRow,
  sourceViewerRowHeight,
} from "@legend-desktop/source-viewer";
import {
  loadCodeFile,
  type SyntaxDocument,
  type SyntaxHighlightTiming,
  type SyntaxRenderLine,
  type SyntaxStyle,
} from "@legend-desktop/syntax-parser";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import {
  useVirtualizedDocumentRows,
  VirtualizedFixedDocumentList,
  type VirtualizedDocumentSnapshot,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { codeBackgroundTokenizationChunkLineCount, codeFileTypes, codeInitialLineCount } from "./appConstants";
import { getCodeLanguage, getFilename, getLaunchCodeFile, isCodePath } from "./codeFiles";
import { setCodeViewerWindowOptions } from "./codeWindows";

const debugPrefix = "[DEBUG-code-cold-v1]";
let debugSequence = 0;
const moduleEvaluatedAt = nowMs();

type CodeViewerWindowProps = {
  launchArguments?: string[];
};

type CodeViewerTiming = {
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

type CodeViewerLoadTrace = {
  document: SyntaxDocument | null;
  filePath: string;
  loadStartedAt: number;
  nativeResolvedAt: number;
  noteRecentFinishedAt: number;
  noteRecentStartedAt: number;
  setStateAt: number;
};

type CodeViewerRowsTrace = {
  count: number;
  document: SyntaxDocument;
  finishedAt: number;
  reason: VirtualizedDocumentRequestReason;
  start: number;
  startedAt: number;
};

const rowHeight = sourceViewerRowHeight;
const initialRequestRowCount = 80;
const lineOverscan = 160;
const overscanRequestDelayMs = 80;

type CodeViewerState =
  | {
    status: "empty";
    filePath: null;
    error: null;
  }
  | {
    status: "opening";
    filePath: string;
    error: null;
  }
  | {
    status: "loaded";
    filePath: string;
    error: null;
    document: SyntaxDocument;
    initialLines: SyntaxRenderLine[];
    styles: SyntaxStyle[];
    timing: CodeViewerTiming;
  }
  | {
    status: "error";
    filePath: string | null;
    error: string;
    timing: null;
  };

const emptyState: CodeViewerState = {
  status: "empty",
  filePath: null,
  error: null,
};

function formatLineCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "line" : "lines"}`;
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function debugLog(event: string, payload: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`${debugPrefix} ${event} ${JSON.stringify({
      seq: ++debugSequence,
      t: Number(nowMs().toFixed(1)),
      ...payload,
    })}`);
  }
}

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

function elapsedMs(start: number, end: number) {
  return Math.max(0, end - start);
}

function formatTimingSummary(timing: CodeViewerTiming) {
  return [
    `${formatLineCount(timing.lineCount)}`,
    `${timing.tokenCount.toLocaleString()} tokens`,
    `native ${formatMs(timing.nativeTotalMs)}`,
    `js ${formatMs(timing.jsLoadMs)}`,
  ].join(" · ");
}

function toCodeViewerTiming(timing: SyntaxHighlightTiming, jsLoadMs: number): CodeViewerTiming {
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

function logCodeLoadTiming(filePath: string, timing: CodeViewerTiming) {
  console.info(
    [
      `[CodeViewer] loaded ${filePath}`,
      `nativeTotal=${formatMs(timing.nativeTotalMs)}`,
      `jsAwait=${formatMs(timing.jsLoadMs)}`,
      `map=${formatMs(timing.mapFileMs)}`,
      `index=${formatMs(timing.indexLinesMs)}`,
      `context=${formatMs(timing.contextMs)}`,
      `initialLines=${formatMs(timing.initialLinesMs)}`,
      `tokenize=${formatMs(timing.tokenizeMs)}`,
      `lines=${timing.lineCount}`,
      `tokens=${timing.tokenCount}`,
      `colors=${timing.colorCount}`,
    ].join(" "),
  );
}

function logCodeUiTiming({
  effectAt,
  frameAt,
  microtaskAt,
  secondFrameAt,
  timeoutAt,
  trace,
}: {
  effectAt: number;
  frameAt: number;
  microtaskAt: number;
  secondFrameAt: number;
  timeoutAt: number;
  trace: CodeViewerLoadTrace;
}) {
  console.info(
    [
      `[CodeViewer] ui ${trace.filePath}`,
      `loadToNative=${formatMs(elapsedMs(trace.loadStartedAt, trace.nativeResolvedAt))}`,
      `nativeToSetState=${formatMs(elapsedMs(trace.nativeResolvedAt, trace.setStateAt))}`,
      `setStateToEffect=${formatMs(elapsedMs(trace.setStateAt, effectAt))}`,
      `effectToMicrotask=${formatMs(elapsedMs(effectAt, microtaskAt))}`,
      `effectToTimeout=${formatMs(elapsedMs(effectAt, timeoutAt))}`,
      `effectToFrame=${formatMs(elapsedMs(effectAt, frameAt))}`,
      `frameToFrame=${formatMs(elapsedMs(frameAt, secondFrameAt))}`,
      `loadToEffect=${formatMs(elapsedMs(trace.loadStartedAt, effectAt))}`,
      `loadToFrame=${formatMs(elapsedMs(trace.loadStartedAt, frameAt))}`,
      `loadToSecondFrame=${formatMs(elapsedMs(trace.loadStartedAt, secondFrameAt))}`,
      `noteRecent=${formatMs(elapsedMs(trace.noteRecentStartedAt, trace.noteRecentFinishedAt))}`,
    ].join(" "),
  );
}

function logCodeRowsTiming({
  effectAt,
  frameAt,
  loadTrace,
  microtaskAt,
  rowsTrace,
  secondFrameAt,
  timeoutAt,
}: {
  effectAt: number;
  frameAt: number;
  loadTrace: CodeViewerLoadTrace;
  microtaskAt: number;
  rowsTrace: CodeViewerRowsTrace;
  secondFrameAt: number;
  timeoutAt: number;
}) {
  console.info(
    [
      `[CodeViewer] rows ${loadTrace.filePath}`,
      `reason=${rowsTrace.reason}`,
      `start=${rowsTrace.start}`,
      `count=${rowsTrace.count}`,
      `getRows=${formatMs(elapsedMs(rowsTrace.startedAt, rowsTrace.finishedAt))}`,
      `loadToRowsFetched=${formatMs(elapsedMs(loadTrace.loadStartedAt, rowsTrace.finishedAt))}`,
      `rowsFetchedToEffect=${formatMs(elapsedMs(rowsTrace.finishedAt, effectAt))}`,
      `effectToMicrotask=${formatMs(elapsedMs(effectAt, microtaskAt))}`,
      `effectToTimeout=${formatMs(elapsedMs(effectAt, timeoutAt))}`,
      `effectToFrame=${formatMs(elapsedMs(effectAt, frameAt))}`,
      `frameToFrame=${formatMs(elapsedMs(frameAt, secondFrameAt))}`,
      `loadToRowsFrame=${formatMs(elapsedMs(loadTrace.loadStartedAt, frameAt))}`,
      `loadToRowsSecondFrame=${formatMs(elapsedMs(loadTrace.loadStartedAt, secondFrameAt))}`,
    ].join(" "),
  );
}

function measureAfterEffect(callback: (timing: {
  frameAt: number;
  microtaskAt: number;
  secondFrameAt: number;
  timeoutAt: number;
}) => void) {
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

type RowLayoutDebugBatch = {
  count: number;
  first: number | null;
  highlighted: number;
  last: number | null;
  missing: number;
  plain: number;
};

let rowLayoutBatch: RowLayoutDebugBatch | null = null;

function recordRowLayout(index: number, line: SyntaxRenderLine | undefined) {
  if (__DEV__) {
    rowLayoutBatch ??= {
      count: 0,
      first: null,
      highlighted: 0,
      last: null,
      missing: 0,
      plain: 0,
    };
    rowLayoutBatch.count += 1;
    rowLayoutBatch.first = rowLayoutBatch.first === null ? index : Math.min(rowLayoutBatch.first, index);
    rowLayoutBatch.last = rowLayoutBatch.last === null ? index : Math.max(rowLayoutBatch.last, index);
    if (!line) {
      rowLayoutBatch.missing += 1;
    } else if (line.tokens.length === 0) {
      rowLayoutBatch.plain += 1;
    } else {
      rowLayoutBatch.highlighted += 1;
    }

    if (rowLayoutBatch.count === 1) {
      requestAnimationFrame(() => {
        const completedBatch = rowLayoutBatch;
        rowLayoutBatch = null;
        if (completedBatch) {
          debugLog("row.layoutFrame", completedBatch as unknown as Record<string, unknown>);
        }
      });
    }
  }
}

debugLog("module.evaluated", {
  moduleEvaluatedAt,
});

export function CodeViewerWindow({ launchArguments }: CodeViewerWindowProps) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const displayTheme = getLegendDisplayTheme("dark");
  const [state, setState] = useState<CodeViewerState>(emptyState);
  const launchFile = useMemo(() => getLaunchCodeFile(launchArguments), [launchArguments]);
  const loadTraceRef = useRef<CodeViewerLoadTrace | null>(null);
  const loggedTraceDocumentRef = useRef<SyntaxDocument | null>(null);
  const rowsTraceRef = useRef<CodeViewerRowsTrace | null>(null);
  const loggedRowsVersionRef = useRef(-1);
  const highlightedInitialRangeRef = useRef<string | null>(null);
  const backgroundTokenizationDocumentRef = useRef<SyntaxDocument | null>(null);
  const documentSnapshot = useMemo<VirtualizedDocumentSnapshot<SyntaxDocument, SyntaxRenderLine, SyntaxStyle, CodeViewerTiming> | null>(
    () => state.status === "loaded"
      ? {
          document: state.document,
          initialRows: state.initialLines,
          itemCount: state.document.lineCount,
          styles: state.styles,
          timing: state.timing,
        }
      : null,
    [state],
  );
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
    return toCodeViewerTiming(document.getTiming(), 0);
  }, []);
  const virtualizedLines = useVirtualizedDocumentRows({
    debugName: "code",
    getRowIndex,
    getRows,
    getStyles,
    getTiming,
    snapshot: documentSnapshot,
  });
  const currentDocument = state.status === "loaded" ? state.document : null;
  const stylesForState = virtualizedLines.styles;
  const tokenStyleById = useMemo(() => createSyntaxStyleMap(stylesForState), [stylesForState]);
  const visibleFilePath = state.filePath ?? launchFile;
  const fileName = visibleFilePath ? getFilename(visibleFilePath) : "No file";
  const backgroundColor = displayTheme.colors.background;
  const mutedColor = displayTheme.colors.muted;
  const foregroundColor = displayTheme.colors.foreground;
  const borderColor = displayTheme.colors.border;

  debugLog("window.render", {
    cacheSize: virtualizedLines.rowCache.size,
    itemCount: virtualizedLines.itemIndexes.length,
    renderCount: renderCountRef.current,
    rowsVersion: virtualizedLines.rowsVersion,
    state: state.status,
  });

  useEffect(() => {
    if (__DEV__) {
      globalThis.__legendCodeBenchmarkGetTokenizedLineCount = () => currentDocument?.getTokenizedLineCount() ?? 0;
    }

    return () => {
      if (__DEV__ && globalThis.__legendCodeBenchmarkGetTokenizedLineCount) {
        globalThis.__legendCodeBenchmarkGetTokenizedLineCount = undefined;
      }
      currentDocument?.stopBackgroundTokenization();
      if (backgroundTokenizationDocumentRef.current === currentDocument) {
        backgroundTokenizationDocumentRef.current = null;
      }
    };
  }, [currentDocument]);

  useEffect(() => {
    debugLog("window.mounted", {
      sinceModuleMs: Number((nowMs() - moduleEvaluatedAt).toFixed(1)),
    });

    return () => {
      debugLog("window.unmounted", {
        renderCount: renderCountRef.current,
      });
    };
  }, []);

  const loadFile = useCallback(async (filePath: string) => {
    const loadStartedAt = nowMs();
    debugLog("load.start", {
      filePath,
      language: getCodeLanguage(filePath),
    });
    const trace: CodeViewerLoadTrace = {
      document: null,
      filePath,
      loadStartedAt,
      nativeResolvedAt: loadStartedAt,
      noteRecentFinishedAt: loadStartedAt,
      noteRecentStartedAt: loadStartedAt,
      setStateAt: loadStartedAt,
    };

    try {
      loadTraceRef.current = trace;
      setState({
        status: "opening",
        filePath,
        error: null,
      });
      const highlighted = await loadCodeFile(filePath, getCodeLanguage(filePath), "github-dark", codeInitialLineCount);
      const loadFinishedAt = nowMs();
      const timing = toCodeViewerTiming(highlighted.timing, loadFinishedAt - loadStartedAt);

      trace.document = highlighted.document;
      trace.nativeResolvedAt = loadFinishedAt;
      logCodeLoadTiming(filePath, timing);
      trace.setStateAt = nowMs();
      debugLog("load.setLoaded", {
        filePath,
        lineCount: highlighted.document.lineCount,
        nativeTotalMs: Number(timing.nativeTotalMs.toFixed(1)),
      });
      setState({
        status: "loaded",
        filePath,
        error: null,
        document: highlighted.document,
        initialLines: highlighted.initialLines,
        styles: highlighted.styles,
        timing,
      });
      trace.noteRecentStartedAt = nowMs();
      noteRecentDocument(filePath);
      trace.noteRecentFinishedAt = nowMs();
    } catch (error) {
      loadTraceRef.current = null;
      setState({
        status: "error",
        filePath,
        error: error instanceof Error ? error.message : String(error),
        timing: null,
      });
    }
  }, []);

  useEffect(() => {
    const trace = loadTraceRef.current;
    if (state.status === "loaded" && trace?.document === state.document && loggedTraceDocumentRef.current !== state.document) {
      loggedTraceDocumentRef.current = state.document;
      const effectAt = nowMs();
      measureAfterEffect(({ frameAt, microtaskAt, secondFrameAt, timeoutAt }) => {
        logCodeUiTiming({
          effectAt,
          frameAt,
          microtaskAt,
          secondFrameAt,
          timeoutAt,
          trace,
        });
        const initialHighlightCount = Math.min(initialRequestRowCount, state.document.lineCount);
        const rangeKey = `0:${initialHighlightCount}`;
        if (initialHighlightCount > 0 && highlightedInitialRangeRef.current !== rangeKey) {
          highlightedInitialRangeRef.current = rangeKey;
          virtualizedLines.requestRange(0, initialHighlightCount, {
            force: true,
            reason: "highlight",
          });
        }
      });
    }
  }, [state, virtualizedLines]);

  useEffect(() => {
    const loadTrace = loadTraceRef.current;
    const rowsTrace = rowsTraceRef.current;
    if (
      state.status === "loaded" &&
      loadTrace?.document === state.document &&
      rowsTrace?.document === state.document &&
      virtualizedLines.rowsVersion > 0 &&
      loggedRowsVersionRef.current !== virtualizedLines.rowsVersion
    ) {
      loggedRowsVersionRef.current = virtualizedLines.rowsVersion;
      const effectAt = nowMs();
      measureAfterEffect(({ frameAt, microtaskAt, secondFrameAt, timeoutAt }) => {
        logCodeRowsTiming({
          effectAt,
          frameAt,
          loadTrace,
          microtaskAt,
          rowsTrace,
          secondFrameAt,
          timeoutAt,
        });
        if (rowsTrace.reason === "initial") {
          const rangeKey = `${rowsTrace.start}:${rowsTrace.count}`;
          if (highlightedInitialRangeRef.current !== rangeKey) {
            highlightedInitialRangeRef.current = rangeKey;
            virtualizedLines.requestRange(rowsTrace.start, rowsTrace.count, {
              force: true,
              reason: "highlight",
            });
          }
        } else if (rowsTrace.reason === "overscan" && backgroundTokenizationDocumentRef.current !== state.document) {
          backgroundTokenizationDocumentRef.current = state.document;
          const tokenizedLineCount = state.document.startBackgroundTokenization(codeBackgroundTokenizationChunkLineCount);
          console.info(
            [
              `[CodeViewer] backgroundTokenization ${state.filePath}`,
              `chunk=${codeBackgroundTokenizationChunkLineCount}`,
              `tokenized=${tokenizedLineCount}`,
              `lines=${state.document.lineCount}`,
            ].join(" "),
          );
        }
      });
    }
  }, [state, virtualizedLines]);

  const openCodeDialog = useCallback(async () => {
    const paths = await openFileDialog({
      allowedFileTypes: codeFileTypes,
      canChooseFiles: true,
    });
    const path = paths?.find(isCodePath) ?? null;

    if (path) {
      await loadFile(path);
    } else if (paths && paths.length > 0) {
      setState({
        status: "error",
        filePath: state.filePath,
        error: `Choose a TypeScript file (${codeFileTypes.map((type) => `.${type}`).join(", ")}).`,
        timing: null,
      });
    }
  }, [loadFile, state.filePath]);

  const renderLine = useCallback(
    ({ index: lineIndex, row: line }: VirtualizedFixedDocumentListRenderRowProps<SyntaxRenderLine>) => {
      return (
        <SourceLineRow
          foregroundColor={foregroundColor}
          index={lineIndex}
          line={line}
          mutedColor={mutedColor}
          onLayout={() => recordRowLayout(lineIndex, line)}
          tokenStyleById={tokenStyleById}
        />
      );
    },
    [foregroundColor, mutedColor, tokenStyleById],
  );

  useEffect(() => {
    if (launchFile) {
      loadFile(launchFile);
    }
  }, [launchFile, loadFile]);

  useEffect(() => {
    setCodeViewerWindowOptions({
      backgroundColor: displayTheme.colors.windowBackground,
      filePath: state.filePath,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, [displayTheme.colors.windowBackground, state.filePath]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: foregroundColor }]} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
            {state.status === "loaded" && virtualizedLines.timing
              ? formatTimingSummary(virtualizedLines.timing)
              : visibleFilePath ?? "Open a .ts or .tsx file"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openCodeDialog}
          style={({ pressed }) => [
            styles.openButton,
            { borderColor, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[styles.openButtonText, { color: foregroundColor }]}>Open</Text>
        </Pressable>
      </View>
      {state.error ? (
        <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{state.error}</Text>
      ) : null}
      {virtualizedLines.itemIndexes.length > 0 ? (
        <VirtualizedFixedDocumentList
          debugName="code"
          initialRequestRowCount={initialRequestRowCount}
          itemIndexes={virtualizedLines.itemIndexes}
          lineOverscan={lineOverscan}
          onInitialRowsRequested={(start, count) => {
            highlightedInitialRangeRef.current = null;
            console.info(`[CodeViewer] initialRowsRequested start=${start} count=${count}`);
          }}
          overscanRequestDelayMs={overscanRequestDelayMs}
          requestRange={virtualizedLines.requestRange}
          rowCache={virtualizedLines.rowCache}
          rowHeight={rowHeight}
          rowsVersion={virtualizedLines.rowsVersion}
          renderRow={renderLine}
          style={styles.list}
        />
      ) : state.status === "empty" ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            No code file open
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]}>
            Open a TypeScript or TSX file to view it.
          </Text>
        </View>
      ) : (
        null
      )}
    </View>
  );
}

export default CodeViewerWindow;

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    minHeight: 60,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  list: {
    flex: 1,
  },
  openButton: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  root: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
});

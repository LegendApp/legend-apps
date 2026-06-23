import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import {
  loadGitFolderDiff,
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSyntaxStyle,
} from "@legend-desktop/diff-parser";
import { watchDirectories } from "@legend-desktop/file-system-watcher";
import {
  createSyntaxStyleMap,
  elapsedMs,
  measureAfterEffect,
  nowMs,
  sourceViewerCodeFontFamily,
  sourceViewerLineNumberWidth,
  sourceViewerRowHeight,
  TokenizedText,
} from "@legend-desktop/source-viewer";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import {
  useVirtualizedDocumentRows,
  VirtualizedFixedDocumentList,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentSnapshot,
  type VirtualizedFixedDocumentListRef,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeSyntheticEvent } from "react-native";
import {
  createDiffPresentationSegments,
  createSegmentListIndexByRowIndex,
  type DiffPresentationSegment,
  type DiffSideBySideLine,
} from "./diffPresentation";
import { getFilename, openDiffFolderDialog } from "./diffFiles";
import {
  diffViewModeOptions,
  setDiffViewModeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
  useDiffViewModeSetting,
  type DiffSettingsFile,
  type DiffViewMode,
} from "./diffSettings";
import { setDiffViewerWindowOptions } from "./diffWindows";

const diffInitialRowCount = 160;
const diffInitialHighlightChunkRowCount = 40;
const diffLineOverscan = 240;
const diffOverscanRequestDelayMs = 80;
const diffFileHeaderRowHeight = 52;
const diffTitlebarTopInset = 52;
const diffRowKindFileHeader = 0;
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;
const diffSideBySideGutterWidth = 44;
const diffSideBySideHorizontalPadding = 12;
const diffSideBySideBlockVerticalPadding = 8;

type DiffViewerWindowProps = {
  folderPath?: string;
};

type DiffLoadTrace = {
  document: DiffDocument | null;
  folderPath: string;
  loadStartedAt: number;
  nativeResolvedAt: number;
  setStateAt: number;
};

type DiffViewerState =
  | {
    status: "empty";
    error: null;
    folderPath: null;
  }
  | {
    status: "loaded";
    error: null;
    folderPath: string;
    document: DiffDocument;
    files: DiffFileSummary[];
    initialRows: DiffRenderRow[];
    styles: DiffSyntaxStyle[];
    syntaxTheme: DiffSettingsFile["syntaxTheme"];
    timing: DiffLoadTiming;
  }
  | {
    status: "error";
    error: string;
    folderPath: string | null;
  };

const emptyState: DiffViewerState = {
  status: "empty",
  error: null,
  folderPath: null,
};

function getDiffLineRowHeight(fontSize: number) {
  return Math.max(20, fontSize + 9);
}

function logDiffOpenTiming(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffOpenTiming] ${event} ${JSON.stringify(payload)}`);
}

function logDiffLoadTiming(folderPath: string, timing: DiffLoadTiming) {
  logDiffOpenTiming("viewer.native.loaded", {
    copyFilesMs: Number(timing.copyFilesMs.toFixed(1)),
    copyInitialRowsMs: Number(timing.copyInitialRowsMs.toFixed(1)),
    createDiffMs: Number(timing.createDiffMs.toFixed(1)),
    documentMs: Number(timing.documentMs.toFixed(1)),
    fileCount: timing.fileCount,
    folderPath,
    nativeTotalMs: Number(timing.nativeTotalMs.toFixed(1)),
    openRepoMs: Number(timing.openRepoMs.toFixed(1)),
    rowCount: timing.rowCount,
    walkDiffMs: Number(timing.walkDiffMs.toFixed(1)),
  });
}

function getDirectoryPath(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(0, separatorIndex) : "";
}

function getFileStatusIcon(status: string) {
  switch (status) {
    case "added":
    case "untracked":
      return {
        backgroundColor: "#238636",
        color: "#ffffff",
        label: "+",
      };
    case "deleted":
      return {
        backgroundColor: "#da3633",
        color: "#ffffff",
        label: "x",
      };
    default:
      return {
        backgroundColor: "#f0883e",
        color: "#1f1300",
        label: "✎",
      };
  }
}

function createVisibleDiffRowIndexes(files: readonly DiffFileSummary[], collapsedFileIndexes: ReadonlySet<number>, fallbackItemIndexes: readonly number[]) {
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
    indexes.push(...fallbackItemIndexes);
  }

  return indexes;
}

function findFileIndexForRow(files: readonly DiffFileSummary[], rowIndex: number) {
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

export function DiffViewerWindow({ folderPath }: DiffViewerWindowProps) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const rowHeight = getDiffLineRowHeight(fontSize);
  const viewMode = useDiffViewModeSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();
  const syntaxTheme = useDiffSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const [state, setState] = useState<DiffViewerState>(emptyState);
  const [collapsedFileIndexes, setCollapsedFileIndexes] = useState<Set<number>>(() => new Set());
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const [splitPaneMetrics, setSplitPaneMetrics] = useState({
    contentHeight: 0,
    contentWidth: 0,
    sidebarHeight: 0,
    sidebarWidth: 0,
  });
  const [diffPaneHeight, setDiffPaneHeight] = useState(0);
  const listRef = useRef<VirtualizedFixedDocumentListRef | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadTraceRef = useRef<DiffLoadTrace | null>(null);
  const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
  const highlightedVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const highlightTimeoutHandlesRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const visibleFolderPath = state.folderPath;
  const backgroundColor = syntaxTheme.background;
  const foregroundColor = syntaxTheme.foreground;
  const mutedColor = displayTheme.colors.muted;
  const fileByIndex = useMemo(() => {
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    return new Map(state.files.map((file) => [file.index, file]));
  }, [state]);
  const fileByRowStart = useMemo(() => {
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    return new Map(state.files.map((file) => [Math.max(0, Math.floor(file.rowStart)), file]));
  }, [state]);
  const snapshot = useMemo<VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming> | null>(
    () => state.status === "loaded"
      ? {
          document: state.document,
          initialRows: state.initialRows,
          itemCount: state.document.rowCount,
          styles: state.styles,
          timing: state.timing,
        }
      : null,
    [state],
  );
  const listExtraData = useMemo(
    () => ({
      fontFamily,
      fontSize,
      rowHeight,
    }),
    [fontFamily, fontSize, rowHeight],
  );
  const getRowIndex = useCallback((row: DiffRenderRow) => row.index, []);
  const getRows = useCallback((document: DiffDocument, start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
    const startedAt = nowMs();
    const shouldHighlight = options?.reason === "highlight";
    const rows = shouldHighlight
      ? document.getRows(start, count)
      : document.getPlainRows(start, count);
    logDiffOpenTiming("viewer.rowsFetched", {
      count,
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      reason: options?.reason ?? "unknown",
      rows: rows.length,
      start,
      tokenized: shouldHighlight,
    });
    return rows;
  }, []);
  const getStyles = useCallback((document: DiffDocument) => {
    const startedAt = nowMs();
    const styles = document.getStyles();
    logDiffOpenTiming("viewer.stylesFetched", {
      durationMs: Number((nowMs() - startedAt).toFixed(1)),
      styles: styles.length,
    });
    return styles;
  }, []);
  const getTiming = useCallback((document: DiffDocument) => document.getTiming(), []);
  const diffRows = useVirtualizedDocumentRows({
    debugName: "diff",
    getRowIndex,
    getRows,
    getStyles,
    getTiming,
    snapshot,
  });
  const tokenStyleById = useMemo(() => createSyntaxStyleMap(diffRows.styles), [diffRows.styles]);
  const fileHeaderRowIndexes = useMemo(() => {
    if (state.status !== "loaded") {
      return new Set<number>();
    }
    return new Set(state.files.map((file) => Math.max(0, Math.floor(file.rowStart))));
  }, [state]);
  const visibleItemIndexes = useMemo(
    () => state.status === "loaded" && collapsedFileIndexes.size > 0
      ? createVisibleDiffRowIndexes(state.files, collapsedFileIndexes, diffRows.itemIndexes)
      : diffRows.itemIndexes,
    [collapsedFileIndexes, diffRows.itemIndexes, state],
  );
  const visibleListIndexByRowIndex = useMemo(() => {
    const indexes = new Map<number, number>();
    visibleItemIndexes.forEach((rowIndex, listIndex) => {
      indexes.set(rowIndex, listIndex);
    });
    return indexes;
  }, [visibleItemIndexes]);
  const sideBySidePlainRows = useMemo(
    () => state.status === "loaded" && viewMode !== "unified"
      ? state.document.getPlainRows(0, state.document.rowCount)
      : [],
    [state, viewMode],
  );
  const sideBySideSegments = useMemo(
    () => state.status === "loaded" && viewMode !== "unified"
      ? createDiffPresentationSegments({
          collapsedFileIndexes,
          files: state.files,
          rows: sideBySidePlainRows,
        })
      : [],
    [collapsedFileIndexes, sideBySidePlainRows, state, viewMode],
  );
  const sideBySideItemIndexes = useMemo(
    () => sideBySideSegments.map((segment) => segment.index),
    [sideBySideSegments],
  );
  const sideBySideRowCache = useMemo(
    () => new Map(sideBySideSegments.map((segment) => [segment.index, segment])),
    [sideBySideSegments],
  );
  const sideBySidePlainRowByIndex = useMemo(
    () => new Map(sideBySidePlainRows.map((row) => [row.index, row])),
    [sideBySidePlainRows],
  );
  const sideBySideListIndexByRowIndex = useMemo(
    () => createSegmentListIndexByRowIndex(sideBySideSegments),
    [sideBySideSegments],
  );
  const clearHighlightTimeouts = useCallback(() => {
    for (const timeoutHandle of highlightTimeoutHandlesRef.current) {
      clearTimeout(timeoutHandle);
    }
    highlightTimeoutHandlesRef.current.clear();
  }, []);

  useEffect(() => {
    highlightedVisibleRangeRef.current = null;
    clearHighlightTimeouts();
    if (state.status === "loaded") {
      setActiveFileIndex(state.files[0]?.index ?? null);
      setCollapsedFileIndexes((current) => current.size > 0 ? new Set() : current);
    } else {
      setActiveFileIndex(null);
    }
  }, [clearHighlightTimeouts, state.status === "loaded" ? state.document : null]);

  useEffect(() => clearHighlightTimeouts, [clearHighlightTimeouts]);

  const scheduleVisibleHighlight = useCallback((start: number, count: number, reason: string) => {
    if (state.status === "loaded") {
      const safeStart = Math.max(0, Math.floor(start));
      const safeCount = Math.min(
        Math.max(0, Math.ceil(count)),
        Math.max(0, state.document.rowCount - safeStart),
      );
      const highlightedRange = highlightedVisibleRangeRef.current;
      const isAlreadyHighlighted = highlightedRange?.document === state.document
        && highlightedRange.start === safeStart
        && highlightedRange.count === safeCount;

      if (safeCount > 0 && !isAlreadyHighlighted) {
        highlightedVisibleRangeRef.current = {
          count: safeCount,
          document: state.document,
          start: safeStart,
        };
        clearHighlightTimeouts();
        logDiffOpenTiming("viewer.visibleHighlight.schedule", {
          chunkSize: diffInitialHighlightChunkRowCount,
          count: safeCount,
          reason,
          start: safeStart,
        });

        const scheduleHighlightChunk = (chunkStart: number) => {
          const timeoutHandle = setTimeout(() => {
            highlightTimeoutHandlesRef.current.delete(timeoutHandle);
            if (highlightedVisibleRangeRef.current?.document === state.document) {
              const chunkOffset = chunkStart - safeStart;
              const chunkCount = Math.min(diffInitialHighlightChunkRowCount, safeCount - chunkOffset);
              if (chunkCount > 0) {
                logDiffOpenTiming("viewer.visibleHighlight.request", {
                  count: chunkCount,
                  remaining: Math.max(0, safeCount - chunkOffset - chunkCount),
                  start: chunkStart,
                });
                diffRows.requestRange(chunkStart, chunkCount, {
                  force: true,
                  reason: "highlight",
                });

                if (chunkOffset + chunkCount < safeCount) {
                  scheduleHighlightChunk(chunkStart + chunkCount);
                }
              }
            }
          }, 0);
          highlightTimeoutHandlesRef.current.add(timeoutHandle);
        };

        const timeoutHandle = setTimeout(() => {
          highlightTimeoutHandlesRef.current.delete(timeoutHandle);
          scheduleHighlightChunk(safeStart);
        }, 0);
        highlightTimeoutHandlesRef.current.add(timeoutHandle);
      }
    }
  }, [clearHighlightTimeouts, diffRows.requestRange, state]);

  const handleVisibleRowsRequested = useCallback((start: number, count: number, reason: string) => {
    scheduleVisibleHighlight(start, count, reason);
  }, [scheduleVisibleHighlight]);

  const handleTopItemChanged = useCallback((rowIndex: number) => {
    if (state.status === "loaded") {
      const nextFileIndex = findFileIndexForRow(state.files, rowIndex);
      setActiveFileIndex((current) => current === nextFileIndex ? current : nextFileIndex);
    }
  }, [state]);

  useEffect(() => {
    logDiffOpenTiming("viewer.renderCommitted", {
      cacheSize: diffRows.rowCache.size,
      itemCount: diffRows.itemIndexes.length,
      renderCount: renderCountRef.current,
      rowsVersion: diffRows.rowsVersion,
      state: state.status,
      visibleItemCount: visibleItemIndexes.length,
    });
  });

  const loadFolder = useCallback(async (path: string, syntaxThemeName: DiffSettingsFile["syntaxTheme"]) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const loadStartedAt = nowMs();
    const trace: DiffLoadTrace = {
      document: null,
      folderPath: path,
      loadStartedAt,
      nativeResolvedAt: loadStartedAt,
      setStateAt: loadStartedAt,
    };
    loadTraceRef.current = trace;
    logDiffOpenTiming("viewer.load.start", {
      path,
      requestId,
      syntaxTheme: syntaxThemeName,
    });

    try {
      const nativeStartedAt = nowMs();
      const result = await loadGitFolderDiff(path, syntaxThemeName, diffInitialRowCount);
      const nativeResolvedAt = nowMs();
      trace.document = result.document;
      trace.nativeResolvedAt = nativeResolvedAt;
      logDiffOpenTiming("viewer.load.nativeResolved", {
        files: result.files.length,
        initialRows: result.initialRows.length,
        jsAwaitMs: Number((nativeResolvedAt - nativeStartedAt).toFixed(1)),
        nativeTotalMs: Number(result.timing.nativeTotalMs.toFixed(1)),
        requestId,
        rows: result.document.rowCount,
        styles: result.styles.length,
        unaccountedJsMs: Number((nativeResolvedAt - nativeStartedAt - result.timing.nativeTotalMs).toFixed(1)),
      });
      logDiffLoadTiming(path, result.timing);
      if (loadRequestIdRef.current === requestId) {
        trace.setStateAt = nowMs();
        setState({
          status: "loaded",
          error: null,
          folderPath: path,
          document: result.document,
          files: result.files,
          initialRows: result.initialRows,
          styles: result.styles,
          syntaxTheme: syntaxThemeName,
          timing: result.timing,
        });
        logDiffOpenTiming("viewer.load.setLoaded", {
          requestId,
          setStateMs: Number((nowMs() - trace.setStateAt).toFixed(1)),
        });
      } else {
        logDiffOpenTiming("viewer.load.stale", {
          activeRequestId: loadRequestIdRef.current,
          requestId,
        });
      }
    } catch (error) {
      if (loadRequestIdRef.current === requestId) {
        loadTraceRef.current = null;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          folderPath: path,
        });
        logDiffOpenTiming("viewer.load.error", {
          error: error instanceof Error ? error.message : String(error),
          requestId,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (folderPath) {
      logDiffOpenTiming("viewer.launchFolder.effect", {
        folderPath,
        selectedSyntaxTheme,
      });
      loadFolder(folderPath, selectedSyntaxTheme);
    }
  }, [folderPath, loadFolder, selectedSyntaxTheme]);

  const openFolder = useCallback(async () => {
    try {
      const dialogStartedAt = nowMs();
      logDiffOpenTiming("viewer.dialog.start", {
        currentFolderPath: state.folderPath,
      });
      const path = await openDiffFolderDialog();
      logDiffOpenTiming("viewer.dialog.finish", {
        dialogMs: Number((nowMs() - dialogStartedAt).toFixed(1)),
        path,
      });
      if (path) {
        await loadFolder(path, selectedSyntaxTheme);
      }
    } catch (error) {
      setState((current) => ({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        folderPath: current.folderPath,
      }));
    }
  }, [loadFolder, selectedSyntaxTheme, state.folderPath]);

  useEffect(() => {
    const trace = loadTraceRef.current;
    if (state.status === "loaded" && trace?.document === state.document && loggedTraceDocumentRef.current !== state.document) {
      loggedTraceDocumentRef.current = state.document;
      const effectAt = nowMs();
      measureAfterEffect(({ frameAt, microtaskAt, secondFrameAt, timeoutAt }) => {
        logDiffOpenTiming("viewer.ui.loaded", {
          effectToFrameMs: Number(elapsedMs(effectAt, frameAt).toFixed(1)),
          effectToMicrotaskMs: Number(elapsedMs(effectAt, microtaskAt).toFixed(1)),
          effectToSecondFrameMs: Number(elapsedMs(effectAt, secondFrameAt).toFixed(1)),
          effectToTimeoutMs: Number(elapsedMs(effectAt, timeoutAt).toFixed(1)),
          loadToEffectMs: Number(elapsedMs(trace.loadStartedAt, effectAt).toFixed(1)),
          loadToFrameMs: Number(elapsedMs(trace.loadStartedAt, frameAt).toFixed(1)),
          loadToNativeMs: Number(elapsedMs(trace.loadStartedAt, trace.nativeResolvedAt).toFixed(1)),
          loadToSecondFrameMs: Number(elapsedMs(trace.loadStartedAt, secondFrameAt).toFixed(1)),
          nativeToSetStateMs: Number(elapsedMs(trace.nativeResolvedAt, trace.setStateAt).toFixed(1)),
          setStateToEffectMs: Number(elapsedMs(trace.setStateAt, effectAt).toFixed(1)),
        });
      });
    }
  }, [state]);

  useEffect(() => {
    if (state.status === "loaded" && state.syntaxTheme !== selectedSyntaxTheme) {
      loadFolder(state.folderPath, selectedSyntaxTheme).catch((error: unknown) => {
        setState((current) => ({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          folderPath: current.folderPath,
        }));
      });
    }
  }, [loadFolder, selectedSyntaxTheme, state]);

  useEffect(() => {
    if (!visibleFolderPath) {
      return undefined;
    }

    let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
    const subscription = watchDirectories([visibleFolderPath], () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
        loadFolder(visibleFolderPath, selectedSyntaxTheme).catch((error: unknown) => {
          setState((current) => ({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            folderPath: current.folderPath,
          }));
        });
      }, 250);
    });

    return () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      subscription.remove();
    };
  }, [loadFolder, selectedSyntaxTheme, visibleFolderPath]);

  useEffect(() => {
    let frameHandle: number | null = null;
    let secondFrameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const applyWindowOptions = () => {
      const startedAt = nowMs();
      setDiffViewerWindowOptions({
        appearance: syntaxTheme.appearance,
        backgroundColor: syntaxTheme.background,
        folderPath: state.folderPath,
      })
        .then(() => {
          logDiffOpenTiming("viewer.windowOptions.finish", {
            folderPath: state.folderPath,
            setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
          });
        })
        .catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
    };

    if (state.status === "loaded") {
      frameHandle = requestAnimationFrame(() => {
        secondFrameHandle = requestAnimationFrame(() => {
          timeoutHandle = setTimeout(applyWindowOptions, 0);
        });
      });
    } else {
      applyWindowOptions();
    }

    return () => {
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
      }
      if (secondFrameHandle !== null) {
        cancelAnimationFrame(secondFrameHandle);
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [state.folderPath, syntaxTheme.appearance, syntaxTheme.background]);

  const toggleFileCollapsed = useCallback((fileIndex: number) => {
    setCollapsedFileIndexes((current) => {
      const next = new Set(current);
      if (next.has(fileIndex)) {
        next.delete(fileIndex);
      } else {
        next.add(fileIndex);
      }
      return next;
    });
  }, []);

  const handleViewModeChange = useCallback((nextViewMode: DiffViewMode) => {
    setDiffViewModeSetting(nextViewMode);
  }, []);

  const scrollToFile = useCallback((file: DiffFileSummary) => {
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const listIndex = viewMode === "unified"
      ? visibleListIndexByRowIndex.get(rowStart)
      : sideBySideListIndexByRowIndex.get(rowStart);
    if (listIndex !== undefined) {
      listRef.current?.scrollToIndex({
        animated: true,
        index: listIndex,
        viewPosition: 0,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  }, [sideBySideListIndexByRowIndex, viewMode, visibleListIndexByRowIndex]);

  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    setSplitPaneMetrics({
      contentHeight: Math.round(event.nativeEvent.contentHeight || event.nativeEvent.height),
      contentWidth: Math.round(event.nativeEvent.contentWidth),
      sidebarHeight: Math.round(event.nativeEvent.sidebarHeight || event.nativeEvent.height),
      sidebarWidth: Math.round(event.nativeEvent.sidebarWidth),
    });
  }, []);

  const handleDiffPaneLayout = useCallback((event: LayoutChangeEvent) => {
    setDiffPaneHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  const getItemType = useCallback((index: number, row: DiffRenderRow | undefined) => (
    row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index) ? "file-header" : "diff-line"
  ), [fileHeaderRowIndexes]);

  const getItemSize = useCallback((index: number, row: DiffRenderRow | undefined) => (
    getItemType(index, row) === "file-header" ? diffFileHeaderRowHeight : rowHeight
  ), [getItemType, rowHeight]);

  const renderRow = useCallback(
    ({ index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
      const fileHeaderLineHeight = Math.max(18, fontSize + 8);
      const changeType = row?.changeType ?? 0;
      const isAdd = changeType === diffChangeTypeAdd;
      const isRemove = changeType === diffChangeTypeRemove;
      const isChanged = isAdd || isRemove;
      const isFileHeader = row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index);
      const file = row ? fileByIndex.get(row.fileIndex) : fileByRowStart.get(index);
      const accentColor = isAdd ? "#7ee787" : isRemove ? "#ff7b72" : "transparent";
      const rowBackgroundColor = isAdd
        ? "#17351f"
        : isRemove
          ? "#3a1d24"
          : "transparent";
      const textColor = isChanged || isFileHeader
        ? foregroundColor
        : "#c9d1d9";
      const lineNumberColor = isChanged ? accentColor : mutedColor;
      const marker = isAdd ? "+" : isRemove ? "-" : " ";

      if (isFileHeader) {
        const path = file?.path ?? row?.text ?? "";
        const filename = getFilename(path);
        const directory = getDirectoryPath(path);
        const fileIndex = file?.index ?? row?.fileIndex ?? index;
        const isCollapsed = collapsedFileIndexes.has(fileIndex);
        const statusIcon = getFileStatusIcon(file?.status ?? "");

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleFileCollapsed(fileIndex)}
            style={({ pressed }) => [
              styles.fileRow,
              {
                backgroundColor: "#252526",
                borderColor: displayTheme.colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text selectable={false} style={[styles.fileDisclosure, { color: mutedColor }]}>
              {isCollapsed ? "▸" : "▾"}
            </Text>
            {file ? (
              <View style={[styles.fileStatusIcon, { backgroundColor: statusIcon.backgroundColor }]}>
                <Text selectable={false} style={[styles.fileStatusIconText, { color: statusIcon.color }]}>
                  {statusIcon.label}
                </Text>
              </View>
            ) : null}
            <View style={styles.fileTitleGroup}>
              {directory ? (
                <Text selectable style={[styles.filePath, { color: mutedColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                  {directory}/
                </Text>
              ) : null}
              <Text selectable style={[styles.fileName, { color: foregroundColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                {filename}
              </Text>
            </View>
            {file ? (
              <View style={styles.fileMeta}>
                <Text selectable={false} style={[styles.fileAdded, { color: "#7ee787", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                  +{file.additions}
                </Text>
                <Text selectable={false} style={[styles.fileRemoved, { color: "#ff7b72", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                  -{file.deletions}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      }

      return (
        <View style={[styles.diffRow, { backgroundColor: rowBackgroundColor, borderLeftColor: accentColor, height: rowHeight }]}>
          <Text selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
            {row && row.oldLineNumber >= 0 ? row.oldLineNumber : ""}
          </Text>
          <Text selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
            {row && row.newLineNumber >= 0 ? row.newLineNumber : ""}
          </Text>
          <Text selectable={false} style={[styles.marker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
            {isFileHeader ? "" : marker}
          </Text>
          <TokenizedText
            foregroundColor={textColor}
            line={row}
            style={[styles.diffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
            tokenStyleById={tokenStyleById}
          />
        </View>
      );
    },
    [collapsedFileIndexes, displayTheme.colors.border, fileByIndex, fileByRowStart, fileHeaderRowIndexes, fontFamily, fontSize, foregroundColor, mutedColor, rowHeight, toggleFileCollapsed, tokenStyleById],
  );

  const getSideBySideSourceRange = useCallback((segmentStart: number, segmentCount: number) => {
    const safeStart = Math.max(0, Math.floor(segmentStart));
    const safeEnd = Math.min(sideBySideSegments.length, safeStart + Math.max(0, Math.ceil(segmentCount)));
    let sourceStart = Number.POSITIVE_INFINITY;
    let sourceEnd = Number.NEGATIVE_INFINITY;

    for (let index = safeStart; index < safeEnd; index += 1) {
      const segment = sideBySideSegments[index];
      if (segment && segment.kind !== "file-header") {
        sourceStart = Math.min(sourceStart, segment.sourceStart);
        sourceEnd = Math.max(sourceEnd, segment.sourceEnd);
      }
    }

    return sourceStart < sourceEnd
      ? {
          count: sourceEnd - sourceStart,
          start: sourceStart,
        }
      : {
          count: 0,
          start: 0,
        };
  }, [sideBySideSegments]);

  const requestSideBySideRange = useCallback((segmentStart: number, segmentCount: number, options?: VirtualizedDocumentRequestOptions) => {
    const range = getSideBySideSourceRange(segmentStart, segmentCount);
    if (range.count > 0) {
      diffRows.requestRange(range.start, range.count, options);
    }
  }, [diffRows.requestRange, getSideBySideSourceRange]);

  const handleSideBySideVisibleRowsRequested = useCallback((segmentStart: number, segmentCount: number, reason: string) => {
    const range = getSideBySideSourceRange(segmentStart, segmentCount);
    if (range.count > 0) {
      scheduleVisibleHighlight(range.start, range.count, reason);
    }
  }, [getSideBySideSourceRange, scheduleVisibleHighlight]);

  const handleSideBySideTopItemChanged = useCallback((segmentIndex: number) => {
    if (state.status === "loaded") {
      const segment = sideBySideSegments[segmentIndex];
      const nextFileIndex = segment
        ? findFileIndexForRow(state.files, segment.sourceStart)
        : null;
      setActiveFileIndex((current) => current === nextFileIndex ? current : nextFileIndex);
    }
  }, [sideBySideSegments, state]);

  const getSideBySideItemType = useCallback((_index: number, segment: DiffPresentationSegment | undefined) => (
    segment?.kind === "file-header" ? "file-header" : `side-by-side-${viewMode}-${segment?.kind ?? "unknown"}`
  ), [viewMode]);

  const getSideBySideItemSize = useCallback((_index: number, segment: DiffPresentationSegment | undefined) => {
    if (!segment || segment.kind === "file-header") {
      return diffFileHeaderRowHeight;
    }

    const lineCount = Math.max(1, segment.lines.length);
    const extraPadding = segment.kind === "change" ? diffSideBySideBlockVerticalPadding * 2 : 0;
    const fluidGap = viewMode === "fluid" && segment.kind === "change" ? 8 : 0;
    return lineCount * rowHeight + extraPadding + fluidGap;
  }, [rowHeight, viewMode]);

  const renderSideBySideLine = useCallback(({
    line,
    rowIndex,
    side,
  }: {
    line: DiffSideBySideLine;
    rowIndex: number;
    side: "new" | "old";
  }) => {
    const sourceRowIndex = side === "old" ? line.oldRowIndex : line.newRowIndex;
    const row = sourceRowIndex !== null
      ? diffRows.rowCache.get(sourceRowIndex) ?? sideBySidePlainRowByIndex.get(sourceRowIndex)
      : undefined;
    const isRemove = side === "old" && row?.changeType === diffChangeTypeRemove;
    const isAdd = side === "new" && row?.changeType === diffChangeTypeAdd;
    const isChanged = isRemove || isAdd;
    const marker = isRemove ? "-" : isAdd ? "+" : " ";
    const accentColor = isAdd ? "#7ee787" : isRemove ? "#ff7b72" : "transparent";
    const rowBackgroundColor = isAdd
      ? "#17351f"
      : isRemove
        ? "#3a1d24"
        : "transparent";
    const textColor = isChanged ? foregroundColor : "#c9d1d9";
    const lineNumber = side === "old" ? row?.oldLineNumber : row?.newLineNumber;

    return (
      <View
        key={`${side}:${rowIndex}:${sourceRowIndex ?? "empty"}`}
        style={[
          styles.sideLine,
          {
            backgroundColor: rowBackgroundColor,
            height: rowHeight,
          },
        ]}
      >
        <Text selectable={false} style={[styles.sideLineNumber, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
          {lineNumber !== undefined && lineNumber >= 0 ? lineNumber : ""}
        </Text>
        <Text selectable={false} style={[styles.sideMarker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
          {row ? marker : ""}
        </Text>
        <TokenizedText
          foregroundColor={textColor}
          line={row}
          style={[styles.sideDiffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
          tokenStyleById={tokenStyleById}
        />
      </View>
    );
  }, [diffRows.rowCache, fontFamily, fontSize, foregroundColor, mutedColor, rowHeight, sideBySidePlainRowByIndex, tokenStyleById]);

  const renderSideBySideSegment = useCallback(
    ({ index, row: segment }: VirtualizedFixedDocumentListRenderRowProps<DiffPresentationSegment>) => {
      if (!segment) {
        return <View style={{ height: rowHeight }} />;
      }

      if (segment.kind === "file-header") {
        const plainRow = sideBySidePlainRowByIndex.get(segment.sourceStart);
        const file = plainRow ? fileByIndex.get(plainRow.fileIndex) : fileByRowStart.get(segment.sourceStart);
        const path = file?.path ?? plainRow?.text ?? "";
        const filename = getFilename(path);
        const directory = getDirectoryPath(path);
        const fileIndex = file?.index ?? plainRow?.fileIndex ?? index;
        const isCollapsed = collapsedFileIndexes.has(fileIndex);
        const statusIcon = getFileStatusIcon(file?.status ?? "");
        const fileHeaderLineHeight = Math.max(18, fontSize + 8);

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleFileCollapsed(fileIndex)}
            style={({ pressed }) => [
              styles.fileRow,
              {
                backgroundColor: "#252526",
                borderColor: displayTheme.colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text selectable={false} style={[styles.fileDisclosure, { color: mutedColor }]}>
              {isCollapsed ? "▸" : "▾"}
            </Text>
            {file ? (
              <View style={[styles.fileStatusIcon, { backgroundColor: statusIcon.backgroundColor }]}>
                <Text selectable={false} style={[styles.fileStatusIconText, { color: statusIcon.color }]}>
                  {statusIcon.label}
                </Text>
              </View>
            ) : null}
            <View style={styles.fileTitleGroup}>
              {directory ? (
                <Text selectable style={[styles.filePath, { color: mutedColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                  {directory}/
                </Text>
              ) : null}
              <Text selectable style={[styles.fileName, { color: foregroundColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                {filename}
              </Text>
            </View>
            {file ? (
              <View style={styles.fileMeta}>
                <Text selectable={false} style={[styles.fileAdded, { color: "#7ee787", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                  +{file.additions}
                </Text>
                <Text selectable={false} style={[styles.fileRemoved, { color: "#ff7b72", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                  -{file.deletions}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      }

      const isChange = segment.kind === "change";
      const isFluid = viewMode === "fluid";
      const segmentPadding = isChange ? diffSideBySideBlockVerticalPadding : 0;

      return (
        <View
          style={[
            styles.sideBySideSegment,
            isChange && viewMode === "blocks" ? styles.blockChangeSegment : null,
            {
              borderColor: isChange && viewMode === "blocks" ? displayTheme.colors.border : "transparent",
              marginHorizontal: isChange && viewMode === "blocks" ? 10 : 0,
              paddingVertical: segmentPadding,
            },
          ]}
        >
          <View style={styles.sidePane}>
            {segment.lines.map((line, lineIndex) => renderSideBySideLine({
              line,
              rowIndex: lineIndex,
              side: "old",
            }))}
          </View>
          <View style={[styles.sideConnectorColumn, { width: diffSideBySideGutterWidth }]}>
            {isFluid && isChange ? (
              <View style={styles.fluidConnector}>
                <View style={styles.fluidConnectorLeft} />
                <View style={styles.fluidConnectorBridge} />
                <View style={styles.fluidConnectorRight} />
              </View>
            ) : null}
          </View>
          <View style={styles.sidePane}>
            {segment.lines.map((line, lineIndex) => renderSideBySideLine({
              line,
              rowIndex: lineIndex,
              side: "new",
            }))}
          </View>
        </View>
      );
    },
    [collapsedFileIndexes, displayTheme.colors.border, fileByIndex, fileByRowStart, fontFamily, fontSize, foregroundColor, mutedColor, renderSideBySideLine, rowHeight, sideBySidePlainRowByIndex, toggleFileCollapsed, viewMode],
  );

  const renderViewModeToolbar = useCallback(() => (
    <View
      accessibilityLabel="Diff view mode"
      style={[
        styles.viewModeToolbar,
        {
          backgroundColor: syntaxTheme.appearance === "dark" ? "#2b2b2dcc" : "#f1f1f4dd",
          borderColor: displayTheme.colors.border,
        },
      ]}
    >
      {diffViewModeOptions.map((option) => {
        const selected = option.value === viewMode;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => handleViewModeChange(option.value)}
            style={({ pressed }) => [
              styles.viewModeButton,
              selected
                ? {
                    backgroundColor: syntaxTheme.appearance === "dark" ? "#4a4a4f" : "#ffffff",
                  }
                : null,
              pressed ? styles.viewModeButtonPressed : null,
            ]}
          >
            <Text
              selectable={false}
              style={[
                styles.viewModeButtonText,
                {
                  color: selected ? foregroundColor : mutedColor,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ), [displayTheme.colors.border, foregroundColor, handleViewModeChange, mutedColor, syntaxTheme.appearance, viewMode]);

  const body = useMemo(() => {
    const diffListHeight = Math.max(0, diffPaneHeight - diffTitlebarTopInset);
    const activeItemIndexes = viewMode === "unified" ? visibleItemIndexes : sideBySideItemIndexes;
    const diffContent = (() => {
      if (state.status === "loaded" && activeItemIndexes.length > 0) {
        if (diffListHeight <= 0) {
          return <View style={styles.diffPaneContent} />;
        }

        const list = viewMode === "unified" ? (
          <VirtualizedFixedDocumentList
            debugName="diff"
            extraData={listExtraData}
            itemIndexes={visibleItemIndexes}
            getItemSize={getItemSize}
            getItemType={getItemType}
            lineOverscan={diffLineOverscan}
            listRef={listRef}
            onTopItemChanged={handleTopItemChanged}
            onVisibleRowsRequested={handleVisibleRowsRequested}
            overscanRequestDelayMs={diffOverscanRequestDelayMs}
            requestRange={diffRows.requestRange}
            rowCache={diffRows.rowCache}
            rowHeight={rowHeight}
            rowsVersion={diffRows.rowsVersion}
            renderRow={renderRow}
            style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
          />
        ) : (
          <VirtualizedFixedDocumentList
            debugName={`diff-${viewMode}`}
            extraData={listExtraData}
            itemIndexes={sideBySideItemIndexes}
            getItemSize={getSideBySideItemSize}
            getItemType={getSideBySideItemType}
            lineOverscan={Math.max(12, Math.floor(diffLineOverscan / 10))}
            listRef={listRef}
            onTopItemChanged={handleSideBySideTopItemChanged}
            onVisibleRowsRequested={handleSideBySideVisibleRowsRequested}
            overscanRequestDelayMs={diffOverscanRequestDelayMs}
            requestRange={requestSideBySideRange}
            rowCache={sideBySideRowCache}
            rowHeight={rowHeight}
            rowsVersion={diffRows.rowsVersion + sideBySideSegments.length}
            renderRow={renderSideBySideSegment}
            style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
          />
        );

        return (
          <View
            style={[
              styles.diffPaneContent,
              {
                height: diffListHeight,
                minHeight: diffListHeight,
              },
            ]}
          >
            {list}
          </View>
        );
      }

      if (state.status === "loaded") {
        return (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
              No changes
            </Text>
            <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
              {visibleFolderPath ?? "The selected folder has no changes."}
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            No folder open
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]}>
            Open a Git folder to view its changes.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={openFolder}
            style={({ pressed }) => [
              styles.emptyButton,
              {
                borderColor: displayTheme.colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text style={[styles.emptyButtonText, { color: foregroundColor }]}>
              Open Folder
            </Text>
          </Pressable>
        </View>
      );
    })();

      if (state.status === "loaded" && activeItemIndexes.length > 0) {
        const sidebar = (
        <View
          style={[
            styles.sidebar,
            {
              height: splitPaneMetrics.sidebarHeight || undefined,
              minHeight: splitPaneMetrics.sidebarHeight || undefined,
              width: splitPaneMetrics.sidebarWidth || undefined,
            },
          ]}
        >
          <Text style={[styles.sidebarTitle, { color: mutedColor }]}>Files</Text>
          <ScrollView style={styles.sidebarList}>
            {state.files.map((file) => {
              const filename = getFilename(file.path);
              const directory = getDirectoryPath(file.path);
              const statusIcon = getFileStatusIcon(file.status);
              const isActive = file.index === activeFileIndex;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={`${file.index}:${file.path}`}
                  onPress={() => scrollToFile(file)}
                  style={({ pressed }) => [
                    styles.sidebarFile,
                    isActive
                      ? {
                          backgroundColor: "#2d333b",
                          borderColor: displayTheme.colors.border,
                        }
                      : null,
                    { opacity: pressed ? 0.72 : 1 },
                  ]}
                >
                  <View style={[styles.sidebarStatusIcon, { backgroundColor: statusIcon.backgroundColor }]}>
                    <Text selectable={false} style={[styles.sidebarStatusIconText, { color: statusIcon.color }]}>
                      {statusIcon.label}
                    </Text>
                  </View>
                  <View style={styles.sidebarFileTextGroup}>
                    <Text numberOfLines={1} style={[styles.sidebarFileName, { color: foregroundColor }]}>
                      {filename}
                    </Text>
                    {directory ? (
                      <Text numberOfLines={1} style={[styles.sidebarFilePath, { color: mutedColor }]}>
                        {directory}/
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      );

      return (
        <SidebarSplitView
          appearance={syntaxTheme.appearance}
          contentMinWidth={420}
          onSplitViewDidResize={handleSplitViewResize}
          sidebarMinWidth={180}
          style={styles.content}
        >
          {sidebar}
          <View onLayout={handleDiffPaneLayout} style={styles.diffPane}>
            {diffContent}
            {renderViewModeToolbar()}
          </View>
        </SidebarSplitView>
      );
    }

    return diffContent;
  }, [activeFileIndex, diffPaneHeight, diffRows.requestRange, diffRows.rowCache, diffRows.rowsVersion, displayTheme.colors.border, foregroundColor, getItemSize, getItemType, getSideBySideItemSize, getSideBySideItemType, handleDiffPaneLayout, handleSideBySideTopItemChanged, handleSideBySideVisibleRowsRequested, handleSplitViewResize, handleTopItemChanged, handleVisibleRowsRequested, listExtraData, mutedColor, openFolder, renderRow, renderSideBySideSegment, renderViewModeToolbar, requestSideBySideRange, rowHeight, scrollToFile, sideBySideItemIndexes, sideBySideRowCache, sideBySideSegments.length, splitPaneMetrics.sidebarHeight, splitPaneMetrics.sidebarWidth, state, syntaxTheme.appearance, viewMode, visibleFolderPath, visibleItemIndexes]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      {state.error ? (
        <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{state.error}</Text>
      ) : null}
      {body}
    </View>
  );
}

export default DiffViewerWindow;

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    padding: 32,
  },
  emptyButton: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
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
  content: {
    flex: 1,
    minHeight: 0,
  },
  diffRow: {
    borderLeftWidth: 3,
    flexDirection: "row",
    height: sourceViewerRowHeight,
  },
  diffPane: {
    flex: 1,
    paddingTop: diffTitlebarTopInset,
  },
  diffPaneContent: {
    flex: 1,
    minHeight: 0,
  },
  diffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingRight: 12,
  },
  blockChangeSegment: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  fileAdded: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  fileDisclosure: {
    fontSize: 22,
    lineHeight: 20,
    textAlign: "center",
    width: 20,
  },
  fileMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  fileName: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  filePath: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 20,
  },
  fileRemoved: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  fileRow: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    height: 40,
    marginHorizontal: 12,
    marginVertical: 6,
    paddingHorizontal: 10,
  },
  fileStatusIcon: {
    alignItems: "center",
    borderRadius: 4,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  fileStatusIconText: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
  },
  fileTitleGroup: {
    alignItems: "baseline",
    flex: 1,
    flexDirection: "row",
  },
  lineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingHorizontal: 8,
    textAlign: "right",
    width: sourceViewerLineNumberWidth,
  },
  list: {
    flex: 1,
  },
  marker: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: 28,
  },
  root: {
    flex: 1,
  },
  sideBySideSegment: {
    flexDirection: "row",
    minHeight: 0,
  },
  sideConnectorColumn: {
    alignItems: "center",
    justifyContent: "center",
  },
  sideDiffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingRight: diffSideBySideHorizontalPadding,
  },
  sideLine: {
    flexDirection: "row",
    overflow: "hidden",
  },
  sideLineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingLeft: 8,
    paddingRight: 6,
    textAlign: "right",
    width: 58,
  },
  sideMarker: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: 18,
  },
  sidePane: {
    flex: 1,
    minWidth: 0,
  },
  fluidConnector: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    minHeight: 22,
    width: diffSideBySideGutterWidth,
  },
  fluidConnectorBridge: {
    backgroundColor: "#3fb95066",
    height: 6,
    width: 16,
  },
  fluidConnectorLeft: {
    backgroundColor: "#ff7b7266",
    borderBottomLeftRadius: 6,
    borderTopLeftRadius: 6,
    height: "70%",
    width: 10,
  },
  fluidConnectorRight: {
    backgroundColor: "#7ee78766",
    borderBottomRightRadius: 6,
    borderTopRightRadius: 6,
    height: "70%",
    width: 10,
  },
  sidebar: {
    flex: 1,
    paddingBottom: 8,
    paddingTop: diffTitlebarTopInset,
  },
  sidebarFile: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sidebarFileName: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  sidebarFilePath: {
    fontSize: 11,
    lineHeight: 15,
  },
  sidebarFileTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  sidebarList: {
    flex: 1,
  },
  sidebarStatusIcon: {
    alignItems: "center",
    borderRadius: 3,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  sidebarStatusIconText: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "center",
  },
  sidebarTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textTransform: "uppercase",
  },
  viewModeButton: {
    alignItems: "center",
    borderRadius: 5,
    height: 26,
    justifyContent: "center",
    minWidth: 72,
    paddingHorizontal: 10,
  },
  viewModeButtonPressed: {
    opacity: 0.72,
  },
  viewModeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  viewModeToolbar: {
    alignItems: "center",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 2,
    padding: 2,
    position: "absolute",
    right: 16,
    top: diffTitlebarTopInset + 8,
    zIndex: 10,
  },
});

import {
  loadGitFolderDiff,
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSyntaxStyle,
} from "@legend-desktop/diff-parser";
import {
  createSyntaxStyleMap,
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
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename, openDiffFolderDialog } from "./diffFiles";
import { useDiffSyntaxTheme, useDiffSyntaxThemeSetting, type DiffSettingsFile } from "./diffSettings";
import { setDiffViewerWindowOptions } from "./diffWindows";

const diffInitialRowCount = 160;
const diffInitialHighlightChunkRowCount = 40;
const diffLineOverscan = 240;
const diffOverscanRequestDelayMs = 80;
const diffFileHeaderRowHeight = 52;
const diffRowKindFileHeader = 0;
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;

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

function formatDiffSummary(timing: DiffLoadTiming) {
  return [
    `${timing.fileCount.toLocaleString()} ${timing.fileCount === 1 ? "file" : "files"}`,
    `${timing.rowCount.toLocaleString()} rows`,
    `${timing.nativeTotalMs.toFixed(1)} ms`,
  ].join(" · ");
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function elapsedMs(start: number, end = nowMs()) {
  return Math.max(0, end - start);
}

function logDiffOpenTiming(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffOpenTiming] ${event} ${JSON.stringify(payload)}`);
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

export function DiffViewerWindow({ folderPath }: DiffViewerWindowProps) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();
  const syntaxTheme = useDiffSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const [state, setState] = useState<DiffViewerState>(emptyState);
  const [collapsedFileIndexes, setCollapsedFileIndexes] = useState<Set<number>>(() => new Set());
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
  const title = visibleFolderPath ? getFilename(visibleFolderPath) : "No folder";
  const backgroundColor = syntaxTheme.background;
  const borderColor = displayTheme.colors.border;
  const foregroundColor = syntaxTheme.foreground;
  const mutedColor = displayTheme.colors.muted;
  const fileByIndex = useMemo(() => {
    if (state.status !== "loaded") {
      return new Map<number, DiffFileSummary>();
    }
    return new Map(state.files.map((file) => [file.index, file]));
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
  const subtitle = state.status === "loaded" && diffRows.timing
    ? formatDiffSummary(diffRows.timing)
    : visibleFolderPath ?? "Open a Git folder to view its changes";

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
      setCollapsedFileIndexes((current) => current.size > 0 ? new Set() : current);
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
  }, [loadFolder, selectedSyntaxTheme]);

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

  const getItemType = useCallback((index: number, row: DiffRenderRow | undefined) => (
    row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index) ? "file-header" : "diff-line"
  ), [fileHeaderRowIndexes]);

  const getItemSize = useCallback((index: number, row: DiffRenderRow | undefined) => (
    getItemType(index, row) === "file-header" ? diffFileHeaderRowHeight : sourceViewerRowHeight
  ), [getItemType]);

  const renderRow = useCallback(
    ({ index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
      const changeType = row?.changeType ?? 0;
      const isAdd = changeType === diffChangeTypeAdd;
      const isRemove = changeType === diffChangeTypeRemove;
      const isChanged = isAdd || isRemove;
      const isFileHeader = row?.kind === diffRowKindFileHeader;
      const file = row ? fileByIndex.get(row.fileIndex) : undefined;
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
                borderColor,
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
                <Text selectable style={[styles.filePath, { color: mutedColor }]} numberOfLines={1}>
                  {directory}
                </Text>
              ) : null}
              <Text selectable style={[styles.fileName, { color: foregroundColor }]} numberOfLines={1}>
                {filename}
              </Text>
            </View>
            {file ? (
              <View style={styles.fileMeta}>
                <Text selectable={false} style={[styles.fileAdded, { color: "#7ee787" }]}>
                  +{file.additions}
                </Text>
                <Text selectable={false} style={[styles.fileRemoved, { color: "#ff7b72" }]}>
                  -{file.deletions}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      }

      return (
        <View style={[styles.diffRow, { backgroundColor: rowBackgroundColor, borderLeftColor: accentColor }]}>
          <Text selectable={false} style={[styles.lineNumber, { color: lineNumberColor }]}>
            {row && row.oldLineNumber >= 0 ? row.oldLineNumber : ""}
          </Text>
          <Text selectable={false} style={[styles.lineNumber, { color: lineNumberColor }]}>
            {row && row.newLineNumber >= 0 ? row.newLineNumber : ""}
          </Text>
          <Text selectable={false} style={[styles.marker, { color: isChanged ? accentColor : mutedColor }]}>
            {isFileHeader ? "" : marker}
          </Text>
          <TokenizedText
            foregroundColor={textColor}
            line={row}
            style={styles.diffText}
            tokenStyleById={tokenStyleById}
          />
        </View>
      );
    },
    [borderColor, collapsedFileIndexes, fileByIndex, foregroundColor, mutedColor, toggleFileCollapsed, tokenStyleById],
  );

  const body = useMemo(() => {
    if (state.status === "loaded" && visibleItemIndexes.length > 0) {
      return (
        <VirtualizedFixedDocumentList
          debugName="diff"
          itemIndexes={visibleItemIndexes}
          getItemSize={getItemSize}
          getItemType={getItemType}
          lineOverscan={diffLineOverscan}
          onVisibleRowsRequested={handleVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={diffRows.requestRange}
          rowCache={diffRows.rowCache}
          rowHeight={sourceViewerRowHeight}
          rowsVersion={diffRows.rowsVersion}
          renderRow={renderRow}
          style={styles.list}
        />
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
      </View>
    );
  }, [diffRows.requestRange, diffRows.rowCache, diffRows.rowsVersion, foregroundColor, getItemSize, getItemType, handleVisibleRowsRequested, mutedColor, renderRow, state.status, visibleFolderPath, visibleItemIndexes]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: foregroundColor }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openFolder}
          style={({ pressed }) => [
            styles.openButton,
            { borderColor, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[styles.openButtonText, { color: foregroundColor }]}>Open Folder</Text>
        </Pressable>
      </View>
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
    gap: 8,
    justifyContent: "center",
    padding: 32,
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
  diffRow: {
    borderLeftWidth: 3,
    flexDirection: "row",
    height: sourceViewerRowHeight,
  },
  diffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingRight: 12,
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
    gap: 8,
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

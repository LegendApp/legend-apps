import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { commandRunner } from "@legend-desktop/command-runner";
import {
  loadGitFolderDiff,
  loadUnifiedDiffFromUrl,
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSideBySideRenderRow,
  type DiffSyntaxStyle,
  type DiffTokenizedRowRange,
} from "@legend-desktop/diff-parser";
import { DragDropView, type DragDropFileEvent } from "@legend-desktop/drag-drop";
import { revealInFinder } from "@legend-desktop/file-dialog";
import { watchDirectories } from "@legend-desktop/file-system-watcher";
import {
  createSyntaxStyleMap,
  elapsedMs,
  LightText,
  measureAfterEffect,
  nowMs,
  sourceViewerCodeFontFamily,
  sourceViewerLineNumberWidth,
  sourceViewerRowHeight,
  TokenizedText,
  type SyntaxStyleMap,
} from "@legend-desktop/source-viewer";
import { updateMenuItems } from "@legend-desktop/native-menu";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { TextInputSearch, type TextInputSearchRef } from "@legend-desktop/text-input-search";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import {
  useVirtualizedDocumentRows,
  VirtualizedFixedDocumentList,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedDocumentSnapshot,
  type VirtualizedFixedDocumentListRef,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type NativeSyntheticEvent } from "react-native";
import { addWindowToolbarItemSelectedListener } from "@legend-desktop/window-manager";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "./appConstants";
import { getDiffRecentDocumentPath, getDiffSourceLabel, getFilename, normalizeDiffOpenSource, openDiffFolderDialog, type DiffOpenSource } from "./diffFiles";
import {
  isDiffViewMode,
  setDiffViewModeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
  useDiffViewModeSetting,
  type DiffSettingsFile,
} from "./diffSettings";
import { registerDiffViewerActionHandlers } from "./diffViewerActions";
import { diffSidebarToolbarItemId, diffViewModeToolbarItemId, setDiffViewerWindowOptions } from "./diffWindows";

const diffInitialRowCount = 160;
const diffInitialHighlightChunkRowCount = 40;
const diffBackgroundTokenizeChunkBudgetMs = 3;
const diffBackgroundTokenizeChunkRowCount = 16;
const diffBackgroundTokenizeMaxRowCount = 100_000;
const diffBackgroundTokenizePollMs = 80;
const diffBackgroundTokenizeStartDelayMs = 160;
const diffLineOverscan = 240;
const diffOverscanRequestDelayMs = 80;
const diffFileHeaderRowHeight = 52;
const diffTitlebarTopInset = 52;
const diffLoadedWindowOptionsDelayMs = 750;
const diffScrollIdleMs = 120;
const diffRowKindFileHeader = 0;
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;
const diffSideBySideGutterWidth = 44;
const diffSideBySideHorizontalPadding = 12;
const diffSidebarFileRowHeight = 46;
const diffSideBySideAdaptiveRender = {
  enterVelocity: 8,
  exitDelay: 150,
  exitVelocity: 3,
};
const diffDropAllowedFileTypes = ["diff", "patch"];

type DiffViewerWindowProps = {
  focusUrlInputRequestId?: number;
  folderPath?: string;
  source?: DiffOpenSource;
};

type DiffLoadTrace = {
  document: DiffDocument | null;
  folderPath: string;
  loadStartedAt: number;
  nativeResolvedAt: number;
  setStateAt: number;
};

type DiffSidebarFileRowProps = {
  activeFileIndex$: Observable<number | null>;
  borderColor: string;
  file: DiffFileSummary;
  foregroundColor: string;
  mutedColor: string;
  onPress: () => void;
  statusPresentation: ReturnType<typeof getFileStatusPresentation>;
};

type SideBySideTokenStyleState = {
  document: DiffDocument;
  styleCount: number;
  tokenStyleById: SyntaxStyleMap;
};

type DiffSideBySideLineProps = {
  adaptiveRender: "light" | "normal";
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  mutedColor: string;
  row: DiffRenderRow;
  rowHeight: number;
  rowVisible: boolean;
  side: "new" | "old";
  tokenStyleById: SyntaxStyleMap;
};

function areDiffRenderRowsEqual(previousRow: DiffRenderRow, nextRow: DiffRenderRow) {
  let areEqual = previousRow === nextRow;
  if (!areEqual) {
    areEqual = previousRow.index === nextRow.index
      && previousRow.kind === nextRow.kind
      && previousRow.fileIndex === nextRow.fileIndex
      && previousRow.hunkIndex === nextRow.hunkIndex
      && previousRow.oldLineNumber === nextRow.oldLineNumber
      && previousRow.newLineNumber === nextRow.newLineNumber
      && previousRow.changeType === nextRow.changeType
      && previousRow.text === nextRow.text
      && previousRow.tokens.length === nextRow.tokens.length;

    if (areEqual) {
      for (let tokenIndex = 0; tokenIndex < previousRow.tokens.length; tokenIndex += 1) {
        const previousToken = previousRow.tokens[tokenIndex];
        const nextToken = nextRow.tokens[tokenIndex];
        if (
          previousToken.startColumn !== nextToken.startColumn
          || previousToken.length !== nextToken.length
          || previousToken.styleId !== nextToken.styleId
        ) {
          areEqual = false;
          break;
        }
      }
    }
  }
  return areEqual;
}

function areDiffSideBySideLinePropsEqual(previousProps: DiffSideBySideLineProps, nextProps: DiffSideBySideLineProps) {
  const sharedPropsAreEqual = previousProps.adaptiveRender === nextProps.adaptiveRender
    && previousProps.fontFamily === nextProps.fontFamily
    && previousProps.fontSize === nextProps.fontSize
    && previousProps.foregroundColor === nextProps.foregroundColor
    && previousProps.mutedColor === nextProps.mutedColor
    && previousProps.rowHeight === nextProps.rowHeight
    && previousProps.rowVisible === nextProps.rowVisible
    && previousProps.side === nextProps.side
    && previousProps.tokenStyleById === nextProps.tokenStyleById;

  return sharedPropsAreEqual
    && (!nextProps.rowVisible || areDiffRenderRowsEqual(previousProps.row, nextProps.row));
}

const DiffSideBySideLine = memo(function DiffSideBySideLine({
  adaptiveRender,
  fontFamily,
  fontSize,
  foregroundColor,
  mutedColor,
  row,
  rowHeight,
  rowVisible,
  side,
  tokenStyleById,
}: DiffSideBySideLineProps) {
  const visibleRow = rowVisible ? row : undefined;
  const isRemove = side === "old" && visibleRow?.changeType === diffChangeTypeRemove;
  const isAdd = side === "new" && visibleRow?.changeType === diffChangeTypeAdd;
  const isChanged = isRemove || isAdd;
  const marker = isRemove ? "-" : isAdd ? "+" : " ";
  const accentColor = isAdd ? "#7ee787" : isRemove ? "#ff7b72" : "transparent";
  const rowBackgroundColor = isAdd
    ? "#17351f"
    : isRemove
      ? "#3a1d24"
      : "transparent";
  const textColor = isChanged ? foregroundColor : "#c9d1d9";
  const lineNumber = side === "old" ? visibleRow?.oldLineNumber : visibleRow?.newLineNumber;

  return (
    <View
      style={[
        styles.sideLine,
        {
          backgroundColor: rowBackgroundColor,
          height: rowHeight,
        },
      ]}
    >
      <LightText selectable={false} style={[styles.sideLineNumber, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {lineNumber !== undefined && lineNumber >= 0 ? lineNumber : ""}
      </LightText>
      <LightText selectable={false} style={[styles.sideMarker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {visibleRow ? marker : ""}
      </LightText>
      <TokenizedText
        adaptiveRender={adaptiveRender}
        foregroundColor={textColor}
        line={visibleRow}
        style={[styles.sideDiffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
        tokenStyleById={tokenStyleById}
      />
    </View>
  );
}, areDiffSideBySideLinePropsEqual);

type DiffViewerState =
  | {
    status: "empty";
    error: null;
    folderPath: null;
    source: null;
  }
  | {
    status: "loaded";
    error: null;
    folderPath: string;
    source: DiffOpenSource;
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
    source: DiffOpenSource | null;
  };

const emptyState: DiffViewerState = {
  status: "empty",
  error: null,
  folderPath: null,
  source: null,
};

function DiffSidebarFileRow({
  activeFileIndex$,
  borderColor,
  file,
  foregroundColor,
  mutedColor,
  onPress,
  statusPresentation,
}: DiffSidebarFileRowProps) {
  const isActive = useValue(() => activeFileIndex$.get() === file.index);
  const filename = getFilename(file.path);
  const directory = getDirectoryPath(file.path);
  const pathContext = getFilePathContext(file, directory);

  return (
    <Pressable
      accessibilityLabel={`${filename}, ${statusPresentation.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sidebarFile,
        isActive
          ? {
              backgroundColor: "#2d333b",
              borderColor,
            }
          : null,
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View style={[styles.sidebarStatusIcon, { backgroundColor: statusPresentation.backgroundColor }]}>
        <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={10} />
      </View>
      <View style={styles.sidebarFileTextGroup}>
        <Text numberOfLines={1} style={[styles.sidebarFileName, { color: foregroundColor }]}>
          {filename}
        </Text>
        {pathContext ? (
          <Text numberOfLines={1} style={[styles.sidebarFilePath, { color: mutedColor }]}>
            {pathContext}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function getDiffLineRowHeight(fontSize: number) {
  return Math.max(20, fontSize + 9);
}

function logDiffOpenTiming(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffOpenTiming] ${event} ${JSON.stringify(payload)}`);
}

function sourcesMatch(left: DiffOpenSource | null, right: DiffOpenSource) {
  return left?.kind === right.kind && left.value === right.value;
}

function logDiffLoadTiming(folderPath: string, timing: DiffLoadTiming) {
  logDiffOpenTiming("viewer.native.loaded", {
    copyFilesMs: Number(timing.copyFilesMs.toFixed(1)),
    copyInitialRowsMs: Number(timing.copyInitialRowsMs.toFixed(1)),
    createDiffMs: Number(timing.createDiffMs.toFixed(1)),
    diffMs: Number(timing.diffMs.toFixed(1)),
    documentMs: Number(timing.documentMs.toFixed(1)),
    fetchMs: Number(timing.fetchMs.toFixed(1)),
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

function getDroppedDiffSource(drop: DragDropFileEvent): DiffOpenSource | null {
  const directory = drop.directories[0];
  let source = directory ? normalizeDiffOpenSource(directory) : null;
  if (!source) {
    const githubUrl = drop.urls.find((url) => normalizeDiffOpenSource(url)?.kind === "github");
    const githubSource = githubUrl ? normalizeDiffOpenSource(githubUrl) : null;
    source = githubSource?.kind === "github" ? githubSource : null;
  }
  return source;
}

function getUnsupportedDropMessage(drop: DragDropFileEvent) {
  let message = "Drop a Git folder or GitHub PR or commit URL.";
  if (drop.files.length > 0) {
    message = "File compare is not available yet. Drop a Git folder or GitHub PR or commit URL.";
  } else if (drop.urls.length > 0) {
    message = "Drop a GitHub PR or commit URL.";
  }
  return message;
}

function getFileStatusPresentation(file: Pick<DiffFileSummary, "isBinary" | "status"> | null | undefined) {
  const status = file?.status ?? "unknown";
  let presentation = {
    backgroundColor: "#f0883e",
    color: "#1f1300",
    symbolName: "pencil",
    title: "Modified",
  };

  switch (status) {
    case "added":
      presentation = {
        backgroundColor: "#238636",
        color: "#ffffff",
        symbolName: "plus",
        title: "Added",
      };
      break;
    case "untracked":
      presentation = {
        backgroundColor: "#238636",
        color: "#ffffff",
        symbolName: "plus",
        title: "Untracked",
      };
      break;
    case "deleted":
      presentation = {
        backgroundColor: "#da3633",
        color: "#ffffff",
        symbolName: "minus",
        title: "Deleted",
      };
      break;
    case "renamed":
      presentation = {
        backgroundColor: "#388bfd",
        color: "#ffffff",
        symbolName: "arrow.right",
        title: "Renamed",
      };
      break;
    case "copied":
      presentation = {
        backgroundColor: "#8957e5",
        color: "#ffffff",
        symbolName: "doc.on.doc",
        title: "Copied",
      };
      break;
    case "modified":
      break;
    default:
      presentation = {
        backgroundColor: "#6e7681",
        color: "#ffffff",
        symbolName: "questionmark",
        title: status === "unknown" ? "Unknown" : status,
      };
      break;
  }

  return file?.isBinary
    ? { ...presentation, title: `${presentation.title} binary` }
    : presentation;
}

function getFilePathContext(file: DiffFileSummary, directory: string) {
  const hasOldPath = file.oldPath && file.oldPath !== file.path;
  let context = directory ? `${directory}/` : "";
  if (hasOldPath && (file.status === "renamed" || file.status === "copied")) {
    context = `${file.oldPath} -> ${context}`;
  }
  return context;
}

function fileMatchesFilter(file: DiffFileSummary, normalizedFilter: string) {
  let matches = true;
  if (normalizedFilter) {
    const haystack = `${file.path} ${file.oldPath} ${file.status}`.toLowerCase();
    const terms = normalizedFilter.split(/\s+/).filter(Boolean);
    matches = terms.every((term) => haystack.includes(term));
  }
  return matches;
}

function getActiveDiffFile(files: readonly DiffFileSummary[], activeFileIndex: number | null) {
  let activeFile = activeFileIndex === null
    ? null
    : files.find((file) => file.index === activeFileIndex) ?? null;
  if (!activeFile) {
    activeFile = files[0] ?? null;
  }
  return activeFile;
}

function getJoinedPath(basePath: string, relativePath: string) {
  return `${basePath.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
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

export function DiffViewerWindow({ focusUrlInputRequestId, folderPath, source }: DiffViewerWindowProps) {
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
  const [urlInput, setUrlInput] = useState("");
  const [urlInputError, setUrlInputError] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState("");
  const [loadingSource, setLoadingSource] = useState<DiffOpenSource | null>(null);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedFileIndexes, setCollapsedFileIndexes] = useState<Set<number>>(() => new Set());
  const activeFileIndex$ = useObservable<number | null>(null);
  const sideBySideRowVersions$ = useObservable<Record<string, number>>({});
  const [splitPaneMetrics, setSplitPaneMetrics] = useState({
    contentHeight: 0,
    contentWidth: 0,
    sidebarHeight: 0,
    sidebarWidth: 0,
  });
  const [diffPaneHeight, setDiffPaneHeight] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const splitPaneMetricsRef = useRef(splitPaneMetrics);
  splitPaneMetricsRef.current = splitPaneMetrics;
  const diffPaneHeightRef = useRef(diffPaneHeight);
  diffPaneHeightRef.current = diffPaneHeight;
  const listRef = useRef<VirtualizedFixedDocumentListRef | null>(null);
  const fileFilterInputRef = useRef<TextInputSearchRef | null>(null);
  const urlInputRef = useRef<TextInput | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadTraceRef = useRef<DiffLoadTrace | null>(null);
  const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
  const [sideBySideTokenStyleState, setSideBySideTokenStyleState] = useState<SideBySideTokenStyleState | null>(null);
  const isLoading = loadingSource !== null;
  const isLoadingGithub = loadingSource?.kind === "github";
  const highlightedVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const sideBySideVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const isRenderingInitialLoadedFrame = state.status === "loaded" && sourcesMatch(loadingSource, state.source);
  const loggedInitialLoadedFrameRef = useRef<boolean | null>(null);
  const sideBySideScrollIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sideBySideScrollingRef = useRef(false);
  const pendingSideBySideTokenRangesRef = useRef<{
    document: DiffDocument;
    ranges: DiffTokenizedRowRange[];
  } | null>(null);
  const collapsedFileIndexListRef = useRef<number[]>([]);
  const highlightTimeoutHandlesRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const visibleSource = state.source;
  const visibleFolderPath = visibleSource?.kind === "folder" ? visibleSource.value : null;
  const visibleSourceLabel = getDiffSourceLabel(visibleSource);
  const backgroundColor = syntaxTheme.background;
  const foregroundColor = syntaxTheme.foreground;
  const mutedColor = displayTheme.colors.muted;
  const loadedFileCount = state.status === "loaded" ? state.files.length : 0;
  const toolbarSource = loadingSource ?? (loadedFileCount > 0 ? visibleSource : null);
  const showViewModeToolbar = toolbarSource !== null;
  const showSidebarControl = showViewModeToolbar;
  const normalizedFileFilter = fileFilter.trim().toLowerCase();

  useEffect(() => {
    if (state.status === "loaded" && loggedInitialLoadedFrameRef.current !== isRenderingInitialLoadedFrame) {
      logDiffOpenTiming("viewer.initialLoadedFrame.state", {
        isRenderingInitialLoadedFrame,
        loadingSource,
        rows: state.document.rowCount,
        source: state.source,
      });
    }
    loggedInitialLoadedFrameRef.current = isRenderingInitialLoadedFrame;
  }, [isRenderingInitialLoadedFrame, loadingSource, state]);

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
  const snapshot = useMemo<VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming> | null>(
    () => {
      const startedAt = nowMs();
      let nextSnapshot: VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming> | null = null;
      if (state.status === "loaded") {
        nextSnapshot = {
          document: state.document,
          initialRows: state.initialRows,
          itemCount: state.document.rowCount,
          styles: state.styles,
          timing: state.timing,
        };
        logDiffOpenTiming("viewer.derive.snapshot", {
          durationMs: Number((nowMs() - startedAt).toFixed(1)),
          initialRows: state.initialRows.length,
          rows: state.document.rowCount,
          styles: state.styles.length,
        });
      }
      return nextSnapshot;
    },
    [state],
  );
  const filteredSidebarFiles = useMemo(
    () => state.status === "loaded"
      ? state.files.filter((file) => fileMatchesFilter(file, normalizedFileFilter))
      : [],
    [normalizedFileFilter, state],
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
  const refreshSideBySideTokenStyles = useCallback((document: DiffDocument) => {
    const styles = document.getStyles();
    setSideBySideTokenStyleState((current) => (
      current?.document === document && current.styleCount === styles.length
        ? current
        : {
            document,
            styleCount: styles.length,
            tokenStyleById: createSyntaxStyleMap(styles),
          }
    ));
  }, []);
  const bumpSideBySideRowVersion = useCallback((rowIndex: number) => {
    const key = String(rowIndex);
    sideBySideRowVersions$[key].set((sideBySideRowVersions$[key].peek() ?? 0) + 1);
  }, [sideBySideRowVersions$]);
  const flushSideBySideTokenInvalidation = useCallback((document: DiffDocument, ranges: readonly DiffTokenizedRowRange[]) => {
    const visibleRange = sideBySideVisibleRangeRef.current;
    if (visibleRange?.document === document && ranges.length > 0) {
      refreshSideBySideTokenStyles(document);
      const end = visibleRange.start + visibleRange.count;
      for (let index = visibleRange.start; index < end; index += 1) {
        const row = document.getPlainSideBySideRow(index, collapsedFileIndexListRef.current);
        const oldRowIndex = row.oldRowVisible ? row.oldRow.index : -1;
        const newRowIndex = row.newRowVisible ? row.newRow.index : -1;
        const overlapsTokenizedRange = ranges.some((range) => (
          (oldRowIndex >= range.start && oldRowIndex < range.end) ||
          (newRowIndex >= range.start && newRowIndex < range.end)
        ));
        if (overlapsTokenizedRange) {
          bumpSideBySideRowVersion(index);
        }
      }
      if (pendingSideBySideTokenRangesRef.current?.document === document) {
        pendingSideBySideTokenRangesRef.current = null;
      }
    } else if (visibleRange && visibleRange.document !== document && pendingSideBySideTokenRangesRef.current?.document === document) {
      pendingSideBySideTokenRangesRef.current = null;
    }
  }, [bumpSideBySideRowVersion, refreshSideBySideTokenStyles]);
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
    () => Array.from(collapsedFileIndexes).sort((left, right) => left - right),
    [collapsedFileIndexes],
  );
  collapsedFileIndexListRef.current = collapsedFileIndexList;
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
  const clearHighlightTimeouts = useCallback(() => {
    for (const timeoutHandle of highlightTimeoutHandlesRef.current) {
      clearTimeout(timeoutHandle);
    }
    highlightTimeoutHandlesRef.current.clear();
  }, []);

  useEffect(() => {
    highlightedVisibleRangeRef.current = null;
    sideBySideVisibleRangeRef.current = null;
    pendingSideBySideTokenRangesRef.current = null;
    sideBySideScrollingRef.current = false;
    sideBySideRowVersions$.set({});
    if (sideBySideScrollIdleTimeoutRef.current) {
      clearTimeout(sideBySideScrollIdleTimeoutRef.current);
      sideBySideScrollIdleTimeoutRef.current = null;
    }
    clearHighlightTimeouts();
    if (state.status === "loaded") {
      activeFileIndex$.set(state.files[0]?.index ?? null);
      setCollapsedFileIndexes((current) => current.size > 0 ? new Set() : current);
    } else {
      activeFileIndex$.set(null);
    }
  }, [activeFileIndex$, clearHighlightTimeouts, sideBySideRowVersions$, state.status === "loaded" ? state.document : null]);

  useEffect(() => clearHighlightTimeouts, [clearHighlightTimeouts]);

  useEffect(() => () => {
    if (sideBySideScrollIdleTimeoutRef.current) {
      clearTimeout(sideBySideScrollIdleTimeoutRef.current);
      sideBySideScrollIdleTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (state.status === "loaded" && viewMode !== "unified" && diffPaneHeight > 0 && sideBySideRowCount > 0) {
      const document = state.document;
      if (sideBySideRowCount > diffBackgroundTokenizeMaxRowCount) {
        logDiffOpenTiming("viewer.backgroundTokenize.skipped", {
          maxRows: diffBackgroundTokenizeMaxRowCount,
          rows: sideBySideRowCount,
        });
        return undefined;
      }

      let intervalHandle: ReturnType<typeof setInterval> | null = null;
      const startTimeoutHandle = setTimeout(() => {
        document.startBackgroundTokenization(diffBackgroundTokenizeChunkRowCount, diffBackgroundTokenizeChunkBudgetMs);
        intervalHandle = setInterval(() => {
          const ranges = document.consumeTokenizedRowRanges();
          if (ranges.length > 0) {
            const pendingRanges = pendingSideBySideTokenRangesRef.current;
            const nextRanges = pendingRanges?.document === document
              ? [...pendingRanges.ranges, ...ranges]
              : ranges;

            pendingSideBySideTokenRangesRef.current = {
              document,
              ranges: nextRanges,
            };

            if (!sideBySideScrollingRef.current) {
              flushSideBySideTokenInvalidation(document, nextRanges);
            }
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
  }, [diffPaneHeight, flushSideBySideTokenInvalidation, sideBySideRowCount, state.status === "loaded" ? state.document : null, viewMode]);

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
      if (activeFileIndex$.get() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, [activeFileIndex$, state]);

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

  const loadSource = useCallback(async (nextSource: DiffOpenSource, syntaxThemeName: DiffSettingsFile["syntaxTheme"]) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const loadStartedAt = nowMs();
    const trace: DiffLoadTrace = {
      document: null,
      folderPath: nextSource.value,
      loadStartedAt,
      nativeResolvedAt: loadStartedAt,
      setStateAt: loadStartedAt,
    };
    loadTraceRef.current = trace;
    setLoadingSource(nextSource);
    logDiffOpenTiming("viewer.load.start", {
      source: nextSource,
      requestId,
      syntaxTheme: syntaxThemeName,
    });

    try {
      const nativeStartedAt = nowMs();
      let result;
      if (nextSource.kind === "github") {
        logDiffOpenTiming("viewer.native.start", {
          diffUrl: nextSource.diffUrl,
          initialRowCount: diffInitialRowCount,
          requestId,
          sourceLabel: nextSource.label,
          sourceKind: nextSource.kind,
        });
        result = await loadUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label, syntaxThemeName, diffInitialRowCount);
        logDiffOpenTiming("viewer.native.finish", {
          fetchMs: Number(result.timing.fetchMs.toFixed(1)),
          files: result.files.length,
          initialRows: result.initialRows.length,
          nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
          nativeTotalMs: Number(result.timing.nativeTotalMs.toFixed(1)),
          requestId,
          rows: result.document.rowCount,
          sourceKind: nextSource.kind,
          styles: result.styles.length,
        });
      } else {
        logDiffOpenTiming("viewer.native.start", {
          folderPath: nextSource.value,
          initialRowCount: diffInitialRowCount,
          requestId,
          sourceKind: nextSource.kind,
        });
        result = await loadGitFolderDiff(nextSource.value, syntaxThemeName, diffInitialRowCount);
        logDiffOpenTiming("viewer.native.finish", {
          files: result.files.length,
          initialRows: result.initialRows.length,
          nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
          nativeTotalMs: Number(result.timing.nativeTotalMs.toFixed(1)),
          requestId,
          rows: result.document.rowCount,
          sourceKind: nextSource.kind,
          styles: result.styles.length,
        });
      }
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
      logDiffLoadTiming(nextSource.value, result.timing);
      const recentDocumentPath = getDiffRecentDocumentPath(nextSource);
      if (recentDocumentPath) {
        const recentStartedAt = nowMs();
        noteRecentDocument(recentDocumentPath);
        logDiffOpenTiming("viewer.recentDocument.noted", {
          durationMs: Number((nowMs() - recentStartedAt).toFixed(1)),
          requestId,
        });
      } else {
        logDiffOpenTiming("viewer.recentDocument.skipped", {
          requestId,
          sourceKind: nextSource.kind,
        });
      }
      if (loadRequestIdRef.current === requestId) {
        const statePayloadStartedAt = nowMs();
        const nextLoadedState: DiffViewerState = {
          status: "loaded",
          error: null,
          folderPath: nextSource.value,
          source: nextSource,
          document: result.document,
          files: result.files,
          initialRows: result.initialRows,
          styles: result.styles,
          syntaxTheme: syntaxThemeName,
          timing: result.timing,
        };
        const statePayloadFinishedAt = nowMs();
        trace.setStateAt = statePayloadFinishedAt;
        setState(nextLoadedState);
        logDiffOpenTiming("viewer.load.setLoaded", {
          requestId,
          statePayloadMs: Number((statePayloadFinishedAt - statePayloadStartedAt).toFixed(1)),
          setStateCallMs: Number((nowMs() - trace.setStateAt).toFixed(1)),
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
        setLoadingSource((current) => sourcesMatch(current, nextSource) ? null : current);
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          folderPath: nextSource.value,
          source: nextSource,
        });
        logDiffOpenTiming("viewer.load.error", {
          error: error instanceof Error ? error.message : String(error),
          requestId,
        });
      }
    }
  }, []);

  useEffect(() => {
    const initialSource = normalizeDiffOpenSource(source ?? folderPath);
    if (initialSource) {
      logDiffOpenTiming("viewer.launchSource.effect", {
        source: initialSource,
        selectedSyntaxTheme,
      });
      loadSource(initialSource, selectedSyntaxTheme);
    }
  }, [folderPath, loadSource, selectedSyntaxTheme, source]);

  useEffect(() => {
    const shouldFocusUrlInput = typeof focusUrlInputRequestId === "number" && !source && !folderPath;
    if (shouldFocusUrlInput) {
      loadRequestIdRef.current += 1;
      loadTraceRef.current = null;
      setLoadingSource(null);
      setState(emptyState);
      setUrlInput("");
      setUrlInputError(null);
      setFileFilter("");
      requestAnimationFrame(() => {
        urlInputRef.current?.focus();
      });
    }
  }, [focusUrlInputRequestId, folderPath, source]);

  const openFolder = useCallback(async () => {
    if (!isLoading) {
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
          const nextSource = normalizeDiffOpenSource(path);
          if (nextSource) {
            await loadSource(nextSource, selectedSyntaxTheme);
          }
        }
      } catch (error) {
        setState((current) => ({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          folderPath: current.folderPath,
          source: current.source,
        }));
      }
    }
  }, [isLoading, loadSource, selectedSyntaxTheme, state.folderPath]);

  const openUrl = useCallback(async () => {
    if (!isLoading) {
      const nextSource = normalizeDiffOpenSource(urlInput);
      if (nextSource?.kind === "github") {
        setUrlInputError(null);
        await loadSource(nextSource, selectedSyntaxTheme);
      } else {
        setUrlInputError("Enter a GitHub PR or commit URL.");
      }
    }
  }, [isLoading, loadSource, selectedSyntaxTheme, urlInput]);

  const handleDragEnter = useCallback(() => {
    setIsDropTargetActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDropTargetActive(false);
  }, []);

  const handleDrop = useCallback(({ nativeEvent }: { nativeEvent: DragDropFileEvent }) => {
    setIsDropTargetActive(false);
    if (!isLoading) {
      const nextSource = getDroppedDiffSource(nativeEvent);
      if (nextSource) {
        loadSource(nextSource, selectedSyntaxTheme).catch((error: unknown) => {
          setState((current) => ({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            folderPath: current.folderPath,
            source: current.source,
          }));
        });
      } else {
        setState((current) => ({
          status: "error",
          error: getUnsupportedDropMessage(nativeEvent),
          folderPath: current.folderPath,
          source: current.source,
        }));
      }
    }
  }, [isLoading, loadSource, selectedSyntaxTheme]);

  useEffect(() => {
    const trace = loadTraceRef.current;
    if (state.status === "loaded" && trace?.document === state.document && loggedTraceDocumentRef.current !== state.document) {
      loggedTraceDocumentRef.current = state.document;
      const effectAt = nowMs();
      measureAfterEffect(({ frameAt, microtaskAt, secondFrameAt, timeoutAt }) => {
        setLoadingSource((current) => sourcesMatch(current, state.source) ? null : current);
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
      loadSource(state.source, selectedSyntaxTheme).catch((error: unknown) => {
        setState((current) => ({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          folderPath: current.folderPath,
          source: current.source,
        }));
      });
    }
  }, [loadSource, selectedSyntaxTheme, state]);

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
        loadSource({ kind: "folder", label: getDiffSourceLabel(visibleSource), value: visibleFolderPath }, selectedSyntaxTheme).catch((error: unknown) => {
          setState((current) => ({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            folderPath: current.folderPath,
            source: current.source,
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
  }, [loadSource, selectedSyntaxTheme, visibleFolderPath, visibleSource]);

  const reloadCurrentSource = useCallback(() => {
    if (state.status !== "loaded") {
      return false;
    }

    loadSource(state.source, selectedSyntaxTheme).catch((error: unknown) => {
      setState((current) => ({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        folderPath: current.folderPath,
        source: current.source,
      }));
    });
    return true;
  }, [loadSource, selectedSyntaxTheme, state]);

  const revealCurrentFolder = useCallback(() => {
    if (!visibleFolderPath) {
      return false;
    }

    revealInFinder(visibleFolderPath)
      .then((didReveal) => {
        if (!didReveal) {
          console.error("Unable to reveal folder in Finder.");
        }
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    return true;
  }, [visibleFolderPath]);

  const copyText = useCallback((text: string) => {
    commandRunner.runCommand({ command: "pbcopy", input: text })
      .then((result) => {
        if (result.exitCode !== 0) {
          console.error(result.stderr || "Unable to copy to clipboard.");
        }
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    return true;
  }, []);

  const copyCurrentSource = useCallback(() => {
    let didCopy = false;
    if (visibleSource) {
      didCopy = copyText(visibleSource.value);
    }
    return didCopy;
  }, [copyText, visibleSource]);

  const copyCurrentFilePath = useCallback(() => {
    let didCopy = false;
    if (state.status === "loaded" && visibleFolderPath) {
      const activeFile = getActiveDiffFile(state.files, activeFileIndex$.get());
      if (activeFile) {
        didCopy = copyText(getJoinedPath(visibleFolderPath, activeFile.path));
      }
    }
    return didCopy;
  }, [activeFileIndex$, copyText, state, visibleFolderPath]);

  const copyCurrentRelativePath = useCallback(() => {
    let didCopy = false;
    if (state.status === "loaded") {
      const activeFile = getActiveDiffFile(state.files, activeFileIndex$.get());
      if (activeFile) {
        didCopy = copyText(activeFile.path);
      }
    }
    return didCopy;
  }, [activeFileIndex$, copyText, state]);

  useEffect(() => {
    if (toolbarSource) {
      setDiffViewerWindowOptions({
        appearance: syntaxTheme.appearance,
        backgroundColor: syntaxTheme.background,
        includeToolbarItems: true,
        source: toolbarSource,
        showSidebarControl,
        showViewModeToolbar,
        sidebarCollapsed,
        viewMode,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  }, [showSidebarControl, showViewModeToolbar, sidebarCollapsed, syntaxTheme.appearance, syntaxTheme.background, toolbarSource, viewMode]);

  useEffect(() => {
    let frameHandle: number | null = null;
    let secondFrameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const scheduleStartedAt = nowMs();
    const shouldWaitForContentLayout = state.status === "loaded" && loadedFileCount > 0;
    const isContentLayoutReady = !shouldWaitForContentLayout || diffPaneHeight > diffTitlebarTopInset;
    const includeToolbarItems = toolbarSource === null;

    logDiffOpenTiming("viewer.windowOptions.schedule", {
      diffPaneHeight,
      includeToolbarItems,
      isContentLayoutReady,
      loadedFileCount,
      showSidebarControl,
      showViewModeToolbar,
      sidebarCollapsed,
      source: toolbarSource ?? state.source,
      status: state.status,
      viewMode,
    });

    if (isContentLayoutReady) {
      const applyWindowOptions = () => {
        const startedAt = nowMs();
        logDiffOpenTiming("viewer.windowOptions.start", {
          diffPaneHeight,
          loadedFileCount,
          scheduledDelayMs: Number((startedAt - scheduleStartedAt).toFixed(1)),
          showSidebarControl,
          showViewModeToolbar,
          sidebarCollapsed,
          source: toolbarSource ?? state.source,
          status: state.status,
          viewMode,
        });
        setDiffViewerWindowOptions({
          appearance: syntaxTheme.appearance,
          backgroundColor: syntaxTheme.background,
          includeToolbarItems,
          source: toolbarSource ?? state.source,
          showSidebarControl,
          showViewModeToolbar,
          sidebarCollapsed,
          viewMode,
        })
          .then(() => {
            logDiffOpenTiming("viewer.windowOptions.finish", {
              source: toolbarSource ?? state.source,
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
            timeoutHandle = setTimeout(applyWindowOptions, diffLoadedWindowOptionsDelayMs);
          });
        });
      } else {
        applyWindowOptions();
      }
    } else {
      logDiffOpenTiming("viewer.windowOptions.deferred", {
        diffPaneHeight,
        loadedFileCount,
        source: toolbarSource ?? state.source,
        status: state.status,
      });
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
  }, [diffPaneHeight, loadedFileCount, showSidebarControl, showViewModeToolbar, sidebarCollapsed, state.source, state.status, syntaxTheme.appearance, syntaxTheme.background, toolbarSource, viewMode]);

  const toggleSidebar = useCallback(() => {
    if (!showSidebarControl) {
      return false;
    }

    setSidebarCollapsed((current) => !current);
    return true;
  }, [showSidebarControl]);

  const focusFileFilter = useCallback(() => {
    if (!showSidebarControl) {
      return false;
    }

    setSidebarCollapsed(false);
    requestAnimationFrame(() => {
      fileFilterInputRef.current?.focus();
    });
    return true;
  }, [showSidebarControl]);

  useEffect(() => registerDiffViewerActionHandlers({
    copyFilePath: copyCurrentFilePath,
    copyRelativePath: copyCurrentRelativePath,
    copySource: copyCurrentSource,
    filterFiles: focusFileFilter,
    reload: reloadCurrentSource,
    revealInFinder: revealCurrentFolder,
    toggleSidebar,
  }), [copyCurrentFilePath, copyCurrentRelativePath, copyCurrentSource, focusFileFilter, reloadCurrentSource, revealCurrentFolder, toggleSidebar]);

  useEffect(() => {
    const hasLoadedFiles = loadedFileCount > 0;
    updateMenuItems(diffMenuOwnerId, [
      {
        enabled: state.status === "loaded",
        id: "reload",
      },
      {
        enabled: visibleFolderPath !== null,
        id: "revealInFinder",
      },
      {
        enabled: visibleSource !== null,
        id: "copySource",
        title: visibleSource?.kind === "github" ? "Copy Source URL" : "Copy Folder Path",
      },
      {
        enabled: visibleFolderPath !== null && hasLoadedFiles,
        id: "copyFilePath",
      },
      {
        enabled: hasLoadedFiles,
        id: "copyRelativePath",
      },
      {
        checked: showSidebarControl && !sidebarCollapsed,
        enabled: showSidebarControl,
        id: "toggleSidebar",
        title: sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar",
      },
      {
        enabled: showSidebarControl,
        id: "filterFiles",
      },
      {
        checked: viewMode === "unified",
        enabled: showViewModeToolbar,
        id: "viewUnified",
      },
      {
        checked: viewMode === "blocks",
        enabled: showViewModeToolbar,
        id: "viewBlocks",
      },
    ]);
  }, [loadedFileCount, showSidebarControl, showViewModeToolbar, sidebarCollapsed, state.status, viewMode, visibleFolderPath, visibleSource]);

  useEffect(() => {
    const subscription = addWindowToolbarItemSelectedListener((event) => {
      if (event.identifier === diffViewerWindowIdentifier) {
        if (event.itemId === diffSidebarToolbarItemId) {
          toggleSidebar();
        } else if (event.itemId === diffViewModeToolbarItemId && isDiffViewMode(event.value)) {
          setDiffViewModeSetting(event.value);
        }
      }
    });
    return () => subscription.remove();
  }, [toggleSidebar]);

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

  const scrollToFile = useCallback((file: DiffFileSummary) => {
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const listIndex = viewMode === "unified"
      ? getVisibleListIndex(rowStart)
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
  }, [getVisibleListIndex, sideBySideListIndexByRowIndex, viewMode]);

  const renderSidebarFile = useCallback(({ item: file }: LegendListRenderItemProps<DiffFileSummary>) => {
    const statusPresentation = getFileStatusPresentation(file);

    return (
      <DiffSidebarFileRow
        activeFileIndex$={activeFileIndex$}
        borderColor={displayTheme.colors.border}
        file={file}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onPress={() => scrollToFile(file)}
        statusPresentation={statusPresentation}
      />
    );
  }, [activeFileIndex$, displayTheme.colors.border, foregroundColor, mutedColor, scrollToFile]);

  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextMetrics = {
      contentHeight: Math.round(event.nativeEvent.contentHeight || event.nativeEvent.height),
      contentWidth: Math.round(event.nativeEvent.contentWidth),
      sidebarHeight: Math.round(event.nativeEvent.sidebarHeight || event.nativeEvent.height),
      sidebarWidth: Math.round(event.nativeEvent.sidebarWidth),
    };
    logDiffOpenTiming("viewer.splitView.resize", {
      contentHeight: nextMetrics.contentHeight,
      contentWidth: nextMetrics.contentWidth,
      previousContentHeight: splitPaneMetricsRef.current.contentHeight,
      previousContentWidth: splitPaneMetricsRef.current.contentWidth,
      previousSidebarHeight: splitPaneMetricsRef.current.sidebarHeight,
      previousSidebarWidth: splitPaneMetricsRef.current.sidebarWidth,
      sidebarHeight: nextMetrics.sidebarHeight,
      sidebarWidth: nextMetrics.sidebarWidth,
    });
    setSplitPaneMetrics(nextMetrics);
  }, []);

  const handleDiffPaneLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    logDiffOpenTiming("viewer.diffPane.layout", {
      height: nextHeight,
      previousHeight: diffPaneHeightRef.current,
      rawHeight: Number(event.nativeEvent.layout.height.toFixed(1)),
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    });
    setDiffPaneHeight(nextHeight);
  }, []);

  const handleSidebarListLayout = useCallback((event: LayoutChangeEvent) => {
    const currentState = stateRef.current;
    logDiffOpenTiming("viewer.sidebarList.layout", {
      fileCount: currentState.status === "loaded" ? currentState.files.length : 0,
      height: Number(event.nativeEvent.layout.height.toFixed(1)),
      status: currentState.status,
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    });
  }, []);

  const getItemType = useCallback((index: number, row: DiffRenderRow | undefined) => (
    row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index) ? "file-header" : "diff-line"
  ), [fileHeaderRowIndexes]);

  const getItemSize = useCallback((index: number, row: DiffRenderRow | undefined) => (
    getItemType(index, row) === "file-header" ? diffFileHeaderRowHeight : rowHeight
  ), [getItemType, rowHeight]);

  const renderRow = useCallback(
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
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
        const statusPresentation = getFileStatusPresentation(file);
        const pathContext = file ? getFilePathContext(file, directory) : directory ? `${directory}/` : "";

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
            <View style={styles.fileDisclosure}>
              <SFSymbol color={mutedColor} name={isCollapsed ? "chevron.right" : "chevron.down"} size={12} />
            </View>
            {file ? (
              <View style={[styles.fileStatusIcon, { backgroundColor: statusPresentation.backgroundColor }]}>
                <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={12} />
              </View>
            ) : null}
            <View style={styles.fileTitleGroup}>
              {pathContext ? (
                <Text selectable style={[styles.filePath, { color: mutedColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                  {pathContext}
                </Text>
              ) : null}
              <Text selectable style={[styles.fileName, { color: foregroundColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                {filename}
              </Text>
            </View>
            {file ? (
              <View style={styles.fileMeta}>
                {!file.isBinary ? (
                  <>
                    <Text selectable={false} style={[styles.fileAdded, { color: "#7ee787", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                      +{file.additions}
                    </Text>
                    <Text selectable={false} style={[styles.fileRemoved, { color: "#ff7b72", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                      -{file.deletions}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      }

      return (
        <View style={[styles.diffRow, { backgroundColor: rowBackgroundColor, borderLeftColor: accentColor, height: rowHeight }]}>
          <LightText selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
            {row && row.oldLineNumber >= 0 ? row.oldLineNumber : ""}
          </LightText>
          <LightText selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
            {row && row.newLineNumber >= 0 ? row.newLineNumber : ""}
          </LightText>
          <LightText selectable={false} style={[styles.marker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
            {isFileHeader ? "" : marker}
          </LightText>
          <TokenizedText
            adaptiveRender={adaptiveRender}
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

  const requestSideBySideRange = useCallback((lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => {
    if (state.status === "loaded" && options?.reason !== "scroll") {
      const start = Math.max(0, Math.floor(lineStart));
      const count = Math.max(0, Math.ceil(lineCount));
      if (count > 0) {
        state.document.getSideBySideRows(start, count, collapsedFileIndexList);
        refreshSideBySideTokenStyles(state.document);
        const end = Math.min(sideBySideRowCount, start + count);
        for (let index = start; index < end; index += 1) {
          bumpSideBySideRowVersion(index);
        }
      }
    }
    // Scroll-driven requests stay side-effect free so scrolling never updates React state.
  }, [bumpSideBySideRowVersion, collapsedFileIndexList, refreshSideBySideTokenStyles, sideBySideRowCount, state]);

  const getSideBySideRow = useCallback((index: number) => (
    state.status === "loaded"
      ? state.document.getPlainSideBySideRow(index, collapsedFileIndexList)
      : undefined
  ), [collapsedFileIndexList, state]);

  useEffect(() => {
    if (state.status === "loaded" && viewMode !== "unified" && diffPaneHeight > 0 && sideBySideRowCount > 0) {
      const initialCount = Math.min(sideBySideRowCount, Math.max(1, Math.ceil(diffPaneHeight / rowHeight)));
      requestSideBySideRange(0, initialCount, { force: true, reason: "initial" });
    } else if (viewMode === "unified") {
      setSideBySideTokenStyleState(null);
    }
  }, [diffPaneHeight, requestSideBySideRange, rowHeight, sideBySideRowCount, state, viewMode]);

  const handleSideBySideTopItemChanged = useCallback((lineIndex: number) => {
    if (state.status === "loaded") {
      const row = state.document.getPlainSideBySideRow(lineIndex, collapsedFileIndexList);
      const nextFileIndex = findFileIndexForRow(state.files, row.sourceStart);
      if (activeFileIndex$.get() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, [activeFileIndex$, collapsedFileIndexList, state]);

  const handleSideBySideVisibleRowsRequested = useCallback((start: number, count: number, reason: VirtualizedDocumentRequestReason) => {
    if (state.status === "loaded") {
      sideBySideVisibleRangeRef.current = {
        count,
        document: state.document,
        start,
      };

      if (reason === "scroll") {
        sideBySideScrollingRef.current = true;
        if (sideBySideScrollIdleTimeoutRef.current) {
          clearTimeout(sideBySideScrollIdleTimeoutRef.current);
        }
        sideBySideScrollIdleTimeoutRef.current = setTimeout(() => {
          sideBySideScrollingRef.current = false;
          sideBySideScrollIdleTimeoutRef.current = null;
          if (pendingSideBySideTokenRangesRef.current?.document === state.document) {
            flushSideBySideTokenInvalidation(state.document, pendingSideBySideTokenRangesRef.current.ranges);
          }
        }, diffScrollIdleMs);
      } else if (pendingSideBySideTokenRangesRef.current?.document === state.document) {
        flushSideBySideTokenInvalidation(state.document, pendingSideBySideTokenRangesRef.current.ranges);
      }
    }
  }, [flushSideBySideTokenInvalidation, state]);

  const getSideBySideItemType = useCallback((index: number, row: DiffSideBySideRenderRow | undefined) => {
    const kind = row?.kind ?? (sideBySideFileHeaderIndexes.has(index) ? "file-header" : "line");
    return kind === "file-header" ? "file-header" : "side-by-side-line";
  }, [sideBySideFileHeaderIndexes]);

  const getSideBySideItemSize = useCallback((index: number, row: DiffSideBySideRenderRow | undefined) => {
    if (row) {
      return row.kind === "file-header"
        ? diffFileHeaderRowHeight
        : rowHeight;
    }

    return sideBySideFileHeaderIndexes.has(index) ? diffFileHeaderRowHeight : rowHeight;
  }, [rowHeight, sideBySideFileHeaderIndexes]);

  const renderSideBySideRow = useCallback(
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => {
      if (!row) {
        return <View style={{ height: rowHeight }} />;
      }

      if (row.kind === "file-header") {
        const file = fileByRowStart.get(row.sourceStart) ?? fileByIndex.get(row.fileIndex);
        const path = file?.path ?? "";
        const filename = getFilename(path);
        const directory = getDirectoryPath(path);
        const fileIndex = file?.index ?? index;
        const isCollapsed = collapsedFileIndexes.has(fileIndex);
        const statusPresentation = getFileStatusPresentation(file);
        const pathContext = file ? getFilePathContext(file, directory) : directory ? `${directory}/` : "";
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
            <View style={styles.fileDisclosure}>
              <SFSymbol color={mutedColor} name={isCollapsed ? "chevron.right" : "chevron.down"} size={12} />
            </View>
            {file ? (
              <View style={[styles.fileStatusIcon, { backgroundColor: statusPresentation.backgroundColor }]}>
                <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={12} />
              </View>
            ) : null}
            <View style={styles.fileTitleGroup}>
              {pathContext ? (
                <Text selectable style={[styles.filePath, { color: mutedColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                  {pathContext}
                </Text>
              ) : null}
              <Text selectable style={[styles.fileName, { color: foregroundColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
                {filename}
              </Text>
            </View>
            {file ? (
              <View style={styles.fileMeta}>
                {!file.isBinary ? (
                  <>
                    <Text selectable={false} style={[styles.fileAdded, { color: "#7ee787", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                      +{file.additions}
                    </Text>
                    <Text selectable={false} style={[styles.fileRemoved, { color: "#ff7b72", fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                      -{file.deletions}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        );
      }

      const sideBySideTokenStyleById = state.status === "loaded" && sideBySideTokenStyleState?.document === state.document
        ? sideBySideTokenStyleState.tokenStyleById
        : tokenStyleById;

      return (
        <View style={[styles.sideBySideRow, { height: rowHeight }]}>
          <View style={styles.sidePane}>
            <DiffSideBySideLine
              adaptiveRender={adaptiveRender}
              fontFamily={fontFamily}
              fontSize={fontSize}
              foregroundColor={foregroundColor}
              mutedColor={mutedColor}
              row={row.oldRow}
              rowHeight={rowHeight}
              rowVisible={row.oldRowVisible}
              side="old"
              tokenStyleById={sideBySideTokenStyleById}
            />
          </View>
          <View style={[styles.sideConnectorColumn, { width: diffSideBySideGutterWidth }]}>
          </View>
          <View style={styles.sidePane}>
            <DiffSideBySideLine
              adaptiveRender={adaptiveRender}
              fontFamily={fontFamily}
              fontSize={fontSize}
              foregroundColor={foregroundColor}
              mutedColor={mutedColor}
              row={row.newRowEqualsOldRow ? row.oldRow : row.newRow}
              rowHeight={rowHeight}
              rowVisible={row.newRowVisible}
              side="new"
              tokenStyleById={sideBySideTokenStyleById}
            />
          </View>
        </View>
      );
    },
    [collapsedFileIndexes, displayTheme.colors.border, fileByIndex, fileByRowStart, fontFamily, fontSize, foregroundColor, mutedColor, rowHeight, sideBySideTokenStyleState, state, toggleFileCollapsed, tokenStyleById],
  );

  const body = useMemo(() => {
    const bodyStartedAt = nowMs();
    const diffListHeight = Math.max(0, diffPaneHeight - diffTitlebarTopInset);
    const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
    const sidebarListHeight = isSidebarLayoutReady ? Math.max(0, splitPaneMetrics.sidebarHeight - diffTitlebarTopInset - 70) : 0;
    const activeItemIndexes = viewMode === "unified" ? visibleItemIndexes : sideBySideItemIndexes;
    const logBodyFinish = (path: string, extra?: Record<string, unknown>) => {
      if (state.status === "loaded") {
        logDiffOpenTiming("viewer.body.finish", {
          activeItemCount: activeItemIndexes.length,
          diffListHeight,
          diffPaneHeight,
          durationMs: Number((nowMs() - bodyStartedAt).toFixed(1)),
          isRenderingInitialLoadedFrame,
          path,
          rows: state.document.rowCount,
          sidebarLayoutReady: isSidebarLayoutReady,
          sidebarHeight: splitPaneMetrics.sidebarHeight,
          sidebarListHeight,
          sidebarWidth: splitPaneMetrics.sidebarWidth,
          viewMode,
          ...extra,
        });
      }
    };

    if (state.status === "loaded") {
      logDiffOpenTiming("viewer.body.start", {
        activeItemCount: activeItemIndexes.length,
        diffListHeight,
        diffPaneHeight,
        isRenderingInitialLoadedFrame,
        loadingSource,
        rows: state.document.rowCount,
        sidebarLayoutReady: isSidebarLayoutReady,
        sidebarHeight: splitPaneMetrics.sidebarHeight,
        sidebarListHeight,
        sidebarWidth: splitPaneMetrics.sidebarWidth,
        source: state.source,
        viewMode,
      });
    }

    const diffContent = (() => {
      if (state.status === "loaded" && activeItemIndexes.length > 0) {
        if (diffListHeight <= 0) {
          logDiffOpenTiming("viewer.body.diffList.deferred", {
            activeItemCount: activeItemIndexes.length,
            diffPaneHeight,
            isRenderingInitialLoadedFrame,
            rows: state.document.rowCount,
            viewMode,
          });
          return <View style={styles.diffPaneContent} />;
        }

        logDiffOpenTiming("viewer.body.diffList.mount", {
          activeItemCount: activeItemIndexes.length,
          diffListHeight,
          rows: state.document.rowCount,
          viewMode,
        });
        const list = viewMode === "unified" ? (
          <VirtualizedFixedDocumentList
            debugName="diff"
            key="unified"
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
            rowVersions$={diffRows.rowVersions$}
            rowHeight={rowHeight}
            rowsVersion={diffRows.rowsVersion}
            renderRow={renderRow}
            style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
          />
        ) : (
          <VirtualizedFixedDocumentList
            adaptiveRender={diffSideBySideAdaptiveRender}
            debugName={`diff-${viewMode}`}
            key={viewMode}
            extraData={listExtraData}
            itemIndexes={sideBySideItemIndexes}
            getItemSize={getSideBySideItemSize}
            getItemType={getSideBySideItemType}
            getRow={getSideBySideRow}
            lineOverscan={Math.max(12, Math.floor(diffLineOverscan / 10))}
            listRef={listRef}
            onTopItemChanged={handleSideBySideTopItemChanged}
            onVisibleRowsRequested={handleSideBySideVisibleRowsRequested}
            overscanRequestDelayMs={diffOverscanRequestDelayMs}
            requestRange={requestSideBySideRange}
            rowVersions$={sideBySideRowVersions$}
            rowHeight={rowHeight}
            rowsVersion={0}
            renderRow={renderSideBySideRow}
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
              {visibleSourceLabel}
            </Text>
          </View>
        );
      }

      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            Open a diff
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]}>
            Choose a local Git folder or paste a GitHub PR or commit URL.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={isLoading}
            onPress={openFolder}
            style={({ pressed }) => [
              styles.emptyButton,
              styles.emptyFolderButton,
              {
                borderColor: displayTheme.colors.border,
                opacity: isLoading ? 0.45 : pressed ? 0.72 : 1,
              },
            ]}
          >
            <SFSymbol color={foregroundColor} name="folder" size={24} />
            <Text style={[styles.emptyButtonText, { color: foregroundColor }]}>
              Open Folder...
            </Text>
          </Pressable>
          <View style={styles.emptyDivider}>
            <View style={[styles.emptyDividerLine, { backgroundColor: displayTheme.colors.border }]} />
            <Text style={[styles.emptyDividerText, { color: mutedColor }]}>or</Text>
            <View style={[styles.emptyDividerLine, { backgroundColor: displayTheme.colors.border }]} />
          </View>
          <View style={styles.emptyUrlForm}>
            <View
              style={[
                styles.emptyUrlInputWrap,
                {
                  borderColor: displayTheme.colors.border,
                },
              ]}
            >
              <SFSymbol color={mutedColor} name="link" size={19} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) => {
                  setUrlInput(text);
                  if (urlInputError) {
                    setUrlInputError(null);
                  }
                }}
                onSubmitEditing={openUrl}
                placeholder="https://github.com/org/repo/pull/123"
                placeholderTextColor={mutedColor}
                ref={urlInputRef}
                returnKeyType="go"
                style={[
                  styles.emptyUrlInput,
                  {
                    color: foregroundColor,
                  },
                ]}
                value={urlInput}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={isLoading || !urlInput.trim()}
              onPress={openUrl}
              style={({ pressed }) => [
                styles.emptyButton,
                styles.emptyUrlButton,
                {
                  backgroundColor: displayTheme.colors.primary,
                  borderColor: displayTheme.colors.primary,
                  opacity: isLoading || !urlInput.trim() ? 0.45 : pressed ? 0.72 : 1,
                },
              ]}
            >
              <View style={styles.emptyButtonContent}>
                {isLoadingGithub ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : null}
                <Text style={[styles.emptyButtonText, { color: "#ffffff" }]}>
                  {isLoadingGithub ? "Downloading..." : "Open URL"}
                </Text>
              </View>
            </Pressable>
          </View>
          {urlInputError ? (
            <Text style={[styles.emptyValidationText, { color: displayTheme.colors.danger }]}>
              {urlInputError}
            </Text>
          ) : null}
        </View>
      );
    })();

      if (state.status === "loaded" && activeItemIndexes.length > 0 && !isRenderingInitialLoadedFrame) {
        logDiffOpenTiming("viewer.body.splitView.mount", {
          activeItemCount: activeItemIndexes.length,
          diffPaneHeight,
          rows: state.document.rowCount,
          sidebarLayoutReady: isSidebarLayoutReady,
          sidebarCollapsed,
          sidebarHeight: splitPaneMetrics.sidebarHeight,
          sidebarListHeight,
          sidebarWidth: splitPaneMetrics.sidebarWidth,
          viewMode,
        });
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
          <TextInputSearch
            defaultValue={fileFilter}
            onChangeText={setFileFilter}
            placeholder="Filter files"
            ref={fileFilterInputRef}
            style={styles.sidebarFilter}
          />
          {isSidebarLayoutReady ? (
            filteredSidebarFiles.length > 0 ? (
              <LegendList
                data={filteredSidebarFiles}
                getFixedItemSize={() => diffSidebarFileRowHeight}
                keyExtractor={(file) => `${file.index}:${file.path}`}
                onLayout={handleSidebarListLayout}
                recycleItems
                renderItem={renderSidebarFile}
                style={[styles.sidebarList, { height: sidebarListHeight, minHeight: sidebarListHeight }]}
              />
            ) : (
              <View style={[styles.sidebarEmpty, { height: sidebarListHeight, minHeight: sidebarListHeight }]}>
                <Text style={[styles.sidebarEmptyText, { color: mutedColor }]}>
                  No files
                </Text>
              </View>
            )
          ) : (
            <View style={styles.sidebarList} />
          )}
        </View>
      );

      logBodyFinish("split-view");
      return (
        <SidebarSplitView
          appearance={syntaxTheme.appearance}
          contentMinWidth={420}
          onSplitViewDidResize={handleSplitViewResize}
          sidebarCollapsed={sidebarCollapsed}
          sidebarMinWidth={180}
          style={styles.content}
        >
          {sidebar}
          <View onLayout={handleDiffPaneLayout} style={styles.diffPane}>
            {diffContent}
          </View>
        </SidebarSplitView>
      );
    }

    logBodyFinish("content-only");
    return diffContent;
  }, [activeFileIndex$, diffPaneHeight, diffRows.requestRange, diffRows.rowCache, diffRows.rowVersions$, diffRows.rowsVersion, displayTheme.colors.border, displayTheme.colors.danger, displayTheme.colors.primary, fileFilter, filteredSidebarFiles, foregroundColor, getItemSize, getItemType, getSideBySideItemSize, getSideBySideItemType, getSideBySideRow, handleDiffPaneLayout, handleSidebarListLayout, handleSideBySideTopItemChanged, handleSideBySideVisibleRowsRequested, handleSplitViewResize, handleTopItemChanged, handleVisibleRowsRequested, isLoading, isLoadingGithub, isRenderingInitialLoadedFrame, listExtraData, loadingSource, mutedColor, openFolder, openUrl, renderRow, renderSidebarFile, renderSideBySideRow, requestSideBySideRange, rowHeight, scrollToFile, sidebarCollapsed, sideBySideItemIndexes, sideBySideRowVersions$, splitPaneMetrics.sidebarHeight, splitPaneMetrics.sidebarWidth, state, syntaxTheme.appearance, urlInput, urlInputError, viewMode, visibleFolderPath, visibleItemIndexes, visibleSourceLabel]);

  return (
    <DragDropView
      allowedFileTypes={diffDropAllowedFileTypes}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={[styles.root, { backgroundColor }]}
    >
      {state.error ? (
        <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{state.error}</Text>
      ) : null}
      {body}
      {isDropTargetActive ? (
        <View
          pointerEvents="none"
          style={[
            styles.dropOverlay,
            {
              backgroundColor: syntaxTheme.appearance === "dark" ? "rgba(88, 166, 255, 0.14)" : "rgba(9, 105, 218, 0.12)",
              borderColor: displayTheme.colors.primary,
            },
          ]}
        >
          <Text style={[styles.dropOverlayTitle, { color: foregroundColor }]}>
            Open Diff
          </Text>
          <Text style={[styles.dropOverlayText, { color: mutedColor }]}>
            Drop a Git folder or GitHub PR or commit URL
          </Text>
        </View>
      ) : null}
    </DragDropView>
  );
}

export default DiffViewerWindow;

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 36,
  },
  emptyButton: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  emptyDivider: {
    alignItems: "center",
    flexDirection: "row",
    gap: 18,
    maxWidth: 620,
    paddingVertical: 6,
    width: "100%",
  },
  emptyDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  emptyDividerText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  emptyFolderButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 46,
    minWidth: 220,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 520,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 44,
  },
  emptyUrlForm: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    maxWidth: 620,
    width: "100%",
  },
  emptyUrlInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
    lineHeight: 22,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  emptyUrlInputWrap: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    height: 46,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  emptyUrlButton: {
    minHeight: 46,
    minWidth: 122,
  },
  emptyValidationText: {
    fontSize: 12,
    lineHeight: 16,
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
  dropOverlay: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 2,
    bottom: 16,
    justifyContent: "center",
    left: 16,
    position: "absolute",
    right: 16,
    top: 16,
  },
  dropOverlayText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  dropOverlayTitle: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
    marginBottom: 4,
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
    alignItems: "center",
    justifyContent: "center",
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
  sideBySideRow: {
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
    height: diffSidebarFileRowHeight,
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
  sidebarFilter: {
    marginBottom: 8,
    marginHorizontal: 10,
    minHeight: 28,
  },
  sidebarEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarEmptyText: {
    fontSize: 12,
    lineHeight: 16,
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
  sidebarTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textTransform: "uppercase",
  },
});

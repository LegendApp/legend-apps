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
  type VirtualizedDocumentSnapshot,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename, openDiffFolderDialog } from "./diffFiles";
import { useDiffSyntaxTheme, useDiffSyntaxThemeSetting, type DiffSettingsFile } from "./diffSettings";
import { setDiffViewerWindowOptions } from "./diffWindows";

const diffInitialRowCount = 160;
const diffLineOverscan = 240;
const diffOverscanRequestDelayMs = 80;
const diffRowKindFileHeader = 0;
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;

type DiffViewerWindowProps = {
  folderPath?: string;
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

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

function logDiffLoadTiming(folderPath: string, timing: DiffLoadTiming) {
  console.info(
    [
      `[DiffViewer] loaded ${folderPath}`,
      `nativeTotal=${formatMs(timing.nativeTotalMs)}`,
      `openRepo=${formatMs(timing.openRepoMs)}`,
      `createDiff=${formatMs(timing.createDiffMs)}`,
      `walkDiff=${formatMs(timing.walkDiffMs)}`,
      `document=${formatMs(timing.documentMs)}`,
      `copyFiles=${formatMs(timing.copyFilesMs)}`,
      `copyInitialRows=${formatMs(timing.copyInitialRowsMs)}`,
      `files=${timing.fileCount}`,
      `rows=${timing.rowCount}`,
    ].join(" "),
  );
}

function getDirectoryPath(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(0, separatorIndex) : "";
}

function formatStatus(status: string) {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "modified":
      return "Modified";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    case "untracked":
      return "Untracked";
    default:
      return status.length > 0 ? status[0].toUpperCase() + status.slice(1) : "Changed";
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
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();
  const syntaxTheme = useDiffSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const [state, setState] = useState<DiffViewerState>(emptyState);
  const [collapsedFileIndexes, setCollapsedFileIndexes] = useState<Set<number>>(() => new Set());
  const loadRequestIdRef = useRef(0);
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
  const getRows = useCallback((document: DiffDocument, start: number, count: number) => document.getRows(start, count), []);
  const getStyles = useCallback((document: DiffDocument) => document.getStyles(), []);
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
  const visibleItemIndexes = useMemo(
    () => state.status === "loaded"
      ? createVisibleDiffRowIndexes(state.files, collapsedFileIndexes, diffRows.itemIndexes)
      : diffRows.itemIndexes,
    [collapsedFileIndexes, diffRows.itemIndexes, state],
  );
  const subtitle = state.status === "loaded" && diffRows.timing
    ? formatDiffSummary(diffRows.timing)
    : visibleFolderPath ?? "Open a Git folder to view its changes";

  useEffect(() => {
    if (state.status === "loaded") {
      setCollapsedFileIndexes(new Set());
    }
  }, [state.status === "loaded" ? state.document : null]);

  const loadFolder = useCallback(async (path: string, syntaxThemeName: DiffSettingsFile["syntaxTheme"]) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    try {
      const result = await loadGitFolderDiff(path, syntaxThemeName, diffInitialRowCount);
      logDiffLoadTiming(path, result.timing);
      if (loadRequestIdRef.current === requestId) {
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
      }
    } catch (error) {
      if (loadRequestIdRef.current === requestId) {
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          folderPath: path,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (folderPath) {
      loadFolder(folderPath, selectedSyntaxTheme);
    }
  }, [folderPath, loadFolder]);

  const openFolder = useCallback(async () => {
    try {
      const path = await openDiffFolderDialog();
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
    setDiffViewerWindowOptions({
      appearance: syntaxTheme.appearance,
      backgroundColor: syntaxTheme.background,
      folderPath: state.folderPath,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
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

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleFileCollapsed(fileIndex)}
            style={({ pressed }) => [
              styles.fileRow,
              {
                borderBottomColor: borderColor,
                borderTopColor: borderColor,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <Text selectable={false} style={[styles.fileDisclosure, { color: mutedColor }]}>
              {isCollapsed ? ">" : "v"}
            </Text>
            <View style={styles.fileTitleGroup}>
              <Text selectable style={[styles.fileName, { color: foregroundColor }]} numberOfLines={1}>
                {filename}
              </Text>
              {directory ? (
                <Text selectable style={[styles.filePath, { color: mutedColor }]} numberOfLines={1}>
                  {directory}
                </Text>
              ) : null}
            </View>
            {file ? (
              <View style={styles.fileMeta}>
                <Text selectable={false} style={[styles.fileStatus, { borderColor, color: foregroundColor }]}>
                  {formatStatus(file.status)}
                </Text>
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
          initialRequestRowCount={diffInitialRowCount}
          itemIndexes={visibleItemIndexes}
          lineOverscan={diffLineOverscan}
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
  }, [diffRows.requestRange, diffRows.rowCache, diffRows.rowsVersion, foregroundColor, mutedColor, renderRow, state.status, visibleFolderPath, visibleItemIndexes]);

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
    lineHeight: sourceViewerRowHeight,
  },
  fileDisclosure: {
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: 20,
  },
  fileMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: sourceViewerRowHeight,
  },
  filePath: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
  },
  fileRemoved: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
  },
  fileRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    height: sourceViewerRowHeight,
    paddingHorizontal: 12,
  },
  fileStatus: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    paddingHorizontal: 6,
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

import {
  loadGitFolderDiff,
  type DiffDocument,
  type DiffLoadTiming,
  type DiffRenderRow,
} from "@legend-desktop/diff-parser";
import {
  sourceViewerCodeFontFamily,
  sourceViewerLineNumberWidth,
  sourceViewerRowHeight,
} from "@legend-desktop/source-viewer";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import {
  useVirtualizedDocumentRows,
  VirtualizedFixedDocumentList,
  type VirtualizedDocumentSnapshot,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename, openDiffFolderDialog } from "./diffFiles";
import { setDiffViewerWindowOptions } from "./diffWindows";

const diffInitialRowCount = 160;
const diffLineOverscan = 240;
const diffOverscanRequestDelayMs = 80;
const diffRowKindFileHeader = 0;
const diffRowKindHunkHeader = 1;
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
    status: "loading";
    error: null;
    folderPath: string;
  }
  | {
    status: "loaded";
    error: null;
    folderPath: string;
    document: DiffDocument;
    initialRows: DiffRenderRow[];
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
    `${timing.diffMs.toFixed(1)} ms`,
  ].join(" · ");
}

export function DiffViewerWindow({ folderPath }: DiffViewerWindowProps) {
  const displayTheme = getLegendDisplayTheme("dark");
  const [state, setState] = useState<DiffViewerState>(emptyState);
  const visibleFolderPath = state.folderPath;
  const title = visibleFolderPath ? getFilename(visibleFolderPath) : "No folder";
  const backgroundColor = displayTheme.colors.background;
  const borderColor = displayTheme.colors.border;
  const foregroundColor = displayTheme.colors.foreground;
  const mutedColor = displayTheme.colors.muted;
  const snapshot = useMemo<VirtualizedDocumentSnapshot<DiffDocument, DiffRenderRow, never, DiffLoadTiming> | null>(
    () => state.status === "loaded"
      ? {
          document: state.document,
          initialRows: state.initialRows,
          itemCount: state.document.rowCount,
          styles: [],
          timing: state.timing,
        }
      : null,
    [state],
  );
  const getRowIndex = useCallback((row: DiffRenderRow) => row.index, []);
  const getRows = useCallback((document: DiffDocument, start: number, count: number) => document.getRows(start, count), []);
  const getTiming = useCallback((document: DiffDocument) => document.getTiming(), []);
  const diffRows = useVirtualizedDocumentRows({
    debugName: "diff",
    getRowIndex,
    getRows,
    getTiming,
    snapshot,
  });
  const subtitle = state.status === "loaded" && diffRows.timing
    ? formatDiffSummary(diffRows.timing)
    : visibleFolderPath ?? "Open a Git folder to view its changes";

  const loadFolder = useCallback(async (path: string) => {
    setState({
      status: "loading",
      error: null,
      folderPath: path,
    });

    try {
      const result = await loadGitFolderDiff(path, diffInitialRowCount);
      setState({
        status: "loaded",
        error: null,
        folderPath: path,
        document: result.document,
        initialRows: result.initialRows,
        timing: result.timing,
      });
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        folderPath: path,
      });
    }
  }, []);

  useEffect(() => {
    if (folderPath) {
      loadFolder(folderPath);
    }
  }, [folderPath, loadFolder]);

  const openFolder = useCallback(async () => {
    try {
      const path = await openDiffFolderDialog();
      if (path) {
        await loadFolder(path);
      }
    } catch (error) {
      setState((current) => ({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        folderPath: current.folderPath,
      }));
    }
  }, [loadFolder]);

  useEffect(() => {
    setDiffViewerWindowOptions({
      backgroundColor: displayTheme.colors.windowBackground,
      folderPath: state.folderPath,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, [displayTheme.colors.windowBackground, state.folderPath]);

  const renderRow = useCallback(
    ({ index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
      const changeType = row?.changeType ?? 0;
      const isAdd = changeType === diffChangeTypeAdd;
      const isRemove = changeType === diffChangeTypeRemove;
      const isFileHeader = row?.kind === diffRowKindFileHeader;
      const isHunkHeader = row?.kind === diffRowKindHunkHeader;
      const rowBackgroundColor = isAdd
        ? "#17351f"
        : isRemove
          ? "#3a1d24"
          : isHunkHeader
            ? "#242a34"
            : "transparent";
      const textColor = isFileHeader
        ? foregroundColor
        : isHunkHeader
          ? "#8cb4ff"
          : foregroundColor;
      const marker = isAdd ? "+" : isRemove ? "-" : " ";

      return (
        <View style={[styles.diffRow, { backgroundColor: rowBackgroundColor }]}>
          <Text selectable={false} style={[styles.lineNumber, { color: mutedColor }]}>
            {row && row.oldLineNumber >= 0 ? row.oldLineNumber : ""}
          </Text>
          <Text selectable={false} style={[styles.lineNumber, { color: mutedColor }]}>
            {row && row.newLineNumber >= 0 ? row.newLineNumber : ""}
          </Text>
          <Text selectable={false} style={[styles.marker, { color: isAdd ? "#7ee787" : isRemove ? "#ff7b72" : mutedColor }]}>
            {isFileHeader || isHunkHeader ? "" : marker}
          </Text>
          <Text selectable style={[styles.diffText, { color: textColor }]} numberOfLines={1}>
            {row?.text ?? ""}
          </Text>
        </View>
      );
    },
    [foregroundColor, mutedColor],
  );

  const body = useMemo(() => {
    if (state.status === "loaded" && diffRows.itemIndexes.length > 0) {
      return (
        <VirtualizedFixedDocumentList
          debugName="diff"
          initialRequestRowCount={diffInitialRowCount}
          itemIndexes={diffRows.itemIndexes}
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
            {visibleFolderPath ?? "The selected folder has no unstaged changes."}
          </Text>
        </View>
      );
    }

    if (state.status === "loading") {
      return (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            Loading changes
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
            {visibleFolderPath}
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
  }, [diffRows.itemIndexes, diffRows.requestRange, diffRows.rowCache, diffRows.rowsVersion, foregroundColor, mutedColor, renderRow, state.status, visibleFolderPath]);

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
    flexDirection: "row",
    height: sourceViewerRowHeight,
    paddingHorizontal: 12,
  },
  diffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
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
    paddingRight: 12,
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
    width: 24,
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

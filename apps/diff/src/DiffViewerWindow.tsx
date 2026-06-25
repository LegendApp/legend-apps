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
  type VirtualizedDocumentRowsState,
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
import { useObservable, useObserveEffect, useValue } from "@legendapp/state/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject, type SetStateAction } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type NativeSyntheticEvent } from "react-native";
import { addWindowToolbarItemSelectedListener } from "@legend-desktop/window-manager";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "./appConstants";
import { getDiffRecentDocumentPath, getDiffSourceLabel, getFilename, normalizeDiffOpenSource, openDiffFolderDialog, type DiffOpenSource } from "./diffFiles";
import {
  isDiffViewMode,
  getDiffSyntaxTheme,
  getDiffSyntaxThemeSetting,
  getDiffViewModeSetting,
  setDiffViewModeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffSyntaxTheme,
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
const diffSidebarTopInset = 40;
const diffDocumentErrorHeight = 78;
const diffDocumentPermissionErrorHeight = 134;
const diffLoadedWindowOptionsDelayMs = 750;
const diffScrollIdleMs = 120;
const diffRowKindFileHeader = 0;
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;
const diffSideBySideGutterWidth = 44;
const diffSideBySideHorizontalPadding = 12;
const diffSidebarFileRowHeight = 46;
const macOSFilesAndFoldersSettingsUrl = "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders";
const diffAdaptiveRender = {
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

type DiffSplitPaneMetrics = {
  contentHeight: number;
  contentWidth: number;
  sidebarHeight: number;
  sidebarWidth: number;
};

type DiffVisibleSourceModel = {
  loadedFileCount: number;
  showSidebarControl: boolean;
  showViewModeToolbar: boolean;
  toolbarSource: DiffOpenSource | null;
  visibleFolderPath: string | null;
  visibleSource: DiffOpenSource | null;
  visibleSourceLabel: string;
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

type DiffFileHeaderRowProps = {
  borderColor: string;
  fallbackFileIndex: number;
  fallbackPath: string;
  file: DiffFileSummary | undefined;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  isCollapsed: boolean;
  mutedColor: string;
  onToggleFileCollapsed: (fileIndex: number) => void;
};

type DiffUnifiedRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  index: number;
  renderFields: DiffRenderFields;
  row: DiffRenderRow | undefined;
};

type DiffSideBySideRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  index: number;
  renderFields: DiffRenderFields;
  row: DiffSideBySideRenderRow | undefined;
};

type DiffRenderFields = {
  borderColor$: Observable<string>;
  fileByIndexRef: { current: ReadonlyMap<number, DiffFileSummary> };
  fileByRowStartRef: { current: ReadonlyMap<number, DiffFileSummary> };
  fileHeaderRowIndexesRef: { current: ReadonlySet<number> };
  fontFamily$: Observable<string>;
  fontSize$: Observable<number>;
  foregroundColor$: Observable<string>;
  mutedColor$: Observable<string>;
  rowHeight$: Observable<number>;
  sideBySideTokenStyleByIdRef: { current: SyntaxStyleMap };
  tokenStyleByIdRef: { current: SyntaxStyleMap };
  toggleFileCollapsed: (fileIndex: number) => void;
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
    && (!nextProps.rowVisible || previousProps.row === nextProps.row);
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

const DiffFileHeaderRow = memo(function DiffFileHeaderRow({
  borderColor,
  fallbackFileIndex,
  fallbackPath,
  file,
  fontFamily,
  fontSize,
  foregroundColor,
  isCollapsed,
  mutedColor,
  onToggleFileCollapsed,
}: DiffFileHeaderRowProps) {
  const path = file?.path ?? fallbackPath;
  const filename = getFilename(path);
  const directory = getDirectoryPath(path);
  const fileIndex = file?.index ?? fallbackFileIndex;
  const statusPresentation = getFileStatusPresentation(file);
  const pathContext = file ? getFilePathContext(file, directory) : directory ? `${directory}/` : "";
  const fileHeaderLineHeight = Math.max(18, fontSize + 8);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onToggleFileCollapsed(fileIndex)}
      style={({ pressed }) => [
        styles.fileRow,
        {
          backgroundColor: "#252526",
          borderColor,
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
});

const DiffUnifiedRow = memo(function DiffUnifiedRow({
  adaptiveRender,
  collapsedFileIndexes$,
  index,
  renderFields,
  row,
}: DiffUnifiedRowProps) {
  const borderColor = useValue(renderFields.borderColor$);
  const fileByIndex = renderFields.fileByIndexRef.current;
  const fileByRowStart = renderFields.fileByRowStartRef.current;
  const fileHeaderRowIndexes = renderFields.fileHeaderRowIndexesRef.current;
  const fontFamily = useValue(renderFields.fontFamily$);
  const fontSize = useValue(renderFields.fontSize$);
  const foregroundColor = useValue(renderFields.foregroundColor$);
  const mutedColor = useValue(renderFields.mutedColor$);
  const rowHeight = useValue(renderFields.rowHeight$);
  const tokenStyleById = renderFields.tokenStyleByIdRef.current;
  const toggleFileCollapsed = renderFields.toggleFileCollapsed;
  const collapsedFileIndexes = useValue(collapsedFileIndexes$);
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
    const fileIndex = file?.index ?? row?.fileIndex ?? index;
    return (
      <DiffFileHeaderRow
        borderColor={borderColor}
        fallbackFileIndex={fileIndex}
        fallbackPath={row?.text ?? ""}
        file={file}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        isCollapsed={collapsedFileIndexes.has(fileIndex)}
        mutedColor={mutedColor}
        onToggleFileCollapsed={toggleFileCollapsed}
      />
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
});

const DiffSideBySideRow = memo(function DiffSideBySideRow({
  adaptiveRender,
  collapsedFileIndexes$,
  index,
  renderFields,
  row,
}: DiffSideBySideRowProps) {
  const borderColor = useValue(renderFields.borderColor$);
  const fileByIndex = renderFields.fileByIndexRef.current;
  const fileByRowStart = renderFields.fileByRowStartRef.current;
  const fontFamily = useValue(renderFields.fontFamily$);
  const fontSize = useValue(renderFields.fontSize$);
  const foregroundColor = useValue(renderFields.foregroundColor$);
  const mutedColor = useValue(renderFields.mutedColor$);
  const rowHeight = useValue(renderFields.rowHeight$);
  const sideBySideTokenStyleById = renderFields.sideBySideTokenStyleByIdRef.current;
  const toggleFileCollapsed = renderFields.toggleFileCollapsed;
  const collapsedFileIndexes = useValue(collapsedFileIndexes$);

  if (!row) {
    return <View style={{ height: rowHeight }} />;
  }

  if (row.kind === "file-header") {
    const file = fileByRowStart.get(row.sourceStart) ?? fileByIndex.get(row.fileIndex);
    const fileIndex = file?.index ?? index;
    return (
      <DiffFileHeaderRow
        borderColor={borderColor}
        fallbackFileIndex={fileIndex}
        fallbackPath={file?.path ?? ""}
        file={file}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        isCollapsed={collapsedFileIndexes.has(fileIndex)}
        mutedColor={mutedColor}
        onToggleFileCollapsed={toggleFileCollapsed}
      />
    );
  }

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
});

type DiffViewerState =
  | {
    status: "empty";
    folderPath: null;
    source: null;
  }
  | {
    status: "loaded";
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
    status: "fatal";
    error: DiffFatalError;
    folderPath: string | null;
    source: DiffOpenSource | null;
  };
type DiffLoadedState = Extract<DiffViewerState, { status: "loaded" }>;

type DiffFatalError = {
  message: string;
  title: string;
};

type DiffLoadedBodyProps = {
  activeItemIndexes: readonly (number | undefined)[];
  diffContentHeight: number;
  diffListHeight: number;
  diffPaneHeight: number;
  diffRows: VirtualizedDocumentRowsState<DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming>;
  documentErrorBody: ReactNode;
  fileFilterInputRef: RefObject<TextInputSearchRef | null>;
  getItemSize: (index: number, row: DiffRenderRow | undefined) => number;
  getItemType: (index: number, row: DiffRenderRow | undefined) => string;
  getSideBySideItemSize: (index: number, row: DiffSideBySideRenderRow | undefined) => number;
  getSideBySideItemType: (index: number, row: DiffSideBySideRenderRow | undefined) => string;
  getSideBySideRow: (index: number) => DiffSideBySideRenderRow | undefined;
  handleDiffPaneLayout: (event: LayoutChangeEvent) => void;
  handleSidebarListLayout: (event: LayoutChangeEvent) => void;
  handleSideBySideTopItemChanged: (lineIndex: number) => void;
  handleSideBySideVisibleRowsRequested: (start: number, count: number, reason: VirtualizedDocumentRequestReason) => void;
  handleSplitViewResize: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void;
  handleTopItemChanged: (rowIndex: number) => void;
  handleVisibleRowsRequested: (start: number, count: number, reason: string) => void;
  isRenderingInitialLoadedFrame: boolean;
  listExtraData: {
    fontFamily: string;
    fontSize: number;
    rowHeight: number;
  };
  listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
  loadingSource: DiffOpenSource | null;
  mutedColor: string;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => ReactElement;
  renderSidebarFile: (props: LegendListRenderItemProps<DiffFileSummary>) => ReactElement;
  renderSideBySideRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => ReactElement;
  requestSideBySideRange: (lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => void;
  rowHeight: number;
  sidebarCollapsed: boolean;
  sidebarListHeight: number;
  sideBySideItemIndexes: Array<number | undefined>;
  sideBySideRowVersions$: Observable<Record<string, number>>;
  splitPaneMetrics: DiffSplitPaneMetrics;
  state: DiffLoadedState;
  syntaxAppearance: "dark" | "light";
  viewMode: DiffSettingsFile["viewMode"];
  visibleItemIndexes: Array<number | undefined>;
};

type DiffRecoverableError = {
  kind?: "generic" | "permission";
  message: string;
  recoverySteps?: string[];
  source: DiffOpenSource | null;
  title: string;
};

const emptyState: DiffViewerState = {
  status: "empty",
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPermissionDeniedMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("operation not permitted")
    || normalizedMessage.includes("permission denied")
    || normalizedMessage.includes("eperm");
}

function getPermissionFolderLabel(source: DiffOpenSource | null, message: string) {
  let folderLabel = "this folder";
  const path = source?.kind === "folder" ? source.value : message;
  const protectedFolders = ["Documents", "Desktop", "Downloads"];
  const matchedFolder = protectedFolders.find((folder) => path.includes(`/${folder}/`) || path.endsWith(`/${folder}`));
  if (matchedFolder) {
    folderLabel = `your ${matchedFolder} folder`;
  }
  return folderLabel;
}

function createPermissionDeniedError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  const folderLabel = getPermissionFolderLabel(source, message);
  return {
    kind: "permission",
    message: `Access to ${folderLabel} was denied. Allow Legend Diff in System Settings, or choose a different folder.`,
    recoverySteps: [
      "Open Privacy & Security in System Settings.",
      "Go to Files and Folders.",
      "Allow Legend Diff to access the folder, then try opening it again.",
    ],
    source,
    title: "Legend Diff can't access this folder",
  };
}

function createOpenError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  return source?.kind === "folder" && isPermissionDeniedMessage(message)
    ? createPermissionDeniedError(source, message)
    : {
      kind: "generic",
      message,
      source,
      title: source?.kind === "github" ? "Couldn't open URL" : "Couldn't open repository",
    };
}

function createRefreshError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  return source?.kind === "folder" && isPermissionDeniedMessage(message)
    ? createPermissionDeniedError(source, message)
    : {
      kind: "generic",
      message,
      source,
      title: "Couldn't refresh changes",
    };
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

function useSyncedObservableValue<T>(value: T): Observable<T> {
  const value$ = useObservable<T>(value) as unknown as Observable<T>;
  useEffect(() => {
    if (value$.peek() !== value) {
      (value$ as { set: (nextValue: T) => void }).set(value);
    }
  }, [value$, value]);
  return value$;
}

function useLatestValueRef<T>(value: T) {
  const valueRef = useRef(value);
  valueRef.current = value;
  return valueRef;
}

function getDiffVisibleSourceModel(state: DiffViewerState, loadingSource: DiffOpenSource | null): DiffVisibleSourceModel {
  const visibleSource = state.source;
  const visibleFolderPath = visibleSource?.kind === "folder" ? visibleSource.value : null;
  const visibleSourceLabel = getDiffSourceLabel(visibleSource);
  const loadedFileCount = state.status === "loaded" ? state.files.length : 0;
  const toolbarSource = loadingSource ?? (loadedFileCount > 0 ? visibleSource : null);
  const showViewModeToolbar = toolbarSource !== null;
  const showSidebarControl = showViewModeToolbar;
  return {
    loadedFileCount,
    showSidebarControl,
    showViewModeToolbar,
    toolbarSource,
    visibleFolderPath,
    visibleSource,
    visibleSourceLabel,
  };
}

function DiffErrorPanel({
  borderColor,
  dangerColor,
  error,
  foregroundColor,
  mutedColor,
  onChooseFolder,
  chooseFolderLabel = "Choose Folder",
  onDismiss,
  onOpenSystemSettings,
  onRetry,
}: {
  borderColor: string;
  chooseFolderLabel?: string;
  dangerColor: string;
  error: DiffRecoverableError | DiffFatalError;
  foregroundColor: string;
  mutedColor: string;
  onChooseFolder?: () => void;
  onDismiss?: () => void;
  onOpenSystemSettings?: () => void;
  onRetry?: () => void;
}) {
  const recoverySteps = "recoverySteps" in error ? error.recoverySteps : undefined;
  return (
    <View style={[styles.errorPanel, { borderColor }]}>
      <View style={[styles.errorPanelAccent, { backgroundColor: dangerColor }]} />
      <View style={styles.errorPanelBody}>
        <Text style={[styles.errorPanelTitle, { color: foregroundColor }]}>
          {error.title}
        </Text>
        <Text style={[styles.errorPanelMessage, { color: mutedColor }]} numberOfLines={3}>
          {error.message}
        </Text>
        {recoverySteps ? (
          <View style={styles.errorPanelSteps}>
            {recoverySteps.map((step, index) => (
              <Text key={step} style={[styles.errorPanelStep, { color: mutedColor }]}>
                {index + 1}. {step}
              </Text>
            ))}
          </View>
        ) : null}
        {onRetry || onOpenSystemSettings || onChooseFolder || onDismiss ? (
          <View style={styles.errorPanelActions}>
            {onRetry ? (
              <Pressable accessibilityRole="button" onPress={onRetry} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>Retry</Text>
              </Pressable>
            ) : null}
            {onOpenSystemSettings ? (
              <Pressable accessibilityRole="button" onPress={onOpenSystemSettings} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>Open System Settings</Text>
              </Pressable>
            ) : null}
            {onChooseFolder ? (
              <Pressable accessibilityRole="button" onPress={onChooseFolder} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>{chooseFolderLabel}</Text>
              </Pressable>
            ) : null}
            {onDismiss ? (
              <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: mutedColor }]}>Dismiss</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DiffDocumentErrorBody({
  borderColor,
  dangerColor,
  documentError,
  foregroundColor,
  mutedColor,
  onDismiss,
  onOpenSystemSettings,
  onRetry,
}: {
  borderColor: string;
  dangerColor: string;
  documentError: DiffRecoverableError | null;
  foregroundColor: string;
  mutedColor: string;
  onDismiss: () => void;
  onOpenSystemSettings: () => void;
  onRetry: () => boolean;
}) {
  return documentError ? (
    <View style={styles.documentError}>
      <DiffErrorPanel
        borderColor={borderColor}
        chooseFolderLabel={documentError.kind === "permission" ? "Choose Another Folder" : undefined}
        dangerColor={dangerColor}
        error={documentError}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onDismiss={onDismiss}
        onOpenSystemSettings={documentError.kind === "permission" ? onOpenSystemSettings : undefined}
        onRetry={documentError.kind !== "permission" && documentError.source ? onRetry : undefined}
      />
    </View>
  ) : null;
}

function DiffFatalBody({
  borderColor,
  dangerColor,
  error,
  foregroundColor,
  mutedColor,
  onChooseFolder,
}: {
  borderColor: string;
  dangerColor: string;
  error: DiffFatalError;
  foregroundColor: string;
  mutedColor: string;
  onChooseFolder: () => void;
}) {
  return (
    <View style={styles.empty}>
      <DiffErrorPanel
        borderColor={borderColor}
        dangerColor={dangerColor}
        error={error}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onChooseFolder={onChooseFolder}
      />
    </View>
  );
}

function DiffNoChangesBody({
  documentErrorBody,
  foregroundColor,
  mutedColor,
  visibleSourceLabel,
}: {
  documentErrorBody: ReactNode;
  foregroundColor: string;
  mutedColor: string;
  visibleSourceLabel: string;
}) {
  return (
    <View style={styles.empty}>
      {documentErrorBody}
      <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
        No changes
      </Text>
      <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
        {visibleSourceLabel}
      </Text>
    </View>
  );
}

function DiffOpenBody({
  borderColor,
  dangerColor,
  foregroundColor,
  isLoading,
  isLoadingGithub,
  mutedColor,
  onChangeUrlInput,
  onChooseFolder,
  onDismissOpenError,
  onOpenPermissionSettings,
  onOpenUrl,
  onRetryOpenError,
  openError,
  primaryColor,
  urlInput,
  urlInputError,
  urlInputRef,
}: {
  borderColor: string;
  dangerColor: string;
  foregroundColor: string;
  isLoading: boolean;
  isLoadingGithub: boolean;
  mutedColor: string;
  onChangeUrlInput: (text: string) => void;
  onChooseFolder: () => void;
  onDismissOpenError: () => void;
  onOpenPermissionSettings: () => void;
  onOpenUrl: () => void;
  onRetryOpenError: () => void;
  openError: DiffRecoverableError | null;
  primaryColor: string;
  urlInput: string;
  urlInputError: string | null;
  urlInputRef: RefObject<TextInput | null>;
}) {
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
        onPress={onChooseFolder}
        style={({ pressed }) => [
          styles.emptyButton,
          styles.emptyFolderButton,
          {
            borderColor,
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
        <View style={[styles.emptyDividerLine, { backgroundColor: borderColor }]} />
        <Text style={[styles.emptyDividerText, { color: mutedColor }]}>or</Text>
        <View style={[styles.emptyDividerLine, { backgroundColor: borderColor }]} />
      </View>
      <View style={styles.emptyUrlForm}>
        <View style={[styles.emptyUrlInputWrap, { borderColor }]}>
          <SFSymbol color={mutedColor} name="link" size={19} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={onChangeUrlInput}
            onSubmitEditing={onOpenUrl}
            placeholder="https://github.com/org/repo/pull/123"
            placeholderTextColor={mutedColor}
            ref={urlInputRef}
            returnKeyType="go"
            style={[styles.emptyUrlInput, { color: foregroundColor }]}
            value={urlInput}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isLoading || !urlInput.trim()}
          onPress={onOpenUrl}
          style={({ pressed }) => [
            styles.emptyButton,
            styles.emptyUrlButton,
            {
              backgroundColor: primaryColor,
              borderColor: primaryColor,
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
        <Text style={[styles.emptyValidationText, { color: dangerColor }]}>
          {urlInputError}
        </Text>
      ) : null}
      {openError ? (
        <View style={styles.emptyOpenError}>
          <DiffErrorPanel
            borderColor={borderColor}
            chooseFolderLabel={openError.kind === "permission" ? "Choose Another Folder" : undefined}
            dangerColor={dangerColor}
            error={openError}
            foregroundColor={foregroundColor}
            mutedColor={mutedColor}
            onChooseFolder={onChooseFolder}
            onDismiss={onDismissOpenError}
            onOpenSystemSettings={openError.kind === "permission" ? onOpenPermissionSettings : undefined}
            onRetry={openError.kind !== "permission" && openError.source ? onRetryOpenError : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

function DiffLoadedBody({
  activeItemIndexes,
  diffContentHeight,
  diffListHeight,
  diffPaneHeight,
  diffRows,
  documentErrorBody,
  fileFilterInputRef,
  getItemSize,
  getItemType,
  getSideBySideItemSize,
  getSideBySideItemType,
  getSideBySideRow,
  handleDiffPaneLayout,
  handleSidebarListLayout,
  handleSideBySideTopItemChanged,
  handleSideBySideVisibleRowsRequested,
  handleSplitViewResize,
  handleTopItemChanged,
  handleVisibleRowsRequested,
  isRenderingInitialLoadedFrame,
  listExtraData,
  listRef,
  loadingSource,
  mutedColor,
  renderRow,
  renderSidebarFile,
  renderSideBySideRow,
  requestSideBySideRange,
  rowHeight,
  sidebarCollapsed,
  sidebarListHeight,
  sideBySideItemIndexes,
  sideBySideRowVersions$,
  splitPaneMetrics,
  state,
  syntaxAppearance,
  viewMode,
  visibleItemIndexes,
}: DiffLoadedBodyProps) {
  const [fileFilter, setFileFilter] = useState("");
  const bodyStartedAt = nowMs();
  const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
  const normalizedFileFilter = fileFilter.trim().toLowerCase();
  const filteredSidebarFiles = useMemo(
    () => state.files.filter((file) => fileMatchesFilter(file, normalizedFileFilter)),
    [normalizedFileFilter, state.files],
  );

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

  const logBodyFinish = (path: string, extra?: Record<string, unknown>) => {
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
  };

  if (activeItemIndexes.length === 0) {
    logBodyFinish("no-changes");
    return null;
  }

  let diffContent: ReactElement;
  if (diffListHeight <= 0) {
    logDiffOpenTiming("viewer.body.diffList.deferred", {
      activeItemCount: activeItemIndexes.length,
      diffPaneHeight,
      isRenderingInitialLoadedFrame,
      rows: state.document.rowCount,
      viewMode,
    });
    diffContent = <View style={styles.diffPaneContent} />;
  } else {
    logDiffOpenTiming("viewer.body.diffList.mount", {
      activeItemCount: activeItemIndexes.length,
      diffListHeight,
      rows: state.document.rowCount,
      viewMode,
    });
    const list = viewMode === "unified" ? (
      <VirtualizedFixedDocumentList
        adaptiveRender={diffAdaptiveRender}
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
        adaptiveRender={diffAdaptiveRender}
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

    diffContent = (
      <View
        style={[
          styles.diffPaneContent,
          {
            height: diffContentHeight,
            minHeight: diffContentHeight,
          },
        ]}
      >
        {documentErrorBody}
        {list}
      </View>
    );
  }

  if (!isRenderingInitialLoadedFrame) {
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
        appearance={syntaxAppearance}
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
}

type DiffLoadSource = (source: DiffOpenSource, syntaxTheme: ReturnType<typeof getDiffSyntaxThemeSetting>) => Promise<void>;

function useDiffSourceRefreshEffects({
  loadSource,
  setDocumentErrorValue,
  state$,
}: {
  loadSource: DiffLoadSource;
  setDocumentErrorValue: (nextError: DiffRecoverableError | null) => void;
  state$: Observable<DiffViewerState>;
}) {
  useDiffSourceRefreshEffects({
    loadSource,
    setDocumentErrorValue,
    state$,
  });
}

function useDiffWindowOptionsSync({
  diffPaneHeight$,
  loadingSource$,
  sidebarCollapsed$,
  state$,
}: {
  diffPaneHeight$: Observable<number>;
  loadingSource$: Observable<DiffOpenSource | null>;
  sidebarCollapsed$: Observable<boolean>;
  state$: Observable<DiffViewerState>;
}) {
  useDiffWindowOptionsSync({
    diffPaneHeight$,
    loadingSource$,
    sidebarCollapsed$,
    state$,
  });
}

function useDiffNativeMenuItems({
  loadingSource$,
  sidebarCollapsed$,
  state$,
}: {
  loadingSource$: Observable<DiffOpenSource | null>;
  sidebarCollapsed$: Observable<boolean>;
  state$: Observable<DiffViewerState>;
}) {
  useObserveEffect(() => {
    const currentState = state$.get();
    const currentViewMode = getDiffViewModeSetting();
    const currentLoadingSource = loadingSource$.get();
    const currentSidebarCollapsed = sidebarCollapsed$.get();
    const currentVisibleSource = currentState.source;
    const currentVisibleFolderPath = currentVisibleSource?.kind === "folder" ? currentVisibleSource.value : null;
    const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
    const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentVisibleSource : null);
    const currentShowViewModeToolbar = currentToolbarSource !== null;
    const currentShowSidebarControl = currentShowViewModeToolbar;
    const hasLoadedFiles = currentLoadedFileCount > 0;
    updateMenuItems(diffMenuOwnerId, [
      {
        enabled: currentState.status === "loaded",
        id: "reload",
      },
      {
        enabled: currentVisibleFolderPath !== null,
        id: "revealInFinder",
      },
      {
        enabled: currentVisibleSource !== null,
        id: "copySource",
        title: currentVisibleSource?.kind === "github" ? "Copy Source URL" : "Copy Folder Path",
      },
      {
        enabled: currentVisibleFolderPath !== null && hasLoadedFiles,
        id: "copyFilePath",
      },
      {
        enabled: hasLoadedFiles,
        id: "copyRelativePath",
      },
      {
        checked: currentShowSidebarControl && !currentSidebarCollapsed,
        enabled: currentShowSidebarControl,
        id: "toggleSidebar",
        title: currentSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar",
      },
      {
        enabled: currentShowSidebarControl,
        id: "filterFiles",
      },
      {
        checked: currentViewMode === "unified",
        enabled: currentShowViewModeToolbar,
        id: "viewUnified",
      },
      {
        checked: currentViewMode === "blocks",
        enabled: currentShowViewModeToolbar,
        id: "viewBlocks",
      },
    ]);
  });
}

function useDiffWindowToolbarItems({
  toggleSidebar,
}: {
  toggleSidebar: () => boolean;
}) {
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
}

function useDiffLoadedModel({
  collapsedFileIndexes,
  fontFamily,
  fontSize,
  rowHeight,
  state,
  viewMode,
}: {
  collapsedFileIndexes: ReadonlySet<number>;
  fontFamily: string;
  fontSize: number;
  rowHeight: number;
  state: DiffViewerState;
  viewMode: DiffSettingsFile["viewMode"];
}) {
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

  return {
    collapsedFileIndexList,
    diffRows,
    fileByIndex,
    fileByRowStart,
    fileHeaderRowIndexes,
    getVisibleListIndex,
    listExtraData,
    sideBySideFileHeaderIndexes,
    sideBySideItemIndexes,
    sideBySideListIndexByRowIndex,
    sideBySideRowCount,
    tokenStyleById,
    visibleItemIndexes,
  };
}

function useDiffSideBySideRuntime({
  activeFileIndex$,
  collapsedFileIndexListRef,
  diffPaneHeight,
  rowHeight,
  sideBySideRowCount,
  state,
  state$,
  viewMode,
}: {
  activeFileIndex$: Observable<number | null>;
  collapsedFileIndexListRef: RefObject<number[]>;
  diffPaneHeight: number;
  rowHeight: number;
  sideBySideRowCount: number;
  state: DiffViewerState;
  state$: Observable<DiffViewerState>;
  viewMode: DiffSettingsFile["viewMode"];
}) {
  const [sideBySideTokenStyleState, setSideBySideTokenStyleState] = useState<SideBySideTokenStyleState | null>(null);
  const sideBySideRowVersions$ = useObservable<Record<string, number>>({});
  const sideBySideVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const sideBySideScrollIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sideBySideScrollingRef = useRef(false);
  const pendingSideBySideTokenRangesRef = useRef<{
    document: DiffDocument;
    ranges: DiffTokenizedRowRange[];
  } | null>(null);
  const sideBySideRowCountRef = useLatestValueRef(sideBySideRowCount);
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
  }, [bumpSideBySideRowVersion, collapsedFileIndexListRef, refreshSideBySideTokenStyles]);
  const resetSideBySideRuntime = useCallback(() => {
    sideBySideVisibleRangeRef.current = null;
    pendingSideBySideTokenRangesRef.current = null;
    sideBySideScrollingRef.current = false;
    sideBySideRowVersions$.set({});
    if (sideBySideScrollIdleTimeoutRef.current) {
      clearTimeout(sideBySideScrollIdleTimeoutRef.current);
      sideBySideScrollIdleTimeoutRef.current = null;
    }
  }, [sideBySideRowVersions$]);
  const requestSideBySideRange = useCallback((lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded" && options?.reason !== "scroll") {
      const start = Math.max(0, Math.floor(lineStart));
      const count = Math.max(0, Math.ceil(lineCount));
      if (count > 0) {
        currentState.document.getSideBySideRows(start, count, collapsedFileIndexListRef.current);
        refreshSideBySideTokenStyles(currentState.document);
        const end = Math.min(sideBySideRowCountRef.current, start + count);
        for (let index = start; index < end; index += 1) {
          bumpSideBySideRowVersion(index);
        }
      }
    }
    // Scroll-driven requests stay side-effect free so scrolling never updates React state.
  }, [bumpSideBySideRowVersion, collapsedFileIndexListRef, refreshSideBySideTokenStyles, state$, sideBySideRowCountRef]);
  const getSideBySideRow = useCallback((index: number) => {
    const currentState = state$.peek();
    return currentState.status === "loaded"
      ? currentState.document.getPlainSideBySideRow(index, collapsedFileIndexListRef.current)
      : undefined;
  }, [collapsedFileIndexListRef, state$]);
  const handleSideBySideTopItemChanged = useCallback((lineIndex: number) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const row = currentState.document.getPlainSideBySideRow(lineIndex, collapsedFileIndexListRef.current);
      const nextFileIndex = findFileIndexForRow(currentState.files, row.sourceStart);
      if (activeFileIndex$.peek() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, [activeFileIndex$, collapsedFileIndexListRef, state$]);
  const handleSideBySideVisibleRowsRequested = useCallback((start: number, count: number, reason: VirtualizedDocumentRequestReason) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      sideBySideVisibleRangeRef.current = {
        count,
        document: currentState.document,
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
          if (pendingSideBySideTokenRangesRef.current?.document === currentState.document) {
            flushSideBySideTokenInvalidation(currentState.document, pendingSideBySideTokenRangesRef.current.ranges);
          }
        }, diffScrollIdleMs);
      } else if (pendingSideBySideTokenRangesRef.current?.document === currentState.document) {
        flushSideBySideTokenInvalidation(currentState.document, pendingSideBySideTokenRangesRef.current.ranges);
      }
    }
  }, [flushSideBySideTokenInvalidation, state$]);

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

  useEffect(() => {
    if (state.status === "loaded" && viewMode !== "unified" && diffPaneHeight > 0 && sideBySideRowCount > 0) {
      const initialCount = Math.min(sideBySideRowCount, Math.max(1, Math.ceil(diffPaneHeight / rowHeight)));
      requestSideBySideRange(0, initialCount, { force: true, reason: "initial" });
    } else if (viewMode === "unified") {
      setSideBySideTokenStyleState(null);
    }
  }, [diffPaneHeight, requestSideBySideRange, rowHeight, sideBySideRowCount, state, viewMode]);

  return {
    getSideBySideRow,
    handleSideBySideTopItemChanged,
    handleSideBySideVisibleRowsRequested,
    requestSideBySideRange,
    resetSideBySideRuntime,
    sideBySideRowVersions$,
    sideBySideTokenStyleState,
  };
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
  const syntaxTheme = useDiffSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const [state, setState] = useState<DiffViewerState>(emptyState);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const state$ = useObservable<DiffViewerState>(emptyState);
  const urlInput$ = useObservable("");
  const urlInputError$ = useObservable<string | null>(null);
  const openError$ = useObservable<DiffRecoverableError | null>(null);
  const documentError$ = useObservable<DiffRecoverableError | null>(null);
  const loadingSource$ = useObservable<DiffOpenSource | null>(null);
  const sidebarCollapsed$ = useObservable(false);
  const collapsedFileIndexes$ = useObservable<Set<number>>(new Set());
  const splitPaneMetrics$ = useObservable<DiffSplitPaneMetrics>({
    contentHeight: 0,
    contentWidth: 0,
    sidebarHeight: 0,
    sidebarWidth: 0,
  });
  const diffPaneHeight$ = useObservable(0);
  const activeFileIndex$ = useObservable<number | null>(null);
  const urlInput = useValue(urlInput$);
  const urlInputError = useValue(urlInputError$);
  const openError = useValue(openError$);
  const documentError = useValue(documentError$);
  const loadingSource = useValue(loadingSource$);
  const sidebarCollapsed = useValue(sidebarCollapsed$);
  const splitPaneMetrics = useValue(splitPaneMetrics$);
  const diffPaneHeight = useValue(diffPaneHeight$);
  const collapsedFileIndexes = useValue(collapsedFileIndexes$);
  const setViewerState = useCallback((nextState: DiffViewerState) => {
    state$.set(nextState);
    setState(nextState);
  }, []);
  const setUrlInputValue = useCallback((nextValue: string) => {
    urlInput$.set(nextValue);
  }, [urlInput$]);
  const setUrlInputErrorValue = useCallback((nextError: string | null) => {
    urlInputError$.set(nextError);
  }, [urlInputError$]);
  const setOpenErrorValue = useCallback((nextError: DiffRecoverableError | null) => {
    openError$.set(nextError);
  }, [openError$]);
  const setDocumentErrorValue = useCallback((nextError: DiffRecoverableError | null) => {
    documentError$.set(nextError);
  }, [documentError$]);
  const setLoadingSourceValue = useCallback((nextValue: SetStateAction<DiffOpenSource | null>) => {
    const currentLoadingSource = loadingSource$.peek();
    const nextLoadingSource = typeof nextValue === "function"
      ? nextValue(currentLoadingSource)
      : nextValue;
    if (nextLoadingSource !== currentLoadingSource) {
      loadingSource$.set(nextLoadingSource);
    }
  }, [loadingSource$]);
  const setSidebarCollapsedValue = useCallback((nextValue: SetStateAction<boolean>) => {
    const currentSidebarCollapsed = sidebarCollapsed$.peek();
    const nextSidebarCollapsed = typeof nextValue === "function"
      ? nextValue(currentSidebarCollapsed)
      : nextValue;
    if (nextSidebarCollapsed !== currentSidebarCollapsed) {
      sidebarCollapsed$.set(nextSidebarCollapsed);
    }
  }, [sidebarCollapsed$]);
  const setCollapsedFileIndexesValue = useCallback((nextValue: SetStateAction<Set<number>>) => {
    const currentIndexes = collapsedFileIndexes$.peek();
    const nextIndexes = typeof nextValue === "function"
      ? nextValue(currentIndexes)
      : nextValue;
    if (nextIndexes !== currentIndexes) {
      collapsedFileIndexes$.set(nextIndexes);
    }
  }, [collapsedFileIndexes$]);
  const setSplitPaneMetricsValue = useCallback((nextMetrics: DiffSplitPaneMetrics) => {
    splitPaneMetrics$.set(nextMetrics);
  }, [splitPaneMetrics$]);
  const setDiffPaneHeightValue = useCallback((nextHeight: number) => {
    diffPaneHeight$.set(nextHeight);
  }, [diffPaneHeight$]);
  const listRef = useRef<VirtualizedFixedDocumentListRef | null>(null);
  const fileFilterInputRef = useRef<TextInputSearchRef | null>(null);
  const urlInputRef = useRef<TextInput | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadTraceRef = useRef<DiffLoadTrace | null>(null);
  const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
  const isLoading = loadingSource !== null;
  const isLoadingGithub = loadingSource?.kind === "github";
  const highlightedVisibleRangeRef = useRef<{
    count: number;
    document: DiffDocument;
    start: number;
  } | null>(null);
  const isRenderingInitialLoadedFrame = state.status === "loaded" && sourcesMatch(loadingSource, state.source);
  const loggedInitialLoadedFrameRef = useRef<boolean | null>(null);
  const collapsedFileIndexListRef = useRef<number[]>([]);
  const highlightTimeoutHandlesRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const visibleSourceModel = getDiffVisibleSourceModel(state, loadingSource);
  const { loadedFileCount, showSidebarControl, showViewModeToolbar, toolbarSource, visibleFolderPath, visibleSource, visibleSourceLabel } = visibleSourceModel;
  const backgroundColor = syntaxTheme.background;
  const foregroundColor = syntaxTheme.foreground;
  const mutedColor = displayTheme.colors.muted;

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentLoadingSource = loadingSource$.get();
    const currentIsRenderingInitialLoadedFrame = currentState.status === "loaded" && sourcesMatch(currentLoadingSource, currentState.source);
    if (currentState.status === "loaded" && loggedInitialLoadedFrameRef.current !== currentIsRenderingInitialLoadedFrame) {
      logDiffOpenTiming("viewer.initialLoadedFrame.state", {
        isRenderingInitialLoadedFrame: currentIsRenderingInitialLoadedFrame,
        loadingSource: currentLoadingSource,
        rows: currentState.document.rowCount,
        source: currentState.source,
      });
    }
    loggedInitialLoadedFrameRef.current = currentIsRenderingInitialLoadedFrame;
  });

  const {
    collapsedFileIndexList,
    diffRows,
    fileByIndex,
    fileByRowStart,
    fileHeaderRowIndexes,
    getVisibleListIndex,
    listExtraData,
    sideBySideFileHeaderIndexes,
    sideBySideItemIndexes,
    sideBySideListIndexByRowIndex,
    sideBySideRowCount,
    tokenStyleById,
    visibleItemIndexes,
  } = useDiffLoadedModel({
    collapsedFileIndexes,
    fontFamily,
    fontSize,
    rowHeight,
    state,
    viewMode,
  });
  collapsedFileIndexListRef.current = collapsedFileIndexList;
  const getVisibleListIndexRef = useLatestValueRef(getVisibleListIndex);
  const sideBySideListIndexByRowIndexRef = useLatestValueRef(sideBySideListIndexByRowIndex);
  const viewModeRef = useLatestValueRef(viewMode);
  const {
    getSideBySideRow,
    handleSideBySideTopItemChanged,
    handleSideBySideVisibleRowsRequested,
    requestSideBySideRange,
    resetSideBySideRuntime,
    sideBySideRowVersions$,
    sideBySideTokenStyleState,
  } = useDiffSideBySideRuntime({
    activeFileIndex$,
    collapsedFileIndexListRef,
    diffPaneHeight,
    rowHeight,
    sideBySideRowCount,
    state,
    state$,
    viewMode,
  });
  const clearHighlightTimeouts = useCallback(() => {
    for (const timeoutHandle of highlightTimeoutHandlesRef.current) {
      clearTimeout(timeoutHandle);
    }
    highlightTimeoutHandlesRef.current.clear();
  }, []);

  useEffect(() => {
    highlightedVisibleRangeRef.current = null;
    resetSideBySideRuntime();
    clearHighlightTimeouts();
    if (state.status === "loaded") {
      activeFileIndex$.set(state.files[0]?.index ?? null);
      setCollapsedFileIndexesValue((current) => current.size > 0 ? new Set() : current);
    } else {
      activeFileIndex$.set(null);
    }
  }, [activeFileIndex$, clearHighlightTimeouts, resetSideBySideRuntime, setCollapsedFileIndexesValue, state.status === "loaded" ? state.document : null]);

  useEffect(() => clearHighlightTimeouts, [clearHighlightTimeouts]);

  const scheduleVisibleHighlight = useCallback((start: number, count: number, reason: string) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const safeStart = Math.max(0, Math.floor(start));
      const safeCount = Math.min(
        Math.max(0, Math.ceil(count)),
        Math.max(0, currentState.document.rowCount - safeStart),
      );
      const highlightedRange = highlightedVisibleRangeRef.current;
      const isAlreadyHighlighted = highlightedRange?.document === currentState.document
        && highlightedRange.start === safeStart
        && highlightedRange.count === safeCount;

      if (safeCount > 0 && !isAlreadyHighlighted) {
        highlightedVisibleRangeRef.current = {
          count: safeCount,
          document: currentState.document,
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
            if (highlightedVisibleRangeRef.current?.document === currentState.document) {
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
  }, [clearHighlightTimeouts, diffRows.requestRange]);

  const handleVisibleRowsRequested = useCallback((start: number, count: number, reason: string) => {
    scheduleVisibleHighlight(start, count, reason);
  }, [scheduleVisibleHighlight]);

  const handleTopItemChanged = useCallback((rowIndex: number) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const nextFileIndex = findFileIndexForRow(currentState.files, rowIndex);
      if (activeFileIndex$.peek() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, []);

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
    setLoadingSourceValue(nextSource);
    if (state$.peek().status === "loaded") {
      setDocumentErrorValue(null);
    } else {
      setOpenErrorValue(null);
    }
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
        setViewerState(nextLoadedState);
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
        setLoadingSourceValue((current) => sourcesMatch(current, nextSource) ? null : current);
        const message = getErrorMessage(error);
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
          const nextError = sourcesMatch(currentState.source, nextSource)
            ? createRefreshError(nextSource, message)
            : createOpenError(nextSource, message);
          setDocumentErrorValue(nextError);
        } else {
          setOpenErrorValue(createOpenError(nextSource, message));
          setViewerState(emptyState);
        }
        logDiffOpenTiming("viewer.load.error", {
          error: message,
          requestId,
        });
      }
    }
  }, []);

  useEffect(() => {
    const initialSource = normalizeDiffOpenSource(source ?? folderPath);
    if (initialSource) {
      const currentSyntaxTheme = getDiffSyntaxThemeSetting();
      logDiffOpenTiming("viewer.launchSource.effect", {
        source: initialSource,
        selectedSyntaxTheme: currentSyntaxTheme,
      });
      loadSource(initialSource, currentSyntaxTheme);
    }
  }, [folderPath, source]);

  useEffect(() => {
    const shouldFocusUrlInput = typeof focusUrlInputRequestId === "number" && !source && !folderPath;
    if (shouldFocusUrlInput) {
      loadRequestIdRef.current += 1;
      loadTraceRef.current = null;
      setLoadingSourceValue(null);
      setViewerState(emptyState);
      setOpenErrorValue(null);
      setDocumentErrorValue(null);
      setUrlInputValue("");
      setUrlInputErrorValue(null);
      requestAnimationFrame(() => {
        urlInputRef.current?.focus();
      });
    }
  }, [focusUrlInputRequestId, folderPath, source]);

  const openFolder = useCallback(async () => {
    if (!loadingSource$.peek()) {
      const currentState = state$.peek();
      try {
        setOpenErrorValue(null);
        setDocumentErrorValue(null);
        const dialogStartedAt = nowMs();
        logDiffOpenTiming("viewer.dialog.start", {
          currentFolderPath: currentState.folderPath,
        });
        const path = await openDiffFolderDialog();
        logDiffOpenTiming("viewer.dialog.finish", {
          dialogMs: Number((nowMs() - dialogStartedAt).toFixed(1)),
          path,
        });
        if (path) {
          const nextSource = normalizeDiffOpenSource(path);
          if (nextSource) {
            await loadSource(nextSource, getDiffSyntaxThemeSetting());
          }
        }
      } catch (error) {
        const nextError = {
          message: getErrorMessage(error),
          source: currentState.source,
          title: "Couldn't choose folder",
        };
        if (currentState.status === "loaded") {
          setDocumentErrorValue(nextError);
        } else {
          setOpenErrorValue(nextError);
        }
      }
    }
  }, []);

  const openUrl = useCallback(async () => {
    if (!loadingSource$.peek()) {
      const nextSource = normalizeDiffOpenSource(urlInput$.peek());
      if (nextSource?.kind === "github") {
        setOpenErrorValue(null);
        setUrlInputErrorValue(null);
        await loadSource(nextSource, getDiffSyntaxThemeSetting());
      } else {
        setUrlInputErrorValue("Enter a GitHub PR or commit URL.");
      }
    }
  }, []);

  const retryOpenError = useCallback(() => {
    const currentOpenError = openError$.peek();
    if (!loadingSource$.peek() && currentOpenError?.source) {
      setOpenErrorValue(null);
      loadSource(currentOpenError.source, getDiffSyntaxThemeSetting());
    }
  }, []);

  const dismissDocumentError = useCallback(() => {
    setDocumentErrorValue(null);
  }, []);

  const openPermissionSettings = useCallback(() => {
    Linking.openURL(macOSFilesAndFoldersSettingsUrl).catch((error: unknown) => {
      console.error(`Unable to open System Settings: ${getErrorMessage(error)}`);
    });
  }, []);

  const handleDragEnter = useCallback(() => {
    setIsDropTargetActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDropTargetActive(false);
  }, []);

  const handleDrop = useCallback(({ nativeEvent }: { nativeEvent: DragDropFileEvent }) => {
    setIsDropTargetActive(false);
    if (!loadingSource$.peek()) {
      const nextSource = getDroppedDiffSource(nativeEvent);
      if (nextSource) {
        loadSource(nextSource, getDiffSyntaxThemeSetting());
      } else {
        const nextError = {
          message: getUnsupportedDropMessage(nativeEvent),
          source: null,
          title: "Unsupported drop",
        };
        if (state$.peek().status === "loaded") {
          setDocumentErrorValue(nextError);
        } else {
          setOpenErrorValue(nextError);
        }
      }
    }
  }, []);

  useObserveEffect(() => {
    const currentState = state$.get();
    const trace = loadTraceRef.current;
    if (currentState.status === "loaded" && trace?.document === currentState.document && loggedTraceDocumentRef.current !== currentState.document) {
      loggedTraceDocumentRef.current = currentState.document;
      const effectAt = nowMs();
      measureAfterEffect(({ frameAt, microtaskAt, secondFrameAt, timeoutAt }) => {
        setLoadingSourceValue((current) => sourcesMatch(current, currentState.source) ? null : current);
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
  });

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentSyntaxTheme = getDiffSyntaxThemeSetting();
    if (currentState.status === "loaded" && currentState.syntaxTheme !== currentSyntaxTheme) {
      loadSource(currentState.source, currentSyntaxTheme).catch((error: unknown) => {
        setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
      });
    }
  });

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentSyntaxTheme = getDiffSyntaxThemeSetting();
    const currentVisibleSource = currentState.source;
    const currentVisibleFolderPath = currentVisibleSource?.kind === "folder" ? currentVisibleSource.value : null;
    if (!currentVisibleFolderPath) {
      return undefined;
    }

    let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
    const subscription = watchDirectories([currentVisibleFolderPath], () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
        loadSource({ kind: "folder", label: getDiffSourceLabel(currentVisibleSource), value: currentVisibleFolderPath }, currentSyntaxTheme).catch((error: unknown) => {
          setDocumentErrorValue(createRefreshError(currentVisibleSource, getErrorMessage(error)));
        });
      }, 250);
    });

    return () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      subscription.remove();
    };
  });

  const reloadCurrentSource = useCallback(() => {
    const currentState = state$.peek();
    if (currentState.status !== "loaded") {
      return false;
    }

    loadSource(currentState.source, getDiffSyntaxThemeSetting()).catch((error: unknown) => {
      setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
    });
    return true;
  }, []);

  const revealCurrentFolder = useCallback(() => {
    const currentSource = state$.peek().source;
    const currentVisibleFolderPath = currentSource?.kind === "folder" ? currentSource.value : null;
    if (!currentVisibleFolderPath) {
      return false;
    }

    revealInFinder(currentVisibleFolderPath)
      .then((didReveal) => {
        if (!didReveal) {
          console.error("Unable to reveal folder in Finder.");
        }
      })
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    return true;
  }, []);

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
    const currentVisibleSource = state$.peek().source;
    if (currentVisibleSource) {
      didCopy = copyText(currentVisibleSource.value);
    }
    return didCopy;
  }, []);

  const copyCurrentFilePath = useCallback(() => {
    let didCopy = false;
    const currentState = state$.peek();
    const currentVisibleFolderPath = currentState.source?.kind === "folder" ? currentState.source.value : null;
    if (currentState.status === "loaded" && currentVisibleFolderPath) {
      const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.get());
      if (activeFile) {
        didCopy = copyText(getJoinedPath(currentVisibleFolderPath, activeFile.path));
      }
    }
    return didCopy;
  }, []);

  const copyCurrentRelativePath = useCallback(() => {
    let didCopy = false;
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.get());
      if (activeFile) {
        didCopy = copyText(activeFile.path);
      }
    }
    return didCopy;
  }, []);

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentLoadingSource = loadingSource$.get();
    const currentSyntaxTheme = getDiffSyntaxTheme();
    const currentViewMode = getDiffViewModeSetting();
    const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
    const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
    const currentShowViewModeToolbar = currentToolbarSource !== null;
    const currentShowSidebarControl = currentShowViewModeToolbar;
    if (currentToolbarSource) {
      setDiffViewerWindowOptions({
        appearance: currentSyntaxTheme.appearance,
        backgroundColor: currentSyntaxTheme.background,
        includeToolbarItems: true,
        source: currentToolbarSource,
        showSidebarControl: currentShowSidebarControl,
        showViewModeToolbar: currentShowViewModeToolbar,
        sidebarCollapsed: sidebarCollapsed$.get(),
        viewMode: currentViewMode,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  });

  useObserveEffect(() => {
    let frameHandle: number | null = null;
    let secondFrameHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const scheduleStartedAt = nowMs();
    const currentState = state$.get();
    const currentLoadingSource = loadingSource$.get();
    const currentSyntaxTheme = getDiffSyntaxTheme();
    const currentViewMode = getDiffViewModeSetting();
    const currentDiffPaneHeight = diffPaneHeight$.get();
    const currentSidebarCollapsed = sidebarCollapsed$.get();
    const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
    const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
    const currentShowViewModeToolbar = currentToolbarSource !== null;
    const currentShowSidebarControl = currentShowViewModeToolbar;
    const shouldWaitForContentLayout = currentState.status === "loaded" && currentLoadedFileCount > 0;
    const isContentLayoutReady = !shouldWaitForContentLayout || currentDiffPaneHeight > diffTitlebarTopInset;
    const includeToolbarItems = currentToolbarSource === null;

    logDiffOpenTiming("viewer.windowOptions.schedule", {
      diffPaneHeight: currentDiffPaneHeight,
      includeToolbarItems,
      isContentLayoutReady,
      loadedFileCount: currentLoadedFileCount,
      showSidebarControl: currentShowSidebarControl,
      showViewModeToolbar: currentShowViewModeToolbar,
      sidebarCollapsed: currentSidebarCollapsed,
      source: currentToolbarSource ?? currentState.source,
      status: currentState.status,
      viewMode: currentViewMode,
    });

    if (isContentLayoutReady) {
      const applyWindowOptions = () => {
        const startedAt = nowMs();
        logDiffOpenTiming("viewer.windowOptions.start", {
          diffPaneHeight: currentDiffPaneHeight,
          loadedFileCount: currentLoadedFileCount,
          scheduledDelayMs: Number((startedAt - scheduleStartedAt).toFixed(1)),
          showSidebarControl: currentShowSidebarControl,
          showViewModeToolbar: currentShowViewModeToolbar,
          sidebarCollapsed: currentSidebarCollapsed,
          source: currentToolbarSource ?? currentState.source,
          status: currentState.status,
          viewMode: currentViewMode,
        });
        setDiffViewerWindowOptions({
          appearance: currentSyntaxTheme.appearance,
          backgroundColor: currentSyntaxTheme.background,
          includeToolbarItems,
          source: currentToolbarSource ?? currentState.source,
          showSidebarControl: currentShowSidebarControl,
          showViewModeToolbar: currentShowViewModeToolbar,
          sidebarCollapsed: currentSidebarCollapsed,
          viewMode: currentViewMode,
        })
          .then(() => {
            logDiffOpenTiming("viewer.windowOptions.finish", {
              source: currentToolbarSource ?? currentState.source,
              setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
            });
          })
          .catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
          });
      };

      if (currentState.status === "loaded") {
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
        diffPaneHeight: currentDiffPaneHeight,
        loadedFileCount: currentLoadedFileCount,
        source: currentToolbarSource ?? currentState.source,
        status: currentState.status,
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
  });

  const toggleSidebar = useCallback(() => {
    const currentState = state$.peek();
    const currentLoadingSource = loadingSource$.peek();
    const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
    const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
    if (!currentToolbarSource) {
      return false;
    }

    setSidebarCollapsedValue((current) => !current);
    return true;
  }, []);

  const focusFileFilter = useCallback(() => {
    const currentState = state$.peek();
    const currentLoadingSource = loadingSource$.peek();
    const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
    const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
    if (!currentToolbarSource) {
      return false;
    }

    setSidebarCollapsedValue(false);
    requestAnimationFrame(() => {
      fileFilterInputRef.current?.focus();
    });
    return true;
  }, []);

  useEffect(() => registerDiffViewerActionHandlers({
    copyFilePath: copyCurrentFilePath,
    copyRelativePath: copyCurrentRelativePath,
    copySource: copyCurrentSource,
    filterFiles: focusFileFilter,
    reload: reloadCurrentSource,
    revealInFinder: revealCurrentFolder,
    toggleSidebar,
  }), []);

  useDiffNativeMenuItems({
    loadingSource$,
    sidebarCollapsed$,
    state$,
  });

  useDiffWindowToolbarItems({
    toggleSidebar,
  });

  const toggleFileCollapsed = useCallback((fileIndex: number) => {
    setCollapsedFileIndexesValue((current) => {
      const next = new Set(current);
      if (next.has(fileIndex)) {
        next.delete(fileIndex);
      } else {
        next.add(fileIndex);
      }
      return next;
    });
  }, [setCollapsedFileIndexesValue]);
  const currentSideBySideTokenStyleById = state.status === "loaded" && sideBySideTokenStyleState?.document === state.document
    ? sideBySideTokenStyleState.tokenStyleById
    : tokenStyleById;
  const borderColor$ = useSyncedObservableValue(displayTheme.colors.border);
  const fileByIndexRef = useLatestValueRef<ReadonlyMap<number, DiffFileSummary>>(fileByIndex);
  const fileByRowStartRef = useLatestValueRef<ReadonlyMap<number, DiffFileSummary>>(fileByRowStart);
  const fileHeaderRowIndexesRef = useLatestValueRef<ReadonlySet<number>>(fileHeaderRowIndexes);
  const fontFamily$ = useSyncedObservableValue(fontFamily);
  const fontSize$ = useSyncedObservableValue(fontSize);
  const foregroundColor$ = useSyncedObservableValue(foregroundColor);
  const mutedColor$ = useSyncedObservableValue(mutedColor);
  const rowHeight$ = useSyncedObservableValue(rowHeight);
  const sideBySideTokenStyleByIdRef = useLatestValueRef(currentSideBySideTokenStyleById);
  const tokenStyleByIdRef = useLatestValueRef(tokenStyleById);
  const renderFieldsRef = useRef<DiffRenderFields | null>(null);
  if (!renderFieldsRef.current) {
    renderFieldsRef.current = {
      borderColor$,
      fileByIndexRef,
      fileByRowStartRef,
      fileHeaderRowIndexesRef,
      fontFamily$,
      fontSize$,
      foregroundColor$,
      mutedColor$,
      rowHeight$,
      sideBySideTokenStyleByIdRef,
      tokenStyleByIdRef,
      toggleFileCollapsed,
    };
  }
  const renderFields = renderFieldsRef.current;

  const scrollToFile = useCallback((file: DiffFileSummary) => {
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const listIndex = viewModeRef.current === "unified"
      ? getVisibleListIndexRef.current(rowStart)
      : sideBySideListIndexByRowIndexRef.current.get(rowStart);
    if (listIndex !== undefined) {
      listRef.current?.scrollToIndex({
        animated: true,
        index: listIndex,
        viewPosition: 0,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  }, []);

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
      previousContentHeight: splitPaneMetrics$.peek().contentHeight,
      previousContentWidth: splitPaneMetrics$.peek().contentWidth,
      previousSidebarHeight: splitPaneMetrics$.peek().sidebarHeight,
      previousSidebarWidth: splitPaneMetrics$.peek().sidebarWidth,
      sidebarHeight: nextMetrics.sidebarHeight,
      sidebarWidth: nextMetrics.sidebarWidth,
    });
    setSplitPaneMetricsValue(nextMetrics);
  }, []);

  const handleDiffPaneLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    logDiffOpenTiming("viewer.diffPane.layout", {
      height: nextHeight,
      previousHeight: diffPaneHeight$.peek(),
      rawHeight: Number(event.nativeEvent.layout.height.toFixed(1)),
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    });
    setDiffPaneHeightValue(nextHeight);
  }, []);

  const handleSidebarListLayout = useCallback((event: LayoutChangeEvent) => {
    const currentState = state$.peek();
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
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => (
      <DiffUnifiedRow
        adaptiveRender={adaptiveRender}
        collapsedFileIndexes$={collapsedFileIndexes$}
        index={index}
        renderFields={renderFields}
        row={row}
      />
    ),
    [collapsedFileIndexes$, renderFields],
  );

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
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => (
      <DiffSideBySideRow
        adaptiveRender={adaptiveRender}
        collapsedFileIndexes$={collapsedFileIndexes$}
        index={index}
        renderFields={renderFields}
        row={row}
      />
    ),
    [collapsedFileIndexes$, renderFields],
  );

  const handleUrlInputChange = useCallback((text: string) => {
    setUrlInputValue(text);
    if (urlInputError$.peek()) {
      setUrlInputErrorValue(null);
    }
    if (openError$.peek()) {
      setOpenErrorValue(null);
    }
  }, []);

  const dismissOpenError = useCallback(() => {
    setOpenErrorValue(null);
  }, []);

  const diffContentHeight = Math.max(0, diffPaneHeight - diffTitlebarTopInset);
  const documentErrorHeight = documentError
    ? documentError.kind === "permission"
      ? diffDocumentPermissionErrorHeight
      : diffDocumentErrorHeight
    : 0;
  const diffListHeight = Math.max(0, diffContentHeight - documentErrorHeight);
  const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
  const sidebarListHeight = isSidebarLayoutReady ? Math.max(0, splitPaneMetrics.sidebarHeight - diffSidebarTopInset - 70) : 0;
  const activeItemIndexes = viewMode === "unified" ? visibleItemIndexes : sideBySideItemIndexes;
  const documentErrorBody = (
    <DiffDocumentErrorBody
      borderColor={displayTheme.colors.border}
      dangerColor={displayTheme.colors.danger}
      documentError={documentError}
      foregroundColor={foregroundColor}
      mutedColor={mutedColor}
      onDismiss={dismissDocumentError}
      onOpenSystemSettings={openPermissionSettings}
      onRetry={reloadCurrentSource}
    />
  );
  let body: ReactNode;

  if (state.status === "fatal") {
    body = (
      <DiffFatalBody
        borderColor={displayTheme.colors.border}
        dangerColor={displayTheme.colors.danger}
        error={state.error}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onChooseFolder={openFolder}
      />
    );
  } else if (state.status === "loaded") {
    body = activeItemIndexes.length === 0 ? (
      <DiffNoChangesBody
        documentErrorBody={documentErrorBody}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        visibleSourceLabel={visibleSourceLabel}
      />
    ) : (
      <DiffLoadedBody
        activeItemIndexes={activeItemIndexes}
        diffContentHeight={diffContentHeight}
        diffListHeight={diffListHeight}
        diffPaneHeight={diffPaneHeight}
        diffRows={diffRows}
        documentErrorBody={documentErrorBody}
        fileFilterInputRef={fileFilterInputRef}
        getItemSize={getItemSize}
        getItemType={getItemType}
        getSideBySideItemSize={getSideBySideItemSize}
        getSideBySideItemType={getSideBySideItemType}
        getSideBySideRow={getSideBySideRow}
        handleDiffPaneLayout={handleDiffPaneLayout}
        handleSidebarListLayout={handleSidebarListLayout}
        handleSideBySideTopItemChanged={handleSideBySideTopItemChanged}
        handleSideBySideVisibleRowsRequested={handleSideBySideVisibleRowsRequested}
        handleSplitViewResize={handleSplitViewResize}
        handleTopItemChanged={handleTopItemChanged}
        handleVisibleRowsRequested={handleVisibleRowsRequested}
        isRenderingInitialLoadedFrame={isRenderingInitialLoadedFrame}
        listExtraData={listExtraData}
        listRef={listRef}
        loadingSource={loadingSource}
        mutedColor={mutedColor}
        renderRow={renderRow}
        renderSidebarFile={renderSidebarFile}
        renderSideBySideRow={renderSideBySideRow}
        requestSideBySideRange={requestSideBySideRange}
        rowHeight={rowHeight}
        sidebarCollapsed={sidebarCollapsed}
        sidebarListHeight={sidebarListHeight}
        sideBySideItemIndexes={sideBySideItemIndexes}
        sideBySideRowVersions$={sideBySideRowVersions$}
        splitPaneMetrics={splitPaneMetrics}
        state={state}
        syntaxAppearance={syntaxTheme.appearance}
        viewMode={viewMode}
        visibleItemIndexes={visibleItemIndexes}
      />
    );
  } else {
    body = (
      <DiffOpenBody
        borderColor={displayTheme.colors.border}
        dangerColor={displayTheme.colors.danger}
        foregroundColor={foregroundColor}
        isLoading={isLoading}
        isLoadingGithub={isLoadingGithub}
        mutedColor={mutedColor}
        onChangeUrlInput={handleUrlInputChange}
        onChooseFolder={openFolder}
        onDismissOpenError={dismissOpenError}
        onOpenPermissionSettings={openPermissionSettings}
        onOpenUrl={openUrl}
        onRetryOpenError={retryOpenError}
        openError={openError}
        primaryColor={displayTheme.colors.primary}
        urlInput={urlInput}
        urlInputError={urlInputError}
        urlInputRef={urlInputRef}
      />
    );
  }

  return (
    <DragDropView
      allowedFileTypes={diffDropAllowedFileTypes}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={[styles.root, { backgroundColor }]}
    >
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
  emptyOpenError: {
    alignItems: "center",
    bottom: 28,
    left: 32,
    position: "absolute",
    right: 32,
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
  content: {
    flex: 1,
    minHeight: 0,
  },
  documentError: {
    height: diffDocumentErrorHeight,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  errorPanel: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    maxWidth: 620,
    overflow: "hidden",
    width: "100%",
  },
  errorPanelAccent: {
    width: 3,
  },
  errorPanelActions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
  },
  errorPanelBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorPanelButton: {
    paddingRight: 8,
    paddingVertical: 2,
  },
  errorPanelButtonText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  errorPanelMessage: {
    fontSize: 12,
    lineHeight: 17,
  },
  errorPanelStep: {
    fontSize: 12,
    lineHeight: 17,
  },
  errorPanelSteps: {
    gap: 2,
    paddingTop: 6,
  },
  errorPanelTitle: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
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
    paddingTop: diffSidebarTopInset,
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

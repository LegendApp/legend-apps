import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { commandRunner } from "@legend-desktop/command-runner";
import {
  DiffMergeNativePane,
  DiffNativeRowConfig,
  loadUnifiedDiff,
  startGitFolderDiff,
  startUnifiedDiffFromUrl,
  type DiffDocument,
  type DiffFileSummary,
  type DiffLoadProgress,
  type DiffLoadResult,
  type DiffLoadSession,
  type DiffLoadTiming,
  type DiffRenderRow,
  type DiffSideBySideFileHeader,
  type DiffSideBySideRenderRow,
  type DiffSyntaxStyle,
} from "@legend-desktop/diff-parser";
import { DragDropView, type DragDropFileEvent } from "@legend-desktop/drag-drop";
import { revealInFinder } from "@legend-desktop/file-dialog";
import { addKeyDownListener, KeyCodes } from "@legend-desktop/keyboard-manager";
import { LightText, nowMs, TokenizedText, type SyntaxStyleMap } from "@legend-desktop/source-viewer";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { ensureSyntaxGrammarsForPaths, getSyntaxLanguageForPath, highlightString, type SyntaxRenderLine, type SyntaxStyle } from "@legend-desktop/syntax-parser";
import { TextInputSearch, type TextInputSearchRef } from "@legend-desktop/text-input-search";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { addWindowCloseRequestedListener, closeWindow } from "@legend-desktop/window-manager";
import { useWindowId } from "@legend-desktop/windows";
import {
  VirtualizedFixedDocumentList,
  type VirtualizedDocumentRowsState,
  type VirtualizedDocumentRequestOptions,
  type VirtualizedDocumentRequestReason,
  type VirtualizedDocumentVisibleRangeInfo,
  type VirtualizedFixedDocumentListRef,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObservable, useObserveEffect, useValue } from "@legendapp/state/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type NativeSyntheticEvent } from "react-native";
import { confirmUnsavedDiffMergeDrafts } from "./confirmUnsavedDiffMergeDrafts";
import { addRecentDiffSource, updateSavedDiffWindowSource } from "./diffAppMetadata";
import {
  createDiffCompareSource,
  createDiffCompareSourceForRef,
  loadDiffCompareRepoState,
  type DiffCompareRepoState,
} from "./diffCompareTargets";
import { getDroppedDiffSource, getUnsupportedDropMessage } from "./diffDrop";
import { getDiffFolderCompareBaseKey, getDiffRecentDocumentPath, getDiffSourceLabel, getFilename, normalizeDiffOpenSource, openDiffFilePairDialog, openDiffFolderDialog, type DiffOpenSource } from "./diffFiles";
import { createFilePairDiffCommand, createFilePairUnifiedDiff } from "./filePairDiff";
import { getDiffPalette } from "./diffPalette";
import {
  createDiffMergeDraftFileWithResolvedBlock,
  createReadyMergeState,
  createDiffMergeHunkDisplayModel,
  loadDiffMergeState,
  readDiffMergeFileContent,
  resolveDiffMergeConflictContent,
  type DiffMergeConflictBlock,
  type DiffMergeConflictChoice,
  type DiffMergeConflictRange,
  type DiffMergeDisplayRow,
  type DiffMergeConflictFile,
  type DiffMergeDisplayModel,
  type DiffMergeHunkHeaderInfo,
  type DiffMergeSideChangeType,
  type DiffMergeState,
  writeDiffMergeFileContent,
} from "./diffMerge";
import { recordDiffSyntaxLanguagesForPaths } from "./diffSyntaxWarmup";
import { GlassToast } from "./GlassToast";
import {
  diffMergeSaveConflictKey,
  getMergeConflictKey,
  isDiffMergeSavePending,
} from "./diffMergeControls";
import {
  defaultDiffSidebarWidth,
  getDiffViewModeSetting,
  getDiffShowOnlyHunksSetting,
  setDiffShowOnlyHunksSetting,
  setDiffSidebarWidthSetting,
  type DiffRowRendererSetting,
  useDiffAdaptiveLightModeEnabledSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffRowRendererSetting,
  useDiffShowOnlyHunksSetting,
  useDiffShowStatisticsPanelSetting,
  useDiffSidebarWidthSetting,
  useDiffSyntaxHighlightingEnabledSetting,
  useDiffSyntaxTheme,
  useDiffViewModeSetting,
  type DiffSettingsFile,
} from "./diffSettings";
import {
  diffAdaptiveRender,
  diffDocumentErrorHeight,
  diffDocumentPermissionErrorHeight,
  diffDropAllowedFileTypes,
  diffFileHeaderRowHeight,
  diffBackgroundTokenizeChunkBudgetMs,
  diffBackgroundTokenizeChunkRowCount,
  diffBackgroundTokenizeMaxFileCount,
  diffBackgroundTokenizeMaxSourceLineCount,
  diffBackgroundTokenizePollMs,
  diffBackgroundTokenizeStartDelayMs,
  diffInitialRowCount,
  diffLineOverscan,
  diffLoadedCacheMaxRows,
  diffOverscanRequestDelayMs,
  diffProgressiveInitialPaintMaxDelayMs,
  diffProgressiveInitialPaintRowCount,
  diffProgressiveItemCountExpandChunkRowCount,
  diffProgressiveItemCountExpandThresholdRows,
  diffProgressiveItemCountPrewarmDelayMs,
  diffProgressiveItemCountPrewarmRowCount,
  diffProgressiveLoadedStatePublishMs,
  diffProgressiveLoadPollMs,
  diffProgressivePostInitialLoadPollMs,
  diffProgressivePostInitialLoadResumeMs,
  diffRowKindFileHeader,
  diffSidebarFileRowHeight,
  diffSidebarTopInset,
  diffTitlebarTopInset,
} from "./viewer/diffViewerConstants";
import {
  findFileIndexForRow,
  getFilesForSourceRowRange,
  useDiffLoadedModel,
  useVisibleDiffFileTokenizationScheduler,
  useDiffSideBySideRuntime,
} from "./viewer/diffLoadedDocumentModel";
import {
  createDiffInlineMergeList,
  type DiffInlineMergeRow,
} from "./viewer/diffInlineMergeModel";
import {
  fileMatchesFilter,
  getActiveDiffFile,
  getConflictedFileStatusPresentation,
  getDirectoryPath,
  getFileStatusPresentation,
  getJoinedPath,
} from "./viewer/diffFilePresentation";
import {
  DiffSideBySideRow,
  DiffUnifiedRow,
  diffHunkHeaderHeight,
  diffSideBySideLineNumberWidth,
  diffSideBySideMarkerWidth,
  diffUnifiedChangeBarWidth,
  diffUnifiedLineNumberWidth,
  diffUnifiedMarkerWidth,
  isDiffSideBySideHunkStart,
  isDiffUnifiedHunkStart,
  getDiffRowPalette,
  getSideBySideDividerColor,
  type DiffRenderFields,
} from "./viewer/DiffRows";
import {
  DiffActionHandlersController,
  DiffFileWatcherController,
  DiffLaunchController,
  DiffLoadCompletionController,
  DiffNativeMenuController,
  DiffWindowChromeController,
  DiffWindowToolbarItemController,
} from "./viewer/diffViewerControllers";
import {
  DiffViewerModelProvider,
  emptyDiffLoadProgressState,
  emptyDiffViewerState,
  unavailableDiffMergeState,
  useDiffViewerModel,
  type DiffFatalError,
  type DiffLoadedState,
  type DiffLoadSourceOptions,
  type DiffLoadTrace,
  type DiffLoadProgressState,
  type DiffRecoverableError,
  type DiffSplitPaneMetrics,
  type DiffViewerState,
} from "./viewer/diffViewerModel";
import { DiffStartScreen } from "./start-screen/DiffStartScreen";
import { useDiffStartScreenController } from "./start-screen/useDiffStartScreenController";
import {
  createOpenError,
  createRefreshError,
  getDiffVisibleSourceModel,
  getErrorMessage,
  logDiffMemoryMark,
  logDiffLoadTiming,
  logDiffOpenTiming,
  sourcesMatch,
} from "./viewer/diffViewerSupport";

const macOSFilesAndFoldersSettingsUrl = "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders";
const diffContentMinWidth = 420;
const diffMergeSaveWatchSuppressMs = 2_000;
const diffSidebarFilterHeight = 28;
const diffSidebarFilterMarginTop = 4;
const diffSidebarFilterReservedHeight =
  diffSidebarFilterMarginTop +
  diffSidebarFilterHeight;
const diffUnsavedMergeBannerHeight = 48;

type DiffCommandResult = Awaited<ReturnType<typeof commandRunner.runCommand>>;
type DiffLoadedPayload = DiffLoadResult | DiffLoadProgress;

type DiffLoadedCacheEntry = {
  loaded: DiffLoadedPayload;
  loadComplete: boolean;
};

type DiffItemCountLimitState = {
  documentId: number;
  limit: number;
};

type DiffMergeDraftFile = {
  content: string;
  file: DiffMergeConflictFile;
};

type DiffMergeFileResolveQueue = {
  chain: Promise<void>;
  completedOriginalBlockIndexes: number[];
};

type DiffViewerWindowProps = {
  focusUrlInputRequestId?: number;
  folderPath?: string;
  source?: DiffOpenSource;
};

function getBackgroundTokenizationPlan(files: readonly DiffFileSummary[]) {
  const selectedFiles: DiffFileSummary[] = [];
  let sourceLineCount = 0;
  let rowLimit = 0;

  for (const file of files) {
    if (selectedFiles.length >= diffBackgroundTokenizeMaxFileCount) {
      break;
    }

    const rowCount = Math.max(0, Math.ceil(file.rowCount));
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    if (rowCount > 0 && sourceLineCount + rowCount <= diffBackgroundTokenizeMaxSourceLineCount) {
      selectedFiles.push(file);
      sourceLineCount += rowCount;
      rowLimit = Math.max(rowLimit, rowStart + rowCount);
    } else {
      break;
    }
  }

  return {
    files: selectedFiles,
    rowLimit,
    sourceLineCount,
  };
}

function createGitDiffCommandError(commandResult: DiffCommandResult) {
  const message = commandResult.stderr
    ? commandResult.stderr
    : `git diff exited with code ${commandResult.exitCode}.`;
  return new Error(message);
}

function waitForDiffProgressPoll(delayMs = diffProgressiveLoadPollMs) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function shouldPublishInitialProgress(progress: DiffLoadProgress, initialRowCount: number, elapsedMs: number) {
  if (progress.complete || progress.error || progress.initialRows.length > 0) {
    return true;
  }

  if (initialRowCount <= 0 && progress.files.length > 0) {
    const rowCount = Math.max(0, Math.floor(progress.rowCount));
    return rowCount >= diffProgressiveInitialPaintRowCount ||
      elapsedMs >= diffProgressiveInitialPaintMaxDelayMs;
  }

  return false;
}

function getDiffLoadProgressState(
  source: DiffOpenSource,
  requestId: number,
  progress: DiffLoadProgress,
): DiffLoadProgressState {
  return {
    complete: progress.complete,
    fileCount: Math.max(0, Math.floor(progress.fileCount)),
    fileVersion: progress.fileVersion,
    requestId,
    rowCount: Math.max(0, Math.floor(progress.rowCount)),
    rowVersion: progress.rowVersion,
    source,
    visible: !progress.complete && !progress.error,
  };
}

function getDiffSourceCacheKey(source: DiffOpenSource) {
  if (source.kind === "github") {
    return `${source.kind}:${source.diffUrl}`;
  }
  if (source.kind === "git") {
    return `${source.kind}:${source.cwd}:${source.args.join("\u0000")}`;
  }
  if (source.kind === "filePair") {
    return `${source.kind}:${source.oldPath}\u0000${source.newPath}`;
  }
  if (source.kind === "diffFile") {
    return `${source.kind}:${source.value}`;
  }
  return `${source.kind}:${source.value}:${getDiffFolderCompareBaseKey(source.compareBase)}`;
}

function getDiffLoadedCacheKey(source: DiffOpenSource, showOnlyHunks: boolean) {
  const mode = showOnlyHunks ? "hunks" : "full";
  return `${getDiffSourceCacheKey(source)}:${mode}`;
}

function getDiffGitFolderLoadCompareOptions(source: DiffOpenSource) {
  if (source.kind === "folder" && source.compareBase?.kind === "ref") {
    return {
      compareBaseKind: "ref",
      compareBaseRef: source.compareBase.ref,
      compareUseMergeBase: source.compareBase.useMergeBase !== false,
    };
  }
  return {
    compareBaseKind: "head",
    compareBaseRef: "",
    compareUseMergeBase: true,
  };
}

function shouldCacheLoadedDiff(loaded: DiffLoadedPayload) {
  return loaded.document.rowCount <= diffLoadedCacheMaxRows;
}

function applyDiffMergeDraftsToState(
  mergeState: DiffMergeState,
  drafts: ReadonlyMap<string, DiffMergeDraftFile>,
): DiffMergeState {
  if (mergeState.status !== "ready" || drafts.size === 0) {
    return mergeState;
  }

  return createReadyMergeState(
    mergeState.files
      .map((file) => drafts.get(file.path)?.file ?? file)
      .filter((file) => file.markerBlocks.length > 0 || file.hasUnsavedDraft),
  );
}

function clearDiffMergeDraftFlag(file: DiffMergeConflictFile) {
  if (!file.hasUnsavedDraft) {
    return file;
  }
  const { hasUnsavedDraft: _hasUnsavedDraft, ...savedFile } = file;
  return savedFile;
}

function getUnsavedDiffMergeDraftFiles(mergeState: DiffMergeState) {
  return mergeState.status === "ready" ? mergeState.files.filter((file) => file.hasUnsavedDraft) : [];
}

function isSaveKeyEvent(event: { keyCode: number; modifiers: number }) {
  const saveModifiers = KeyCodes.MODIFIER_COMMAND;
  const relevantModifiers =
    KeyCodes.MODIFIER_COMMAND |
    KeyCodes.MODIFIER_OPTION |
    KeyCodes.MODIFIER_CONTROL |
    KeyCodes.MODIFIER_SHIFT;
  return event.keyCode === KeyCodes.KEY_S && (event.modifiers & relevantModifiers) === saveModifiers;
}

function isPasteKeyEvent(event: { keyCode: number; modifiers: number }) {
  const pasteModifiers = KeyCodes.MODIFIER_COMMAND;
  const relevantModifiers =
    KeyCodes.MODIFIER_COMMAND |
    KeyCodes.MODIFIER_OPTION |
    KeyCodes.MODIFIER_CONTROL |
    KeyCodes.MODIFIER_SHIFT;
  return event.keyCode === KeyCodes.KEY_V && (event.modifiers & relevantModifiers) === pasteModifiers;
}

type DiffSidebarFileRowProps = {
  activeFileIndex$: Observable<number | null>;
  conflictBadgeBackgroundColor: string;
  conflictBadgeTextColor: string;
  file: DiffFileSummary;
  foregroundColor: string;
  mergeFile: DiffMergeConflictFile | null;
  onPressFile: (file: DiffFileSummary) => void;
  selectedBorderColor: string;
  selectedBackgroundColor: string;
  statusPresentation: ReturnType<typeof getFileStatusPresentation>;
};

type DiffSidebarFolderRowProps = {
  color: string;
  title: string;
};

type DiffSidebarEntry =
  | {
      id: string;
      title: string;
      type: "folder";
    }
  | {
      file: DiffFileSummary;
      id: string;
      type: "file";
    };

type DiffLoadedBodyProps = {
  activeFileIndex$: Observable<number | null>;
  activeItemIndexes: readonly (number | undefined)[];
  backgroundColor: string;
  diffPaneHeight$: Observable<number>;
  diffTopChromeHeight: number;
  diffRows: VirtualizedDocumentRowsState<DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming>;
  documentErrorBody: ReactNode;
  fileFilterInputRef: RefObject<TextInputSearchRef | null>;
  floatingDocumentBanner: ReactNode;
  getItemSize: (index: number) => number;
  getItemType: (index: number) => string;
  getRow: (index: number) => DiffRenderRow | undefined;
  getSideBySideItemSize: (index: number) => number;
  getSideBySideItemType: (index: number) => string;
  getSideBySideRow: (index: number) => DiffSideBySideRenderRow | undefined;
  handleDiffPaneLayout: (event: LayoutChangeEvent) => void;
  handleSidebarListLayout: (event: LayoutChangeEvent) => void;
  handleSideBySideTopItemChanged: (lineIndex: number) => void;
  handleSideBySideVisibleRowsRequested: (start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => void;
  handleSplitViewResize: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void;
  handleTopItemChanged: (rowIndex: number) => void;
  handleVisibleRowsRequested: (start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => void;
  isRenderingInitialLoadedFrame: boolean;
  listExtraData: DiffListExtraData;
  listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
  loadingSource: DiffOpenSource | null;
  mergeState: DiffMergeState;
  nativeSideBySideRowConfig: DiffNativeRowConfigProps;
  nativeUnifiedRowConfig: DiffNativeRowConfigProps;
  adaptiveLightModeEnabled: boolean;
  mutedColor: string;
  noChangesBody: ReactElement;
  primaryColor: string;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => ReactElement;
  renderSidebarEntry: (props: LegendListRenderItemProps<DiffSidebarEntry>) => ReactElement;
  renderSideBySideRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => ReactElement;
  requestSideBySideRange: (lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => void;
  resolvingMergeConflictKeys$: Observable<ReadonlySet<string>>;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  rowHeight: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sideBySideDataVersion: number;
  sideBySideFileHeaderByListIndex: Map<number, DiffSideBySideFileHeader>;
  sideBySideItemIndexes: Array<number | undefined>;
  splitPaneMetrics$: Observable<DiffSplitPaneMetrics>;
  state: DiffLoadedState;
  syntaxAppearance: "dark" | "light";
  syntaxTokenizationVersion$: Observable<number>;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
  visibleItemIndexes: Array<number | undefined>;
};

type DiffLoadingSplitBodyProps = {
  backgroundColor: string;
  foregroundColor: string;
  handleSplitViewResize: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void;
  mutedColor: string;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  source: DiffOpenSource;
  syntaxAppearance: "dark" | "light";
};

type DiffListExtraData = {
  adaptiveLightModeEnabled: boolean;
  borderColor: string;
  collapsedFileIndexes: ReadonlySet<number>;
  collapsedFileIndexesKey: string;
  fileHeaderBackgroundColor: string;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  mutedColor: string;
  rowRenderer: DiffRowRendererSetting;
  rowHeight: number;
  showOnlyHunks: boolean;
  sideBySideRowCount: number;
  syntaxAppearance: "dark" | "light";
  syntaxHighlightingEnabled: boolean;
  syntaxTheme: DiffSettingsFile["syntaxTheme"];
};

type DiffNativeRowConfigProps = {
  addAccentColor: string;
  addBackgroundColor: string;
  changeBarWidth: number;
  collapsedFileIndexes: string;
  configId: string;
  configVersion: number;
  dividerColor: string;
  documentId: number;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  lineNumberWidth: number;
  markerWidth: number;
  mutedColor: string;
  presentation: "blocks" | "unified";
  removeAccentColor: string;
  removeBackgroundColor: string;
  rowHeight: number;
  syntaxHighlightingEnabled: boolean;
  themeName: string;
};

function noopVirtualizedDocumentRequestRange() {
}

function hashDiffNativeRowConfigVersion(parts: readonly unknown[]) {
  let hash = 2166136261;
  for (const part of parts) {
    const value = String(part);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 31;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDiffSidebarFolderTitle(file: DiffFileSummary) {
  return getDirectoryPath(file.path) || "Files";
}

function createDiffSidebarEntries(files: readonly DiffFileSummary[]) {
  const entries: DiffSidebarEntry[] = [];
  let currentFolder = "";
  for (const file of files) {
    const folder = getDiffSidebarFolderTitle(file);
    if (folder !== currentFolder) {
      entries.push({
        id: `folder:${folder}:${entries.length}`,
        title: folder,
        type: "folder",
      });
      currentFolder = folder;
    }
    entries.push({
      file,
      id: `file:${file.index}:${file.path}`,
      type: "file",
    });
  }
  return entries;
}

const DiffSidebarFolderRow = memo(function DiffSidebarFolderRow({ color, title }: DiffSidebarFolderRowProps) {
  return (
    <View className="justify-center px-3 pb-1 pt-3" style={styles.sidebarFolder}>
      <Text className="text-xs font-medium leading-4" numberOfLines={1} style={{ color }}>
        {title}
      </Text>
    </View>
  );
});

function diffFileStatusPresentationsEqual(
  previous: ReturnType<typeof getFileStatusPresentation>,
  next: ReturnType<typeof getFileStatusPresentation>,
) {
  return previous.backgroundColor === next.backgroundColor
    && previous.color === next.color
    && previous.iconYOffset === next.iconYOffset
    && previous.symbolName === next.symbolName
    && previous.title === next.title;
}

function diffSidebarFileRowPropsEqual(previous: DiffSidebarFileRowProps, next: DiffSidebarFileRowProps) {
  return previous.activeFileIndex$ === next.activeFileIndex$
    && previous.conflictBadgeBackgroundColor === next.conflictBadgeBackgroundColor
    && previous.conflictBadgeTextColor === next.conflictBadgeTextColor
    && previous.file === next.file
    && previous.foregroundColor === next.foregroundColor
    && previous.mergeFile === next.mergeFile
    && previous.onPressFile === next.onPressFile
    && previous.selectedBackgroundColor === next.selectedBackgroundColor
    && previous.selectedBorderColor === next.selectedBorderColor
    && diffFileStatusPresentationsEqual(previous.statusPresentation, next.statusPresentation);
}

const DiffSidebarFileRow = memo(function DiffSidebarFileRow({
  activeFileIndex$,
  conflictBadgeBackgroundColor,
  conflictBadgeTextColor,
  file,
  foregroundColor,
  mergeFile,
  onPressFile,
  selectedBorderColor,
  selectedBackgroundColor,
  statusPresentation,
}: DiffSidebarFileRowProps) {
  const isActive = useValue(() => activeFileIndex$.get() === file.index);
  const filename = getFilename(file.path);
  const handlePress = useCallback(() => {
    onPressFile(file);
  }, [file, onPressFile]);

  return (
    <Pressable
      accessibilityLabel={`${filename}, ${statusPresentation.title}`}
      accessibilityRole="button"
      className="flex-row items-center gap-2 px-3"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.sidebarFile,
        isActive
          ? {
              backgroundColor: selectedBackgroundColor,
              borderColor: selectedBorderColor,
            }
          : null,
        { opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View className="h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: statusPresentation.backgroundColor }}>
        <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={11} yOffset={statusPresentation.iconYOffset} />
      </View>
      <Text className="min-w-0 flex-1 text-sm font-normal leading-5" numberOfLines={1} style={{ color: foregroundColor }}>
        {filename}{mergeFile?.hasUnsavedDraft ? " *" : ""}
      </Text>
      {mergeFile && mergeFile.markerBlocks.length > 0 ? (
        <View className="h-4 min-w-4 items-center justify-center rounded-full px-1" style={{ backgroundColor: conflictBadgeBackgroundColor }}>
          <Text className="text-xs font-bold leading-3" style={{ color: conflictBadgeTextColor }}>
            {mergeFile.markerBlocks.length}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}, diffSidebarFileRowPropsEqual);

function getDiffLineRowHeight(fontSize: number) {
  return Math.max(20, fontSize + 9);
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
  onOpenExternalUrl,
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
  onOpenExternalUrl?: (url: string) => void;
  onOpenSystemSettings?: () => void;
  onRetry?: () => void;
}) {
  const recoverySteps = "recoverySteps" in error ? error.recoverySteps : undefined;
  const externalUrl = "externalUrl" in error ? error.externalUrl : undefined;
  const externalUrlLabel = ("externalUrlLabel" in error ? error.externalUrlLabel : undefined) ?? "Open in Browser";
  const canOpenExternalUrl = Boolean(onOpenExternalUrl && externalUrl);
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
        {onRetry || canOpenExternalUrl || onOpenSystemSettings || onChooseFolder || onDismiss ? (
          <View style={styles.errorPanelActions}>
            {onRetry ? (
              <Pressable accessibilityRole="button" onPress={onRetry} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>Retry</Text>
              </Pressable>
            ) : null}
            {onOpenExternalUrl && externalUrl ? (
              <Pressable accessibilityRole="button" onPress={() => onOpenExternalUrl(externalUrl)} style={styles.errorPanelButton}>
                <Text style={[styles.errorPanelButtonText, { color: foregroundColor }]}>{externalUrlLabel}</Text>
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
  onOpenExternalUrl,
  onOpenSystemSettings,
  onRetry,
}: {
  borderColor: string;
  dangerColor: string;
  documentError: DiffRecoverableError | null;
  foregroundColor: string;
  mutedColor: string;
  onDismiss: () => void;
  onOpenExternalUrl: (url: string) => void;
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
        onOpenExternalUrl={onOpenExternalUrl}
        onOpenSystemSettings={documentError.kind === "permission" ? onOpenSystemSettings : undefined}
        onRetry={documentError.kind !== "permission" && documentError.source ? onRetry : undefined}
      />
    </View>
  ) : null;
}

function DiffUnsavedMergeDraftBanner({
  dangerColor,
  disabled,
  fileCount,
  onDiscard,
  onSave,
  primaryColor,
}: {
  dangerColor: string;
  disabled: boolean;
  fileCount: number;
  onDiscard: () => void;
  onSave: () => void;
  primaryColor: string;
}) {
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  return (
    <GlassToast
      actions={[
        { disabled, label: "Discard", onPress: onDiscard },
        { color: primaryColor, disabled, label: "Save", minWidth: 56, onPress: onSave, variant: "primary" },
      ]}
      style={styles.unsavedMergeBanner}
      tintColor={`${dangerColor}24`}
      title={`Unsaved merge resolutions - ${fileLabel}`}
    />
  );
}

function DiffUnsavedMergeDraftBannerWithSavingState({
  dangerColor,
  fileCount,
  onDiscard,
  onSave,
  primaryColor,
  resolvingMergeConflictKeys$,
}: {
  dangerColor: string;
  fileCount: number;
  onDiscard: () => void;
  onSave: () => void;
  primaryColor: string;
  resolvingMergeConflictKeys$: Observable<ReadonlySet<string>>;
}) {
  const isSavingMergeDrafts = useValue(() => resolvingMergeConflictKeys$.get().has(diffMergeSaveConflictKey));
  return (
    <DiffUnsavedMergeDraftBanner
      dangerColor={dangerColor}
      disabled={isSavingMergeDrafts}
      fileCount={fileCount}
      onDiscard={onDiscard}
      onSave={onSave}
      primaryColor={primaryColor}
    />
  );
}

function DiffNativeMenuSavingStateController({
  hasUnsavedMergeDrafts,
  resolvingMergeConflictKeys$,
}: {
  hasUnsavedMergeDrafts: boolean;
  resolvingMergeConflictKeys$: Observable<ReadonlySet<string>>;
}) {
  const isSavingMergeDrafts = useValue(() => resolvingMergeConflictKeys$.get().has(diffMergeSaveConflictKey));
  return (
    <DiffNativeMenuController
      hasUnsavedMergeDrafts={hasUnsavedMergeDrafts}
      isSavingMergeDrafts={isSavingMergeDrafts}
    />
  );
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
  foregroundColor,
  mutedColor,
  visibleSourceLabel,
}: {
  foregroundColor: string;
  mutedColor: string;
  visibleSourceLabel: string;
}) {
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

function DiffLoadingBody({
  foregroundColor,
  mutedColor,
  source,
}: {
  foregroundColor: string;
  mutedColor: string;
  source: DiffOpenSource;
}) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={mutedColor} size="small" />
      <Text style={[styles.loadingTitle, { color: foregroundColor }]}>
        {source.kind === "github" ? "Downloading..." : "Loading..."}
      </Text>
      <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
        {getDiffSourceLabel(source)}
      </Text>
    </View>
  );
}

const DiffLoadingSplitBody = memo(function DiffLoadingSplitBody({
  backgroundColor,
  foregroundColor,
  handleSplitViewResize,
  mutedColor,
  sidebarCollapsed,
  sidebarWidth,
  source,
  syntaxAppearance,
}: DiffLoadingSplitBodyProps) {
  const sidebar = (
    <View style={styles.sidebar}>
      <View style={styles.sidebarList} />
    </View>
  );

  return (
    <View style={styles.loadedRoot}>
      <SidebarSplitView
        appearance={syntaxAppearance}
        contentMinWidth={diffContentMinWidth}
        contentTitlebarHeight={diffTitlebarTopInset}
        contentTitlebarMaterial="glass"
        contentTitlebarOverlayColor={backgroundColor}
        contentTitlebarOverlayOpacity={syntaxAppearance === "dark" ? 0.72 : 0.82}
        onSplitViewDidResize={handleSplitViewResize}
        sidebarCollapsed={sidebarCollapsed}
        sidebarMinWidth={defaultDiffSidebarWidth}
        sidebarWidth={sidebarWidth}
        style={styles.content}
      >
        {sidebar}
        <View style={styles.diffWorkspace}>
          <View style={styles.diffPane}>
            <View style={styles.diffPaneContent}>
              <View style={styles.diffTitlebarSpacer} />
              <DiffLoadingBody
                foregroundColor={foregroundColor}
                mutedColor={mutedColor}
                source={source}
              />
            </View>
          </View>
        </View>
      </SidebarSplitView>
    </View>
  );
});

const DiffLoadedBody = memo(function DiffLoadedBody({
  activeFileIndex$,
  activeItemIndexes,
  backgroundColor,
  diffPaneHeight$,
  diffTopChromeHeight,
  diffRows,
  documentErrorBody,
  fileFilterInputRef,
  floatingDocumentBanner,
  getItemSize,
  getItemType,
  getRow,
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
  mergeState,
  nativeSideBySideRowConfig,
  nativeUnifiedRowConfig,
  mutedColor,
  noChangesBody,
  primaryColor,
  renderRow,
  renderSidebarEntry,
  renderSideBySideRow,
  requestSideBySideRange,
  resolvingMergeConflictKeys$,
  onResolveMergeConflict,
  rowHeight,
  sidebarCollapsed,
  sidebarWidth,
  sideBySideDataVersion,
  sideBySideFileHeaderByListIndex,
  sideBySideItemIndexes,
  splitPaneMetrics$,
  state,
  adaptiveLightModeEnabled,
  syntaxAppearance,
  syntaxTokenizationVersion$,
  viewMode,
  visibleItemIndexes,
}: DiffLoadedBodyProps) {
  const [fileFilter, setFileFilter] = useState("");
  const bodyStartedAt = nowMs();
  const activeFileIndex = useValue(activeFileIndex$);
  const diffPaneHeight = useValue(diffPaneHeight$);
  const splitPaneMetrics = useValue(splitPaneMetrics$);
  const diffContentHeight = diffPaneHeight;
  const diffListHeight = Math.max(0, diffContentHeight - diffTopChromeHeight);
  const inlineMergeModel = useDiffInlineMergeModel({
    borderColor: listExtraData.borderColor,
    collapsedFileIndexes: listExtraData.collapsedFileIndexes,
    fileHeaderBackgroundColor: listExtraData.fileHeaderBackgroundColor,
    files: state.files,
    foregroundColor: listExtraData.foregroundColor,
    fontFamily: listExtraData.fontFamily,
    fontSize: listExtraData.fontSize,
    mergeState,
    mutedColor,
    onResolveMergeConflict,
    primaryColor,
    resolvingMergeConflictKeys$,
    rowHeight,
    rowRenderer: listExtraData.rowRenderer,
    showOnlyHunks: listExtraData.showOnlyHunks,
    sideBySideFileHeaderByListIndex,
    sideBySideItemIndexes,
    syntaxAppearance,
    syntaxHighlightingEnabled: listExtraData.syntaxHighlightingEnabled,
    syntaxThemeName: listExtraData.syntaxTheme,
    unifiedItemIndexes: visibleItemIndexes,
    viewMode,
  });
  const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
  const sidebarListHeight = isSidebarLayoutReady ? Math.max(0, splitPaneMetrics.sidebarHeight - diffSidebarTopInset - diffSidebarFilterReservedHeight) : 0;
  const shouldRenderSidebarList = !sidebarCollapsed && isSidebarLayoutReady && sidebarListHeight > 0;
  const normalizedFileFilter = fileFilter.trim().toLowerCase();
  const filteredSidebarFiles = useMemo(
    () => {
      let files: readonly DiffFileSummary[] = [];
      if (shouldRenderSidebarList) {
        files = normalizedFileFilter
          ? state.files.filter((file) => fileMatchesFilter(file, normalizedFileFilter))
          : state.files;
      }
      return files;
    },
    [normalizedFileFilter, shouldRenderSidebarList, state.files],
  );
  const sidebarEntries = useMemo(
    () => shouldRenderSidebarList ? createDiffSidebarEntries(filteredSidebarFiles) : [],
    [filteredSidebarFiles, shouldRenderSidebarList],
  );
  const nativeUnifiedRows = listExtraData.rowRenderer === "native" && viewMode === "unified";
  const nativeSideBySideRows = listExtraData.rowRenderer === "native" && viewMode !== "unified";
  const adaptiveRender = adaptiveLightModeEnabled ? diffAdaptiveRender : undefined;
  const activeMergeFile = getActiveMergeFile({
    activeFileIndex,
    files: state.files,
    mergeState,
  });
  const shouldShowNoChanges = activeItemIndexes.length === 0 && !activeMergeFile;
  const requestUnifiedRange = nativeUnifiedRows ? noopVirtualizedDocumentRequestRange : diffRows.requestRange;
  const requestBlocksRange = nativeSideBySideRows ? noopVirtualizedDocumentRequestRange : requestSideBySideRange;
  const nativeRowConfig = nativeUnifiedRows ? nativeUnifiedRowConfig : nativeSideBySideRows ? nativeSideBySideRowConfig : null;
  const hasTopChrome = diffTopChromeHeight > 0;
  const listHeader = useMemo(() => (
    hasTopChrome ? undefined : <View style={styles.diffTitlebarSpacer} />
  ), [hasTopChrome]);
  const listHeaderHeight = hasTopChrome ? 0 : diffTitlebarTopInset;
  const sideBySideLineOverscan = Math.max(12, Math.floor(diffLineOverscan / 10));
  const diffListStyle = useMemo(
    () => [styles.list, { height: diffListHeight, minHeight: diffListHeight }],
    [diffListHeight],
  );
  const getUnifiedItemSize = useCallback(
    (index: number) => inlineMergeModel.getItemSize(index, getItemSize),
    [getItemSize, inlineMergeModel],
  );
  const getUnifiedItemType = useCallback(
    (index: number) => inlineMergeModel.getItemType(index, getItemType),
    [getItemType, inlineMergeModel],
  );
  const getUnifiedRow = useCallback(
    (index: number) => inlineMergeModel.getInlineMergeRow(index) ?? (nativeUnifiedRows ? undefined : getRow(index)),
    [getRow, inlineMergeModel, nativeUnifiedRows],
  );
  const handleUnifiedTopItemChanged = useCallback((index: number) => {
    const mergeRow = inlineMergeModel.getInlineMergeRow(index);
    if (mergeRow) {
      activeFileIndex$.set(mergeRow.sourceFileIndex);
    } else {
      handleTopItemChanged(index);
    }
  }, [activeFileIndex$, handleTopItemChanged, inlineMergeModel]);
  const renderUnifiedRow = useCallback(
    (props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow | DiffInlineMergeRow>) => (
      inlineMergeModel.getInlineMergeRow(props.index)
        ? inlineMergeModel.renderMergeRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>)
        : renderRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>)
    ),
    [inlineMergeModel, renderRow],
  );
  const getSideBySideListItemSize = useCallback(
    (index: number) => inlineMergeModel.getItemSize(index, getSideBySideItemSize),
    [getSideBySideItemSize, inlineMergeModel],
  );
  const getSideBySideListItemType = useCallback(
    (index: number) => inlineMergeModel.getItemType(index, getSideBySideItemType),
    [getSideBySideItemType, inlineMergeModel],
  );
  const getSideBySideListRow = useCallback(
    (index: number) => inlineMergeModel.getInlineMergeRow(index) ?? (nativeSideBySideRows ? undefined : getSideBySideRow(index)),
    [getSideBySideRow, inlineMergeModel, nativeSideBySideRows],
  );
  const handleSideBySideListTopItemChanged = useCallback((index: number) => {
    const mergeRow = inlineMergeModel.getInlineMergeRow(index);
    if (mergeRow) {
      activeFileIndex$.set(mergeRow.sourceFileIndex);
    } else {
      handleSideBySideTopItemChanged(index);
    }
  }, [activeFileIndex$, handleSideBySideTopItemChanged, inlineMergeModel]);
  const renderSideBySideListRow = useCallback(
    (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow | DiffInlineMergeRow>) => (
      inlineMergeModel.getInlineMergeRow(props.index)
        ? inlineMergeModel.renderMergeRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>)
        : renderSideBySideRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>)
    ),
    [inlineMergeModel, renderSideBySideRow],
  );

  logDiffOpenTiming("viewer.body.start", () => ({
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
  }));

  const logBodyFinish = (path: string, extra?: Record<string, unknown>) => {
    logDiffOpenTiming("viewer.body.finish", () => ({
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
    }));
  };

  let diffContent: ReactElement;
  if (diffListHeight <= 0) {
    logDiffOpenTiming("viewer.body.diffList.deferred", () => ({
      activeItemCount: activeItemIndexes.length,
      diffPaneHeight,
      isRenderingInitialLoadedFrame,
      rows: state.document.rowCount,
      viewMode,
    }));
    diffContent = <View style={styles.diffPaneContent} />;
  } else {
    logDiffOpenTiming("viewer.body.diffList.mount", () => ({
      activeItemCount: activeItemIndexes.length,
      diffListHeight,
      rows: state.document.rowCount,
      viewMode,
    }));
    let contentBody: ReactElement;
    if (shouldShowNoChanges) {
      contentBody = noChangesBody;
    } else if (viewMode === "unified") {
      contentBody = (
        <VirtualizedFixedDocumentList
          adaptiveRender={adaptiveRender}
          dataVersion={`${diffRows.dataVersion}:${inlineMergeModel.dataVersion}`}
          debugName="diff-unified-list"
          estimatedItemSize={rowHeight}
          key="unified"
          extraData={listExtraData}
          itemIndexes={inlineMergeModel.itemIndexes}
          itemKeyVersion={state.document.documentId}
          ListHeaderComponent={listHeader}
          getDocumentIndex={inlineMergeModel.getDocumentIndex}
          getItemSize={getUnifiedItemSize}
          getItemType={getUnifiedItemType}
          listHeaderHeight={listHeaderHeight}
          lineOverscan={diffLineOverscan}
          listRef={listRef}
          onTopItemChanged={handleUnifiedTopItemChanged}
          onVisibleRowsRequested={handleVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={requestUnifiedRange}
          requestRangesOnScroll
          getRow={getUnifiedRow}
          rowHeight={rowHeight}
          renderRow={renderUnifiedRow}
          style={diffListStyle}
        />
      );
    } else {
      contentBody = (
        <VirtualizedFixedDocumentList
          adaptiveRender={adaptiveRender}
          dataVersion={`${sideBySideDataVersion}:${inlineMergeModel.dataVersion}`}
          debugName="diff-side-by-side-list"
          estimatedItemSize={rowHeight}
          key={viewMode}
          extraData={listExtraData}
          itemIndexes={inlineMergeModel.itemIndexes}
          itemKeyVersion={state.document.documentId}
          ListHeaderComponent={listHeader}
          getDocumentIndex={inlineMergeModel.getDocumentIndex}
          getItemSize={getSideBySideListItemSize}
          getItemType={getSideBySideListItemType}
          getRow={getSideBySideListRow}
          listHeaderHeight={listHeaderHeight}
          lineOverscan={sideBySideLineOverscan}
          listRef={listRef}
          onTopItemChanged={handleSideBySideListTopItemChanged}
          onVisibleRowsRequested={handleSideBySideVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={requestBlocksRange}
          requestRangesOnScroll
          rowHeight={rowHeight}
          renderRow={renderSideBySideListRow}
          style={diffListStyle}
        />
      );
    }

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
        {hasTopChrome ? (
          <View style={[styles.diffPaneTopChrome, { height: diffTopChromeHeight, minHeight: diffTopChromeHeight }]}>
            {documentErrorBody}
          </View>
        ) : null}
        {nativeRowConfig && !shouldShowNoChanges ? (
          <DiffNativeRowConfigView
            nativeRowConfig={nativeRowConfig}
            syntaxTokenizationVersion$={syntaxTokenizationVersion$}
          />
        ) : null}
        {contentBody}
      </View>
    );
  }

  logDiffOpenTiming("viewer.body.splitView.mount", () => ({
    activeItemCount: activeItemIndexes.length,
    diffPaneHeight,
    rows: state.document.rowCount,
    sidebarLayoutReady: isSidebarLayoutReady,
    sidebarCollapsed,
    sidebarHeight: splitPaneMetrics.sidebarHeight,
    sidebarListHeight,
    sidebarWidth: splitPaneMetrics.sidebarWidth,
    viewMode,
  }));
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
      <TextInputSearch
        appearance={syntaxAppearance}
        defaultValue={fileFilter}
        onChangeText={setFileFilter}
        placeholder="Filter files"
        ref={fileFilterInputRef}
        style={styles.sidebarFilter}
      />
      {shouldRenderSidebarList ? (
        filteredSidebarFiles.length > 0 ? (
          <LegendList
            data={sidebarEntries}
            estimatedItemSize={diffSidebarFileRowHeight}
            getFixedItemSize={() => diffSidebarFileRowHeight}
            getItemType={(entry) => entry.type}
            keyExtractor={(entry) => entry.id}
            onLayout={handleSidebarListLayout}
            recycleItems
            renderItem={renderSidebarEntry}
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
    <View style={styles.loadedRoot}>
      <SidebarSplitView
        appearance={syntaxAppearance}
        contentMinWidth={diffContentMinWidth}
        contentTitlebarHeight={diffTitlebarTopInset}
        contentTitlebarMaterial="glass"
        contentTitlebarOverlayColor={backgroundColor}
        contentTitlebarOverlayOpacity={syntaxAppearance === "dark" ? 0.72 : 0.82}
        onSplitViewDidResize={handleSplitViewResize}
        sidebarCollapsed={sidebarCollapsed}
        sidebarMinWidth={defaultDiffSidebarWidth}
        sidebarWidth={sidebarWidth}
        style={styles.content}
      >
        {sidebar}
        <View style={styles.diffWorkspace}>
          <View onLayout={handleDiffPaneLayout} style={styles.diffPane}>
            {diffContent}
            {floatingDocumentBanner}
          </View>
        </View>
      </SidebarSplitView>
    </View>
  );
});

function DiffNativeRowConfigView({
  nativeRowConfig,
  syntaxTokenizationVersion$,
}: {
  nativeRowConfig: DiffNativeRowConfigProps;
  syntaxTokenizationVersion$: Observable<number>;
}) {
  const tokenizationVersion = useValue(() => syntaxTokenizationVersion$.get());
  return (
    <DiffNativeRowConfig
      addAccentColor={nativeRowConfig.addAccentColor}
      addBackgroundColor={nativeRowConfig.addBackgroundColor}
      changeBarWidth={nativeRowConfig.changeBarWidth}
      collapsedFileIndexes={nativeRowConfig.collapsedFileIndexes}
      collapsable={false}
      configId={nativeRowConfig.configId}
      configVersion={nativeRowConfig.configVersion}
      dividerColor={nativeRowConfig.dividerColor}
      documentId={nativeRowConfig.documentId}
      fontFamily={nativeRowConfig.fontFamily}
      fontSize={nativeRowConfig.fontSize}
      foregroundColor={nativeRowConfig.foregroundColor}
      lineNumberWidth={nativeRowConfig.lineNumberWidth}
      markerWidth={nativeRowConfig.markerWidth}
      mutedColor={nativeRowConfig.mutedColor}
      presentation={nativeRowConfig.presentation}
      removeAccentColor={nativeRowConfig.removeAccentColor}
      removeBackgroundColor={nativeRowConfig.removeBackgroundColor}
      rowHeight={nativeRowConfig.rowHeight}
      style={styles.nativeDiffRowConfig}
      syntaxHighlightingEnabled={nativeRowConfig.syntaxHighlightingEnabled}
      themeName={nativeRowConfig.themeName}
      tokenizationVersion={tokenizationVersion}
    />
  );
}

function getMergeConflictFileForDiffFile(mergeState: DiffMergeState, file: DiffFileSummary | null) {
  if (mergeState.status !== "ready" || !file) {
    return null;
  }
  return mergeState.fileByPath.get(file.path) ?? (file.oldPath ? mergeState.fileByPath.get(file.oldPath) : undefined) ?? null;
}

function getActiveMergeFile({
  activeFileIndex,
  files,
  mergeState,
}: {
  activeFileIndex: number | null;
  files: DiffFileSummary[];
  mergeState: DiffMergeState;
}) {
  if (mergeState.status !== "ready") {
    return null;
  }
  const activeFile = getActiveDiffFile(files, activeFileIndex);
  return getMergeConflictFileForDiffFile(mergeState, activeFile);
}

function DiffMergeActionButton({
  borderColor,
  choice,
  disabled,
  file,
  label,
  onResolveMergeConflict,
  primaryColor,
  block,
}: {
  borderColor: string;
  block: DiffMergeConflictBlock;
  choice: DiffMergeConflictChoice;
  disabled: boolean;
  file: DiffMergeConflictFile;
  label: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
}) {
  const iconColor = disabled ? borderColor : primaryColor;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onResolveMergeConflict(file, block, choice)}
      style={[
        styles.mergeChoiceButton,
        {
          borderColor: disabled ? borderColor : primaryColor,
          opacity: disabled ? 0.48 : 1,
        },
      ]}
    >
      {choice === "both" ? (
        <View style={styles.mergeChoiceBothIcons}>
          <SFSymbol color={iconColor} name="arrow.left" size={12} />
          <SFSymbol color={iconColor} name="arrow.right" size={12} />
        </View>
      ) : (
        <SFSymbol color={iconColor} name={choice === "ours" ? "arrow.left" : "arrow.right"} size={14} />
      )}
    </Pressable>
  );
}

type DiffMergeSyntaxState = {
  configVersion: number;
  key: string;
  leftLines: readonly SyntaxRenderLine[];
  rightLines: readonly SyntaxRenderLine[];
  tokenStyleById: SyntaxStyleMap;
};

type DiffMergeSyntaxByPath = Record<string, DiffMergeSyntaxState | undefined>;

function createMergeSyntaxStyleMap(styles: readonly SyntaxStyle[]): SyntaxStyleMap {
  return new Map(styles.map((style) => [style.id, style]));
}

function encodeMergeNativeTokens(
  line: SyntaxRenderLine | undefined,
  tokenStyleById: SyntaxStyleMap,
  foregroundColor: string,
) {
  return line?.tokens.map((token) => {
    const tokenStyle = tokenStyleById.get(token.styleId);
    return [
      Math.max(0, Math.floor(token.startColumn)),
      Math.max(0, Math.floor(token.length)),
      tokenStyle?.foreground || foregroundColor,
      tokenStyle?.fontStyle ?? 0,
    ].join(",");
  }).join(";") ?? "";
}

function encodeMergeInlineHighlights(ranges: readonly { length: number; startColumn: number }[] | undefined) {
  return ranges?.map((range) => [
    Math.max(0, Math.floor(range.startColumn)),
    Math.max(0, Math.floor(range.length)),
  ].join(",")).join(";") ?? "";
}

function getMergeSyntaxLine(
  lines: readonly SyntaxRenderLine[] | undefined,
  index: number,
  text: string,
): SyntaxRenderLine {
  return lines?.[index] ?? {
    index,
    text,
    tokens: [],
  };
}

function getMergeControlRowByBlockKey(
  conflictRanges: readonly DiffMergeConflictRange[],
  file: DiffMergeConflictFile,
) {
  const rowByBlockKey = new Map<string, number>();
  for (const range of conflictRanges) {
    rowByBlockKey.set(getMergeConflictKey(file, range.block), Math.floor((range.startRow + range.endRow) / 2));
  }
  return rowByBlockKey;
}

function getFullMergeDisplayModel(file: DiffMergeConflictFile | null): DiffMergeDisplayModel {
  return file
    ? {
        conflictRanges: file.conflictRanges,
        rows: file.displayRows,
      }
    : {
        conflictRanges: [],
        rows: [],
      };
}

function DiffMergeHunkHeader({
  borderColor,
  fileHeaderBackgroundColor,
  fontFamily,
  fontSize,
  info,
  mutedColor,
}: {
  borderColor: string;
  fileHeaderBackgroundColor: string;
  fontFamily: string;
  fontSize: number;
  info: DiffMergeHunkHeaderInfo;
  mutedColor: string;
}) {
  return (
    <View style={[styles.mergeHunkHeader, { backgroundColor: fileHeaderBackgroundColor, borderColor }]}>
      <Text selectable={false} style={[styles.mergeHunkHeaderTitle, { color: mutedColor, fontFamily, fontSize }]}>
        Conflict {info.hunkNumber}: {info.lineLabel}
      </Text>
    </View>
  );
}

function getMergeConflictPalette(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark"
    ? {
        accent: "#ffc857",
        hunkBackground: "#6f5f2e",
        inlineBackground: "#8f5f1f",
        rowBackground: "#463f20",
      }
    : {
        accent: "#9a6400",
        hunkBackground: "#fff0c2",
        inlineBackground: "#ffffffd9",
        rowBackground: "#fff8e5",
      };
}

function getMergeSideColors(
  changeType: DiffMergeSideChangeType | undefined,
  isConflict: boolean,
  side: "left" | "right",
  mutedColor: string,
  syntaxAppearance: "dark" | "light",
) {
  const palette = getDiffRowPalette(syntaxAppearance);
  const conflictPalette = getMergeConflictPalette(syntaxAppearance);
  const isDelete = changeType === "delete" || (side === "left" && changeType === "modify");
  const isAdd = changeType === "add" || (side === "right" && changeType === "modify");
  const backgroundColor = isConflict
    ? conflictPalette.rowBackground
    : isDelete
      ? palette.removeBackground
      : isAdd
        ? palette.addBackground
        : "transparent";
  const lineNumberColor = isDelete
    ? palette.removeAccent
    : isAdd
      ? palette.addAccent
      : isConflict
        ? conflictPalette.accent
        : mutedColor;
  return {
    backgroundColor,
    lineNumberColor,
  };
}

function DiffMergeCodePane({
  backgroundColor,
  foregroundColor,
  fontFamily,
  fontSize,
  inlineHighlightColor,
  inlineHighlights,
  lineNumber,
  lineNumberWidth,
  mutedColor,
  nativeTokens,
  renderer,
  rowHeight,
  syntaxLine,
  text,
  tokenStyleById,
}: {
  backgroundColor: string;
  foregroundColor: string;
  fontFamily: string;
  fontSize: number;
  inlineHighlightColor: string;
  inlineHighlights: string;
  lineNumber?: number;
  lineNumberWidth: number;
  mutedColor: string;
  nativeTokens: string;
  renderer: DiffRowRendererSetting;
  rowHeight: number;
  syntaxLine: SyntaxRenderLine;
  text: string;
  tokenStyleById: SyntaxStyleMap;
}) {
  if (renderer === "native") {
    return (
      <DiffMergeNativePane
        configVersion={hashDiffNativeRowConfigVersion([
          fontFamily,
          fontSize,
          foregroundColor,
          backgroundColor,
          inlineHighlightColor,
          inlineHighlights,
          lineNumber,
          mutedColor,
          nativeTokens,
          rowHeight,
          text,
        ])}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        inlineHighlightColor={inlineHighlightColor}
        inlineHighlights={inlineHighlights}
        lineNumber={lineNumber ?? -1}
        lineNumberWidth={lineNumberWidth}
        mutedColor={mutedColor}
        rowHeight={rowHeight}
        style={[styles.mergeNativePane, { backgroundColor, height: rowHeight }]}
        text={text}
        tokens={nativeTokens}
      />
    );
  }

  return (
    <View style={[styles.mergeCodeLine, { backgroundColor, height: rowHeight }]}>
      <LightText numberOfLines={1} selectable={false} style={[styles.mergeLineNumber, { color: mutedColor, fontFamily, fontSize, lineHeight: rowHeight, width: lineNumberWidth }]}>
        {lineNumber ?? ""}
      </LightText>
      <TokenizedText
        foregroundColor={foregroundColor}
        line={syntaxLine}
        selectable={false}
        style={[styles.mergeCodeText, { fontFamily, fontSize, lineHeight: rowHeight }]}
        tokenStyleById={tokenStyleById}
      />
    </View>
  );
}

function DiffMergeCenterGutter({
  block,
  borderColor,
  file,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  resolvingMergeConflictKeys$,
}: {
  block: DiffMergeConflictBlock | null;
  borderColor: string;
  file: DiffMergeConflictFile;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  resolvingMergeConflictKeys$: Observable<ReadonlySet<string>>;
}) {
  const conflictKey = block ? getMergeConflictKey(file, block) : null;
  const resolvingState = useValue(() => {
    const resolvingKeys = resolvingMergeConflictKeys$.get();
    return (resolvingKeys.has(diffMergeSaveConflictKey) ? 1 : 0)
      | (conflictKey && resolvingKeys.has(conflictKey) ? 2 : 0);
  });
  const controlsDisabled = resolvingState !== 0;
  const isResolving = (resolvingState & 2) !== 0;
  return (
    <View style={[styles.mergeCommonMiddle, { borderColor }]}>
      {block ? (
        <View style={styles.mergeChoiceColumn}>
          <DiffMergeActionButton
            block={block}
            borderColor={borderColor}
            choice="ours"
            disabled={controlsDisabled}
            file={file}
            label="A"
            onResolveMergeConflict={onResolveMergeConflict}
            primaryColor={primaryColor}
          />
          <DiffMergeActionButton
            block={block}
            borderColor={borderColor}
            choice="theirs"
            disabled={controlsDisabled}
            file={file}
            label="B"
            onResolveMergeConflict={onResolveMergeConflict}
            primaryColor={primaryColor}
          />
          <DiffMergeActionButton
            block={block}
            borderColor={borderColor}
            choice="both"
            disabled={controlsDisabled}
            file={file}
            label="Both"
            onResolveMergeConflict={onResolveMergeConflict}
            primaryColor={primaryColor}
          />
          {isResolving ? (
            <Text numberOfLines={1} style={[styles.mergeResolvingText, { color: mutedColor }]}>
              Applying
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function DiffMergeLineRow({
  borderColor,
  controlBlock,
  file,
  fileHeaderBackgroundColor,
  foregroundColor,
  fontFamily,
  fontSize,
  mergeSyntaxByPath$,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  renderer,
  resolvingMergeConflictKeys$,
  row,
  rowIndex,
  rowHeight,
  syntaxAppearance,
}: {
  borderColor: string;
  controlBlock: DiffMergeConflictBlock | null;
  file: DiffMergeConflictFile;
  fileHeaderBackgroundColor: string;
  foregroundColor: string;
  fontFamily: string;
  fontSize: number;
  mergeSyntaxByPath$: Observable<DiffMergeSyntaxByPath>;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  renderer: DiffRowRendererSetting;
  resolvingMergeConflictKeys$: Observable<ReadonlySet<string>>;
  row: DiffMergeDisplayRow | undefined;
  rowIndex: number;
  rowHeight: number;
  syntaxAppearance: "dark" | "light";
}) {
  const mergeSyntax = useValue(() => mergeSyntaxByPath$[file.path].get());
  const tokenStyleById = mergeSyntax?.tokenStyleById ?? new Map<number, SyntaxStyle>();
  const leftSyntaxLine = getMergeSyntaxLine(mergeSyntax?.leftLines, rowIndex, row?.leftText ?? "");
  const rightSyntaxLine = getMergeSyntaxLine(mergeSyntax?.rightLines, rowIndex, row?.rightText ?? "");
  const leftTokens = encodeMergeNativeTokens(leftSyntaxLine, tokenStyleById, foregroundColor);
  const rightTokens = encodeMergeNativeTokens(rightSyntaxLine, tokenStyleById, foregroundColor);
  const isConflictRow = row?.conflictBlock !== undefined;
  const leftColors = getMergeSideColors(row?.leftChangeType, isConflictRow, "left", mutedColor, syntaxAppearance);
  const rightColors = getMergeSideColors(row?.rightChangeType, isConflictRow, "right", mutedColor, syntaxAppearance);
  const conflictPalette = getMergeConflictPalette(syntaxAppearance);

  return (
    <>
      {row?.hunkHeader ? (
        <DiffMergeHunkHeader
          borderColor={borderColor}
          fileHeaderBackgroundColor={fileHeaderBackgroundColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          info={row.hunkHeader}
          mutedColor={mutedColor}
        />
      ) : null}
      <View style={[styles.mergeCommonRow, { height: rowHeight }]}>
        <View style={styles.mergeCommonPane}>
          <DiffMergeCodePane
            backgroundColor={leftColors.backgroundColor}
            foregroundColor={foregroundColor}
            fontFamily={fontFamily}
            fontSize={fontSize}
            inlineHighlightColor={conflictPalette.inlineBackground}
            inlineHighlights={encodeMergeInlineHighlights(row?.leftInlineChangeRanges)}
            lineNumber={row?.leftLineNumber}
            lineNumberWidth={diffSideBySideLineNumberWidth}
            mutedColor={leftColors.lineNumberColor}
            nativeTokens={leftTokens}
            renderer={renderer}
            rowHeight={rowHeight}
            syntaxLine={leftSyntaxLine}
            text={row?.leftText ?? ""}
            tokenStyleById={tokenStyleById}
          />
        </View>
        <DiffMergeCenterGutter
          block={controlBlock}
          borderColor={borderColor}
          file={file}
          mutedColor={mutedColor}
          onResolveMergeConflict={onResolveMergeConflict}
          primaryColor={primaryColor}
          resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}
        />
        <View style={styles.mergeCommonPane}>
          <DiffMergeCodePane
            backgroundColor={rightColors.backgroundColor}
            foregroundColor={foregroundColor}
            fontFamily={fontFamily}
            fontSize={fontSize}
            inlineHighlightColor={conflictPalette.inlineBackground}
            inlineHighlights={encodeMergeInlineHighlights(row?.rightInlineChangeRanges)}
            lineNumber={row?.rightLineNumber}
            lineNumberWidth={diffSideBySideLineNumberWidth}
            mutedColor={rightColors.lineNumberColor}
            nativeTokens={rightTokens}
            renderer={renderer}
            rowHeight={rowHeight}
            syntaxLine={rightSyntaxLine}
            text={row?.rightText ?? ""}
            tokenStyleById={tokenStyleById}
          />
        </View>
      </View>
    </>
  );
}

function useDiffInlineMergeModel({
  borderColor,
  collapsedFileIndexes,
  fileHeaderBackgroundColor,
  files,
  foregroundColor,
  fontFamily,
  fontSize,
  mergeState,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  resolvingMergeConflictKeys$,
  rowRenderer,
  rowHeight,
  showOnlyHunks,
  sideBySideFileHeaderByListIndex,
  sideBySideItemIndexes,
  syntaxAppearance,
  syntaxHighlightingEnabled,
  syntaxThemeName,
  unifiedItemIndexes,
  viewMode,
}: {
  borderColor: string;
  collapsedFileIndexes: ReadonlySet<number>;
  fileHeaderBackgroundColor: string;
  files: readonly DiffFileSummary[];
  foregroundColor: string;
  fontFamily: string;
  fontSize: number;
  mergeState: DiffMergeState;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  resolvingMergeConflictKeys$: Observable<ReadonlySet<string>>;
  rowRenderer: DiffRowRendererSetting;
  rowHeight: number;
  showOnlyHunks: boolean;
  sideBySideFileHeaderByListIndex: Map<number, DiffSideBySideFileHeader>;
  sideBySideItemIndexes: Array<number | undefined>;
  syntaxAppearance: "dark" | "light";
  syntaxHighlightingEnabled: boolean;
  syntaxThemeName: string;
  unifiedItemIndexes: Array<number | undefined>;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
}) {
  const mergeSyntaxByPath$ = useObservable<DiffMergeSyntaxByPath>({});
  const mergeDisplayModelByPath = useMemo(() => {
    const map = new Map<string, DiffMergeDisplayModel>();
    if (mergeState.status === "ready") {
      for (const file of mergeState.files) {
        const fullModel = getFullMergeDisplayModel(file);
        map.set(
          file.path,
          showOnlyHunks
            ? createDiffMergeHunkDisplayModel(fullModel.rows, fullModel.conflictRanges)
            : fullModel,
        );
      }
    }
    return map;
  }, [mergeState, showOnlyHunks]);
  const dataVersion = useMemo(() => {
    if (mergeState.status !== "ready" || mergeState.files.length === 0) {
      return "merge:none";
    }
    return mergeState.files.map((file) => {
      const model = mergeDisplayModelByPath.get(file.path);
      return `${file.path}:${file.displayRows.length}:${file.markerBlocks.length}:${file.hasUnsavedDraft ? "draft" : "saved"}:${model?.rows.length ?? 0}`;
    }).join("|");
  }, [mergeDisplayModelByPath, mergeState]);
  const controlRowByFilePath = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    if (mergeState.status === "ready") {
      for (const file of mergeState.files) {
        const model = mergeDisplayModelByPath.get(file.path);
        if (model) {
          map.set(file.path, getMergeControlRowByBlockKey(model.conflictRanges, file));
        }
      }
    }
    return map;
  }, [mergeDisplayModelByPath, mergeState]);

  const emptyMergeFileByPath = useMemo(() => new Map<string, DiffMergeConflictFile>(), []);
  const mergeFileByPath = mergeState.status === "ready" ? mergeState.fileByPath : emptyMergeFileByPath;
  const inlineList = useMemo(
    () => createDiffInlineMergeList({
      collapsedFileIndexes,
      files,
      mergeDisplayModelByPath,
      mergeFileByPath,
      sideBySideFileHeaderByListIndex,
      sideBySideItemIndexes,
      unifiedItemIndexes,
      viewMode,
    }),
    [
      collapsedFileIndexes,
      files,
      mergeDisplayModelByPath,
      mergeFileByPath,
      sideBySideFileHeaderByListIndex,
      sideBySideItemIndexes,
      unifiedItemIndexes,
      viewMode,
    ],
  );

  const getInlineMergeRow = useCallback((index: number) => inlineList.rowByItemIndex.get(index), [inlineList]);
  const getDocumentIndex = useCallback((index: number) => {
    const mergeRow = inlineList.rowByItemIndex.get(index);
    return mergeRow?.sourceRowIndex ?? inlineList.sourceRowByItemIndex.get(index) ?? index;
  }, [inlineList]);
  const getItemSize = useCallback((index: number, getNormalItemSize: (index: number) => number) => {
    const mergeRow = inlineList.rowByItemIndex.get(index);
    return mergeRow
      ? rowHeight + (mergeRow.row.hunkHeader ? diffHunkHeaderHeight : 0)
      : getNormalItemSize(index);
  }, [inlineList, rowHeight]);
  const getItemType = useCallback((index: number, getNormalItemType: (index: number) => string) => (
    inlineList.rowByItemIndex.has(index) ? "merge-line" : getNormalItemType(index)
  ), [inlineList]);
  const renderMergeRow = useCallback(
    ({ index }: VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>) => {
      const mergeRow = inlineList.rowByItemIndex.get(index);
      if (!mergeRow) {
        return <View style={{ height: rowHeight }} />;
      }
      const { file, row: displayRow, rowIndex } = mergeRow;
      const controlRowByBlockKey = controlRowByFilePath.get(file.path) ?? new Map<string, number>();
      const controlBlock = displayRow?.conflictBlock
        && controlRowByBlockKey.get(getMergeConflictKey(file, displayRow.conflictBlock)) === rowIndex
        ? displayRow.conflictBlock
        : null;
      return (
        <DiffMergeLineRow
          borderColor={borderColor}
          controlBlock={controlBlock}
          file={file}
          fileHeaderBackgroundColor={fileHeaderBackgroundColor}
          foregroundColor={foregroundColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          mergeSyntaxByPath$={mergeSyntaxByPath$}
          mutedColor={mutedColor}
          onResolveMergeConflict={onResolveMergeConflict}
          primaryColor={primaryColor}
          renderer={rowRenderer}
          resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}
          row={displayRow}
          rowIndex={rowIndex}
          rowHeight={rowHeight}
          syntaxAppearance={syntaxAppearance}
        />
      );
    },
    [borderColor, controlRowByFilePath, fileHeaderBackgroundColor, fontFamily, fontSize, foregroundColor, inlineList, mergeSyntaxByPath$, mutedColor, onResolveMergeConflict, primaryColor, resolvingMergeConflictKeys$, rowHeight, rowRenderer, syntaxAppearance],
  );

  useEffect(() => {
    if (mergeState.status !== "ready" || !syntaxHighlightingEnabled || mergeState.files.length === 0) {
      mergeSyntaxByPath$.set({});
      return;
    }

    let cancelled = false;
    const filesToHighlight = mergeState.files.filter((file) => (mergeDisplayModelByPath.get(file.path)?.rows.length ?? 0) > 0);
    ensureSyntaxGrammarsForPaths(filesToHighlight.map((file) => file.path))
      .then(() => Promise.all(filesToHighlight.map(async (file) => {
        const model = mergeDisplayModelByPath.get(file.path);
        const language = getSyntaxLanguageForPath(file.path);
        const leftSource = model?.rows.map((row) => row.leftText).join("\n") ?? "";
        const rightSource = model?.rows.map((row) => row.rightText).join("\n") ?? "";
        const [leftResult, rightResult] = await Promise.all([
          highlightString(leftSource, language, syntaxThemeName),
          highlightString(rightSource, language, syntaxThemeName),
        ]);
        return { file, leftResult, rightResult };
      })))
      .then((results) => {
        if (!cancelled) {
          const nextSyntaxByPath: DiffMergeSyntaxByPath = {};
          results.forEach(({ file, leftResult, rightResult }) => {
            const styles = [...leftResult.styles, ...rightResult.styles];
            const syntaxKey = `${dataVersion}:${file.path}:${syntaxThemeName}`;
            nextSyntaxByPath[file.path] = {
              configVersion: hashDiffNativeRowConfigVersion([syntaxKey, styles.length]),
              key: syntaxKey,
              leftLines: leftResult.lines,
              rightLines: rightResult.lines,
              tokenStyleById: createMergeSyntaxStyleMap(styles),
            };
          });
          mergeSyntaxByPath$.set(nextSyntaxByPath);
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.error(error instanceof Error ? error.message : String(error));
          mergeSyntaxByPath$.set({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataVersion, mergeDisplayModelByPath, mergeState, mergeSyntaxByPath$, syntaxHighlightingEnabled, syntaxThemeName]);

  const emptyMessage = mergeState.status === "loading"
    ? "Checking merge conflicts..."
    : mergeState.status === "error"
      ? mergeState.message
      : mergeState.status === "ready"
        ? "No unresolved marker blocks in this file."
        : mergeState.reason;

  return {
    dataVersion,
    emptyMessage,
    getDocumentIndex,
    getInlineMergeRow,
    getItemSize,
    getItemType,
    itemIndexes: inlineList.itemIndexes,
    renderMergeRow,
  };
}

function DiffDropSurface({
  backgroundColor,
  borderColor,
  children,
  foregroundColor,
  mutedColor,
  onDropDiff,
  syntaxAppearance,
}: {
  backgroundColor: string;
  borderColor: string;
  children: ReactNode;
  foregroundColor: string;
  mutedColor: string;
  onDropDiff: (event: DragDropFileEvent) => void;
  syntaxAppearance: "dark" | "light";
}) {
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const handleDragEnter = useCallback(() => {
    setIsDropTargetActive(true);
  }, []);
  const handleDragLeave = useCallback(() => {
    setIsDropTargetActive(false);
  }, []);
  const handleDrop = useCallback(({ nativeEvent }: { nativeEvent: DragDropFileEvent }) => {
    setIsDropTargetActive(false);
    onDropDiff(nativeEvent);
  }, [onDropDiff]);

  return (
    <DragDropView
      allowedFileTypes={diffDropAllowedFileTypes}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={[styles.root, { backgroundColor }]}
    >
      {children}
      {isDropTargetActive ? (
        <View
          pointerEvents="none"
          style={[
            styles.dropOverlay,
            {
              backgroundColor: syntaxAppearance === "dark" ? "rgba(88, 166, 255, 0.14)" : "rgba(9, 105, 218, 0.12)",
              borderColor,
            },
          ]}
        >
          <Text style={[styles.dropOverlayTitle, { color: foregroundColor }]}>
            Open Diff
          </Text>
          <Text style={[styles.dropOverlayText, { color: mutedColor }]}>
            Drop a folder, .diff file, or two files
          </Text>
        </View>
      ) : null}
    </DragDropView>
  );
}

function formatStatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.floor(value)));
}

function formatStatTime(value: number) {
  return `${Math.max(0, value).toFixed(1)} ms`;
}

function DiffStatisticsPanel({
  borderColor,
  foregroundColor,
  mutedColor,
  syntaxAppearance,
}: {
  borderColor: string;
  foregroundColor: string;
  mutedColor: string;
  syntaxAppearance: "dark" | "light";
}) {
  const showStatisticsPanel = useDiffShowStatisticsPanelSetting();
  const {
    loadStatistics$,
    state$,
  } = useDiffViewerModel();
  const state = useValue(state$);
  const statistics = useValue(loadStatistics$);

  if (!showStatisticsPanel || state.status !== "loaded" || !statistics) {
    return null;
  }

  const rows = state.document.rowCount;
  const files = state.files.length;
  const loadComplete = state.loadComplete !== false;
  const panelBackgroundColor = syntaxAppearance === "dark" ? "rgba(16, 20, 26, 0.92)" : "rgba(255, 255, 255, 0.94)";

  return (
    <View
      pointerEvents="none"
      style={[
        styles.statisticsPanel,
        {
          backgroundColor: panelBackgroundColor,
          borderColor,
        },
      ]}
    >
      <Text style={[styles.statisticsTitle, { color: foregroundColor }]}>
        Statistics
      </Text>
      <View style={styles.statisticsRows}>
        {statistics.downloadMs > 0 ? (
          <View style={styles.statisticsRow}>
            <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Download</Text>
            <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatTime(statistics.downloadMs)}</Text>
          </View>
        ) : null}
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Initial UI paint</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatTime(statistics.firstPaintMs)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Native/session total</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatTime(statistics.nativeTotalMs)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Files</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatNumber(files)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>Rows</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{formatStatNumber(rows)}</Text>
        </View>
        <View style={styles.statisticsRow}>
          <Text style={[styles.statisticsLabel, { color: mutedColor }]}>State</Text>
          <Text style={[styles.statisticsValue, { color: foregroundColor }]}>{loadComplete ? "Complete" : "Loading"}</Text>
        </View>
      </View>
    </View>
  );
}

function DiffCompareRefPrompt({
  backgroundColor,
  borderColor,
  foregroundColor,
  mutedColor,
  onCancel,
  onChangeValue,
  onSubmit,
  value,
}: {
  backgroundColor: string;
  borderColor: string;
  foregroundColor: string;
  mutedColor: string;
  onCancel: () => void;
  onChangeValue: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  return (
    <View style={styles.compareRefPromptOverlay}>
      <Pressable accessibilityLabel="Cancel compare ref" onPress={onCancel} style={StyleSheet.absoluteFill} />
      <View style={[styles.compareRefPrompt, { backgroundColor, borderColor }]}>
        <Text style={[styles.compareRefPromptTitle, { color: foregroundColor }]}>Compare Against</Text>
        <TextInput
          autoFocus
          onChangeText={onChangeValue}
          onSubmitEditing={onSubmit}
          placeholder="Branch, tag, commit, or ref"
          placeholderTextColor={mutedColor}
          returnKeyType="go"
          selectionColor={foregroundColor}
          style={[styles.compareRefPromptInput, { borderColor, color: foregroundColor }]}
          value={value}
        />
        <View style={styles.compareRefPromptActions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.compareRefPromptButton, { borderColor }]}>
            <Text style={[styles.compareRefPromptButtonText, { color: foregroundColor }]}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSubmit} style={[styles.compareRefPromptButton, { borderColor }]}>
            <Text style={[styles.compareRefPromptButtonText, { color: foregroundColor }]}>Compare</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function DiffViewerWindow(props: DiffViewerWindowProps) {
  return (
    <DiffViewerModelProvider>
      <DiffViewerWindowContent {...props} />
    </DiffViewerModelProvider>
  );
}

function DiffViewerWindowContent({ focusUrlInputRequestId, folderPath, source }: DiffViewerWindowProps) {
  const windowIdentifier = useWindowId();
  const renderCountRef = useRef(0);
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const adaptiveLightModeEnabled = useDiffAdaptiveLightModeEnabledSetting();
  const rowHeight = getDiffLineRowHeight(fontSize);
  const rowRenderer = useDiffRowRendererSetting();
  const showOnlyHunks = useDiffShowOnlyHunksSetting();
  const sidebarWidth = useDiffSidebarWidthSetting();
  const viewMode = useDiffViewModeSetting();
  const syntaxTheme = useDiffSyntaxTheme();
  const syntaxHighlightingEnabled = useDiffSyntaxHighlightingEnabledSetting();
  const nativeUnifiedRows = rowRenderer === "native" && viewMode === "unified";
  const nativeSideBySideRows = rowRenderer === "native" && viewMode !== "unified";
  const nativeDiffRows = nativeUnifiedRows || nativeSideBySideRows;
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const model = useDiffViewerModel();
  const {
    activeFileIndex$,
    collapsedFileIndexes$,
    diffPaneHeight$,
    documentError$,
    loadingSource$,
    mergeState$,
    openError$,
    setCollapsedFileIndexesValue,
    setDiffPaneHeightValue,
    setDocumentErrorValue,
    setLoadProgressValue,
    setLoadStatisticsValue,
    setLoadingSourceValue,
    setMergeStateValue,
    setOpenErrorValue,
    setSidebarCollapsedValue,
    setSplitPaneMetricsValue,
    setUrlInputErrorValue,
    setUrlInputValue,
    setViewerState,
    sidebarCollapsed$,
    splitPaneMetrics$,
    state$,
    urlInput$,
    urlInputError$,
  } = model;
  const state = useValue(state$);
  const documentError = useValue(documentError$);
  const loadingSource = useValue(loadingSource$);
  const mergeState = useValue(mergeState$);
  const sidebarCollapsed = useValue(sidebarCollapsed$);
  const collapsedFileIndexes = useValue(collapsedFileIndexes$);
  const unsavedMergeDraftFiles = useMemo(() => getUnsavedDiffMergeDraftFiles(mergeState), [mergeState]);
  const hasUnsavedMergeDrafts = unsavedMergeDraftFiles.length > 0;
  const collapsedFileIndexesKey = useMemo(
    () => [...collapsedFileIndexes].sort((left, right) => left - right).join(","),
    [collapsedFileIndexes],
  );
  const listRef = useRef<VirtualizedFixedDocumentListRef | null>(null);
  const fileFilterInputRef = useRef<TextInputSearchRef | null>(null);
  const urlInputRef = useRef<TextInput | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadTraceRef = useRef<DiffLoadTrace | null>(null);
  const loadedCacheRef = useRef(new Map<string, DiffLoadedCacheEntry>());
  const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
  const preserveActiveFilePathRef = useRef<string | null>(null);
  const loggedFirstSidebarFileRenderRef = useRef(false);
  const loggedFirstUnifiedRowRenderRef = useRef(false);
  const loggedFirstSideBySideRowRenderRef = useRef(false);
  const mergeDraftsRef = useRef(new Map<string, DiffMergeDraftFile>());
  const mergeDraftsSourceKeyRef = useRef<string | null>(null);
  const savingMergeDraftsRef = useRef(false);
  const suppressFileWatcherReloadUntilRef = useRef(0);
  const syntaxTokenizationVersion$ = useObservable(0);
  const resolvingMergeConflictKeys$ = useObservable<ReadonlySet<string>>(new Set());
  const resolvingMergeConflictKeysRef = useRef<ReadonlySet<string>>(new Set());
  const mergeResolveQueuesRef = useRef(new Map<string, DiffMergeFileResolveQueue>());
  const [compareRepoState, setCompareRepoState] = useState<DiffCompareRepoState | null>(null);
  const [compareRefPromptVisible, setCompareRefPromptVisible] = useState(false);
  const [compareRefInput, setCompareRefInput] = useState("");

  const setResolvingMergeConflictKeyActive = useCallback((key: string, active: boolean) => {
    const currentKeys = resolvingMergeConflictKeysRef.current;
    if (currentKeys.has(key) !== active) {
      const nextKeys = new Set(currentKeys);
      if (active) {
        nextKeys.add(key);
      } else {
        nextKeys.delete(key);
      }
      resolvingMergeConflictKeysRef.current = nextKeys;
      resolvingMergeConflictKeys$.set(nextKeys);
    }
  }, [resolvingMergeConflictKeys$]);

  const waitForMergeResolveQueues = useCallback(async () => {
    const queues = [...mergeResolveQueuesRef.current.values()];
    if (queues.length > 0) {
      await Promise.all(queues.map((queue) => queue.chain.catch(() => undefined)));
    }
  }, []);
  const isLoading = loadingSource !== null;
  const isRenderingInitialLoadedFrame =
    state.status === "loaded" &&
    sourcesMatch(loadingSource, state.source);
  const renderViewMode = viewMode;
  const loggedInitialLoadedFrameRef = useRef<boolean | null>(null);
  const visibleSourceModel = getDiffVisibleSourceModel(state, loadingSource);
  const { loadedFileCount, showSidebarControl, showViewModeToolbar, toolbarSource, visibleFolderPath, visibleSource, visibleSourceLabel } = visibleSourceModel;
  const compareRepoPath = toolbarSource?.kind === "folder"
    ? toolbarSource.value
    : toolbarSource?.kind === "git"
      ? toolbarSource.cwd
      : null;

  useEffect(() => {
    let cancelled = false;
    if (!compareRepoPath) {
      setCompareRepoState(null);
    } else {
      loadDiffCompareRepoState(compareRepoPath)
        .then((nextState) => {
          if (!cancelled) {
            setCompareRepoState(nextState);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            console.error(`Unable to load diff compare targets: ${getErrorMessage(error)}`);
            setCompareRepoState({
              currentBranch: null,
              defaultBranch: null,
              localBranches: [],
              remoteBranches: [],
              repoPath: compareRepoPath,
              upstreamBranch: null,
            });
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [compareRepoPath]);

  const diffPalette = useMemo(
    () => getDiffPalette(syntaxTheme, displayTheme.colors),
    [
      displayTheme.colors.border,
      displayTheme.colors.danger,
      displayTheme.colors.muted,
      displayTheme.colors.primary,
      displayTheme.colors.surface,
      displayTheme.colors.surfaceMuted,
      syntaxTheme.appearance,
      syntaxTheme.background,
      syntaxTheme.foreground,
    ],
  );
  const backgroundColor = diffPalette.background;
  const foregroundColor = diffPalette.foreground;
  const fileHeaderBackgroundColor = diffPalette.fileHeaderBackground;
  const hunkHeaderBackgroundColor = diffPalette.hunkHeaderBackground;
  const mutedColor = diffPalette.muted;
  const sidebarFolderColor = diffPalette.sidebarFolder;
  const selectedSidebarFileBackgroundColor = diffPalette.sidebarSelectedBackground;
  const sidebarConflictBadgeBackgroundColor = diffPalette.sidebarConflictBadgeBackground;
  const sidebarConflictBadgeTextColor = diffPalette.sidebarConflictBadgeText;
  const loadedDocument = state.status === "loaded" ? state.document : null;
  const loadedDocumentId = loadedDocument?.documentId ?? 0;
  const loadedDocumentRowCount = loadedDocument ? Math.max(0, Math.floor(loadedDocument.rowCount)) : 0;
  const [itemCountLimitState, setItemCountLimitState] = useState<DiffItemCountLimitState | null>(null);
  const currentItemCountLimit = itemCountLimitState?.documentId === loadedDocumentId
    ? itemCountLimitState.limit
    : diffProgressiveInitialPaintRowCount;
  const initialItemCountLimit = loadedDocument !== null && loadedDocumentRowCount > diffProgressiveInitialPaintRowCount
    ? Math.min(loadedDocumentRowCount, currentItemCountLimit)
    : null;

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentLoadingSource = loadingSource$.get();
    const currentIsRenderingInitialLoadedFrame =
      currentState.status === "loaded" &&
      sourcesMatch(currentLoadingSource, currentState.source);
    if (currentState.status === "loaded" && loggedInitialLoadedFrameRef.current !== currentIsRenderingInitialLoadedFrame) {
      logDiffOpenTiming("viewer.initialLoadedFrame.state", () => ({
        isRenderingInitialLoadedFrame: currentIsRenderingInitialLoadedFrame,
        loadingSource: currentLoadingSource,
        rows: currentState.document.rowCount,
        source: currentState.source,
      }));
    }
    loggedInitialLoadedFrameRef.current = currentIsRenderingInitialLoadedFrame;
  });

  const {
    collapsedFileIndexList,
    diffRows,
    fileByIndex,
    fileByRowStart,
    fileHeaderRowIndexes,
    getRow,
    getVisibleListIndex,
    sideBySideFileHeaderIndexes,
    sideBySideFileHeaderByListIndex,
    sideBySideItemIndexes,
    sideBySideListIndexByRowIndex,
    sideBySideRowCount,
    syntaxStyleStore,
    visibleItemIndexes,
  } = useDiffLoadedModel({
    collapsedFileIndexes,
    fontFamily,
    fontSize,
    initialItemCountLimit,
    nativeUnifiedRows,
    rowHeight,
    state,
    syntaxHighlightingEnabled,
    syntaxThemeName: syntaxTheme.name,
    viewMode: renderViewMode,
  });
  const scheduleVisibleFileTokenization = useVisibleDiffFileTokenizationScheduler(syntaxHighlightingEnabled);
  useEffect(() => {
    if (loadedDocument) {
      return () => {
        loadedDocument.cancelTokenizationRequests("viewer.cleanup");
      };
    }
    return undefined;
  }, [loadedDocument]);
  const {
    getSideBySideRow,
    handleSideBySideTopItemChanged,
    handleSideBySideVisibleRowsRequested,
    requestSideBySideRange,
    resetSideBySideRuntime,
  } = useDiffSideBySideRuntime({
    activeFileIndex$,
    collapsedFileIndexes$,
    diffPaneHeight$,
    nativeSideBySideRows,
    rowHeight,
    sideBySideRowCount,
    state$,
    syntaxHighlightingEnabled,
    viewMode: renderViewMode,
  });

  const expandItemCountLimit = useCallback((documentId: number, requestedMinimum: number, reason: string) => {
    setItemCountLimitState((current) => {
      let nextState = current;
      if (loadedDocument !== null && loadedDocumentId === documentId && loadedDocumentRowCount > diffProgressiveInitialPaintRowCount) {
        const currentLimit = current?.documentId === documentId
          ? current.limit
          : diffProgressiveInitialPaintRowCount;
        const nextLimit = Math.min(
          loadedDocumentRowCount,
          Math.max(
            Math.ceil(requestedMinimum),
            currentLimit + diffProgressiveItemCountExpandChunkRowCount,
          ),
        );

        if (nextLimit > currentLimit) {
          nextState = {
            documentId,
            limit: nextLimit,
          };
          logDiffOpenTiming("viewer.itemCountLimit.expand", () => ({
            currentLimit,
            documentId,
            nextLimit,
            reason,
            rows: loadedDocumentRowCount,
          }));
        }
      }
      return nextState;
    });
  }, [loadedDocument, loadedDocumentId, loadedDocumentRowCount]);

  const maybeExpandItemCountLimitForVisibleRange = useCallback((start: number, count: number, reason: string) => {
    if (loadedDocument !== null && initialItemCountLimit !== null) {
      const visibleEnd = Math.max(0, Math.floor(start)) + Math.max(0, Math.ceil(count));
      const requestedMinimum = visibleEnd + diffProgressiveItemCountExpandThresholdRows;
      if (requestedMinimum >= initialItemCountLimit) {
        expandItemCountLimit(loadedDocumentId, requestedMinimum, reason);
      }
    }
  }, [expandItemCountLimit, initialItemCountLimit, loadedDocument, loadedDocumentId]);

  const prewarmItemCountLimit = useCallback((documentId: number, reason: "side-by-side-row-render" | "unified-row-render") => {
    requestAnimationFrame(() => {
      logDiffOpenTiming("viewer.itemCountLimit.firstPaint", () => ({
        documentId,
        limit: initialItemCountLimit,
        reason,
        rows: loadedDocumentRowCount,
      }));
      setTimeout(() => {
        expandItemCountLimit(documentId, diffProgressiveItemCountPrewarmRowCount, `${reason}:prewarm`);
      }, diffProgressiveItemCountPrewarmDelayMs);
    });
  }, [expandItemCountLimit, initialItemCountLimit, loadedDocumentRowCount]);

  useEffect(() => {
    if (state.status === "loaded" && state.loadComplete !== false) {
      const document = state.document;
      if (syntaxHighlightingEnabled) {
        let cancelled = false;
        let startTimeout: ReturnType<typeof setTimeout> | undefined;
        const startedAt = nowMs();
        startTimeout = setTimeout(() => {
          const backgroundPlan = getBackgroundTokenizationPlan(state.files);
          if (backgroundPlan.files.length > 0 && backgroundPlan.rowLimit > 0) {
            const backgroundFiles = backgroundPlan.files;
            const filePaths = backgroundFiles.map((file) => file.path);
            ensureSyntaxGrammarsForPaths(filePaths)
              .then(() => {
                if (!cancelled) {
                  document.startBackgroundTokenization(
                    diffBackgroundTokenizeChunkRowCount,
                    diffBackgroundTokenizeChunkBudgetMs,
                    backgroundPlan.rowLimit,
                    backgroundPlan.sourceLineCount,
                  );
                  logDiffMemoryMark("viewer.syntaxTokenization.start", () => ({
                    durationMs: Number((nowMs() - startedAt).toFixed(1)),
                    files: backgroundFiles.length,
                    rowLimit: backgroundPlan.rowLimit,
                    rows: document.rowCount,
                    scopes: document.scopeCount,
                    sourceLineBudget: diffBackgroundTokenizeMaxSourceLineCount,
                    sourceLines: backgroundPlan.sourceLineCount,
                  }));
                }
              })
              .catch((error: unknown) => {
                console.error(getErrorMessage(error));
              });
          } else {
            logDiffMemoryMark("viewer.syntaxTokenization.skipBackgroundBudget", () => ({
              durationMs: Number((nowMs() - startedAt).toFixed(1)),
              fileBudget: diffBackgroundTokenizeMaxFileCount,
              files: state.files.length,
              rows: document.rowCount,
              scopes: document.scopeCount,
              sourceLineBudget: diffBackgroundTokenizeMaxSourceLineCount,
            }));
          }
        }, diffBackgroundTokenizeStartDelayMs);
        return () => {
          cancelled = true;
          if (startTimeout) {
            clearTimeout(startTimeout);
          }
          document.stopBackgroundTokenization();
        };
      }

      document.stopBackgroundTokenization();
    }
    return undefined;
  }, [state.status === "loaded" ? state.document : null, state.status === "loaded" ? state.loadComplete : true, syntaxHighlightingEnabled]);
  useEffect(() => {
    if (state.status === "loaded" && state.loadComplete !== false && syntaxHighlightingEnabled) {
      const document = state.document;
      const updateTokenizationVersion = () => {
        const tokenizationVersion = document.getTokenizedRowVersion();
        if (syntaxTokenizationVersion$.peek() !== tokenizationVersion) {
          syntaxTokenizationVersion$.set(tokenizationVersion);
        }
      };

      updateTokenizationVersion();
      const intervalHandle = setInterval(updateTokenizationVersion, diffBackgroundTokenizePollMs);
      return () => {
        clearInterval(intervalHandle);
      };
    }

    if (syntaxTokenizationVersion$.peek() !== 0) {
      syntaxTokenizationVersion$.set(0);
    }
    return undefined;
  }, [state.status === "loaded" ? state.document : null, state.status === "loaded" ? state.loadComplete : true, syntaxHighlightingEnabled, syntaxTokenizationVersion$]);
  useEffect(() => {
    resetSideBySideRuntime();
    if (state.status === "loaded") {
      loggedFirstSidebarFileRenderRef.current = false;
      loggedFirstUnifiedRowRenderRef.current = false;
      loggedFirstSideBySideRowRenderRef.current = false;
      const preserveActiveFilePath = preserveActiveFilePathRef.current;
      preserveActiveFilePathRef.current = null;
      if (preserveActiveFilePath) {
        const preservedFile = state.files.find((file) => file.path === preserveActiveFilePath || file.oldPath === preserveActiveFilePath);
        activeFileIndex$.set(preservedFile?.index ?? state.files[0]?.index ?? null);
      } else {
        activeFileIndex$.set(state.files[0]?.index ?? null);
        setCollapsedFileIndexesValue((current) => current.size > 0 ? new Set() : current);
      }
    } else {
      activeFileIndex$.set(null);
    }
  }, [activeFileIndex$, resetSideBySideRuntime, setCollapsedFileIndexesValue, state.status === "loaded" ? state.document : null]);
  const handleVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
    maybeExpandItemCountLimitForVisibleRange(start, count, `unified:${info.reason}`);
    const currentState = state$.peek();
    if (syntaxHighlightingEnabled && currentState.status === "loaded") {
      const files = getFilesForSourceRowRange(currentState.files, start, count);
      scheduleVisibleFileTokenization(currentState.document, files, info);
    }
  }, [maybeExpandItemCountLimitForVisibleRange, scheduleVisibleFileTokenization, state$, syntaxHighlightingEnabled]);

  const handleLimitedSideBySideVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
    maybeExpandItemCountLimitForVisibleRange(start, count, `side-by-side:${info.reason}`);
    handleSideBySideVisibleRowsRequested(start, count, info);
  }, [handleSideBySideVisibleRowsRequested, maybeExpandItemCountLimitForVisibleRange]);

  const handleTopItemChanged = useCallback((rowIndex: number) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const nextFileIndex = findFileIndexForRow(currentState.files, rowIndex);
      if (activeFileIndex$.peek() !== nextFileIndex) {
        activeFileIndex$.set(nextFileIndex);
      }
    }
  }, [activeFileIndex$, state$]);

  useEffect(() => {
    renderCountRef.current += 1;
    logDiffOpenTiming("viewer.renderCommitted", () => ({
      dataVersion: diffRows.dataVersion,
      itemCount: diffRows.itemIndexes.length,
      renderCount: renderCountRef.current,
      state: state.status,
      visibleItemCount: visibleItemIndexes.length,
    }));
  });

  const loadSource = useCallback(async (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    updateSavedDiffWindowSource(windowIdentifier, nextSource);
    const loadStartedAt = nowMs();
    const initialRowCount = nativeDiffRows ? 0 : diffInitialRowCount;
    const loadShowOnlyHunks = getDiffShowOnlyHunksSetting();
    const sourceCacheKey = getDiffSourceCacheKey(nextSource);
    const loadedCacheKey = getDiffLoadedCacheKey(nextSource, loadShowOnlyHunks);
    const stateBeforeLoad = state$.peek();
    const isBackgroundWatchRefresh =
      options?.reason === "watch" &&
      stateBeforeLoad.status === "loaded" &&
      sourcesMatch(stateBeforeLoad.source, nextSource);

    if (mergeDraftsSourceKeyRef.current !== null && mergeDraftsSourceKeyRef.current !== sourceCacheKey) {
      mergeDraftsRef.current = new Map();
      mergeDraftsSourceKeyRef.current = null;
    }

    if (options?.force) {
      for (const key of loadedCacheRef.current.keys()) {
        if (key.startsWith(`${sourceCacheKey}:`)) {
          loadedCacheRef.current.delete(key);
        }
      }
    } else if (stateBeforeLoad.status === "loaded" && !sourcesMatch(stateBeforeLoad.source, nextSource)) {
      loadedCacheRef.current.clear();
    }

    const cachedEntry = !options?.force && options?.reason === "mode-toggle"
      ? loadedCacheRef.current.get(loadedCacheKey)
      : undefined;
    if (cachedEntry) {
      const trace: DiffLoadTrace = {
        cacheHit: true,
        document: cachedEntry.loaded.document,
        folderPath: nextSource.value,
        loadStartedAt,
        nativeResolvedAt: loadStartedAt,
        requestId,
        setStateAt: nowMs(),
      };
      loadTraceRef.current = trace;
      setLoadProgressValue(emptyDiffLoadProgressState);
      setLoadingSourceValue(null);
      setLoadStatisticsValue(null);
      setDocumentErrorValue(null);
      setOpenErrorValue(null);
      setViewerState({
        status: "loaded",
        folderPath: nextSource.value,
        source: nextSource,
        document: cachedEntry.loaded.document,
        files: cachedEntry.loaded.files,
        initialRows: cachedEntry.loaded.initialRows,
        loadComplete: cachedEntry.loadComplete,
        timing: cachedEntry.loaded.timing,
      });
      logDiffOpenTiming("viewer.load.cacheHit", () => ({
        requestId,
        rows: cachedEntry.loaded.document.rowCount,
        showOnlyHunks: loadShowOnlyHunks,
        source: nextSource,
      }));
      return;
    }

    const trace: DiffLoadTrace = {
      cacheHit: false,
      document: null,
      folderPath: nextSource.value,
      loadStartedAt,
      nativeResolvedAt: loadStartedAt,
      requestId,
      setStateAt: loadStartedAt,
    };
    loadTraceRef.current = trace;
    if (!isBackgroundWatchRefresh) {
      setLoadProgressValue(nextSource.kind === "folder"
        ? {
            ...emptyDiffLoadProgressState,
            requestId,
            source: nextSource,
            visible: true,
          }
        : emptyDiffLoadProgressState);
      setLoadingSourceValue(nextSource);
      setLoadStatisticsValue(null);
      setMergeStateValue(nextSource.kind === "folder" ? { status: "loading" } : unavailableDiffMergeState);
      if (stateBeforeLoad.status === "loaded") {
        setDocumentErrorValue(null);
      } else {
        setOpenErrorValue(null);
      }
    }
    logDiffOpenTiming("viewer.load.start", () => ({
      source: nextSource,
      requestId,
    }));
    logDiffMemoryMark("viewer.load.start", () => ({
      requestId,
      reason: options?.reason ?? "manual",
      source: nextSource,
    }));

    const schedulePostLoadSideEffects = (loaded: DiffLoadedPayload) => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            const filePaths = loaded.files.map((file) => file.path);
            const syntaxLanguages = recordDiffSyntaxLanguagesForPaths(filePaths);
            logDiffMemoryMark("viewer.syntaxLanguagesRecorded", () => ({
              files: loaded.files.length,
              languages: syntaxLanguages,
              requestId,
              rows: loaded.document.rowCount,
              scopes: loaded.document.scopeCount,
            }));
            addRecentDiffSource(nextSource);
            logDiffOpenTiming("viewer.recentSource.noted", () => ({
              requestId,
              sourceKind: nextSource.kind,
            }));
            const recentDocumentPath = getDiffRecentDocumentPath(nextSource);
            if (recentDocumentPath) {
              const recentStartedAt = nowMs();
              noteRecentDocument(recentDocumentPath);
              logDiffOpenTiming("viewer.recentDocument.noted", () => ({
                durationMs: Number((nowMs() - recentStartedAt).toFixed(1)),
                requestId,
              }));
              logDiffMemoryMark("viewer.recentDocument.noted", () => ({
                durationMs: Number((nowMs() - recentStartedAt).toFixed(1)),
                requestId,
              }));
            } else {
              logDiffOpenTiming("viewer.recentDocument.skipped", () => ({
                requestId,
                sourceKind: nextSource.kind,
              }));
            }
            if (nextSource.kind === "folder") {
              loadDiffMergeState(nextSource.value)
                .then((nextMergeState) => {
                  const currentState = state$.peek();
                  if (loadRequestIdRef.current === requestId && currentState.status === "loaded" && sourcesMatch(currentState.source, nextSource)) {
                    setMergeStateValue(applyDiffMergeDraftsToState(nextMergeState, mergeDraftsRef.current));
                    logDiffOpenTiming("viewer.mergeState.loaded", () => ({
                      files: nextMergeState.status === "ready" ? nextMergeState.conflictFileCount : 0,
                      requestId,
                      status: nextMergeState.status,
                    }));
                  }
                })
                .catch((error: unknown) => {
                  if (loadRequestIdRef.current === requestId) {
                    setMergeStateValue({
                      status: "error",
                      message: getErrorMessage(error),
                    });
                  }
                });
            }
          }
        }, 0);
      });
    };

    const publishLoadedState = (loaded: DiffLoadedPayload, loadComplete: boolean, reason: string) => {
      const statePayloadStartedAt = nowMs();
      const nextLoadedState: DiffViewerState = {
        status: "loaded",
        folderPath: nextSource.value,
        source: nextSource,
        document: loaded.document,
        files: loaded.files,
        initialRows: loaded.initialRows,
        loadComplete,
        timing: loaded.timing,
      };
      const statePayloadFinishedAt = nowMs();
      if (!trace.document) {
        trace.document = loaded.document;
        trace.setStateAt = statePayloadFinishedAt;
      }
      if (isBackgroundWatchRefresh) {
        const currentLoadedState = state$.peek();
        preserveActiveFilePathRef.current = currentLoadedState.status === "loaded"
          ? getActiveDiffFile(currentLoadedState.files, activeFileIndex$.peek())?.path ?? null
          : null;
      }
      setViewerState(nextLoadedState);
      if (isBackgroundWatchRefresh) {
        setDocumentErrorValue(null);
      }
      if (loadComplete) {
        if (shouldCacheLoadedDiff(loaded)) {
          loadedCacheRef.current.set(loadedCacheKey, {
            loaded,
            loadComplete,
          });
        } else {
          loadedCacheRef.current.delete(loadedCacheKey);
        }
        setLoadProgressValue(emptyDiffLoadProgressState);
      }
      logDiffMemoryMark("viewer.statePublished", () => ({
        files: loaded.files.length,
        initialRows: loaded.initialRows.length,
        loadComplete,
        reason,
        requestId,
        rows: loaded.document.rowCount,
        scopes: loaded.document.scopeCount,
      }));
      logDiffOpenTiming("viewer.load.setLoaded", () => ({
        loadComplete,
        reason,
        requestId,
        statePayloadMs: Number((statePayloadFinishedAt - statePayloadStartedAt).toFixed(1)),
        setStateCallMs: Number((nowMs() - statePayloadFinishedAt).toFixed(1)),
      }));
    };

    let loadError: unknown = null;
    let progressiveSession: DiffLoadSession | null = null;
    try {
      const nativeStartedAt = nowMs();
      let result: DiffLoadedPayload | null = null;
      if (nextSource.kind === "github") {
        logDiffOpenTiming("viewer.native.start", () => ({
          diffUrl: nextSource.diffUrl,
          initialRowCount,
          requestId,
          sourceLabel: nextSource.label,
          sourceKind: nextSource.kind,
        }));
        progressiveSession = startUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label);
        let progress = progressiveSession.consumeChanges(initialRowCount);
        setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
        while (
          loadRequestIdRef.current === requestId &&
          !shouldPublishInitialProgress(progress, initialRowCount, nowMs() - nativeStartedAt)
        ) {
          await waitForDiffProgressPoll();
          progress = progressiveSession.consumeChanges(initialRowCount);
          setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
        }
        if (loadRequestIdRef.current !== requestId) {
          progressiveSession.cancel();
        } else if (progress.error) {
          loadError = new Error(progress.error);
        } else {
          result = progress;
          logDiffOpenTiming("viewer.native.initialProgress", () => ({
            complete: progress.complete,
            files: progress.files.length,
            initialRows: progress.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            requestId,
            rowVersion: progress.rowVersion,
            rows: progress.document.rowCount,
            sourceKind: nextSource.kind,
          }));
        }
      } else if (nextSource.kind === "git") {
        logDiffOpenTiming("viewer.git.start", () => ({
          args: nextSource.args,
          cwd: nextSource.cwd,
          requestId,
          sourceKind: nextSource.kind,
        }));
        const commandResult = await commandRunner.runCommand({
          args: ["diff", ...nextSource.args],
          command: "git",
          cwd: nextSource.cwd,
          timeoutMs: 60_000,
        });
        if (commandResult.exitCode !== 0) {
          loadError = createGitDiffCommandError(commandResult);
        } else {
          logDiffOpenTiming("viewer.git.finish", () => ({
            requestId,
            stderrLength: commandResult.stderr.length,
            stdoutLength: commandResult.stdout.length,
            timedOut: commandResult.timedOut,
          }));
          result = await loadUnifiedDiff(commandResult.stdout, nextSource.label, initialRowCount);
          const loadedResult = result;
          logDiffOpenTiming("viewer.native.finish", () => ({
            files: loadedResult.files.length,
            initialRows: loadedResult.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            nativeTotalMs: Number(loadedResult.timing.nativeTotalMs.toFixed(1)),
            requestId,
            rows: loadedResult.document.rowCount,
            sourceKind: nextSource.kind,
            scopes: loadedResult.document.scopeCount,
          }));
        }
      } else if (nextSource.kind === "filePair") {
        const diffCommand = createFilePairDiffCommand(nextSource);
        logDiffOpenTiming("viewer.filePair.start", () => ({
          args: diffCommand.args,
          requestId,
          sourceKind: nextSource.kind,
        }));
        const commandResult = await commandRunner.runCommand(diffCommand);
        if (commandResult.timedOut) {
          loadError = new Error("File comparison timed out. The files may be too large to compare.");
        } else if (commandResult.exitCode !== 0 && commandResult.exitCode !== 1) {
          loadError = new Error(commandResult.stderr || `diff exited with code ${commandResult.exitCode}.`);
        } else {
          logDiffOpenTiming("viewer.filePair.finish", () => ({
            requestId,
            stderrLength: commandResult.stderr.length,
            stdoutLength: commandResult.stdout.length,
            timedOut: commandResult.timedOut,
          }));
          result = await loadUnifiedDiff(createFilePairUnifiedDiff(nextSource, commandResult), nextSource.label, initialRowCount);
          const loadedResult = result;
          logDiffOpenTiming("viewer.native.finish", () => ({
            files: loadedResult.files.length,
            initialRows: loadedResult.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            nativeTotalMs: Number(loadedResult.timing.nativeTotalMs.toFixed(1)),
            requestId,
            rows: loadedResult.document.rowCount,
            sourceKind: nextSource.kind,
            scopes: loadedResult.document.scopeCount,
          }));
        }
      } else if (nextSource.kind === "diffFile") {
        logDiffOpenTiming("viewer.diffFile.start", () => ({
          path: nextSource.value,
          requestId,
          sourceKind: nextSource.kind,
        }));
        const commandResult = await commandRunner.runCommand({
          args: [nextSource.value],
          command: "/bin/cat",
          timeoutMs: 60_000,
        });
        if (commandResult.timedOut) {
          loadError = new Error("Reading the diff file timed out. The file may be too large to open.");
        } else if (commandResult.exitCode !== 0) {
          loadError = new Error(commandResult.stderr || `cat exited with code ${commandResult.exitCode}.`);
        } else {
          logDiffOpenTiming("viewer.diffFile.finish", () => ({
            requestId,
            stderrLength: commandResult.stderr.length,
            stdoutLength: commandResult.stdout.length,
            timedOut: commandResult.timedOut,
          }));
          result = await loadUnifiedDiff(commandResult.stdout, nextSource.label, initialRowCount);
          const loadedResult = result;
          logDiffOpenTiming("viewer.native.finish", () => ({
            files: loadedResult.files.length,
            initialRows: loadedResult.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            nativeTotalMs: Number(loadedResult.timing.nativeTotalMs.toFixed(1)),
            requestId,
            rows: loadedResult.document.rowCount,
            sourceKind: nextSource.kind,
            scopes: loadedResult.document.scopeCount,
          }));
        }
      } else {
        logDiffOpenTiming("viewer.native.start", () => ({
          folderPath: nextSource.value,
          initialRowCount,
          requestId,
          showOnlyHunks: loadShowOnlyHunks,
          sourceKind: nextSource.kind,
        }));
        progressiveSession = startGitFolderDiff(nextSource.value, {
          ...getDiffGitFolderLoadCompareOptions(nextSource),
          showOnlyHunks: loadShowOnlyHunks,
        });
        let progress = progressiveSession.consumeChanges(initialRowCount);
        setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
        while (
          loadRequestIdRef.current === requestId &&
          !shouldPublishInitialProgress(progress, initialRowCount, nowMs() - nativeStartedAt)
        ) {
          await waitForDiffProgressPoll();
          progress = progressiveSession.consumeChanges(initialRowCount);
          setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
        }
        if (loadRequestIdRef.current !== requestId) {
          progressiveSession.cancel();
        } else if (progress.error) {
          loadError = new Error(progress.error);
        } else {
          result = progress;
          logDiffOpenTiming("viewer.native.initialProgress", () => ({
            complete: progress.complete,
            files: progress.files.length,
            initialRows: progress.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            requestId,
            rowVersion: progress.rowVersion,
            rows: progress.document.rowCount,
            showOnlyHunks: loadShowOnlyHunks,
            sourceKind: nextSource.kind,
          }));
        }
      }

      if (!loadError) {
        if (result) {
          const loadedResult = result;
          result = null;
          const nativeResolvedAt = nowMs();
          trace.nativeResolvedAt = nativeResolvedAt;
          logDiffOpenTiming("viewer.load.nativeResolved", () => ({
            files: loadedResult.files.length,
            grammarEnsureMs: 0,
            initialRows: loadedResult.initialRows.length,
            jsAwaitMs: Number((nativeResolvedAt - nativeStartedAt).toFixed(1)),
            nativeTotalMs: Number(loadedResult.timing.nativeTotalMs.toFixed(1)),
            requestId,
            rows: loadedResult.document.rowCount,
            scopes: loadedResult.document.scopeCount,
            unaccountedJsMs: Number((nativeResolvedAt - nativeStartedAt - loadedResult.timing.nativeTotalMs).toFixed(1)),
          }));
          logDiffLoadTiming(nextSource.value, loadedResult.timing);
          if (loadRequestIdRef.current === requestId) {
            const initialLoadComplete = "complete" in loadedResult ? loadedResult.complete : true;
            if (isBackgroundWatchRefresh && progressiveSession && "complete" in loadedResult && !loadedResult.complete) {
              let progress = loadedResult;
              setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
              while (loadRequestIdRef.current === requestId && !progress.complete && !progress.error) {
                await waitForDiffProgressPoll(diffProgressivePostInitialLoadPollMs);
                progress = progressiveSession.consumeChanges(0);
                setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
              }
              if (loadRequestIdRef.current !== requestId) {
                progressiveSession.cancel();
              } else if (progress.error) {
                throw new Error(progress.error);
              } else {
                publishLoadedState(progress, progress.complete, "complete");
                schedulePostLoadSideEffects(progress);
              }
            } else {
              publishLoadedState(loadedResult, initialLoadComplete, "initial");
              if (progressiveSession && "complete" in loadedResult && !loadedResult.complete) {
                let lastFileVersion = loadedResult.fileVersion;
                let lastRowVersion = loadedResult.rowVersion;
                let lastStatePublishedAt = nowMs();
                let progress = loadedResult;
                await waitForDiffProgressPoll(diffProgressivePostInitialLoadResumeMs);
                while (loadRequestIdRef.current === requestId && !progress.complete && !progress.error) {
                  await waitForDiffProgressPoll(diffProgressivePostInitialLoadPollMs);
                  progress = progressiveSession.consumeChanges(0);
                  const hasChanges =
                    progress.rowVersion !== lastRowVersion ||
                    progress.fileVersion !== lastFileVersion ||
                    progress.complete ||
                    !!progress.error;
                  if (hasChanges && loadRequestIdRef.current === requestId) {
                    const shouldPublishLoadedState =
                      progress.complete ||
                      progress.error ||
                      nowMs() - lastStatePublishedAt >= diffProgressiveLoadedStatePublishMs;
                    setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progress));
                    lastFileVersion = progress.fileVersion;
                    lastRowVersion = progress.rowVersion;
                    if (shouldPublishLoadedState) {
                      lastStatePublishedAt = nowMs();
                      publishLoadedState(progress, progress.complete, progress.complete ? "complete" : "progress");
                    }
                  }
                }
                if (loadRequestIdRef.current !== requestId) {
                  progressiveSession.cancel();
                } else if (progress.error) {
                  throw new Error(progress.error);
                } else {
                  schedulePostLoadSideEffects(progress);
                }
              } else {
                schedulePostLoadSideEffects(loadedResult);
              }
            }
          } else {
            progressiveSession?.cancel();
            logDiffOpenTiming("viewer.load.stale", () => ({
              activeRequestId: loadRequestIdRef.current,
              requestId,
            }));
          }
        }
      }
    } catch (error) {
      loadError = error;
    }

    if (loadError && loadRequestIdRef.current === requestId) {
      if (!isBackgroundWatchRefresh) {
        loadTraceRef.current = null;
        setMergeStateValue(unavailableDiffMergeState);
        setLoadProgressValue(emptyDiffLoadProgressState);
        setLoadStatisticsValue(null);
        setLoadingSourceValue((current) => sourcesMatch(current, nextSource) ? null : current);
      }
      const message = getErrorMessage(loadError);
      const currentState = state$.peek();
      if (currentState.status === "loaded") {
        const nextError = sourcesMatch(currentState.source, nextSource)
          ? createRefreshError(nextSource, message)
          : createOpenError(nextSource, message);
        setDocumentErrorValue(nextError);
      } else {
        setOpenErrorValue(createOpenError(nextSource, message));
        setViewerState(emptyDiffViewerState);
      }
      logDiffOpenTiming("viewer.load.error", () => ({
        error: message,
        requestId,
      }));
    }
  }, [nativeDiffRows, setDocumentErrorValue, setLoadProgressValue, setLoadStatisticsValue, setLoadingSourceValue, setMergeStateValue, setOpenErrorValue, setViewerState, state$, windowIdentifier]);

  const saveMergeDrafts = useCallback(async () => {
    if (savingMergeDraftsRef.current) {
      return false;
    }

    await waitForMergeResolveQueues();

    const currentState = state$.peek();
    const draftEntries = [...mergeDraftsRef.current.entries()];
    const sourceKey = currentState.source ? getDiffSourceCacheKey(currentState.source) : null;
    if (
      currentState.status !== "loaded" ||
      currentState.source.kind !== "folder" ||
      draftEntries.length === 0 ||
      mergeDraftsSourceKeyRef.current !== sourceKey ||
      resolvingMergeConflictKeysRef.current.size !== 0
    ) {
      return false;
    }

    savingMergeDraftsRef.current = true;
    suppressFileWatcherReloadUntilRef.current = Date.now() + diffMergeSaveWatchSuppressMs;
    setResolvingMergeConflictKeyActive(diffMergeSaveConflictKey, true);
    setDocumentErrorValue(null);
    try {
      const draftPaths = new Set(draftEntries.map(([path]) => path));
      for (const [path, draft] of draftEntries) {
        await writeDiffMergeFileContent({
          content: draft.content,
          folderPath: currentState.source.value,
          path,
        });
      }
      suppressFileWatcherReloadUntilRef.current = Date.now() + diffMergeSaveWatchSuppressMs;
      for (const key of loadedCacheRef.current.keys()) {
        if (key.startsWith(`${sourceKey}:`)) {
          loadedCacheRef.current.delete(key);
        }
      }
      mergeDraftsRef.current = new Map();
      mergeDraftsSourceKeyRef.current = null;
      const currentMergeState = mergeState$.peek();
      if (currentMergeState.status === "ready") {
        setMergeStateValue(createReadyMergeState(
          currentMergeState.files.map((file) => (
            draftPaths.has(file.path) ? clearDiffMergeDraftFlag(file) : file
          )),
        ));
      }
      return true;
    } catch (error: unknown) {
      setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
      return false;
    } finally {
      savingMergeDraftsRef.current = false;
      setResolvingMergeConflictKeyActive(diffMergeSaveConflictKey, false);
    }
  }, [mergeState$, setDocumentErrorValue, setMergeStateValue, setResolvingMergeConflictKeyActive, state$, waitForMergeResolveQueues]);

  const saveMergeDraftsFromCommand = useCallback(() => {
    const hasSaveWork = mergeDraftsRef.current.size > 0 || mergeResolveQueuesRef.current.size > 0;
    if (hasSaveWork && !savingMergeDraftsRef.current) {
      saveMergeDrafts().catch((error: unknown) => {
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
          setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
        }
      });
      return true;
    }
    return false;
  }, [saveMergeDrafts, setDocumentErrorValue, state$]);

  const openClipboardSourceFromStartScreen = useCallback(() => {
    const currentState = state$.peek();
    const focusedUrlInput = urlInputRef.current && "isFocused" in urlInputRef.current && typeof urlInputRef.current.isFocused === "function"
      ? urlInputRef.current.isFocused()
      : false;
    const canOpenClipboardSource = currentState.status === "empty" && !focusedUrlInput && !loadingSource$.peek();
    if (canOpenClipboardSource) {
      commandRunner.runCommand({ command: "pbpaste", timeoutMs: 1000 })
        .then((result) => {
          if (result.exitCode !== 0) {
            throw new Error(result.stderr || "Unable to read the clipboard.");
          }
          const nextSource = normalizeDiffOpenSource(result.stdout);
          if (!nextSource) {
            throw new Error("Clipboard does not contain a folder path, GitHub URL, .diff file, or two file paths.");
          }
          return loadSource(nextSource);
        })
        .catch((error: unknown) => {
          setOpenErrorValue({
            message: getErrorMessage(error),
            source: currentState.source,
            title: "Couldn't open clipboard",
          });
        });
    }
    return canOpenClipboardSource;
  }, [loadSource, loadingSource$, setOpenErrorValue, state$, urlInputRef]);

  useEffect(() => addKeyDownListener((event) => {
    let handled = false;
    if (isSaveKeyEvent(event)) {
      handled = saveMergeDraftsFromCommand();
    } else if (isPasteKeyEvent(event)) {
      handled = openClipboardSourceFromStartScreen();
    }
    return handled;
  }), [openClipboardSourceFromStartScreen, saveMergeDraftsFromCommand]);

  const getCurrentMergeFileForResolve = useCallback((path: string) => {
    const existingDraft = mergeDraftsRef.current.get(path);
    if (existingDraft) {
      return existingDraft.file;
    }
    const currentMergeState = mergeState$.peek();
    return currentMergeState.status === "ready" ? currentMergeState.fileByPath.get(path) ?? null : null;
  }, [mergeState$]);

  const resolveMergeConflict = useCallback((file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => {
    const currentState = state$.peek();
    const resolvingKeys = resolvingMergeConflictKeysRef.current;
    const conflictKey = getMergeConflictKey(file, block);
    if (
      currentState.status === "loaded" &&
      currentState.source.kind === "folder" &&
      !savingMergeDraftsRef.current &&
      !isDiffMergeSavePending(resolvingKeys) &&
      !resolvingKeys.has(conflictKey)
    ) {
      setResolvingMergeConflictKeyActive(conflictKey, true);
      setDocumentErrorValue(null);

      const originalBlockIndex = Math.max(
        0,
        file.markerBlocks.findIndex((candidate) => candidate === block || candidate.startLine === block.startLine),
      );
      const queue = mergeResolveQueuesRef.current.get(file.path) ?? {
        chain: Promise.resolve(),
        completedOriginalBlockIndexes: [],
      };
      const runResolve = async () => {
        try {
          const existingDraft = mergeDraftsRef.current.get(file.path);
          const currentFile = getCurrentMergeFileForResolve(file.path) ?? file;
          const resolvedEarlierBlocks = queue.completedOriginalBlockIndexes.filter((index) => index < originalBlockIndex).length;
          const currentBlockIndex = Math.max(0, originalBlockIndex - resolvedEarlierBlocks);
          const currentBlock = currentFile.markerBlocks[currentBlockIndex] ?? currentFile.markerBlocks.find((candidate) => (
            candidate.oursLines.length === block.oursLines.length &&
            candidate.theirsLines.length === block.theirsLines.length &&
            candidate.oursLines.every((line, index) => line === block.oursLines[index]) &&
            candidate.theirsLines.every((line, index) => line === block.theirsLines[index])
          ));
          if (!currentBlock) {
            throw new Error(`Unable to find conflict block in ${file.path}.`);
          }

          const currentContent = existingDraft?.content ?? await readDiffMergeFileContent({
            folderPath: currentState.source.value,
            path: file.path,
          });
          const resolvedContent = resolveDiffMergeConflictContent(currentContent, currentBlock.startLine, choice);
          const nextFile = createDiffMergeDraftFileWithResolvedBlock({
            block: currentBlock,
            choice,
            content: resolvedContent,
            file: currentFile,
          });
          const nextDrafts = new Map(mergeDraftsRef.current);
          nextDrafts.set(file.path, {
            content: resolvedContent,
            file: nextFile,
          });
          mergeDraftsRef.current = nextDrafts;
          mergeDraftsSourceKeyRef.current = getDiffSourceCacheKey(currentState.source);

          const currentMergeState = mergeState$.peek();
          if (currentMergeState.status === "ready") {
            setMergeStateValue(createReadyMergeState(
              currentMergeState.files
                .map((currentFile) => currentFile.path === file.path ? nextFile : currentFile)
                .filter((currentFile) => currentFile.markerBlocks.length > 0 || currentFile.hasUnsavedDraft),
            ));
          }

          queue.completedOriginalBlockIndexes.push(originalBlockIndex);
        } catch (error: unknown) {
          setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
        } finally {
          setResolvingMergeConflictKeyActive(conflictKey, false);
        }
      };

      const nextChain = queue.chain
        .catch(() => undefined)
        .then(runResolve);
      queue.chain = nextChain;
      mergeResolveQueuesRef.current.set(file.path, queue);
      nextChain.finally(() => {
        if (mergeResolveQueuesRef.current.get(file.path)?.chain === nextChain) {
          mergeResolveQueuesRef.current.delete(file.path);
        }
      });
    }
  }, [getCurrentMergeFileForResolve, mergeState$, setDocumentErrorValue, setMergeStateValue, setResolvingMergeConflictKeyActive, state$]);

  const discardMergeDrafts = useCallback(async () => {
    await waitForMergeResolveQueues();
    const currentState = state$.peek();
    if (currentState.status !== "loaded" || currentState.source.kind !== "folder") {
      return false;
    }

    mergeDraftsRef.current = new Map();
    mergeDraftsSourceKeyRef.current = null;
    const nextMergeState = await loadDiffMergeState(currentState.source.value);
    setMergeStateValue(nextMergeState);
    return true;
  }, [setMergeStateValue, state$, waitForMergeResolveQueues]);

  const discardMergeDraftsFromCommand = useCallback(() => {
    if (hasUnsavedMergeDrafts && !savingMergeDraftsRef.current) {
      discardMergeDrafts().catch((error: unknown) => {
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
          setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
        }
      });
    }
  }, [discardMergeDrafts, hasUnsavedMergeDrafts, setDocumentErrorValue, state$]);

  const prepareMergeDraftsForClose = useCallback(async () => {
    await waitForMergeResolveQueues();
    const currentState = state$.peek();
    const draftFiles = getUnsavedDiffMergeDraftFiles(mergeState$.peek());
    if (currentState.status !== "loaded" || draftFiles.length === 0) {
      return true;
    }

    const action = await confirmUnsavedDiffMergeDrafts({
      fileCount: draftFiles.length,
      sourceLabel: getDiffSourceLabel(currentState.source),
    });

    if (action === "discard") {
      return true;
    }

    if (action === "save") {
      return saveMergeDrafts();
    }

    return false;
  }, [mergeState$, saveMergeDrafts, state$, waitForMergeResolveQueues]);

  useEffect(() => {
    let isCloseInFlight = false;
    const subscription = addWindowCloseRequestedListener((event) => {
      if (event.identifier === windowIdentifier && !isCloseInFlight) {
        isCloseInFlight = true;
        prepareMergeDraftsForClose()
          .then((canClose) => {
            if (canClose) {
              return closeWindow(windowIdentifier);
            }
            return null;
          })
          .catch((error: unknown) => {
            const currentState = state$.peek();
            if (currentState.status === "loaded") {
              setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
            }
            return null;
          })
          .finally(() => {
            isCloseInFlight = false;
          });
      }
    });
    return () => {
      subscription.remove();
    };
  }, [prepareMergeDraftsForClose, setDocumentErrorValue, state$, windowIdentifier]);

  const openFolder = useCallback(async () => {
    if (!loadingSource$.peek()) {
      const currentState = state$.peek();
      try {
        setOpenErrorValue(null);
        setDocumentErrorValue(null);
        const dialogStartedAt = nowMs();
        logDiffOpenTiming("viewer.dialog.start", () => ({
          currentFolderPath: currentState.folderPath,
        }));
        const path = await openDiffFolderDialog();
        logDiffOpenTiming("viewer.dialog.finish", () => ({
          dialogMs: Number((nowMs() - dialogStartedAt).toFixed(1)),
          path,
        }));
        if (path) {
          const nextSource = normalizeDiffOpenSource(path);
          if (nextSource) {
            await loadSource(nextSource);
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
  }, [loadSource, loadingSource$, setDocumentErrorValue, setOpenErrorValue, state$]);

  const compareFiles = useCallback(async () => {
    if (!loadingSource$.peek()) {
      const currentState = state$.peek();
      try {
        setOpenErrorValue(null);
        setDocumentErrorValue(null);
        const dialogStartedAt = nowMs();
        logDiffOpenTiming("viewer.filePairDialog.start", () => ({
          currentSource: currentState.source,
        }));
        const nextSource = await openDiffFilePairDialog();
        logDiffOpenTiming("viewer.filePairDialog.finish", () => ({
          dialogMs: Number((nowMs() - dialogStartedAt).toFixed(1)),
          source: nextSource,
        }));
        if (nextSource) {
          await loadSource(nextSource);
        }
      } catch (error) {
        const nextError = {
          message: getErrorMessage(error),
          source: currentState.source,
          title: "Couldn't choose files",
        };
        if (currentState.status === "loaded") {
          setDocumentErrorValue(nextError);
        } else {
          setOpenErrorValue(nextError);
        }
      }
    }
  }, [loadSource, loadingSource$, setDocumentErrorValue, setOpenErrorValue, state$]);

  const dismissDocumentError = useCallback(() => {
    setDocumentErrorValue(null);
  }, [setDocumentErrorValue]);

  const openPermissionSettings = useCallback(() => {
    Linking.openURL(macOSFilesAndFoldersSettingsUrl).catch((error: unknown) => {
      console.error(`Unable to open System Settings: ${getErrorMessage(error)}`);
    });
  }, []);
  const openExternalErrorUrl = useCallback((url: string) => {
    Linking.openURL(url).catch((error: unknown) => {
      console.error(`Unable to open URL: ${getErrorMessage(error)}`);
    });
  }, []);

  const startScreenController = useDiffStartScreenController({
    loadSource,
    loadingSource$,
    openError$,
    setDocumentErrorValue,
    setOpenErrorValue,
    setUrlInputErrorValue,
    setUrlInputValue,
    urlInput$,
    urlInputError$,
  });

  const handleDropDiff = useCallback((nativeEvent: DragDropFileEvent) => {
    if (!loadingSource$.peek()) {
      const nextSource = getDroppedDiffSource(nativeEvent);
      if (nextSource) {
        loadSource(nextSource);
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
  }, [loadSource, loadingSource$, setDocumentErrorValue, setOpenErrorValue, state$]);

  const reloadCurrentSource = useCallback(() => {
    const currentState = state$.peek();
    if (currentState.status !== "loaded") {
      return false;
    }

    loadSource(currentState.source, { force: true, reason: "reload" }).catch((error: unknown) => {
      setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
    });
    return true;
  }, [loadSource, setDocumentErrorValue, state$]);

  const compareCurrentSource = useCallback((selection: string) => {
    const currentSource = loadingSource$.peek() ?? state$.peek().source;
    const repoPath = currentSource?.kind === "folder"
      ? currentSource.value
      : currentSource?.kind === "git"
        ? currentSource.cwd
        : null;
    const nextSource = repoPath ? createDiffCompareSource(repoPath, selection, compareRepoState) : null;
    if (!nextSource || loadingSource$.peek()) {
      return false;
    }

    loadSource(nextSource).catch((error: unknown) => {
      setDocumentErrorValue(createRefreshError(nextSource, getErrorMessage(error)));
    });
    return true;
  }, [compareRepoState, loadSource, loadingSource$, setDocumentErrorValue, state$]);

  const openCompareRefPrompt = useCallback(() => {
    const currentSource = loadingSource$.peek() ?? state$.peek().source;
    const repoPath = currentSource?.kind === "folder"
      ? currentSource.value
      : currentSource?.kind === "git"
        ? currentSource.cwd
        : null;
    if (!repoPath || loadingSource$.peek()) {
      return false;
    }

    setCompareRefInput("");
    setCompareRefPromptVisible(true);
    return true;
  }, [loadingSource$, state$]);

  const closeCompareRefPrompt = useCallback(() => {
    setCompareRefPromptVisible(false);
    setCompareRefInput("");
  }, []);

  const submitCompareRefPrompt = useCallback(() => {
    const ref = compareRefInput.trim();
    const currentSource = loadingSource$.peek() ?? state$.peek().source;
    const repoPath = currentSource?.kind === "folder"
      ? currentSource.value
      : currentSource?.kind === "git"
        ? currentSource.cwd
        : null;
    if (ref && repoPath && !loadingSource$.peek()) {
      const nextSource = createDiffCompareSourceForRef(repoPath, ref);
      closeCompareRefPrompt();
      loadSource(nextSource).catch((error: unknown) => {
        setDocumentErrorValue(createRefreshError(nextSource, getErrorMessage(error)));
      });
    }
  }, [closeCompareRefPrompt, compareRefInput, loadSource, loadingSource$, setDocumentErrorValue, state$]);

  const toggleShowOnlyHunks = useCallback(() => {
    const currentState = state$.peek();
    let didToggle = false;
    if (currentState.status === "loaded" && currentState.source.kind === "folder") {
      const nextShowOnlyHunks = !getDiffShowOnlyHunksSetting();
      setDiffShowOnlyHunksSetting(nextShowOnlyHunks);
      loadSource(currentState.source, { reason: "mode-toggle" }).catch((error: unknown) => {
        setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
      });
      didToggle = true;
    }
    return didToggle;
  }, [loadSource, setDocumentErrorValue, state$]);

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
  }, [state$]);

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
  }, [copyText, state$]);

  const copyCurrentFilePath = useCallback(() => {
    let didCopy = false;
    const currentState = state$.peek();
    const currentVisibleFolderPath = currentState.source?.kind === "folder" ? currentState.source.value : null;
    if (currentState.status === "loaded" && currentVisibleFolderPath) {
      const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.peek());
      if (activeFile) {
        didCopy = copyText(getJoinedPath(currentVisibleFolderPath, activeFile.path));
      }
    }
    return didCopy;
  }, [activeFileIndex$, copyText, state$]);

  const copyCurrentRelativePath = useCallback(() => {
    let didCopy = false;
    const currentState = state$.peek();
    if (currentState.status === "loaded") {
      const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.peek());
      if (activeFile) {
        didCopy = copyText(activeFile.path);
      }
    }
    return didCopy;
  }, [activeFileIndex$, copyText, state$]);

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
  }, [loadingSource$, setSidebarCollapsedValue, state$]);

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
  }, [loadingSource$, setSidebarCollapsedValue, state$]);

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
  const listSyntaxTheme = syntaxTheme.name;
  const sideBySideDataVersion = useMemo(
    () => hashDiffNativeRowConfigVersion([diffRows.dataVersion, collapsedFileIndexesKey, sideBySideRowCount]),
    [collapsedFileIndexesKey, diffRows.dataVersion, sideBySideRowCount],
  );
  const listExtraData = useMemo<DiffListExtraData>(
    () => ({
      adaptiveLightModeEnabled,
      borderColor: diffPalette.border,
      collapsedFileIndexes,
      collapsedFileIndexesKey,
      fileHeaderBackgroundColor,
      fontFamily,
      fontSize,
      foregroundColor,
      mutedColor,
      rowRenderer,
      rowHeight,
      showOnlyHunks,
      sideBySideRowCount,
      syntaxAppearance: syntaxTheme.appearance,
      syntaxHighlightingEnabled,
      syntaxTheme: listSyntaxTheme,
    }),
    [
      adaptiveLightModeEnabled,
      collapsedFileIndexes,
      collapsedFileIndexesKey,
      diffPalette.border,
      fileHeaderBackgroundColor,
      fontFamily,
      fontSize,
      foregroundColor,
      listSyntaxTheme,
      mutedColor,
      rowRenderer,
      rowHeight,
      showOnlyHunks,
      sideBySideRowCount,
      syntaxHighlightingEnabled,
      syntaxTheme.appearance,
    ],
  );
  const nativeUnifiedRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
    const palette = getDiffRowPalette(syntaxTheme.appearance);
    const configId = `diff:${loadedDocumentId}:unified`;
    const configVersion = hashDiffNativeRowConfigVersion([
      configId,
      diffUnifiedChangeBarWidth,
      diffUnifiedLineNumberWidth,
      diffUnifiedMarkerWidth,
      fontFamily,
      fontSize,
      foregroundColor,
      mutedColor,
      palette.addAccent,
      palette.addBackground,
      palette.removeAccent,
      palette.removeBackground,
      rowHeight,
      syntaxHighlightingEnabled,
      listSyntaxTheme,
    ]);
    return {
      addAccentColor: palette.addAccent,
      addBackgroundColor: palette.addBackground,
      changeBarWidth: diffUnifiedChangeBarWidth,
      collapsedFileIndexes: "",
      configId,
      configVersion,
      dividerColor: "transparent",
      documentId: loadedDocumentId,
      fontFamily,
      fontSize,
      foregroundColor,
      lineNumberWidth: diffUnifiedLineNumberWidth,
      markerWidth: diffUnifiedMarkerWidth,
      mutedColor,
      presentation: "unified",
      removeAccentColor: palette.removeAccent,
      removeBackgroundColor: palette.removeBackground,
      rowHeight,
      syntaxHighlightingEnabled,
      themeName: listSyntaxTheme,
    };
  }, [
    fontFamily,
    fontSize,
    foregroundColor,
    listSyntaxTheme,
    loadedDocumentId,
    mutedColor,
    rowHeight,
    syntaxHighlightingEnabled,
    syntaxTheme.appearance,
  ]);
  const nativeSideBySideRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
    const palette = getDiffRowPalette(syntaxTheme.appearance);
    const dividerColor = getSideBySideDividerColor(syntaxTheme.appearance);
    const configId = `diff:${loadedDocumentId}:blocks`;
    const configVersion = hashDiffNativeRowConfigVersion([
      configId,
      collapsedFileIndexesKey,
      dividerColor,
      diffSideBySideLineNumberWidth,
      diffSideBySideMarkerWidth,
      fontFamily,
      fontSize,
      foregroundColor,
      mutedColor,
      palette.addAccent,
      palette.addBackground,
      palette.removeAccent,
      palette.removeBackground,
      rowHeight,
      syntaxHighlightingEnabled,
      listSyntaxTheme,
    ]);
    return {
      addAccentColor: palette.addAccent,
      addBackgroundColor: palette.addBackground,
      changeBarWidth: 0,
      collapsedFileIndexes: collapsedFileIndexesKey,
      configId,
      configVersion,
      dividerColor,
      documentId: loadedDocumentId,
      fontFamily,
      fontSize,
      foregroundColor,
      lineNumberWidth: diffSideBySideLineNumberWidth,
      markerWidth: diffSideBySideMarkerWidth,
      mutedColor,
      presentation: "blocks",
      removeAccentColor: palette.removeAccent,
      removeBackgroundColor: palette.removeBackground,
      rowHeight,
      syntaxHighlightingEnabled,
      themeName: listSyntaxTheme,
    };
  }, [
    collapsedFileIndexesKey,
    fontFamily,
    fontSize,
    foregroundColor,
    listSyntaxTheme,
    loadedDocumentId,
    mutedColor,
    rowHeight,
    syntaxHighlightingEnabled,
    syntaxTheme.appearance,
  ]);
  const renderFields = useMemo<DiffRenderFields>(
    () => ({
      borderColor: diffPalette.border,
      collapsedFileIndexList,
      document: loadedDocument,
      fileHeaderBackgroundColor,
      fileByIndex,
      fileByRowStart,
      fileHeaderRowIndexes,
      fontFamily,
      fontSize,
      foregroundColor,
      hunkHeaderBackgroundColor,
      mutedColor,
      nativeSideBySideRowConfigId: nativeSideBySideRowConfig.configId,
      nativeSideBySideRowConfigVersion: nativeSideBySideRowConfig.configVersion,
      nativeUnifiedRowConfigId: nativeUnifiedRowConfig.configId,
      nativeUnifiedRowConfigVersion: nativeUnifiedRowConfig.configVersion,
      rowRenderer,
      rowHeight,
      showOnlyHunks,
      sideBySideFileHeaderByListIndex,
      sideBySideRowCount,
      syntaxAppearance: syntaxTheme.appearance,
      syntaxHighlightingEnabled,
      syntaxStyleStore,
      syntaxThemeName: listSyntaxTheme,
      toggleFileCollapsed,
    }),
    [
      diffPalette.border,
      collapsedFileIndexList,
      fileHeaderBackgroundColor,
      fileByIndex,
      fileByRowStart,
      fileHeaderRowIndexes,
      fontFamily,
      fontSize,
      foregroundColor,
      hunkHeaderBackgroundColor,
      loadedDocument,
      mutedColor,
      nativeSideBySideRowConfig.configId,
      nativeSideBySideRowConfig.configVersion,
      nativeUnifiedRowConfig.configId,
      nativeUnifiedRowConfig.configVersion,
      rowRenderer,
      rowHeight,
      showOnlyHunks,
      sideBySideFileHeaderByListIndex,
      sideBySideRowCount,
      syntaxHighlightingEnabled,
      syntaxStyleStore,
      syntaxTheme.appearance,
      listSyntaxTheme,
      toggleFileCollapsed,
    ],
  );

  const scrollToFile = useCallback((file: DiffFileSummary) => {
    const rowStart = Math.max(0, Math.floor(file.rowStart));
    const listIndex = viewMode === "unified"
      ? getVisibleListIndex(rowStart)
      : sideBySideListIndexByRowIndex.get(rowStart);
    if (listIndex !== undefined) {
      listRef.current?.scrollToIndex({
        animated: true,
        index: listIndex,
        viewOffset: diffTitlebarTopInset,
        viewPosition: 0,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  }, [getVisibleListIndex, sideBySideListIndexByRowIndex, viewMode]);

  const handleSidebarFilePress = useCallback((file: DiffFileSummary) => {
    activeFileIndex$.set(file.index);
    requestAnimationFrame(() => {
      scrollToFile(file);
    });
  }, [activeFileIndex$, scrollToFile]);

  const renderSidebarEntry = useCallback(({ item }: LegendListRenderItemProps<DiffSidebarEntry>) => {
    let row: ReactElement;
    if (item.type === "folder") {
      row = <DiffSidebarFolderRow color={sidebarFolderColor} title={item.title} />;
    } else {
      const file = item.file;
      const mergeFile = getMergeConflictFileForDiffFile(mergeState, file);
      const statusPresentation = mergeFile?.markerBlocks.length
        ? getConflictedFileStatusPresentation()
        : getFileStatusPresentation(file);
      if (!loggedFirstSidebarFileRenderRef.current) {
        loggedFirstSidebarFileRenderRef.current = true;
        logDiffOpenTiming("viewer.sidebarFile.render.first", () => ({
          fileIndex: file.index,
          filePath: file.path,
        }));
      }

      row = (
        <DiffSidebarFileRow
          activeFileIndex$={activeFileIndex$}
          conflictBadgeBackgroundColor={sidebarConflictBadgeBackgroundColor}
          conflictBadgeTextColor={sidebarConflictBadgeTextColor}
          file={file}
          foregroundColor={foregroundColor}
          mergeFile={mergeFile}
          onPressFile={handleSidebarFilePress}
          selectedBackgroundColor={selectedSidebarFileBackgroundColor}
          selectedBorderColor={diffPalette.sidebarSelectedBorder}
          statusPresentation={statusPresentation}
        />
      );
    }

    return row;
  }, [
    activeFileIndex$,
    diffPalette.sidebarSelectedBorder,
    foregroundColor,
    handleSidebarFilePress,
    mergeState,
    selectedSidebarFileBackgroundColor,
    sidebarFolderColor,
    sidebarConflictBadgeBackgroundColor,
    sidebarConflictBadgeTextColor,
  ]);

  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextMetrics = {
      contentHeight: Math.round(event.nativeEvent.contentHeight || event.nativeEvent.height),
      contentWidth: Math.round(event.nativeEvent.contentWidth),
      contentX: Math.round(event.nativeEvent.contentX),
      sidebarHeight: Math.round(event.nativeEvent.sidebarHeight || event.nativeEvent.height),
      sidebarWidth: Math.round(event.nativeEvent.sidebarWidth),
    };
    const previousDiffPaneHeight = diffPaneHeight$.peek();
    logDiffOpenTiming("viewer.splitView.resize", () => ({
      contentHeight: nextMetrics.contentHeight,
      contentWidth: nextMetrics.contentWidth,
      contentX: nextMetrics.contentX,
      previousDiffPaneHeight,
      previousContentHeight: splitPaneMetrics$.peek().contentHeight,
      previousContentWidth: splitPaneMetrics$.peek().contentWidth,
      previousContentX: splitPaneMetrics$.peek().contentX,
      previousSidebarHeight: splitPaneMetrics$.peek().sidebarHeight,
      previousSidebarWidth: splitPaneMetrics$.peek().sidebarWidth,
      sidebarHeight: nextMetrics.sidebarHeight,
      sidebarWidth: nextMetrics.sidebarWidth,
    }));
    setSplitPaneMetricsValue(nextMetrics);
    const shouldSaveSidebarWidth =
      nextMetrics.sidebarWidth >= defaultDiffSidebarWidth &&
      !sidebarCollapsed$.peek() &&
      (nextMetrics.sidebarWidth >= sidebarWidth || nextMetrics.contentWidth > diffContentMinWidth);
    if (shouldSaveSidebarWidth) {
      setDiffSidebarWidthSetting(nextMetrics.sidebarWidth);
    }
    if (nextMetrics.contentHeight > 0 && previousDiffPaneHeight !== nextMetrics.contentHeight) {
      setDiffPaneHeightValue(nextMetrics.contentHeight);
    }
  }, [diffPaneHeight$, setDiffPaneHeightValue, setSplitPaneMetricsValue, sidebarCollapsed$, sidebarWidth, splitPaneMetrics$]);

  const handleDiffPaneLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    const previousHeight = diffPaneHeight$.peek();
    logDiffOpenTiming("viewer.diffPane.layout", () => ({
      height: nextHeight,
      previousHeight,
      rawHeight: Number(event.nativeEvent.layout.height.toFixed(1)),
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    }));
    if (nextHeight > 0 || previousHeight === 0) {
      setDiffPaneHeightValue(nextHeight);
    }
  }, [diffPaneHeight$, setDiffPaneHeightValue]);

  const handleSidebarListLayout = useCallback((event: LayoutChangeEvent) => {
    const currentState = state$.peek();
    logDiffOpenTiming("viewer.sidebarList.layout", () => ({
      fileCount: currentState.status === "loaded" ? currentState.files.length : 0,
      height: Number(event.nativeEvent.layout.height.toFixed(1)),
      status: currentState.status,
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    }));
  }, [state$]);

  const getItemType = useCallback((index: number) => (
    fileHeaderRowIndexes.has(index) ? "file-header" : "diff-line"
  ), [fileHeaderRowIndexes]);

  const getItemSize = useCallback((index: number) => {
    if (getItemType(index) === "file-header") {
      return diffFileHeaderRowHeight;
    }

    if (!showOnlyHunks) {
      return rowHeight;
    }

    const row = loadedDocument?.getPlainRows(index, 1)[0];
    return rowHeight + (isDiffUnifiedHunkStart(loadedDocument, index, row) ? diffHunkHeaderHeight : 0);
  }, [getItemType, loadedDocument, rowHeight, showOnlyHunks]);

  const renderRow = useCallback(
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
      if (!loggedFirstUnifiedRowRenderRef.current) {
        loggedFirstUnifiedRowRenderRef.current = true;
        logDiffOpenTiming("viewer.unifiedRow.render.first", () => ({
          hasRow: row !== undefined,
          index,
          rowKind: row?.kind,
        }));
        prewarmItemCountLimit(loadedDocumentId, "unified-row-render");
      }
      return (
        <DiffUnifiedRow
          adaptiveRender={adaptiveRender}
          collapsedFileIndexes$={collapsedFileIndexes$}
          index={index}
          renderFields={renderFields}
          row={row}
        />
      );
    },
    [collapsedFileIndexes$, loadedDocumentId, prewarmItemCountLimit, renderFields],
  );

  const getSideBySideItemType = useCallback((index: number) => {
    return sideBySideFileHeaderIndexes.has(index) ? "file-header" : "side-by-side-line";
  }, [sideBySideFileHeaderIndexes]);

  const getSideBySideItemSize = useCallback((index: number) => {
    if (sideBySideFileHeaderIndexes.has(index)) {
      return diffFileHeaderRowHeight;
    }

    const row = loadedDocument?.getPlainSideBySideRow(index, collapsedFileIndexList);
    return rowHeight + (showOnlyHunks && isDiffSideBySideHunkStart(loadedDocument, index, collapsedFileIndexList, row) ? diffHunkHeaderHeight : 0);
  }, [collapsedFileIndexList, loadedDocument, rowHeight, showOnlyHunks, sideBySideFileHeaderIndexes]);

  const renderSideBySideRow = useCallback(
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => {
      if (!loggedFirstSideBySideRowRenderRef.current) {
        loggedFirstSideBySideRowRenderRef.current = true;
        logDiffOpenTiming("viewer.sideBySideRow.render.first", () => ({
          hasRow: row !== undefined,
          index,
          rowKind: row?.kind,
        }));
        prewarmItemCountLimit(loadedDocumentId, "side-by-side-row-render");
      }
      return (
        <DiffSideBySideRow
          adaptiveRender={adaptiveRender}
          collapsedFileIndexes$={collapsedFileIndexes$}
          index={index}
          renderFields={renderFields}
          row={row}
        />
      );
    },
    [collapsedFileIndexes$, loadedDocumentId, prewarmItemCountLimit, renderFields],
  );

  const documentErrorHeight = documentError
    ? documentError.kind === "permission"
      ? diffDocumentPermissionErrorHeight
      : diffDocumentErrorHeight
    : 0;
  const diffTopChromeContentHeight = documentErrorHeight;
  const diffTopChromeHeight = diffTopChromeContentHeight > 0 ? diffTitlebarTopInset + diffTopChromeContentHeight : 0;
  const activeItemIndexes = renderViewMode === "unified"
    ? visibleItemIndexes
    : sideBySideItemIndexes;
  const documentErrorBody = (
    <DiffDocumentErrorBody
      borderColor={diffPalette.border}
      dangerColor={diffPalette.danger}
      documentError={documentError}
      foregroundColor={foregroundColor}
      mutedColor={mutedColor}
      onDismiss={dismissDocumentError}
      onOpenExternalUrl={openExternalErrorUrl}
      onOpenSystemSettings={openPermissionSettings}
      onRetry={reloadCurrentSource}
    />
  );
  const unsavedMergeDraftBanner = hasUnsavedMergeDrafts ? (
    <DiffUnsavedMergeDraftBannerWithSavingState
      dangerColor={diffPalette.danger}
      fileCount={unsavedMergeDraftFiles.length}
      onDiscard={discardMergeDraftsFromCommand}
      onSave={saveMergeDraftsFromCommand}
      primaryColor={diffPalette.primary}
      resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}
    />
  ) : null;
  const startScreenOpenErrorBody = startScreenController.openError ? (
    <DiffErrorPanel
      borderColor={diffPalette.border}
      chooseFolderLabel={startScreenController.openError.kind === "permission" ? "Choose Another Folder" : undefined}
      dangerColor={diffPalette.danger}
      error={startScreenController.openError}
      foregroundColor={foregroundColor}
      mutedColor={mutedColor}
      onChooseFolder={openFolder}
      onDismiss={startScreenController.dismissOpenError}
      onOpenExternalUrl={openExternalErrorUrl}
      onOpenSystemSettings={startScreenController.openError.kind === "permission" ? openPermissionSettings : undefined}
      onRetry={startScreenController.openError.kind !== "permission" && startScreenController.openError.source ? startScreenController.retryOpenError : undefined}
    />
  ) : null;
  let body: ReactNode;
  const initialLoadingSource = startScreenController.openError ? null : source ?? null;
  const emptyLoadingSource = state.status === "empty" ? loadingSource ?? initialLoadingSource : null;

  if (state.status === "fatal") {
    body = (
      <DiffFatalBody
        borderColor={diffPalette.border}
        dangerColor={diffPalette.danger}
        error={state.error}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onChooseFolder={openFolder}
      />
    );
  } else if (state.status === "loaded") {
    body = (
      <DiffLoadedBody
        activeFileIndex$={activeFileIndex$}
        activeItemIndexes={activeItemIndexes}
        adaptiveLightModeEnabled={adaptiveLightModeEnabled}
        backgroundColor={backgroundColor}
        diffPaneHeight$={diffPaneHeight$}
        diffTopChromeHeight={diffTopChromeHeight}
        diffRows={diffRows}
        documentErrorBody={documentErrorBody}
        fileFilterInputRef={fileFilterInputRef}
        floatingDocumentBanner={unsavedMergeDraftBanner}
        getItemSize={getItemSize}
        getItemType={getItemType}
        getRow={getRow}
        getSideBySideItemSize={getSideBySideItemSize}
        getSideBySideItemType={getSideBySideItemType}
        getSideBySideRow={getSideBySideRow}
        handleDiffPaneLayout={handleDiffPaneLayout}
        handleSidebarListLayout={handleSidebarListLayout}
        handleSideBySideTopItemChanged={handleSideBySideTopItemChanged}
        handleSideBySideVisibleRowsRequested={handleLimitedSideBySideVisibleRowsRequested}
        handleSplitViewResize={handleSplitViewResize}
        handleTopItemChanged={handleTopItemChanged}
        handleVisibleRowsRequested={handleVisibleRowsRequested}
        isRenderingInitialLoadedFrame={isRenderingInitialLoadedFrame}
        listExtraData={listExtraData}
        listRef={listRef}
        loadingSource={loadingSource}
        mergeState={mergeState}
        nativeSideBySideRowConfig={nativeSideBySideRowConfig}
        nativeUnifiedRowConfig={nativeUnifiedRowConfig}
        mutedColor={mutedColor}
        noChangesBody={(
          <DiffNoChangesBody
            foregroundColor={foregroundColor}
            mutedColor={mutedColor}
            visibleSourceLabel={visibleSourceLabel}
          />
        )}
        primaryColor={diffPalette.primary}
        renderRow={renderRow}
        renderSidebarEntry={renderSidebarEntry}
        renderSideBySideRow={renderSideBySideRow}
        requestSideBySideRange={requestSideBySideRange}
        resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}
        onResolveMergeConflict={resolveMergeConflict}
        rowHeight={rowHeight}
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
        sideBySideDataVersion={sideBySideDataVersion}
        sideBySideFileHeaderByListIndex={sideBySideFileHeaderByListIndex}
        sideBySideItemIndexes={sideBySideItemIndexes}
        splitPaneMetrics$={splitPaneMetrics$}
        state={state}
        syntaxAppearance={syntaxTheme.appearance}
        syntaxTokenizationVersion$={syntaxTokenizationVersion$}
        viewMode={renderViewMode}
        visibleItemIndexes={visibleItemIndexes}
      />
    );
  } else if (emptyLoadingSource) {
    body = (
      <DiffLoadingSplitBody
        backgroundColor={backgroundColor}
        foregroundColor={foregroundColor}
        handleSplitViewResize={handleSplitViewResize}
        mutedColor={mutedColor}
        sidebarCollapsed={sidebarCollapsed}
        sidebarWidth={sidebarWidth}
        source={emptyLoadingSource}
        syntaxAppearance={syntaxTheme.appearance}
      />
    );
  } else {
    body = (
      <DiffStartScreen
        backgroundColor={backgroundColor}
        borderColor={diffPalette.border}
        dangerColor={diffPalette.danger}
        foregroundColor={foregroundColor}
        isLoading={isLoading}
        loadingSource={loadingSource}
        mutedColor={mutedColor}
        onChangeUrlInput={startScreenController.onChangeUrlInput}
        onChooseFolder={openFolder}
        onCompareFiles={compareFiles}
        onOpenRecentSource={startScreenController.onOpenRecentSource}
        onOpenUrl={startScreenController.onOpenUrl}
        openErrorBody={startScreenOpenErrorBody}
        recentFilter={startScreenController.recentFilter}
        recentSources={startScreenController.recentSources}
        setRecentFilter={startScreenController.setRecentFilter}
        sidebarBackgroundColor={diffPalette.sidebarBackground}
        urlInput={startScreenController.urlInput}
        urlInputError={startScreenController.urlInputError}
        urlInputRef={urlInputRef}
      />
    );
  }

  return (
    <>
      <DiffWindowChromeController compareRepoState={compareRepoState} hasUnsavedMergeDrafts={hasUnsavedMergeDrafts} />
      <DiffNativeMenuSavingStateController
        hasUnsavedMergeDrafts={hasUnsavedMergeDrafts}
        resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}
      />
      <DiffWindowToolbarItemController
        compareCurrentSource={compareCurrentSource}
        openCompareRefPrompt={openCompareRefPrompt}
        toggleSidebar={toggleSidebar}
      />
      <DiffLaunchController
        focusUrlInputRequestId={focusUrlInputRequestId}
        folderPath={folderPath}
        loadRequestIdRef={loadRequestIdRef}
        loadSource={loadSource}
        loadTraceRef={loadTraceRef}
        source={source}
        urlInputRef={urlInputRef}
      />
      <DiffLoadCompletionController
        loadTraceRef={loadTraceRef}
        loggedTraceDocumentRef={loggedTraceDocumentRef}
      />
      <DiffFileWatcherController loadSource={loadSource} suppressReloadUntilRef={suppressFileWatcherReloadUntilRef} />
      <DiffActionHandlersController
        copyCurrentFilePath={copyCurrentFilePath}
        copyCurrentRelativePath={copyCurrentRelativePath}
        copyCurrentSource={copyCurrentSource}
        focusFileFilter={focusFileFilter}
        reloadCurrentSource={reloadCurrentSource}
        revealCurrentFolder={revealCurrentFolder}
        saveMergeDrafts={saveMergeDraftsFromCommand}
        toggleShowOnlyHunks={toggleShowOnlyHunks}
        toggleSidebar={toggleSidebar}
      />
      <DiffDropSurface
        backgroundColor={backgroundColor}
        borderColor={diffPalette.primary}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onDropDiff={handleDropDiff}
        syntaxAppearance={syntaxTheme.appearance}
      >
        {body}
        <DiffStatisticsPanel
          borderColor={diffPalette.border}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          syntaxAppearance={syntaxTheme.appearance}
        />
        {compareRefPromptVisible ? (
          <DiffCompareRefPrompt
            backgroundColor={diffPalette.surface}
            borderColor={diffPalette.border}
            foregroundColor={foregroundColor}
            mutedColor={mutedColor}
            onCancel={closeCompareRefPrompt}
            onChangeValue={setCompareRefInput}
            onSubmit={submitCompareRefPrompt}
            value={compareRefInput}
          />
        ) : null}
      </DiffDropSurface>
    </>
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
  loadingTitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  compareRefPrompt: {
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 360,
  },
  compareRefPromptActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  compareRefPromptButton: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    height: 26,
    justifyContent: "center",
    minWidth: 74,
    paddingHorizontal: 10,
  },
  compareRefPromptButtonText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  compareRefPromptInput: {
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    height: 30,
    lineHeight: 18,
    paddingHorizontal: 9,
  },
  compareRefPromptOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "flex-start",
    left: 0,
    paddingTop: diffTitlebarTopInset + 54,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 60,
  },
  compareRefPromptTitle: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  loadedRoot: {
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
  diffPane: {
    flex: 1,
  },
  diffPaneContent: {
    flex: 1,
    minHeight: 0,
  },
  diffPaneTopChrome: {
    paddingTop: diffTitlebarTopInset,
  },
  diffWorkspace: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
    minWidth: 0,
  },
  nativeDiffRowConfig: {
    height: 0,
    overflow: "hidden",
    width: 0,
  },
  diffTitlebarSpacer: {
    height: diffTitlebarTopInset,
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
  list: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
  sidebar: {
    flex: 1,
    paddingBottom: 8,
    paddingTop: diffSidebarTopInset,
  },
  sidebarFile: {
    borderColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: diffSidebarFileRowHeight,
  },
  sidebarFolder: {
    height: diffSidebarFileRowHeight,
  },
  sidebarFilter: {
    marginHorizontal: 12,
    marginTop: diffSidebarFilterMarginTop,
    minHeight: diffSidebarFilterHeight,
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
  statisticsLabel: {
    fontSize: 11,
    lineHeight: 15,
  },
  statisticsPanel: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 14,
    minWidth: 190,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "absolute",
    right: 14,
    zIndex: 40,
  },
  statisticsRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
  },
  statisticsRows: {
    gap: 2,
  },
  statisticsTitle: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginBottom: 4,
  },
  statisticsValue: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    lineHeight: 15,
  },
  unsavedMergeBanner: {
    alignItems: "center",
    left: 0,
    paddingHorizontal: 20,
    position: "absolute",
    right: 0,
    top: diffTitlebarTopInset + 10,
    zIndex: 35,
  },
  mergeChoiceButton: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    justifyContent: "center",
    width: 54,
  },
  mergeChoiceBothIcons: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    justifyContent: "center",
  },
  mergeChoiceColumn: {
    alignItems: "center",
    gap: 5,
    justifyContent: "center",
    position: "absolute",
    top: -31,
    width: 82,
  },
  mergeCodeLine: {
    flexDirection: "row",
    minWidth: 0,
  },
  mergeCodeText: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    paddingRight: 10,
  },
  mergeCommonMiddle: {
    alignItems: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    overflow: "visible",
    position: "relative",
    width: 82,
  },
  mergeCommonPane: {
    flex: 1,
    minWidth: 0,
  },
  mergeCommonRow: {
    flexDirection: "row",
    overflow: "visible",
  },
  mergeHunkHeader: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: diffHunkHeaderHeight,
    paddingLeft: 10,
    paddingRight: 10,
  },
  mergeHunkHeaderTitle: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
  },
  mergeLineNumber: {
    textAlign: "right",
  },
  mergeNativePane: {
    flex: 1,
  },
  mergeResolvingText: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 12,
  },
});

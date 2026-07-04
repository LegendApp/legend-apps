import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { commandRunner } from "@legend-desktop/command-runner";
import {
  DiffMergeNativePane,
  DiffNativeRowConfig,
  loadUnifiedDiff,
  loadUnifiedDiffFromUrl,
  startGitFolderDiff,
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
  type VirtualizedFixedDocumentListRef,
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-desktop/virtualized-document";
import {
  LegendList,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type NativeSyntheticEvent } from "react-native";
import { confirmUnsavedDiffMergeDrafts } from "./confirmUnsavedDiffMergeDrafts";
import { getDiffRecentDocumentPath, getDiffSourceLabel, getFilename, normalizeDiffOpenSource, openDiffFolderDialog, type DiffOpenSource } from "./diffFiles";
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
  areDiffMergeConflictActionsDisabled,
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
  diffBackgroundTokenizePollMs,
  diffBackgroundTokenizeStartDelayMs,
  diffInitialRowCount,
  diffLineOverscan,
  diffOverscanRequestDelayMs,
  diffProgressiveLoadPollMs,
  diffRowKindFileHeader,
  diffSidebarFileRowHeight,
  diffSidebarTopInset,
  diffTitlebarTopInset,
} from "./viewer/diffViewerConstants";
import {
  findFileIndexForRow,
  useDiffLoadedModel,
  useDiffSideBySideRuntime,
} from "./viewer/diffLoadedDocumentModel";
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
  emptyDiffViewerState,
  unavailableDiffMergeState,
  useDiffViewerModel,
  type DiffFatalError,
  type DiffLoadedState,
  type DiffLoadSourceOptions,
  type DiffLoadTrace,
  type DiffRecoverableError,
  type DiffSplitPaneMetrics,
  type DiffViewerState,
} from "./viewer/diffViewerModel";
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
const diffUnsavedMergeBannerHeight = 48;

type DiffCommandResult = Awaited<ReturnType<typeof commandRunner.runCommand>>;
type DiffLoadedPayload = DiffLoadResult | DiffLoadProgress;

type DiffLoadedCacheEntry = {
  loaded: DiffLoadedPayload;
  loadComplete: boolean;
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

function createGitDiffCommandError(commandResult: DiffCommandResult) {
  const message = commandResult.stderr
    ? commandResult.stderr
    : `git diff exited with code ${commandResult.exitCode}.`;
  return new Error(message);
}

function waitForDiffProgressPoll() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, diffProgressiveLoadPollMs);
  });
}

function shouldPublishInitialProgress(progress: DiffLoadProgress, initialRowCount: number) {
  return progress.initialRows.length > 0
    || (initialRowCount <= 0 && progress.files.length > 0)
    || progress.complete
    || !!progress.error;
}

function getDiffSourceCacheKey(source: DiffOpenSource) {
  if (source.kind === "github") {
    return `${source.kind}:${source.diffUrl}`;
  }
  if (source.kind === "git") {
    return `${source.kind}:${source.cwd}:${source.args.join("\u0000")}`;
  }
  return `${source.kind}:${source.value}`;
}

function getDiffLoadedCacheKey(source: DiffOpenSource, showOnlyHunks: boolean) {
  const mode = showOnlyHunks ? "hunks" : "full";
  return `${getDiffSourceCacheKey(source)}:${mode}`;
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

type DiffSidebarFileRowProps = {
  activeFileIndex$: Observable<number | null>;
  conflictBadgeBackgroundColor: string;
  conflictBadgeTextColor: string;
  file: DiffFileSummary;
  foregroundColor: string;
  mergeFile: DiffMergeConflictFile | null;
  onPress: () => void;
  selectedBorderColor: string;
  selectedBackgroundColor: string;
  statusPresentation: ReturnType<typeof getFileStatusPresentation>;
};

type DiffSidebarFolderRowProps = {
  mutedColor: string;
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
  diffContentHeight: number;
  diffListHeight: number;
  diffPaneHeight: number;
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
  handleSideBySideVisibleRowsRequested: (start: number, count: number, reason: VirtualizedDocumentRequestReason) => void;
  handleSplitViewResize: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void;
  handleTopItemChanged: (rowIndex: number) => void;
  handleVisibleRowsRequested: (start: number, count: number, reason: string) => void;
  isRenderingInitialLoadedFrame: boolean;
  listExtraData: DiffListExtraData;
  listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
  loadingSource: DiffOpenSource | null;
  mergeState: DiffMergeState;
  nativeSideBySideRowConfig: DiffNativeRowConfigProps;
  nativeUnifiedRowConfig: DiffNativeRowConfigProps;
  adaptiveLightModeEnabled: boolean;
  mutedColor: string;
  primaryColor: string;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => ReactElement;
  renderSidebarEntry: (props: LegendListRenderItemProps<DiffSidebarEntry>) => ReactElement;
  renderSideBySideRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => ReactElement;
  requestSideBySideRange: (lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => void;
  resolvingMergeConflictKeys: ReadonlySet<string>;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  rowHeight: number;
  sidebarCollapsed: boolean;
  sidebarListHeight: number;
  sidebarWidth: number;
  sideBySideDataVersion: number;
  sideBySideFileHeaderByListIndex: Map<number, DiffSideBySideFileHeader>;
  sideBySideItemIndexes: Array<number | undefined>;
  splitPaneMetrics: DiffSplitPaneMetrics;
  state: DiffLoadedState;
  syntaxAppearance: "dark" | "light";
  syntaxTokenizationProgress: DiffSyntaxTokenizationProgress;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
  visibleItemIndexes: Array<number | undefined>;
};

type DiffSyntaxTokenizationProgress = {
  progress: number;
  version: number;
  visible: boolean;
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
  sideBySideTokenStyleCount: number;
  syntaxAppearance: "dark" | "light";
  syntaxHighlightingEnabled: boolean;
  syntaxTheme: DiffSettingsFile["syntaxTheme"];
  tokenStyleCount: number;
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
  tokenizationVersion: number;
};

type DiffInlineMergeRow = {
  file: DiffMergeConflictFile;
  itemIndex: number;
  row: DiffMergeDisplayRow;
  rowIndex: number;
  sourceFileIndex: number;
  sourceRowIndex: number;
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

function parseHexColor(color: string) {
  const normalized = color.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }
  return {
    b: Number.parseInt(hex.slice(4, 6), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    r: Number.parseInt(hex.slice(0, 2), 16),
  };
}

function toHexColor({ b, g, r }: { b: number; g: number; r: number }) {
  const toHexComponent = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`;
}

function mixHexColor(color: string, targetColor: string, amount: number, fallbackColor: string) {
  const parsedColor = parseHexColor(color);
  const parsedTarget = parseHexColor(targetColor);
  if (!parsedColor || !parsedTarget) {
    return fallbackColor;
  }
  return toHexColor({
    b: parsedColor.b + (parsedTarget.b - parsedColor.b) * amount,
    g: parsedColor.g + (parsedTarget.g - parsedColor.g) * amount,
    r: parsedColor.r + (parsedTarget.r - parsedColor.r) * amount,
  });
}

function getThemeAdjustedBackground(
  backgroundColor: string,
  appearance: "dark" | "light",
  darkAmount: number,
  lightAmount: number,
  fallbackColor: string,
) {
  return mixHexColor(
    backgroundColor,
    appearance === "dark" ? "#ffffff" : "#000000",
    appearance === "dark" ? darkAmount : lightAmount,
    fallbackColor,
  );
}

function getReadableBadgeTextColor(backgroundColor: string) {
  const parsedColor = parseHexColor(backgroundColor);
  if (!parsedColor) {
    return "#ffffff";
  }
  const luminance = (0.2126 * parsedColor.r + 0.7152 * parsedColor.g + 0.0722 * parsedColor.b) / 255;
  return luminance > 0.55 ? "#111827" : "#ffffff";
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

function DiffSidebarFolderRow({ mutedColor, title }: DiffSidebarFolderRowProps) {
  return (
    <View style={styles.sidebarFolder}>
      <Text numberOfLines={1} style={[styles.sidebarFolderText, { color: mutedColor }]}>
        {title}
      </Text>
    </View>
  );
}

function DiffSidebarFileRow({
  activeFileIndex$,
  conflictBadgeBackgroundColor,
  conflictBadgeTextColor,
  file,
  foregroundColor,
  mergeFile,
  onPress,
  selectedBorderColor,
  selectedBackgroundColor,
  statusPresentation,
}: DiffSidebarFileRowProps) {
  const isActive = useValue(() => activeFileIndex$.get() === file.index);
  const filename = getFilename(file.path);

  return (
    <Pressable
      accessibilityLabel={`${filename}, ${statusPresentation.title}`}
      accessibilityRole="button"
      onPress={onPress}
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
      <View style={[styles.sidebarStatusIcon, { backgroundColor: statusPresentation.backgroundColor }]}>
        <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={11} yOffset={statusPresentation.iconYOffset} />
      </View>
      <Text numberOfLines={1} style={[styles.sidebarFileName, { color: foregroundColor }]}>
        {filename}{mergeFile?.hasUnsavedDraft ? " *" : ""}
      </Text>
      {mergeFile && mergeFile.markerBlocks.length > 0 ? (
        <View style={[styles.sidebarConflictBadge, { backgroundColor: conflictBadgeBackgroundColor }]}>
          <Text style={[styles.sidebarConflictBadgeText, { color: conflictBadgeTextColor }]}>
            {mergeFile.markerBlocks.length}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function getDiffLineRowHeight(fontSize: number) {
  return Math.max(20, fontSize + 9);
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
  floatingDocumentBanner,
  hasDocumentChrome,
  foregroundColor,
  mutedColor,
  visibleSourceLabel,
}: {
  documentErrorBody: ReactNode;
  floatingDocumentBanner: ReactNode;
  hasDocumentChrome: boolean;
  foregroundColor: string;
  mutedColor: string;
  visibleSourceLabel: string;
}) {
  return (
    <View style={styles.noChangesRoot}>
      {hasDocumentChrome ? (
        <View style={styles.noChangesTopChrome}>
          {documentErrorBody}
        </View>
      ) : null}
      <View style={styles.empty}>
        <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
          No changes
        </Text>
        <Text style={[styles.emptyText, { color: mutedColor }]} numberOfLines={2}>
          {visibleSourceLabel}
        </Text>
      </View>
      {floatingDocumentBanner}
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
  activeFileIndex$,
  activeItemIndexes,
  backgroundColor,
  diffContentHeight,
  diffListHeight,
  diffPaneHeight,
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
  primaryColor,
  renderRow,
  renderSidebarEntry,
  renderSideBySideRow,
  requestSideBySideRange,
  resolvingMergeConflictKeys,
  onResolveMergeConflict,
  rowHeight,
  sidebarCollapsed,
  sidebarListHeight,
  sidebarWidth,
  sideBySideDataVersion,
  sideBySideFileHeaderByListIndex,
  sideBySideItemIndexes,
  splitPaneMetrics,
  state,
  adaptiveLightModeEnabled,
  syntaxAppearance,
  syntaxTokenizationProgress,
  viewMode,
  visibleItemIndexes,
}: DiffLoadedBodyProps) {
  const [fileFilter, setFileFilter] = useState("");
  const bodyStartedAt = nowMs();
  const activeFileIndex = useValue(activeFileIndex$);
  const activeMergeFile = getActiveMergeFile({ activeFileIndex, files: state.files, mergeState });
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
    resolvingMergeConflictKeys,
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
  const normalizedFileFilter = fileFilter.trim().toLowerCase();
  const filteredSidebarFiles = useMemo(
    () => state.files.filter((file) => fileMatchesFilter(file, normalizedFileFilter)),
    [normalizedFileFilter, state.files],
  );
  const sidebarEntries = useMemo(
    () => createDiffSidebarEntries(filteredSidebarFiles),
    [filteredSidebarFiles],
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

  if (activeItemIndexes.length === 0 && !activeMergeFile) {
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
    const nativeUnifiedRows = listExtraData.rowRenderer === "native" && viewMode === "unified";
    const nativeSideBySideRows = listExtraData.rowRenderer === "native" && viewMode !== "unified";
    const adaptiveRender = adaptiveLightModeEnabled ? diffAdaptiveRender : undefined;
    const requestUnifiedRange = nativeUnifiedRows ? noopVirtualizedDocumentRequestRange : diffRows.requestRange;
    const requestBlocksRange = nativeSideBySideRows ? noopVirtualizedDocumentRequestRange : requestSideBySideRange;
    const nativeRowConfig = nativeUnifiedRows ? nativeUnifiedRowConfig : nativeSideBySideRows ? nativeSideBySideRowConfig : null;
    const hasTopChrome = diffTopChromeHeight > 0;
    const listHeader = hasTopChrome ? undefined : <View style={styles.diffTitlebarSpacer} />;
    const listHeaderHeight = hasTopChrome ? 0 : diffTitlebarTopInset;
    let list: ReactElement;
    if (viewMode === "unified") {
      list = (
        <VirtualizedFixedDocumentList
          adaptiveRender={adaptiveRender}
          dataVersion={`${diffRows.dataVersion}:${inlineMergeModel.dataVersion}`}
          key="unified"
          extraData={listExtraData}
          itemIndexes={inlineMergeModel.itemIndexes}
          ListHeaderComponent={listHeader}
          getDocumentIndex={inlineMergeModel.getDocumentIndex}
          getItemSize={(index) => inlineMergeModel.getItemSize(index, getItemSize)}
          getItemType={(index) => inlineMergeModel.getItemType(index, getItemType)}
          listHeaderHeight={listHeaderHeight}
          lineOverscan={diffLineOverscan}
          listRef={listRef}
          onTopItemChanged={(index) => {
            const mergeRow = inlineMergeModel.getInlineMergeRow(index);
            if (mergeRow) {
              activeFileIndex$.set(mergeRow.sourceFileIndex);
            } else {
              handleTopItemChanged(index);
            }
          }}
          onVisibleRowsRequested={nativeUnifiedRows ? undefined : handleVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={requestUnifiedRange}
          requestRangesOnScroll={!nativeUnifiedRows}
          getRow={(index) => inlineMergeModel.getInlineMergeRow(index) ?? (nativeUnifiedRows ? undefined : getRow(index))}
          rowHeight={rowHeight}
          renderRow={(props) => (
            inlineMergeModel.getInlineMergeRow(props.index)
              ? inlineMergeModel.renderMergeRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>)
              : renderRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>)
          )}
          style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
        />
      );
    } else {
      list = (
        <VirtualizedFixedDocumentList
          adaptiveRender={adaptiveRender}
          dataVersion={`${sideBySideDataVersion}:${inlineMergeModel.dataVersion}`}
          key={viewMode}
          extraData={listExtraData}
          itemIndexes={inlineMergeModel.itemIndexes}
          ListHeaderComponent={listHeader}
          getDocumentIndex={inlineMergeModel.getDocumentIndex}
          getItemSize={(index) => inlineMergeModel.getItemSize(index, getSideBySideItemSize)}
          getItemType={(index) => inlineMergeModel.getItemType(index, getSideBySideItemType)}
          getRow={(index) => inlineMergeModel.getInlineMergeRow(index) ?? (nativeSideBySideRows ? undefined : getSideBySideRow(index))}
          listHeaderHeight={listHeaderHeight}
          lineOverscan={Math.max(12, Math.floor(diffLineOverscan / 10))}
          listRef={listRef}
          onTopItemChanged={(index) => {
            const mergeRow = inlineMergeModel.getInlineMergeRow(index);
            if (mergeRow) {
              activeFileIndex$.set(mergeRow.sourceFileIndex);
            } else {
              handleSideBySideTopItemChanged(index);
            }
          }}
          onVisibleRowsRequested={nativeSideBySideRows ? undefined : handleSideBySideVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={requestBlocksRange}
          requestRangesOnScroll={!nativeSideBySideRows}
          rowHeight={rowHeight}
          renderRow={(props) => (
            inlineMergeModel.getInlineMergeRow(props.index)
              ? inlineMergeModel.renderMergeRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>)
              : renderSideBySideRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>)
          )}
          style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
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
        {nativeRowConfig ? (
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
            tokenizationVersion={nativeRowConfig.tokenizationVersion}
          />
        ) : null}
        {list}
      </View>
    );
  }

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
      <TextInputSearch
        appearance={syntaxAppearance}
        defaultValue={fileFilter}
        onChangeText={setFileFilter}
        placeholder="Filter files"
        ref={fileFilterInputRef}
        style={styles.sidebarFilter}
      />
      {isSidebarLayoutReady ? (
        filteredSidebarFiles.length > 0 ? (
          <LegendList
            data={sidebarEntries}
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
            <DiffSyntaxProgressBar
              foregroundColor={syntaxAppearance === "dark" ? "#58a6ffe6" : "#0969dadb"}
              progress={syntaxTokenizationProgress.progress}
              visible={syntaxTokenizationProgress.visible}
            />
          </View>
        </View>
      </SidebarSplitView>
    </View>
  );
}

function DiffSyntaxProgressBar({
  foregroundColor,
  progress,
  visible,
}: {
  foregroundColor: string;
  progress: number;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <View accessibilityLabel="Syntax highlighting progress" pointerEvents="none" style={styles.syntaxProgressTrack}>
      <View
        style={[
          styles.syntaxProgressFill,
          {
            backgroundColor: foregroundColor,
            width: `${Math.max(0.02, Math.min(1, progress)) * 100}%`,
          },
        ]}
      />
    </View>
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
  resolvingMergeConflictKeys,
}: {
  block: DiffMergeConflictBlock | null;
  borderColor: string;
  file: DiffMergeConflictFile;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  resolvingMergeConflictKeys: ReadonlySet<string>;
}) {
  const controlsDisabled = areDiffMergeConflictActionsDisabled(file, block, resolvingMergeConflictKeys);
  const isResolving = block ? resolvingMergeConflictKeys.has(getMergeConflictKey(file, block)) : false;
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
  leftSyntaxLine,
  leftTokens,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  renderer,
  resolvingMergeConflictKeys,
  rightSyntaxLine,
  rightTokens,
  row,
  rowHeight,
  syntaxAppearance,
  tokenStyleById,
}: {
  borderColor: string;
  controlBlock: DiffMergeConflictBlock | null;
  file: DiffMergeConflictFile;
  fileHeaderBackgroundColor: string;
  foregroundColor: string;
  fontFamily: string;
  fontSize: number;
  leftSyntaxLine: SyntaxRenderLine;
  leftTokens: string;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  renderer: DiffRowRendererSetting;
  resolvingMergeConflictKeys: ReadonlySet<string>;
  rightSyntaxLine: SyntaxRenderLine;
  rightTokens: string;
  row: DiffMergeDisplayRow | undefined;
  rowHeight: number;
  syntaxAppearance: "dark" | "light";
  tokenStyleById: SyntaxStyleMap;
}) {
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
          resolvingMergeConflictKeys={resolvingMergeConflictKeys}
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
  resolvingMergeConflictKeys,
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
  resolvingMergeConflictKeys: ReadonlySet<string>;
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
  const [mergeSyntaxByPath, setMergeSyntaxByPath] = useState<Map<string, DiffMergeSyntaxState>>(() => new Map());
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
  const mergeSyntaxVersion = useMemo(
    () => [...mergeSyntaxByPath.values()].reduce((version, syntax) => version + syntax.configVersion, 0),
    [mergeSyntaxByPath],
  );
  const mergeListExtraData = useMemo(() => ({
    borderColor,
    dataVersion,
    foregroundColor,
    fontFamily,
    fontSize,
    mergeSyntaxVersion,
    mutedColor,
    primaryColor,
    resolvingMergeConflictKeys,
    rowHeight,
    rowRenderer,
    showOnlyHunks,
    syntaxAppearance,
  }), [
    borderColor,
    dataVersion,
    foregroundColor,
    fontFamily,
    fontSize,
    mergeSyntaxVersion,
    mutedColor,
    primaryColor,
    resolvingMergeConflictKeys,
    rowHeight,
    rowRenderer,
    showOnlyHunks,
    syntaxAppearance,
  ]);
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

  const createInlineRowsForFile = useCallback((
    file: DiffMergeConflictFile,
    sourceFileIndex: number,
    sourceRowIndex: number,
    nextItemIndex: { current: number },
    rowByItemIndex: Map<number, DiffInlineMergeRow>,
  ) => {
    const model = mergeDisplayModelByPath.get(file.path);
    if (!model || model.rows.length === 0) {
      return [];
    }

    const itemIndexes: number[] = [];
    for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
      const itemIndex = nextItemIndex.current;
      nextItemIndex.current -= 1;
      itemIndexes.push(itemIndex);
      rowByItemIndex.set(itemIndex, {
        file,
        itemIndex,
        row: model.rows[rowIndex],
        rowIndex,
        sourceFileIndex,
        sourceRowIndex,
      });
    }
    return itemIndexes;
  }, [mergeDisplayModelByPath]);

  const inlineList = useMemo(() => {
    const rowByItemIndex = new Map<number, DiffInlineMergeRow>();
    const nextItemIndex = { current: -1 };
    const fileByIndex = new Map(files.map((file) => [file.index, file]));
    const getMergeFile = (file: DiffFileSummary | undefined) => file ? getMergeConflictFileForDiffFile(mergeState, file) : null;
    const sourceRowByItemIndex = new Map<number, number>();
    let itemIndexes: number[];

    if (viewMode === "unified") {
      itemIndexes = [];
      let fileCursor = 0;
      for (const itemIndex of unifiedItemIndexes) {
        const rowIndex = itemIndex ?? itemIndexes.length;
        while (fileCursor < files.length) {
          const currentFile = files[fileCursor];
          const rowStart = Math.max(0, Math.floor(currentFile.rowStart));
          const rowEnd = rowStart + Math.max(0, Math.floor(currentFile.rowCount));
          if (rowEnd > rowIndex || fileCursor === files.length - 1) {
            break;
          }
          fileCursor += 1;
        }

        const file = files[fileCursor];
        const rowStart = file ? Math.max(0, Math.floor(file.rowStart)) : -1;
        const rowEnd = file ? rowStart + Math.max(0, Math.floor(file.rowCount)) : -1;
        const mergeFile = getMergeFile(file);
        if (file && mergeFile && rowIndex === rowStart) {
          itemIndexes.push(rowIndex);
          sourceRowByItemIndex.set(rowIndex, rowIndex);
          if (!collapsedFileIndexes.has(file.index)) {
            itemIndexes.push(...createInlineRowsForFile(mergeFile, file.index, rowStart, nextItemIndex, rowByItemIndex));
          }
        } else if (file && mergeFile && !collapsedFileIndexes.has(file.index) && rowIndex > rowStart && rowIndex < rowEnd) {
          // The merge rows replace the original conflicted file body.
        } else {
          itemIndexes.push(rowIndex);
          sourceRowByItemIndex.set(rowIndex, rowIndex);
        }
      }
    } else {
      itemIndexes = [];
      const headerListIndexes = [...sideBySideFileHeaderByListIndex.keys()].sort((left, right) => left - right);
      let skipUntil = -1;
      for (let listIndex = 0; listIndex < sideBySideItemIndexes.length; listIndex += 1) {
        if (listIndex < skipUntil) {
          continue;
        }

        const header = sideBySideFileHeaderByListIndex.get(listIndex);
        const file = header ? fileByIndex.get(header.fileIndex) : undefined;
        const mergeFile = getMergeFile(file);
        if (header && file && mergeFile && !collapsedFileIndexes.has(file.index)) {
          const nextHeader = headerListIndexes.find((headerIndex) => headerIndex > listIndex) ?? sideBySideItemIndexes.length;
          const rowIndex = sideBySideItemIndexes[listIndex] ?? listIndex;
          itemIndexes.push(rowIndex);
          sourceRowByItemIndex.set(rowIndex, rowIndex);
          itemIndexes.push(...createInlineRowsForFile(mergeFile, file.index, header.sourceStart, nextItemIndex, rowByItemIndex));
          skipUntil = nextHeader;
        } else {
          const rowIndex = sideBySideItemIndexes[listIndex] ?? listIndex;
          itemIndexes.push(rowIndex);
          sourceRowByItemIndex.set(rowIndex, rowIndex);
        }
      }
    }

    return {
      itemIndexes,
      rowByItemIndex,
      sourceRowByItemIndex,
    };
  }, [
    collapsedFileIndexes,
    createInlineRowsForFile,
    files,
    mergeState,
    sideBySideFileHeaderByListIndex,
    sideBySideItemIndexes,
    unifiedItemIndexes,
    viewMode,
  ]);

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
      const mergeSyntax = mergeSyntaxByPath.get(file.path);
      const leftSyntaxLine = getMergeSyntaxLine(mergeSyntax?.leftLines, rowIndex, displayRow?.leftText ?? "");
      const rightSyntaxLine = getMergeSyntaxLine(mergeSyntax?.rightLines, rowIndex, displayRow?.rightText ?? "");
      const tokenStyleById = mergeSyntax?.tokenStyleById ?? new Map<number, SyntaxStyle>();
      return (
        <DiffMergeLineRow
          borderColor={borderColor}
          controlBlock={controlBlock}
          file={file}
          fileHeaderBackgroundColor={fileHeaderBackgroundColor}
          foregroundColor={foregroundColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          leftSyntaxLine={leftSyntaxLine}
          leftTokens={encodeMergeNativeTokens(leftSyntaxLine, tokenStyleById, foregroundColor)}
          mutedColor={mutedColor}
          onResolveMergeConflict={onResolveMergeConflict}
          primaryColor={primaryColor}
          renderer={rowRenderer}
          resolvingMergeConflictKeys={resolvingMergeConflictKeys}
          rightSyntaxLine={rightSyntaxLine}
          rightTokens={encodeMergeNativeTokens(rightSyntaxLine, tokenStyleById, foregroundColor)}
          row={displayRow}
          rowHeight={rowHeight}
          syntaxAppearance={syntaxAppearance}
          tokenStyleById={tokenStyleById}
        />
      );
    },
    [borderColor, controlRowByFilePath, fileHeaderBackgroundColor, fontFamily, fontSize, foregroundColor, inlineList, mergeSyntaxByPath, mutedColor, onResolveMergeConflict, primaryColor, resolvingMergeConflictKeys, rowHeight, rowRenderer, syntaxAppearance],
  );

  useEffect(() => {
    if (mergeState.status !== "ready" || !syntaxHighlightingEnabled || mergeState.files.length === 0) {
      setMergeSyntaxByPath(new Map());
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
          const nextSyntaxByPath = new Map<string, DiffMergeSyntaxState>();
          results.forEach(({ file, leftResult, rightResult }) => {
            const styles = [...leftResult.styles, ...rightResult.styles];
            const syntaxKey = `${dataVersion}:${file.path}:${syntaxThemeName}`;
            nextSyntaxByPath.set(file.path, {
              configVersion: hashDiffNativeRowConfigVersion([syntaxKey, styles.length]),
              key: syntaxKey,
              leftLines: leftResult.lines,
              rightLines: rightResult.lines,
              tokenStyleById: createMergeSyntaxStyleMap(styles),
            });
          });
          setMergeSyntaxByPath(nextSyntaxByPath);
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.error(error instanceof Error ? error.message : String(error));
          setMergeSyntaxByPath(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataVersion, mergeDisplayModelByPath, mergeState, syntaxHighlightingEnabled, syntaxThemeName]);

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
    mergeListExtraData,
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
            Drop a Git folder or GitHub PR or commit URL
          </Text>
        </View>
      ) : null}
    </DragDropView>
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
  const urlInput = useValue(urlInput$);
  const urlInputError = useValue(urlInputError$);
  const openError = useValue(openError$);
  const documentError = useValue(documentError$);
  const loadingSource = useValue(loadingSource$);
  const mergeState = useValue(mergeState$);
  const sidebarCollapsed = useValue(sidebarCollapsed$);
  const splitPaneMetrics = useValue(splitPaneMetrics$);
  const diffPaneHeight = useValue(diffPaneHeight$);
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
  const [syntaxTokenizationProgress, setSyntaxTokenizationProgress] = useState<DiffSyntaxTokenizationProgress>({
    progress: 0,
    version: 0,
    visible: false,
  });
  const [resolvingMergeConflictKeys, setResolvingMergeConflictKeys] = useState<ReadonlySet<string>>(() => new Set());
  const resolvingMergeConflictKeysRef = useRef<ReadonlySet<string>>(new Set());
  const mergeResolveQueuesRef = useRef(new Map<string, DiffMergeFileResolveQueue>());
  const isSavingMergeDrafts = resolvingMergeConflictKeys.has(diffMergeSaveConflictKey);

  const setResolvingMergeConflictKeyActive = useCallback((key: string, active: boolean) => {
    const nextKeys = new Set(resolvingMergeConflictKeysRef.current);
    if (active) {
      nextKeys.add(key);
    } else {
      nextKeys.delete(key);
    }
    resolvingMergeConflictKeysRef.current = nextKeys;
    setResolvingMergeConflictKeys(nextKeys);
  }, []);

  const waitForMergeResolveQueues = useCallback(async () => {
    const queues = [...mergeResolveQueuesRef.current.values()];
    if (queues.length > 0) {
      await Promise.all(queues.map((queue) => queue.chain.catch(() => undefined)));
    }
  }, []);
  const isLoading = loadingSource !== null;
  const isLoadingGithub = loadingSource?.kind === "github";
  const isRenderingInitialLoadedFrame =
    state.status === "loaded" &&
    sourcesMatch(loadingSource, state.source);
  const renderViewMode = viewMode;
  const loggedInitialLoadedFrameRef = useRef<boolean | null>(null);
  const visibleSourceModel = getDiffVisibleSourceModel(state, loadingSource);
  const { loadedFileCount, showSidebarControl, showViewModeToolbar, toolbarSource, visibleFolderPath, visibleSource, visibleSourceLabel } = visibleSourceModel;
  const backgroundColor = syntaxTheme.background;
  const foregroundColor = syntaxTheme.foreground;
  const fileHeaderBackgroundColor = getThemeAdjustedBackground(
    backgroundColor,
    syntaxTheme.appearance,
    0.11,
    0.065,
    displayTheme.colors.surfaceMuted,
  );
  const hunkHeaderBackgroundColor = getThemeAdjustedBackground(
    backgroundColor,
    syntaxTheme.appearance,
    0.055,
    0.035,
    displayTheme.colors.surface,
  );
  const mutedColor = displayTheme.colors.muted;
  const selectedSidebarFileBackgroundColor = mixHexColor(
    backgroundColor,
    displayTheme.colors.primary,
    syntaxTheme.appearance === "dark" ? 0.28 : 0.18,
    displayTheme.colors.selection === "auto" ? displayTheme.colors.surfaceMuted : displayTheme.colors.selection,
  );
  const sidebarConflictBadgeBackgroundColor = displayTheme.colors.danger;
  const sidebarConflictBadgeTextColor = getReadableBadgeTextColor(sidebarConflictBadgeBackgroundColor);

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentLoadingSource = loadingSource$.get();
    const currentIsRenderingInitialLoadedFrame =
      currentState.status === "loaded" &&
      sourcesMatch(currentLoadingSource, currentState.source);
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
    getRow,
    getVisibleListIndex,
    sideBySideFileHeaderIndexes,
    sideBySideFileHeaderByListIndex,
    sideBySideItemIndexes,
    sideBySideListIndexByRowIndex,
    sideBySideRowCount,
    syntaxStyleStore,
    tokenStyleById,
    visibleItemIndexes,
  } = useDiffLoadedModel({
    collapsedFileIndexes,
    fontFamily,
    fontSize,
    nativeUnifiedRows,
    rowHeight,
    state,
    syntaxHighlightingEnabled,
    syntaxThemeName: syntaxTheme.name,
    viewMode: renderViewMode,
  });
  const {
    getSideBySideRow,
    handleSideBySideTopItemChanged,
    handleSideBySideVisibleRowsRequested,
    requestSideBySideRange,
    resetSideBySideRuntime,
  } = useDiffSideBySideRuntime({
    activeFileIndex$,
    collapsedFileIndexes$,
    diffPaneHeight,
    nativeSideBySideRows,
    rowHeight,
    sideBySideRowCount,
    state,
    state$,
    viewMode: renderViewMode,
  });
  useEffect(() => {
    if (state.status === "loaded" && state.loadComplete !== false) {
      const document = state.document;
      if (syntaxHighlightingEnabled) {
        let cancelled = false;
        let startTimeout: ReturnType<typeof setTimeout> | undefined;
        const filePaths = state.files.map((file) => file.path);
        const startedAt = nowMs();
        startTimeout = setTimeout(() => {
          ensureSyntaxGrammarsForPaths(filePaths)
            .then(() => {
              if (!cancelled) {
                document.startBackgroundTokenization(
                  diffBackgroundTokenizeChunkRowCount,
                  diffBackgroundTokenizeChunkBudgetMs,
                );
                logDiffMemoryMark("viewer.syntaxTokenization.start", {
                  durationMs: Number((nowMs() - startedAt).toFixed(1)),
                  files: state.files.length,
                  rows: document.rowCount,
                  scopes: document.scopeCount,
                });
              }
            })
            .catch((error: unknown) => {
              console.error(getErrorMessage(error));
            });
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
      const totalRows = Math.max(0, document.rowCount);
      const updateProgress = () => {
        const tokenizedRows = Math.max(0, Math.min(totalRows, document.tokenizedMaxRow));
        const tokenizationVersion = document.getTokenizedRowVersion();
        const nextProgress = totalRows > 0 ? tokenizedRows / totalRows : 1;
        const nextVisible = totalRows > 0 && tokenizedRows < totalRows;
        setSyntaxTokenizationProgress((current) => (
          current.visible === nextVisible &&
          current.version === tokenizationVersion &&
          Math.abs(current.progress - nextProgress) < 0.001
            ? current
            : {
              progress: nextProgress,
              version: tokenizationVersion,
              visible: nextVisible,
            }
        ));
      };

      updateProgress();
      const intervalHandle = setInterval(updateProgress, diffBackgroundTokenizePollMs);
      return () => {
        clearInterval(intervalHandle);
      };
    }

    setSyntaxTokenizationProgress((current) => (
      current.visible || current.progress !== 0 || current.version !== 0
        ? {
          progress: 0,
          version: 0,
          visible: false,
        }
        : current
    ));
    return undefined;
  }, [state.status === "loaded" ? state.document : null, state.status === "loaded" ? state.loadComplete : true, syntaxHighlightingEnabled]);
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
  const handleVisibleRowsRequested = useCallback(() => {
  }, []);

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
    logDiffOpenTiming("viewer.renderCommitted", {
      dataVersion: diffRows.dataVersion,
      itemCount: diffRows.itemIndexes.length,
      renderCount: renderCountRef.current,
      state: state.status,
      visibleItemCount: visibleItemIndexes.length,
    });
  });

  const loadSource = useCallback(async (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
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
    }

    const cachedEntry = !options?.force && options?.reason === "mode-toggle"
      ? loadedCacheRef.current.get(loadedCacheKey)
      : undefined;
    if (cachedEntry) {
      loadTraceRef.current = null;
      setLoadingSourceValue(null);
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
      logDiffOpenTiming("viewer.load.cacheHit", {
        requestId,
        rows: cachedEntry.loaded.document.rowCount,
        showOnlyHunks: loadShowOnlyHunks,
        source: nextSource,
      });
      return;
    }

    const trace: DiffLoadTrace = {
      document: null,
      folderPath: nextSource.value,
      loadStartedAt,
      nativeResolvedAt: loadStartedAt,
      setStateAt: loadStartedAt,
    };
    loadTraceRef.current = trace;
    if (!isBackgroundWatchRefresh) {
      setLoadingSourceValue(nextSource);
      setMergeStateValue(nextSource.kind === "folder" ? { status: "loading" } : unavailableDiffMergeState);
      if (stateBeforeLoad.status === "loaded") {
        setDocumentErrorValue(null);
      } else {
        setOpenErrorValue(null);
      }
    }
    logDiffOpenTiming("viewer.load.start", {
      source: nextSource,
      requestId,
    });
    logDiffMemoryMark("viewer.load.start", {
      requestId,
      reason: options?.reason ?? "manual",
      source: nextSource,
    });

    const schedulePostLoadSideEffects = (loaded: DiffLoadedPayload) => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (loadRequestIdRef.current === requestId) {
            const filePaths = loaded.files.map((file) => file.path);
            const syntaxLanguages = recordDiffSyntaxLanguagesForPaths(filePaths);
            logDiffMemoryMark("viewer.syntaxLanguagesRecorded", {
              files: loaded.files.length,
              languages: syntaxLanguages,
              requestId,
              rows: loaded.document.rowCount,
              scopes: loaded.document.scopeCount,
            });
            const recentDocumentPath = getDiffRecentDocumentPath(nextSource);
            if (recentDocumentPath) {
              const recentStartedAt = nowMs();
              noteRecentDocument(recentDocumentPath);
              logDiffOpenTiming("viewer.recentDocument.noted", {
                durationMs: Number((nowMs() - recentStartedAt).toFixed(1)),
                requestId,
              });
              logDiffMemoryMark("viewer.recentDocument.noted", {
                durationMs: Number((nowMs() - recentStartedAt).toFixed(1)),
                requestId,
              });
            } else {
              logDiffOpenTiming("viewer.recentDocument.skipped", {
                requestId,
                sourceKind: nextSource.kind,
              });
            }
            if (nextSource.kind === "folder") {
              loadDiffMergeState(nextSource.value)
                .then((nextMergeState) => {
                  const currentState = state$.peek();
                  if (loadRequestIdRef.current === requestId && currentState.status === "loaded" && sourcesMatch(currentState.source, nextSource)) {
                    setMergeStateValue(applyDiffMergeDraftsToState(nextMergeState, mergeDraftsRef.current));
                    logDiffOpenTiming("viewer.mergeState.loaded", {
                      files: nextMergeState.status === "ready" ? nextMergeState.conflictFileCount : 0,
                      requestId,
                      status: nextMergeState.status,
                    });
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
        loadedCacheRef.current.set(loadedCacheKey, {
          loaded,
          loadComplete,
        });
      }
      logDiffMemoryMark("viewer.statePublished", {
        files: loaded.files.length,
        initialRows: loaded.initialRows.length,
        loadComplete,
        reason,
        requestId,
        rows: loaded.document.rowCount,
        scopes: loaded.document.scopeCount,
      });
      logDiffOpenTiming("viewer.load.setLoaded", {
        loadComplete,
        reason,
        requestId,
        statePayloadMs: Number((statePayloadFinishedAt - statePayloadStartedAt).toFixed(1)),
        setStateCallMs: Number((nowMs() - statePayloadFinishedAt).toFixed(1)),
      });
    };

    let loadError: unknown = null;
    let progressiveSession: DiffLoadSession | null = null;
    try {
      const nativeStartedAt = nowMs();
      let result: DiffLoadedPayload | null = null;
      if (nextSource.kind === "github") {
        logDiffOpenTiming("viewer.native.start", {
          diffUrl: nextSource.diffUrl,
          initialRowCount,
          requestId,
          sourceLabel: nextSource.label,
          sourceKind: nextSource.kind,
        });
        result = await loadUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label, initialRowCount);
        logDiffOpenTiming("viewer.native.finish", {
          fetchMs: Number(result.timing.fetchMs.toFixed(1)),
          files: result.files.length,
          initialRows: result.initialRows.length,
          nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
          nativeTotalMs: Number(result.timing.nativeTotalMs.toFixed(1)),
          requestId,
          rows: result.document.rowCount,
          sourceKind: nextSource.kind,
          scopes: result.document.scopeCount,
        });
      } else if (nextSource.kind === "git") {
        logDiffOpenTiming("viewer.git.start", {
          args: nextSource.args,
          cwd: nextSource.cwd,
          requestId,
          sourceKind: nextSource.kind,
        });
        const commandResult = await commandRunner.runCommand({
          args: ["diff", ...nextSource.args],
          command: "git",
          cwd: nextSource.cwd,
          timeoutMs: 60_000,
        });
        if (commandResult.exitCode !== 0) {
          loadError = createGitDiffCommandError(commandResult);
        } else {
          logDiffOpenTiming("viewer.git.finish", {
            requestId,
            stderrLength: commandResult.stderr.length,
            stdoutLength: commandResult.stdout.length,
            timedOut: commandResult.timedOut,
          });
          result = await loadUnifiedDiff(commandResult.stdout, nextSource.label, initialRowCount);
          logDiffOpenTiming("viewer.native.finish", {
            files: result.files.length,
            initialRows: result.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            nativeTotalMs: Number(result.timing.nativeTotalMs.toFixed(1)),
            requestId,
            rows: result.document.rowCount,
            sourceKind: nextSource.kind,
            scopes: result.document.scopeCount,
          });
        }
      } else {
        logDiffOpenTiming("viewer.native.start", {
          folderPath: nextSource.value,
          initialRowCount,
          requestId,
          showOnlyHunks: loadShowOnlyHunks,
          sourceKind: nextSource.kind,
        });
        progressiveSession = startGitFolderDiff(nextSource.value, { showOnlyHunks: loadShowOnlyHunks });
        let progress = progressiveSession.consumeChanges(initialRowCount);
        while (loadRequestIdRef.current === requestId && !shouldPublishInitialProgress(progress, initialRowCount)) {
          await waitForDiffProgressPoll();
          progress = progressiveSession.consumeChanges(initialRowCount);
        }
        if (loadRequestIdRef.current !== requestId) {
          progressiveSession.cancel();
        } else if (progress.error) {
          loadError = new Error(progress.error);
        } else {
          result = progress;
          logDiffOpenTiming("viewer.native.initialProgress", {
            complete: progress.complete,
            files: progress.files.length,
            initialRows: progress.initialRows.length,
            nativeAwaitMs: Number((nowMs() - nativeStartedAt).toFixed(1)),
            requestId,
            rowVersion: progress.rowVersion,
            rows: progress.document.rowCount,
            showOnlyHunks: loadShowOnlyHunks,
            sourceKind: nextSource.kind,
          });
        }
      }

      if (!loadError) {
        if (result) {
          const nativeResolvedAt = nowMs();
          trace.nativeResolvedAt = nativeResolvedAt;
          logDiffOpenTiming("viewer.load.nativeResolved", {
            files: result.files.length,
            grammarEnsureMs: 0,
            initialRows: result.initialRows.length,
            jsAwaitMs: Number((nativeResolvedAt - nativeStartedAt).toFixed(1)),
            nativeTotalMs: Number(result.timing.nativeTotalMs.toFixed(1)),
            requestId,
            rows: result.document.rowCount,
            scopes: result.document.scopeCount,
            unaccountedJsMs: Number((nativeResolvedAt - nativeStartedAt - result.timing.nativeTotalMs).toFixed(1)),
          });
          logDiffLoadTiming(nextSource.value, result.timing);
          if (loadRequestIdRef.current === requestId) {
            const initialLoadComplete = "complete" in result ? result.complete : true;
            if (isBackgroundWatchRefresh && progressiveSession && "complete" in result && !result.complete) {
              let progress = result;
              while (loadRequestIdRef.current === requestId && !progress.complete && !progress.error) {
                await waitForDiffProgressPoll();
                progress = progressiveSession.consumeChanges(initialRowCount);
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
              publishLoadedState(result, initialLoadComplete, "initial");
              if (progressiveSession && "complete" in result && !result.complete) {
                let lastFileVersion = result.fileVersion;
                let lastRowVersion = result.rowVersion;
                let progress = result;
                while (loadRequestIdRef.current === requestId && !progress.complete && !progress.error) {
                  await waitForDiffProgressPoll();
                  progress = progressiveSession.consumeChanges(initialRowCount);
                  const hasChanges =
                    progress.rowVersion !== lastRowVersion ||
                    progress.fileVersion !== lastFileVersion ||
                    progress.complete ||
                    !!progress.error;
                  if (hasChanges && loadRequestIdRef.current === requestId) {
                    lastFileVersion = progress.fileVersion;
                    lastRowVersion = progress.rowVersion;
                    publishLoadedState(progress, progress.complete, progress.complete ? "complete" : "progress");
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
                schedulePostLoadSideEffects(result);
              }
            }
          } else {
            progressiveSession?.cancel();
            logDiffOpenTiming("viewer.load.stale", {
              activeRequestId: loadRequestIdRef.current,
              requestId,
            });
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
      logDiffOpenTiming("viewer.load.error", {
        error: message,
        requestId,
      });
    }
  }, [nativeDiffRows, setDocumentErrorValue, setLoadingSourceValue, setMergeStateValue, setOpenErrorValue, setViewerState, state$]);

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

  useEffect(() => addKeyDownListener((event) => {
    let handled = false;
    if (isSaveKeyEvent(event)) {
      handled = saveMergeDraftsFromCommand();
    }
    return handled;
  }), [saveMergeDraftsFromCommand]);

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
    if (hasUnsavedMergeDrafts && !isSavingMergeDrafts) {
      discardMergeDrafts().catch((error: unknown) => {
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
          setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
        }
      });
    }
  }, [discardMergeDrafts, hasUnsavedMergeDrafts, isSavingMergeDrafts, setDocumentErrorValue, state$]);

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

  const openUrl = useCallback(async () => {
    if (!loadingSource$.peek()) {
      const nextSource = normalizeDiffOpenSource(urlInput$.peek());
      if (nextSource?.kind === "github") {
        setOpenErrorValue(null);
        setUrlInputErrorValue(null);
        await loadSource(nextSource);
      } else {
        setUrlInputErrorValue("Enter a GitHub PR or commit URL.");
      }
    }
  }, [loadSource, loadingSource$, setOpenErrorValue, setUrlInputErrorValue, urlInput$]);

  const retryOpenError = useCallback(() => {
    const currentOpenError = openError$.peek();
    if (!loadingSource$.peek() && currentOpenError?.source) {
      setOpenErrorValue(null);
      loadSource(currentOpenError.source);
    }
  }, [loadSource, loadingSource$, openError$, setOpenErrorValue]);

  const dismissDocumentError = useCallback(() => {
    setDocumentErrorValue(null);
  }, [setDocumentErrorValue]);

  const openPermissionSettings = useCallback(() => {
    Linking.openURL(macOSFilesAndFoldersSettingsUrl).catch((error: unknown) => {
      console.error(`Unable to open System Settings: ${getErrorMessage(error)}`);
    });
  }, []);

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
      const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.get());
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
      const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.get());
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
      borderColor: displayTheme.colors.border,
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
      sideBySideTokenStyleCount: tokenStyleById.size,
      syntaxAppearance: syntaxTheme.appearance,
      syntaxHighlightingEnabled,
      syntaxTheme: listSyntaxTheme,
      tokenStyleCount: tokenStyleById.size,
    }),
    [
      adaptiveLightModeEnabled,
      collapsedFileIndexes,
      collapsedFileIndexesKey,
      displayTheme.colors.border,
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
      tokenStyleById.size,
    ],
  );
  const nativeUnifiedRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
    const palette = getDiffRowPalette(syntaxTheme.appearance);
    const documentId = state.status === "loaded" ? state.document.documentId : 0;
    const configId = `diff:${documentId}:unified`;
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
      documentId,
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
      tokenizationVersion: syntaxTokenizationProgress.version,
    };
  }, [
    fontFamily,
    fontSize,
    foregroundColor,
    listSyntaxTheme,
    mutedColor,
    rowHeight,
    state.status === "loaded" ? state.document : null,
    syntaxHighlightingEnabled,
    syntaxTokenizationProgress.version,
    syntaxTheme.appearance,
  ]);
  const nativeSideBySideRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
    const palette = getDiffRowPalette(syntaxTheme.appearance);
    const dividerColor = getSideBySideDividerColor(syntaxTheme.appearance);
    const documentId = state.status === "loaded" ? state.document.documentId : 0;
    const configId = `diff:${documentId}:blocks`;
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
      documentId,
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
      tokenizationVersion: syntaxTokenizationProgress.version,
    };
  }, [
    collapsedFileIndexesKey,
    fontFamily,
    fontSize,
    foregroundColor,
    listSyntaxTheme,
    mutedColor,
    rowHeight,
    state.status === "loaded" ? state.document : null,
    syntaxHighlightingEnabled,
    syntaxTokenizationProgress.version,
    syntaxTheme.appearance,
  ]);
  const renderFields = useMemo<DiffRenderFields>(
    () => ({
      borderColor: displayTheme.colors.border,
      collapsedFileIndexList,
      document: state.status === "loaded" ? state.document : null,
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
      sideBySideTokenStyleById: tokenStyleById,
      syntaxAppearance: syntaxTheme.appearance,
      syntaxHighlightingEnabled,
      syntaxStyleStore,
      syntaxThemeName: listSyntaxTheme,
      tokenStyleById,
      toggleFileCollapsed,
    }),
    [
      displayTheme.colors.border,
      collapsedFileIndexList,
      fileHeaderBackgroundColor,
      fileByIndex,
      fileByRowStart,
      fileHeaderRowIndexes,
      fontFamily,
      fontSize,
      foregroundColor,
      hunkHeaderBackgroundColor,
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
      state.status === "loaded" ? state.document : null,
      syntaxHighlightingEnabled,
      syntaxStyleStore,
      syntaxTheme.appearance,
      listSyntaxTheme,
      toggleFileCollapsed,
      tokenStyleById,
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
      row = <DiffSidebarFolderRow mutedColor={mutedColor} title={item.title} />;
    } else {
      const file = item.file;
      const mergeFile = getMergeConflictFileForDiffFile(mergeState, file);
      const statusPresentation = mergeFile?.markerBlocks.length
        ? getConflictedFileStatusPresentation()
        : getFileStatusPresentation(file);
      if (!loggedFirstSidebarFileRenderRef.current) {
        loggedFirstSidebarFileRenderRef.current = true;
        logDiffOpenTiming("viewer.sidebarFile.render.first", {
          fileIndex: file.index,
          filePath: file.path,
        });
      }

      row = (
        <DiffSidebarFileRow
          activeFileIndex$={activeFileIndex$}
          conflictBadgeBackgroundColor={sidebarConflictBadgeBackgroundColor}
          conflictBadgeTextColor={sidebarConflictBadgeTextColor}
          file={file}
          foregroundColor={foregroundColor}
          mergeFile={mergeFile}
          onPress={() => handleSidebarFilePress(file)}
          selectedBackgroundColor={selectedSidebarFileBackgroundColor}
          selectedBorderColor={displayTheme.colors.primary}
          statusPresentation={statusPresentation}
        />
      );
    }

    return row;
  }, [
    activeFileIndex$,
    displayTheme.colors.primary,
    foregroundColor,
    handleSidebarFilePress,
    mergeState,
    mutedColor,
    selectedSidebarFileBackgroundColor,
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
    logDiffOpenTiming("viewer.splitView.resize", {
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
    });
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
    logDiffOpenTiming("viewer.diffPane.layout", {
      height: nextHeight,
      previousHeight,
      rawHeight: Number(event.nativeEvent.layout.height.toFixed(1)),
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    });
    if (nextHeight > 0 || previousHeight === 0) {
      setDiffPaneHeightValue(nextHeight);
    }
  }, [diffPaneHeight$, setDiffPaneHeightValue]);

  const handleSidebarListLayout = useCallback((event: LayoutChangeEvent) => {
    const currentState = state$.peek();
    logDiffOpenTiming("viewer.sidebarList.layout", {
      fileCount: currentState.status === "loaded" ? currentState.files.length : 0,
      height: Number(event.nativeEvent.layout.height.toFixed(1)),
      status: currentState.status,
      width: Number(event.nativeEvent.layout.width.toFixed(1)),
    });
  }, [state$]);

  const getItemType = useCallback((index: number) => (
    fileHeaderRowIndexes.has(index) ? "file-header" : "diff-line"
  ), [fileHeaderRowIndexes]);

  const getItemSize = useCallback((index: number) => {
    if (getItemType(index) === "file-header") {
      return diffFileHeaderRowHeight;
    }

    const document = state.status === "loaded" ? state.document : null;
    const row = document?.getPlainRows(index, 1)[0];
    return rowHeight + (showOnlyHunks && isDiffUnifiedHunkStart(document, index, row) ? diffHunkHeaderHeight : 0);
  }, [getItemType, rowHeight, showOnlyHunks, state]);

  const renderRow = useCallback(
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
      if (!loggedFirstUnifiedRowRenderRef.current) {
        loggedFirstUnifiedRowRenderRef.current = true;
        logDiffOpenTiming("viewer.unifiedRow.render.first", {
          hasRow: row !== undefined,
          index,
          rowKind: row?.kind,
        });
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
    [collapsedFileIndexes$, renderFields],
  );

  const getSideBySideItemType = useCallback((index: number) => {
    return sideBySideFileHeaderIndexes.has(index) ? "file-header" : "side-by-side-line";
  }, [sideBySideFileHeaderIndexes]);

  const getSideBySideItemSize = useCallback((index: number) => {
    if (sideBySideFileHeaderIndexes.has(index)) {
      return diffFileHeaderRowHeight;
    }

    const document = state.status === "loaded" ? state.document : null;
    const row = document?.getPlainSideBySideRow(index, collapsedFileIndexList);
    return rowHeight + (showOnlyHunks && isDiffSideBySideHunkStart(document, index, collapsedFileIndexList, row) ? diffHunkHeaderHeight : 0);
  }, [collapsedFileIndexList, rowHeight, showOnlyHunks, sideBySideFileHeaderIndexes, state]);

  const renderSideBySideRow = useCallback(
    ({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => {
      if (!loggedFirstSideBySideRowRenderRef.current) {
        loggedFirstSideBySideRowRenderRef.current = true;
        logDiffOpenTiming("viewer.sideBySideRow.render.first", {
          hasRow: row !== undefined,
          index,
          rowKind: row?.kind,
        });
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
  }, [openError$, setOpenErrorValue, setUrlInputErrorValue, setUrlInputValue, urlInputError$]);

  const dismissOpenError = useCallback(() => {
    setOpenErrorValue(null);
  }, [setOpenErrorValue]);

  const diffContentHeight = diffPaneHeight;
  const documentErrorHeight = documentError
    ? documentError.kind === "permission"
      ? diffDocumentPermissionErrorHeight
      : diffDocumentErrorHeight
    : 0;
  const diffTopChromeContentHeight = documentErrorHeight;
  const diffTopChromeHeight = diffTopChromeContentHeight > 0 ? diffTitlebarTopInset + diffTopChromeContentHeight : 0;
  const diffListHeight = Math.max(0, diffContentHeight - diffTopChromeHeight);
  const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
  const sidebarListHeight = isSidebarLayoutReady ? Math.max(0, splitPaneMetrics.sidebarHeight - diffSidebarTopInset - 43) : 0;
  const currentActiveFileIndex = useValue(activeFileIndex$);
  const activeMergeFile = state.status === "loaded"
    ? getActiveMergeFile({ activeFileIndex: currentActiveFileIndex, files: state.files, mergeState })
    : null;
  const activeItemIndexes = renderViewMode === "unified"
    ? visibleItemIndexes
    : sideBySideItemIndexes;
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
  const unsavedMergeDraftBanner = hasUnsavedMergeDrafts ? (
    <DiffUnsavedMergeDraftBanner
      dangerColor={displayTheme.colors.danger}
      disabled={isSavingMergeDrafts}
      fileCount={unsavedMergeDraftFiles.length}
      onDiscard={discardMergeDraftsFromCommand}
      onSave={saveMergeDraftsFromCommand}
      primaryColor={displayTheme.colors.primary}
    />
  ) : null;
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
    body = activeItemIndexes.length === 0 && !activeMergeFile ? (
      <DiffNoChangesBody
        documentErrorBody={documentErrorBody}
        floatingDocumentBanner={unsavedMergeDraftBanner}
        hasDocumentChrome={diffTopChromeContentHeight > 0}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        visibleSourceLabel={visibleSourceLabel}
      />
    ) : (
      <DiffLoadedBody
        activeFileIndex$={activeFileIndex$}
        activeItemIndexes={activeItemIndexes}
        adaptiveLightModeEnabled={adaptiveLightModeEnabled}
        backgroundColor={backgroundColor}
        diffContentHeight={diffContentHeight}
        diffListHeight={diffListHeight}
        diffPaneHeight={diffPaneHeight}
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
        handleSideBySideVisibleRowsRequested={handleSideBySideVisibleRowsRequested}
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
        primaryColor={displayTheme.colors.primary}
        renderRow={renderRow}
        renderSidebarEntry={renderSidebarEntry}
        renderSideBySideRow={renderSideBySideRow}
        requestSideBySideRange={requestSideBySideRange}
        resolvingMergeConflictKeys={resolvingMergeConflictKeys}
        onResolveMergeConflict={resolveMergeConflict}
        rowHeight={rowHeight}
        sidebarCollapsed={sidebarCollapsed}
        sidebarListHeight={sidebarListHeight}
        sidebarWidth={sidebarWidth}
        sideBySideDataVersion={sideBySideDataVersion}
        sideBySideFileHeaderByListIndex={sideBySideFileHeaderByListIndex}
        sideBySideItemIndexes={sideBySideItemIndexes}
        splitPaneMetrics={splitPaneMetrics}
        state={state}
        syntaxAppearance={syntaxTheme.appearance}
        syntaxTokenizationProgress={syntaxTokenizationProgress}
        viewMode={renderViewMode}
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
    <>
      <DiffWindowChromeController hasUnsavedMergeDrafts={hasUnsavedMergeDrafts} />
      <DiffNativeMenuController hasUnsavedMergeDrafts={hasUnsavedMergeDrafts} isSavingMergeDrafts={isSavingMergeDrafts} />
      <DiffWindowToolbarItemController toggleSidebar={toggleSidebar} />
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
        borderColor={displayTheme.colors.primary}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onDropDiff={handleDropDiff}
        syntaxAppearance={syntaxTheme.appearance}
      >
        {body}
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
  noChangesRoot: {
    flex: 1,
    minHeight: 0,
  },
  noChangesTopChrome: {
    paddingTop: diffTitlebarTopInset,
  },
  diffTitlebarSpacer: {
    height: diffTitlebarTopInset,
  },
  syntaxProgressFill: {
    height: 2,
  },
  syntaxProgressTrack: {
    height: 2,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: diffTitlebarTopInset,
    zIndex: 20,
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
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    height: diffSidebarFileRowHeight,
    paddingHorizontal: 10,
  },
  sidebarFileName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    minWidth: 0,
  },
  sidebarFolder: {
    height: diffSidebarFileRowHeight,
    justifyContent: "flex-end",
    paddingBottom: 3,
    paddingHorizontal: 20,
  },
  sidebarFolderText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  sidebarConflictBadge: {
    alignItems: "center",
    borderRadius: 7,
    height: 15,
    justifyContent: "center",
    minWidth: 15,
    paddingHorizontal: 4,
  },
  sidebarConflictBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
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
    height: 16,
    justifyContent: "center",
    width: 16,
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

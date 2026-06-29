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
  type DiffSideBySideRenderRow,
  type DiffSyntaxStyle,
} from "@legend-desktop/diff-parser";
import { DragDropView, type DragDropFileEvent } from "@legend-desktop/drag-drop";
import { revealInFinder } from "@legend-desktop/file-dialog";
import { LightText, nowMs, TokenizedText, type SyntaxStyleMap } from "@legend-desktop/source-viewer";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { ensureSyntaxGrammarsForPaths, getSyntaxLanguageForPath, highlightString, type SyntaxRenderLine, type SyntaxStyle } from "@legend-desktop/syntax-parser";
import { TextInputSearch, type TextInputSearchRef } from "@legend-desktop/text-input-search";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
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
import { getDiffRecentDocumentPath, getDiffSourceLabel, getFilename, normalizeDiffOpenSource, openDiffFolderDialog, type DiffOpenSource } from "./diffFiles";
import {
  createDiffMergeHunkDisplayModel,
  loadDiffMergeState,
  resolveDiffMergeConflictBlock,
  type DiffMergeConflictBlock,
  type DiffMergeConflictChoice,
  type DiffMergeConflictRange,
  type DiffMergeDisplayRow,
  type DiffMergeConflictFile,
  type DiffMergeDisplayModel,
  type DiffMergeHunkHeaderInfo,
  type DiffMergeSideChangeType,
  type DiffMergeState,
} from "./diffMerge";
import { recordDiffSyntaxLanguagesForPaths } from "./diffSyntaxWarmup";
import {
  getDiffViewModeSetting,
  getDiffShowOnlyHunksSetting,
  type DiffRowRendererSetting,
  useDiffAdaptiveLightModeEnabledSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffRowRendererSetting,
  useDiffShowOnlyHunksSetting,
  useDiffSyntaxHighlightingEnabledSetting,
  useDiffSyntaxTheme,
  useDiffViewModeSetting,
  type DiffSettingsFile,
  setDiffShowOnlyHunksSetting,
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
  getDirectoryPath,
  getFilePathContext,
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

type DiffCommandResult = Awaited<ReturnType<typeof commandRunner.runCommand>>;
type DiffLoadedPayload = DiffLoadResult | DiffLoadProgress;

type DiffLoadedCacheEntry = {
  loaded: DiffLoadedPayload;
  loadComplete: boolean;
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

type DiffSidebarFileRowProps = {
  activeFileIndex$: Observable<number | null>;
  borderColor: string;
  file: DiffFileSummary;
  foregroundColor: string;
  mergeFile: DiffMergeConflictFile | null;
  mutedColor: string;
  onPress: () => void;
  selectedBorderColor: string;
  selectedBackgroundColor: string;
  statusPresentation: ReturnType<typeof getFileStatusPresentation>;
};

type DiffLoadedBodyProps = {
  activeFileIndex$: Observable<number | null>;
  activeItemIndexes: readonly (number | undefined)[];
  backgroundColor: string;
  diffContentHeight: number;
  diffListHeight: number;
  diffPaneHeight: number;
  diffRows: VirtualizedDocumentRowsState<DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming>;
  documentErrorBody: ReactNode;
  fileFilterInputRef: RefObject<TextInputSearchRef | null>;
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
  renderSidebarFile: (props: LegendListRenderItemProps<DiffFileSummary>) => ReactElement;
  renderSideBySideRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => ReactElement;
  requestSideBySideRange: (lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => void;
  resolvingMergeConflictKey: string | null;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  rowHeight: number;
  sidebarCollapsed: boolean;
  sidebarListHeight: number;
  sideBySideDataVersion: number;
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

function DiffSidebarFileRow({
  activeFileIndex$,
  borderColor,
  file,
  foregroundColor,
  mergeFile,
  mutedColor,
  onPress,
  selectedBorderColor,
  selectedBackgroundColor,
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
              backgroundColor: selectedBackgroundColor,
              borderColor: selectedBorderColor,
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
      {mergeFile && mergeFile.markerBlocks.length > 0 ? (
        <View style={styles.sidebarConflictBadge}>
          <Text style={styles.sidebarConflictBadgeText}>
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
  activeFileIndex$,
  activeItemIndexes,
  backgroundColor,
  diffContentHeight,
  diffListHeight,
  diffPaneHeight,
  diffRows,
  documentErrorBody,
  fileFilterInputRef,
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
  renderSidebarFile,
  renderSideBySideRow,
  requestSideBySideRange,
  resolvingMergeConflictKey,
  onResolveMergeConflict,
  rowHeight,
  sidebarCollapsed,
  sidebarListHeight,
  sideBySideDataVersion,
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
  const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
  const normalizedFileFilter = fileFilter.trim().toLowerCase();
  const filteredSidebarFiles = useMemo(
    () => {
      if (viewMode === "merge" && mergeState.status === "ready") {
        const unresolvedPaths = new Set(
          mergeState.files
            .filter((file) => file.markerBlocks.length > 0)
            .map((file) => file.path),
        );
        if (unresolvedPaths.size > 0) {
          return state.files.filter((file) => unresolvedPaths.has(file.path) && fileMatchesFilter(file, normalizedFileFilter));
        }
      }
      return state.files.filter((file) => fileMatchesFilter(file, normalizedFileFilter));
    },
    [mergeState, normalizedFileFilter, state.files, viewMode],
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
    const nativeUnifiedRows = listExtraData.rowRenderer === "native" && viewMode === "unified";
    const nativeSideBySideRows = listExtraData.rowRenderer === "native" && viewMode !== "unified";
    const adaptiveRender = adaptiveLightModeEnabled ? diffAdaptiveRender : undefined;
    const requestUnifiedRange = nativeUnifiedRows ? noopVirtualizedDocumentRequestRange : diffRows.requestRange;
    const requestBlocksRange = nativeSideBySideRows ? noopVirtualizedDocumentRequestRange : requestSideBySideRange;
    const nativeRowConfig = nativeUnifiedRows ? nativeUnifiedRowConfig : nativeSideBySideRows ? nativeSideBySideRowConfig : null;
    const listHeader = <View style={styles.diffTitlebarSpacer} />;
    let list: ReactElement;
    if (viewMode === "merge") {
      list = (
        <DiffMergeContent
          activeFileIndex={activeFileIndex}
          borderColor={listExtraData.borderColor}
          fileByIndex={state.files}
          foregroundColor={listExtraData.foregroundColor}
          fontFamily={listExtraData.fontFamily}
          fontSize={listExtraData.fontSize}
          height={diffListHeight}
          listRef={listRef}
          mergeState={mergeState}
          mutedColor={mutedColor}
          onResolveMergeConflict={onResolveMergeConflict}
          primaryColor={primaryColor}
          resolvingMergeConflictKey={resolvingMergeConflictKey}
          rowRenderer={listExtraData.rowRenderer}
          rowHeight={rowHeight}
          showOnlyHunks={listExtraData.showOnlyHunks}
          syntaxAppearance={syntaxAppearance}
          syntaxHighlightingEnabled={listExtraData.syntaxHighlightingEnabled}
          syntaxThemeName={listExtraData.syntaxTheme}
        />
      );
    } else if (viewMode === "unified") {
      list = (
        <VirtualizedFixedDocumentList
          adaptiveRender={adaptiveRender}
          dataVersion={diffRows.dataVersion}
          key="unified"
          extraData={listExtraData}
          itemIndexes={visibleItemIndexes}
          ListHeaderComponent={listHeader}
          getItemSize={getItemSize}
          getItemType={getItemType}
          listHeaderHeight={diffTitlebarTopInset}
          lineOverscan={diffLineOverscan}
          listRef={listRef}
          onTopItemChanged={handleTopItemChanged}
          onVisibleRowsRequested={nativeUnifiedRows ? undefined : handleVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={requestUnifiedRange}
          requestRangesOnScroll={!nativeUnifiedRows}
          getRow={nativeUnifiedRows ? undefined : getRow}
          rowHeight={rowHeight}
          renderRow={renderRow}
          style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
        />
      );
    } else {
      list = (
        <VirtualizedFixedDocumentList
          adaptiveRender={adaptiveRender}
          dataVersion={sideBySideDataVersion}
          key={viewMode}
          extraData={listExtraData}
          itemIndexes={sideBySideItemIndexes}
          ListHeaderComponent={listHeader}
          getItemSize={getSideBySideItemSize}
          getItemType={getSideBySideItemType}
          getRow={nativeSideBySideRows ? undefined : getSideBySideRow}
          listHeaderHeight={diffTitlebarTopInset}
          lineOverscan={Math.max(12, Math.floor(diffLineOverscan / 10))}
          listRef={listRef}
          onTopItemChanged={handleSideBySideTopItemChanged}
          onVisibleRowsRequested={nativeSideBySideRows ? undefined : handleSideBySideVisibleRowsRequested}
          overscanRequestDelayMs={diffOverscanRequestDelayMs}
          requestRange={requestBlocksRange}
          requestRangesOnScroll={!nativeSideBySideRows}
          rowHeight={rowHeight}
          renderRow={renderSideBySideRow}
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
        {documentErrorBody}
        {viewMode !== "merge" && nativeRowConfig ? (
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
  const sidebarTitle = viewMode === "merge" && mergeState.status === "ready" && mergeState.conflictBlockCount > 0
    ? `Files - ${mergeState.conflictBlockCount} conflicts`
    : "Files";
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
      <Text style={[styles.sidebarTitle, { color: mutedColor }]}>{sidebarTitle}</Text>
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
    <View style={styles.loadedRoot}>
      <SidebarSplitView
        appearance={syntaxAppearance}
        contentMinWidth={420}
        contentTitlebarHeight={diffTitlebarTopInset}
        contentTitlebarMaterial="glass"
        contentTitlebarOverlayColor={backgroundColor}
        contentTitlebarOverlayOpacity={syntaxAppearance === "dark" ? 0.72 : 0.82}
        onSplitViewDidResize={handleSplitViewResize}
        sidebarCollapsed={sidebarCollapsed}
        sidebarMinWidth={180}
        style={styles.content}
      >
        {sidebar}
        <View style={styles.diffWorkspace}>
          <View onLayout={handleDiffPaneLayout} style={styles.diffPane}>
            {diffContent}
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

function getMergeConflictKey(file: DiffMergeConflictFile, block: DiffMergeConflictBlock) {
  return `${file.path}:${block.startLine}`;
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
  fontFamily,
  fontSize,
  info,
  syntaxAppearance,
}: {
  borderColor: string;
  fontFamily: string;
  fontSize: number;
  info: DiffMergeHunkHeaderInfo;
  syntaxAppearance: "dark" | "light";
}) {
  const conflictPalette = getMergeConflictPalette(syntaxAppearance);
  return (
    <View style={[styles.mergeHunkHeader, { backgroundColor: conflictPalette.hunkBackground, borderColor }]}>
      <Text selectable={false} style={[styles.mergeHunkHeaderTitle, { color: conflictPalette.accent, fontFamily, fontSize }]}>
        Hunk {info.hunkNumber}: {info.lineLabel}
      </Text>
    </View>
  );
}

function getMergeConflictPalette(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark"
    ? {
        accent: "#d29922",
        hunkBackground: "rgba(187, 128, 9, 0.28)",
        rowBackground: "rgba(187, 128, 9, 0.18)",
      }
    : {
        accent: "#9a6700",
        hunkBackground: "#fff1a7",
        rowBackground: "#fff8c5",
      };
}

function getMergeSideColors(
  changeType: DiffMergeSideChangeType | undefined,
  side: "left" | "right",
  mutedColor: string,
  syntaxAppearance: "dark" | "light",
) {
  const palette = getDiffRowPalette(syntaxAppearance);
  const conflictPalette = getMergeConflictPalette(syntaxAppearance);
  const isDelete = changeType === "delete" || (side === "left" && changeType === "modify");
  const isAdd = changeType === "add" || (side === "right" && changeType === "modify");
  const isConflict = changeType !== undefined;
  const backgroundColor = isConflict ? conflictPalette.rowBackground : "transparent";
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
          lineNumber,
          mutedColor,
          nativeTokens,
          rowHeight,
          text,
        ])}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
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
  conflictBackgroundColor,
  file,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  resolvingMergeConflictKey,
}: {
  block: DiffMergeConflictBlock | null;
  borderColor: string;
  conflictBackgroundColor: string;
  file: DiffMergeConflictFile;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  resolvingMergeConflictKey: string | null;
}) {
  const controlsDisabled = resolvingMergeConflictKey !== null;
  const isResolving = block ? resolvingMergeConflictKey === getMergeConflictKey(file, block) : false;
  return (
    <View style={[styles.mergeCommonMiddle, { backgroundColor: conflictBackgroundColor, borderColor }]}>
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
  foregroundColor,
  fontFamily,
  fontSize,
  leftSyntaxLine,
  leftTokens,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  renderer,
  resolvingMergeConflictKey,
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
  foregroundColor: string;
  fontFamily: string;
  fontSize: number;
  leftSyntaxLine: SyntaxRenderLine;
  leftTokens: string;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  renderer: DiffRowRendererSetting;
  resolvingMergeConflictKey: string | null;
  rightSyntaxLine: SyntaxRenderLine;
  rightTokens: string;
  row: DiffMergeDisplayRow | undefined;
  rowHeight: number;
  syntaxAppearance: "dark" | "light";
  tokenStyleById: SyntaxStyleMap;
}) {
  const leftColors = getMergeSideColors(row?.leftChangeType, "left", mutedColor, syntaxAppearance);
  const rightColors = getMergeSideColors(row?.rightChangeType, "right", mutedColor, syntaxAppearance);
  const conflictBackgroundColor = row?.conflictBlock
    ? getMergeConflictPalette(syntaxAppearance).rowBackground
    : "transparent";

  return (
    <>
      {row?.hunkHeader ? (
        <DiffMergeHunkHeader
          borderColor={borderColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          info={row.hunkHeader}
          syntaxAppearance={syntaxAppearance}
        />
      ) : null}
      <View style={[styles.mergeCommonRow, { height: rowHeight }]}>
        <View style={styles.mergeCommonPane}>
          <DiffMergeCodePane
            backgroundColor={leftColors.backgroundColor}
            foregroundColor={foregroundColor}
            fontFamily={fontFamily}
            fontSize={fontSize}
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
          conflictBackgroundColor={conflictBackgroundColor}
          file={file}
          mutedColor={mutedColor}
          onResolveMergeConflict={onResolveMergeConflict}
          primaryColor={primaryColor}
          resolvingMergeConflictKey={resolvingMergeConflictKey}
        />
        <View style={styles.mergeCommonPane}>
          <DiffMergeCodePane
            backgroundColor={rightColors.backgroundColor}
            foregroundColor={foregroundColor}
            fontFamily={fontFamily}
            fontSize={fontSize}
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

function DiffMergeContent({
  activeFileIndex,
  borderColor,
  fileByIndex,
  foregroundColor,
  fontFamily,
  fontSize,
  height,
  listRef,
  mergeState,
  mutedColor,
  onResolveMergeConflict,
  primaryColor,
  resolvingMergeConflictKey,
  rowRenderer,
  rowHeight,
  showOnlyHunks,
  syntaxAppearance,
  syntaxHighlightingEnabled,
  syntaxThemeName,
}: {
  activeFileIndex: number | null;
  borderColor: string;
  fileByIndex: DiffFileSummary[];
  foregroundColor: string;
  fontFamily: string;
  fontSize: number;
  height: number;
  listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
  mergeState: DiffMergeState;
  mutedColor: string;
  onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
  primaryColor: string;
  resolvingMergeConflictKey: string | null;
  rowRenderer: DiffRowRendererSetting;
  rowHeight: number;
  showOnlyHunks: boolean;
  syntaxAppearance: "dark" | "light";
  syntaxHighlightingEnabled: boolean;
  syntaxThemeName: string;
}) {
  const mergeFile = getActiveMergeFile({ activeFileIndex, files: fileByIndex, mergeState });
  const [mergeSyntax, setMergeSyntax] = useState<DiffMergeSyntaxState | null>(null);
  const scrolledMergeFileRef = useRef<string | null>(null);
  const mergeDisplayModel = useMemo(() => {
    const fullModel = getFullMergeDisplayModel(mergeFile);
    return showOnlyHunks
      ? createDiffMergeHunkDisplayModel(fullModel.rows, fullModel.conflictRanges)
      : fullModel;
  }, [mergeFile, showOnlyHunks]);
  const itemIndexes = useMemo(
    () => Array.from({ length: mergeDisplayModel.rows.length }, (_, index) => index),
    [mergeDisplayModel],
  );
  const dataVersion = mergeFile ? `${mergeFile.path}:${mergeFile.displayRows.length}:${mergeFile.markerBlocks.length}:${showOnlyHunks ? "hunks" : "full"}:${mergeDisplayModel.rows.length}` : "empty";
  const syntaxKey = mergeFile && syntaxHighlightingEnabled
    ? `${dataVersion}:${mergeFile.path}:${syntaxThemeName}`
    : "disabled";
  const mergeListExtraData = useMemo(() => ({
    borderColor,
    dataVersion,
    foregroundColor,
    fontFamily,
    fontSize,
    mergeSyntaxVersion: mergeSyntax?.configVersion ?? 0,
    mutedColor,
    primaryColor,
    resolvingMergeConflictKey,
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
    mergeSyntax?.configVersion,
    mutedColor,
    primaryColor,
    resolvingMergeConflictKey,
    rowHeight,
    rowRenderer,
    showOnlyHunks,
    syntaxAppearance,
  ]);
  const controlRowByBlockKey = useMemo(
    () => mergeFile ? getMergeControlRowByBlockKey(mergeDisplayModel.conflictRanges, mergeFile) : new Map<string, number>(),
    [mergeDisplayModel, mergeFile],
  );
  const getMergeRow = useCallback((index: number) => mergeDisplayModel.rows[index], [mergeDisplayModel]);
  const getMergeItemSize = useCallback((index: number) => (
    rowHeight + (mergeDisplayModel.rows[index]?.hunkHeader ? diffHunkHeaderHeight : 0)
  ), [mergeDisplayModel, rowHeight]);
  const firstConflictRowIndex = mergeDisplayModel.conflictRanges[0]?.startRow ?? 0;
  const renderMergeRow = useCallback(
    ({ index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffMergeDisplayRow>) => {
      if (!mergeFile) {
        return <View style={{ height: rowHeight }} />;
      }
      const displayRow = row ?? mergeDisplayModel.rows[index];
      const controlBlock = displayRow?.conflictBlock
        && controlRowByBlockKey.get(getMergeConflictKey(mergeFile, displayRow.conflictBlock)) === index
        ? displayRow.conflictBlock
        : null;
      const leftSyntaxLine = getMergeSyntaxLine(mergeSyntax?.leftLines, index, displayRow?.leftText ?? "");
      const rightSyntaxLine = getMergeSyntaxLine(mergeSyntax?.rightLines, index, displayRow?.rightText ?? "");
      const tokenStyleById = mergeSyntax?.tokenStyleById ?? new Map<number, SyntaxStyle>();
      return (
        <DiffMergeLineRow
          borderColor={borderColor}
          controlBlock={controlBlock}
          file={mergeFile}
          foregroundColor={foregroundColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          leftSyntaxLine={leftSyntaxLine}
          leftTokens={encodeMergeNativeTokens(leftSyntaxLine, tokenStyleById, foregroundColor)}
          mutedColor={mutedColor}
          onResolveMergeConflict={onResolveMergeConflict}
          primaryColor={primaryColor}
          renderer={rowRenderer}
          resolvingMergeConflictKey={resolvingMergeConflictKey}
          rightSyntaxLine={rightSyntaxLine}
          rightTokens={encodeMergeNativeTokens(rightSyntaxLine, tokenStyleById, foregroundColor)}
          row={displayRow}
          rowHeight={rowHeight}
          syntaxAppearance={syntaxAppearance}
          tokenStyleById={tokenStyleById}
        />
      );
    },
    [borderColor, controlRowByBlockKey, foregroundColor, fontFamily, fontSize, mergeDisplayModel, mergeFile, mergeSyntax, mutedColor, onResolveMergeConflict, primaryColor, resolvingMergeConflictKey, rowHeight, rowRenderer, syntaxAppearance],
  );

  useEffect(() => {
    if (!mergeFile || !syntaxHighlightingEnabled) {
      setMergeSyntax(null);
      return;
    }

    let cancelled = false;
    const language = getSyntaxLanguageForPath(mergeFile.path);
    const leftSource = mergeDisplayModel.rows.map((row) => row.leftText).join("\n");
    const rightSource = mergeDisplayModel.rows.map((row) => row.rightText).join("\n");
    ensureSyntaxGrammarsForPaths([mergeFile.path])
      .then(() => Promise.all([
        highlightString(leftSource, language, syntaxThemeName),
        highlightString(rightSource, language, syntaxThemeName),
      ]))
      .then(([leftResult, rightResult]) => {
        if (!cancelled) {
          const styles = [...leftResult.styles, ...rightResult.styles];
          setMergeSyntax({
            configVersion: hashDiffNativeRowConfigVersion([syntaxKey, styles.length]),
            key: syntaxKey,
            leftLines: leftResult.lines,
            rightLines: rightResult.lines,
            tokenStyleById: createMergeSyntaxStyleMap(styles),
          });
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.error(error instanceof Error ? error.message : String(error));
          setMergeSyntax(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mergeDisplayModel, mergeFile, syntaxHighlightingEnabled, syntaxKey, syntaxThemeName]);

  useEffect(() => {
    if (mergeFile && scrolledMergeFileRef.current !== dataVersion && mergeDisplayModel.conflictRanges.length > 0) {
      scrolledMergeFileRef.current = dataVersion;
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          animated: false,
          index: Math.max(0, firstConflictRowIndex - 4),
          viewPosition: 0,
        }).catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
      });
    }
  }, [dataVersion, firstConflictRowIndex, listRef, mergeDisplayModel, mergeFile]);
  const emptyMessage = mergeState.status === "loading"
    ? "Checking merge conflicts..."
    : mergeState.status === "error"
      ? mergeState.message
      : mergeState.status === "ready"
        ? "No unresolved marker blocks in this file."
        : mergeState.reason;

  if (!mergeFile || mergeState.status !== "ready" || mergeFile.markerBlocks.length === 0) {
    return (
      <View style={[styles.mergeEmpty, { height, minHeight: height }]}>
        <Text style={[styles.mergeEmptyTitle, { color: foregroundColor }]}>
          Merge Result
        </Text>
        <Text style={[styles.mergeEmptyText, { color: mutedColor }]}>
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.mergeVirtualizedRoot, { height, minHeight: height }]}>
      <VirtualizedFixedDocumentList
        dataVersion={dataVersion}
        debugName="merge"
        extraData={mergeListExtraData}
        getRow={getMergeRow}
        getItemSize={getMergeItemSize}
        itemIndexes={itemIndexes}
        ListHeaderComponent={<View style={styles.mergeListHeaderSpacer} />}
        listHeaderHeight={diffTitlebarTopInset + 32}
        listRef={listRef}
        lineOverscan={Math.max(12, Math.floor(diffLineOverscan / 10))}
        overscanRequestDelayMs={diffOverscanRequestDelayMs}
        requestRange={noopVirtualizedDocumentRequestRange}
        requestRangesOnScroll
        rowHeight={rowHeight}
        renderRow={renderMergeRow}
        style={styles.mergeVirtualizedList}
      />
      <View pointerEvents="none" style={[styles.mergeHeader, { borderColor }]}>
        <Text style={[styles.mergeHeaderLabel, { color: mutedColor }]}>A Current</Text>
        <View style={styles.mergeHeaderMiddle}>
          <SFSymbol color={primaryColor} name="arrow.triangle.merge" size={13} />
        </View>
        <Text style={[styles.mergeHeaderLabel, { color: mutedColor }]}>B Incoming</Text>
      </View>
    </View>
  );
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
  const renderCountRef = useRef(0);
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const adaptiveLightModeEnabled = useDiffAdaptiveLightModeEnabledSetting();
  const rowHeight = getDiffLineRowHeight(fontSize);
  const rowRenderer = useDiffRowRendererSetting();
  const showOnlyHunks = useDiffShowOnlyHunksSetting();
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
  const loggedFirstSidebarFileRenderRef = useRef(false);
  const loggedFirstUnifiedRowRenderRef = useRef(false);
  const loggedFirstSideBySideRowRenderRef = useRef(false);
  const [syntaxTokenizationProgress, setSyntaxTokenizationProgress] = useState<DiffSyntaxTokenizationProgress>({
    progress: 0,
    version: 0,
    visible: false,
  });
  const [resolvingMergeConflictKey, setResolvingMergeConflictKey] = useState<string | null>(null);
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
  const fileHeaderBackgroundColor = displayTheme.colors.surfaceMuted;
  const mutedColor = displayTheme.colors.muted;
  const selectedSidebarFileBackgroundColor = syntaxTheme.appearance === "dark"
    ? "rgba(88, 166, 255, 0.24)"
    : "rgba(9, 105, 218, 0.16)";

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
      activeFileIndex$.set(state.files[0]?.index ?? null);
      setCollapsedFileIndexesValue((current) => current.size > 0 ? new Set() : current);
    } else {
      activeFileIndex$.set(null);
    }
  }, [activeFileIndex$, resetSideBySideRuntime, setCollapsedFileIndexesValue, state.status === "loaded" ? state.document : null]);
  useEffect(() => {
    if (viewMode === "merge" && state.status === "loaded" && mergeState.status === "ready" && mergeState.conflictBlockCount > 0) {
      const unresolvedPaths = new Set(
        mergeState.files
          .filter((file) => file.markerBlocks.length > 0)
          .map((file) => file.path),
      );
      const activeFile = getActiveDiffFile(state.files, activeFileIndex$.peek());
      if (!activeFile || !unresolvedPaths.has(activeFile.path)) {
        const nextFile = state.files.find((file) => unresolvedPaths.has(file.path));
        activeFileIndex$.set(nextFile?.index ?? null);
      }
    }
  }, [activeFileIndex$, mergeState, state.status === "loaded" ? state.files : null, viewMode]);

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
    setLoadingSourceValue(nextSource);
    setMergeStateValue(nextSource.kind === "folder" ? { status: "loading" } : unavailableDiffMergeState);
    if (state$.peek().status === "loaded") {
      setDocumentErrorValue(null);
    } else {
      setOpenErrorValue(null);
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
                    setMergeStateValue(nextMergeState);
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
      setViewerState(nextLoadedState);
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
      loadTraceRef.current = null;
      setMergeStateValue(unavailableDiffMergeState);
      setLoadingSourceValue((current) => sourcesMatch(current, nextSource) ? null : current);
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

  const resolveMergeConflict = useCallback((file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => {
    const currentState = state$.peek();
    if (currentState.status === "loaded" && currentState.source.kind === "folder" && resolvingMergeConflictKey === null) {
      const conflictKey = getMergeConflictKey(file, block);
      setResolvingMergeConflictKey(conflictKey);
      setDocumentErrorValue(null);
      resolveDiffMergeConflictBlock({
        choice,
        folderPath: currentState.source.value,
        path: file.path,
        startLine: block.startLine,
      })
        .then(() => loadSource(currentState.source, { force: true, reason: "merge-resolve" }))
        .catch((error: unknown) => {
          setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
        })
        .finally(() => {
          setResolvingMergeConflictKey(null);
        });
    }
  }, [loadSource, resolvingMergeConflictKey, setDocumentErrorValue, state$]);

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
        viewPosition: 0,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  }, [getVisibleListIndex, sideBySideListIndexByRowIndex, viewMode]);

  const renderSidebarFile = useCallback(({ item: file }: LegendListRenderItemProps<DiffFileSummary>) => {
    const statusPresentation = getFileStatusPresentation(file);
    if (!loggedFirstSidebarFileRenderRef.current) {
      loggedFirstSidebarFileRenderRef.current = true;
      logDiffOpenTiming("viewer.sidebarFile.render.first", {
        fileIndex: file.index,
        filePath: file.path,
      });
    }

    return (
      <DiffSidebarFileRow
        activeFileIndex$={activeFileIndex$}
        borderColor={displayTheme.colors.border}
        file={file}
        foregroundColor={foregroundColor}
        mergeFile={viewMode === "merge" ? getMergeConflictFileForDiffFile(mergeState, file) : null}
        mutedColor={mutedColor}
        onPress={() => scrollToFile(file)}
        selectedBackgroundColor={selectedSidebarFileBackgroundColor}
        selectedBorderColor={displayTheme.colors.primary}
        statusPresentation={statusPresentation}
      />
    );
  }, [activeFileIndex$, displayTheme.colors.border, displayTheme.colors.primary, foregroundColor, mergeState, mutedColor, scrollToFile, selectedSidebarFileBackgroundColor, viewMode]);

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
    if (nextMetrics.contentHeight > 0 && previousDiffPaneHeight !== nextMetrics.contentHeight) {
      setDiffPaneHeightValue(nextMetrics.contentHeight);
    }
  }, [diffPaneHeight$, setDiffPaneHeightValue, setSplitPaneMetricsValue, splitPaneMetrics$]);

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
  const diffListHeight = Math.max(0, diffContentHeight - documentErrorHeight);
  const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
  const sidebarListHeight = isSidebarLayoutReady ? Math.max(0, splitPaneMetrics.sidebarHeight - diffSidebarTopInset - 70) : 0;
  const activeItemIndexes = renderViewMode === "merge" && mergeState.status === "ready" && mergeState.conflictFileCount > 0
    ? [0]
    : renderViewMode === "unified"
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
        activeFileIndex$={activeFileIndex$}
        activeItemIndexes={activeItemIndexes}
        adaptiveLightModeEnabled={adaptiveLightModeEnabled}
        backgroundColor={backgroundColor}
        diffContentHeight={diffContentHeight}
        diffListHeight={diffListHeight}
        diffPaneHeight={diffPaneHeight}
        diffRows={diffRows}
        documentErrorBody={documentErrorBody}
        fileFilterInputRef={fileFilterInputRef}
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
        renderSidebarFile={renderSidebarFile}
        renderSideBySideRow={renderSideBySideRow}
        requestSideBySideRange={requestSideBySideRange}
        resolvingMergeConflictKey={resolvingMergeConflictKey}
        onResolveMergeConflict={resolveMergeConflict}
        rowHeight={rowHeight}
        sidebarCollapsed={sidebarCollapsed}
        sidebarListHeight={sidebarListHeight}
        sideBySideDataVersion={sideBySideDataVersion}
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
      <DiffWindowChromeController />
      <DiffNativeMenuController />
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
      <DiffFileWatcherController loadSource={loadSource} />
      <DiffActionHandlersController
        copyCurrentFilePath={copyCurrentFilePath}
        copyCurrentRelativePath={copyCurrentRelativePath}
        copyCurrentSource={copyCurrentSource}
        focusFileFilter={focusFileFilter}
        reloadCurrentSource={reloadCurrentSource}
        revealCurrentFolder={revealCurrentFolder}
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
  sidebarConflictBadge: {
    alignItems: "center",
    backgroundColor: "#f59e0b",
    borderRadius: 7,
    height: 15,
    justifyContent: "center",
    minWidth: 15,
    paddingHorizontal: 4,
  },
  sidebarConflictBadgeText: {
    color: "#111827",
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
  mergeEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  mergeEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 420,
    paddingTop: 6,
    textAlign: "center",
  },
  mergeEmptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
  },
  mergeHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 32,
    left: 0,
    position: "absolute",
    right: 0,
    top: diffTitlebarTopInset,
    zIndex: 2,
  },
  mergeHeaderLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 32,
    paddingHorizontal: 10,
    textTransform: "uppercase",
  },
  mergeHeaderMiddle: {
    alignItems: "center",
    justifyContent: "center",
    width: 82,
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
  mergeListHeaderSpacer: {
    height: diffTitlebarTopInset + 32,
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
  mergeVirtualizedList: {
    flex: 1,
  },
  mergeVirtualizedRoot: {
    flex: 1,
    minHeight: 0,
  },
});

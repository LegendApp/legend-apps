import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { commandRunner } from "@legend-desktop/command-runner";
import {
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
import { nowMs } from "@legend-desktop/source-viewer";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import { ensureSyntaxGrammarsForPaths } from "@legend-desktop/syntax-parser";
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
import { recordDiffSyntaxLanguagesForPaths } from "./diffSyntaxWarmup";
import {
  getDiffViewModeSetting,
  type DiffRowRendererSetting,
  useDiffAdaptiveLightModeEnabledSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffRowRendererSetting,
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
  getDirectoryPath,
  getFilePathContext,
  getFileStatusPresentation,
  getJoinedPath,
} from "./viewer/diffFilePresentation";
import {
  DiffSideBySideRow,
  DiffUnifiedRow,
  diffSideBySideLineNumberWidth,
  diffSideBySideMarkerWidth,
  diffUnifiedChangeBarWidth,
  diffUnifiedLineNumberWidth,
  diffUnifiedMarkerWidth,
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
  useDiffViewerModel,
  type DiffFatalError,
  type DiffLoadedState,
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

type DiffSidebarFileRowProps = {
  activeFileIndex$: Observable<number | null>;
  borderColor: string;
  file: DiffFileSummary;
  foregroundColor: string;
  mutedColor: string;
  onPress: () => void;
  selectedBorderColor: string;
  selectedBackgroundColor: string;
  statusPresentation: ReturnType<typeof getFileStatusPresentation>;
};

type DiffLoadedBodyProps = {
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
  nativeSideBySideRowConfig: DiffNativeRowConfigProps;
  nativeUnifiedRowConfig: DiffNativeRowConfigProps;
  adaptiveLightModeEnabled: boolean;
  mutedColor: string;
  renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => ReactElement;
  renderSidebarFile: (props: LegendListRenderItemProps<DiffFileSummary>) => ReactElement;
  renderSideBySideRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => ReactElement;
  requestSideBySideRange: (lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => void;
  rowHeight: number;
  sidebarCollapsed: boolean;
  sidebarListHeight: number;
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
  visible: boolean;
};

type DiffListExtraData = {
  adaptiveLightModeEnabled: boolean;
  borderColor: string;
  fileHeaderBackgroundColor: string;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  mutedColor: string;
  rowRenderer: DiffRowRendererSetting;
  rowHeight: number;
  sideBySideTokenStyleCount: number;
  syntaxAppearance: "dark" | "light";
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
  nativeSideBySideRowConfig,
  nativeUnifiedRowConfig,
  mutedColor,
  renderRow,
  renderSidebarFile,
  renderSideBySideRow,
  requestSideBySideRange,
  rowHeight,
  sidebarCollapsed,
  sidebarListHeight,
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
    const nativeUnifiedRows = listExtraData.rowRenderer === "native" && viewMode === "unified";
    const nativeSideBySideRows = listExtraData.rowRenderer === "native" && viewMode === "blocks";
    const adaptiveRender = adaptiveLightModeEnabled ? diffAdaptiveRender : undefined;
    const requestUnifiedRange = nativeUnifiedRows ? noopVirtualizedDocumentRequestRange : diffRows.requestRange;
    const requestBlocksRange = nativeSideBySideRows ? noopVirtualizedDocumentRequestRange : requestSideBySideRange;
    const nativeRowConfig = nativeUnifiedRows ? nativeUnifiedRowConfig : nativeSideBySideRows ? nativeSideBySideRowConfig : null;
    const listHeader = <View style={styles.diffTitlebarSpacer} />;
    const list = viewMode === "unified" ? (
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
        getRow={nativeUnifiedRows ? undefined : getRow}
        rowHeight={rowHeight}
        renderRow={renderRow}
        style={[styles.list, { height: diffListHeight, minHeight: diffListHeight }]}
      />
    ) : (
      <VirtualizedFixedDocumentList
        adaptiveRender={adaptiveRender}
        dataVersion={diffRows.dataVersion}
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
        rowHeight={rowHeight}
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
      <Text style={[styles.sidebarTitle, { color: mutedColor }]}>Files</Text>
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
        <View onLayout={handleDiffPaneLayout} style={styles.diffPane}>
          {diffContent}
        </View>
      </SidebarSplitView>
      <DiffSyntaxProgressBar
        foregroundColor={syntaxAppearance === "dark" ? "rgba(88, 166, 255, 0.9)" : "rgba(9, 105, 218, 0.86)"}
        progress={syntaxTokenizationProgress.progress}
        visible={syntaxTokenizationProgress.visible}
      />
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
  const viewMode = useDiffViewModeSetting();
  const syntaxTheme = useDiffSyntaxTheme();
  const syntaxHighlightingEnabled = useDiffSyntaxHighlightingEnabledSetting();
  const nativeUnifiedRows = rowRenderer === "native" && viewMode === "unified";
  const nativeSideBySideRows = rowRenderer === "native" && viewMode === "blocks";
  const nativeDiffRows = nativeUnifiedRows || nativeSideBySideRows;
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const model = useDiffViewerModel();
  const {
    activeFileIndex$,
    collapsedFileIndexes$,
    diffPaneHeight$,
    documentError$,
    loadingSource$,
    openError$,
    setCollapsedFileIndexesValue,
    setDiffPaneHeightValue,
    setDocumentErrorValue,
    setLoadingSourceValue,
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
  const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
  const loggedFirstSidebarFileRenderRef = useRef(false);
  const loggedFirstUnifiedRowRenderRef = useRef(false);
  const loggedFirstSideBySideRowRenderRef = useRef(false);
  const [syntaxTokenizationProgress, setSyntaxTokenizationProgress] = useState<DiffSyntaxTokenizationProgress>({
    progress: 0,
    visible: false,
  });
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
        const nextProgress = totalRows > 0 ? tokenizedRows / totalRows : 1;
        const nextVisible = totalRows > 0 && tokenizedRows < totalRows;
        setSyntaxTokenizationProgress((current) => (
          current.visible === nextVisible && Math.abs(current.progress - nextProgress) < 0.001
            ? current
            : {
              progress: nextProgress,
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
      current.visible || current.progress !== 0
        ? {
          progress: 0,
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

  const loadSource = useCallback(async (nextSource: DiffOpenSource) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const loadStartedAt = nowMs();
    const initialRowCount = nativeDiffRows ? 0 : diffInitialRowCount;
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
    });
    logDiffMemoryMark("viewer.load.start", {
      requestId,
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
          sourceKind: nextSource.kind,
        });
        progressiveSession = startGitFolderDiff(nextSource.value);
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
  }, [nativeDiffRows, setDocumentErrorValue, setLoadingSourceValue, setOpenErrorValue, setViewerState, state$]);

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

    loadSource(currentState.source).catch((error: unknown) => {
      setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
    });
    return true;
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
  const listExtraData = useMemo<DiffListExtraData>(
    () => ({
      adaptiveLightModeEnabled,
      borderColor: displayTheme.colors.border,
      fileHeaderBackgroundColor,
      fontFamily,
      fontSize,
      foregroundColor,
      mutedColor,
      rowRenderer,
      rowHeight,
      sideBySideTokenStyleCount: tokenStyleById.size,
      syntaxAppearance: syntaxTheme.appearance,
      syntaxTheme: listSyntaxTheme,
      tokenStyleCount: tokenStyleById.size,
    }),
    [
      adaptiveLightModeEnabled,
      displayTheme.colors.border,
      fileHeaderBackgroundColor,
      fontFamily,
      fontSize,
      foregroundColor,
      listSyntaxTheme,
      mutedColor,
      rowRenderer,
      rowHeight,
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
    syntaxTheme.appearance,
  ]);
  const renderFields = useMemo<DiffRenderFields>(
    () => ({
      borderColor: displayTheme.colors.border,
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
      sideBySideFileHeaderByListIndex,
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
      sideBySideFileHeaderByListIndex,
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
        mutedColor={mutedColor}
        onPress={() => scrollToFile(file)}
        selectedBackgroundColor={selectedSidebarFileBackgroundColor}
        selectedBorderColor={displayTheme.colors.primary}
        statusPresentation={statusPresentation}
      />
    );
  }, [activeFileIndex$, displayTheme.colors.border, displayTheme.colors.primary, foregroundColor, mutedColor, scrollToFile, selectedSidebarFileBackgroundColor]);

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

  const getItemSize = useCallback((index: number) => (
    getItemType(index) === "file-header" ? diffFileHeaderRowHeight : rowHeight
  ), [getItemType, rowHeight]);

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
    return sideBySideFileHeaderIndexes.has(index) ? diffFileHeaderRowHeight : rowHeight;
  }, [rowHeight, sideBySideFileHeaderIndexes]);

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
  const activeItemIndexes = renderViewMode === "unified" ? visibleItemIndexes : sideBySideItemIndexes;
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
        nativeSideBySideRowConfig={nativeSideBySideRowConfig}
        nativeUnifiedRowConfig={nativeUnifiedRowConfig}
        mutedColor={mutedColor}
        renderRow={renderRow}
        renderSidebarFile={renderSidebarFile}
        renderSideBySideRow={renderSideBySideRow}
        requestSideBySideRange={requestSideBySideRange}
        rowHeight={rowHeight}
        sidebarCollapsed={sidebarCollapsed}
        sidebarListHeight={sidebarListHeight}
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
    top: 0,
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

import { type DiffDocument, type DiffFileSummary, type DiffLoadSession, type DiffLoadStatus, type DiffRenderRow, type DiffSideBySideRenderRow, loadUnifiedDiff, loadUnifiedDiffFile, loadUnifiedDiffFromUrl, startGitFolderDiff, startUnifiedDiffFromUrl } from "@legend-apps/diff-parser";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { nowMs } from "@legend-apps/source-viewer";
import { ensureTreeGrammarsForPaths } from "@legend-apps/syntax-parser";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { type VirtualizedDocumentVisibleRangeInfo, type VirtualizedFixedDocumentListRef, type VirtualizedFixedDocumentListRenderRowProps } from "@legend-apps/virtualized-document";
import { type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { noteRecentDocument } from "@legendapp/spark/app/documents";
import { type DropEvent } from "@legendapp/spark/drag-drop";
import { revealInFileManager } from "@legendapp/spark/files";
import { runCommand } from "@legendapp/spark/processes";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { type SidebarSplitViewResizeEvent } from "@legendapp/spark/ui/split-view";
import { useWindowId } from "@legendapp/spark/windows";
import { type Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Linking, Platform, TextInput, View } from "react-native";
import { type UnsavedDiffMergeDraftReason, confirmUnsavedDiffMergeDrafts } from "../confirmUnsavedDiffMergeDrafts";
import { registerDiffWindowExitPreparation } from "../diffAppExit";
import { addRecentDiffSource, updateSavedDiffWindowSource } from "../diffAppMetadata";
import { createDiffCompareSource, createDiffCompareSourceForRef, loadDiffCompareRepoState } from "../diffCompareTargets";
import { getDroppedDiffSource, getUnsupportedDropMessage } from "../diffDrop";
import { type DiffOpenSource, getDiffRecentDocumentPath, getDiffSourceLabel, normalizeDiffOpenSource, openDiffFilePairDialog, openDiffFolderDialog } from "../diffFiles";
import { diffHotkeyRouter } from "../diffHotkeys";
import { type DiffMergeConflictBlock, type DiffMergeConflictChoice, type DiffMergeConflictFile, createDiffMergeDraftFileWithResolvedBlock, createReadyMergeState, loadDiffMergeState, readDiffMergeFileContent, resolveDiffMergeConflictContent, writeDiffMergeFileContent } from "../diffMerge";
import { diffMergeSaveConflictKey, getMergeConflictKey, isDiffMergeSavePending } from "../diffMergeControls";
import { getDiffPalette } from "../diffPalette";
import { defaultDiffSidebarWidth, getDiffIgnoreWhitespaceChangesSetting, getDiffShowOnlyHunksSetting, setDiffShowOnlyHunksSetting, setDiffSidebarWidthSetting, useDiffAdaptiveLightModeEnabledSetting, useDiffFontFamilySetting, useDiffFontSizeSetting, useDiffHighlightChangedCharactersSetting, useDiffIgnoreWhitespaceChangesSetting, useDiffRestoreWindowsOnStartupSetting, useDiffShowOnlyHunksSetting, useDiffShowWhitespaceCharactersSetting, useDiffSidebarWidthSetting, useDiffSyntaxHighlightingEnabledSetting, useDiffSyntaxTheme, useDiffViewModeSetting } from "../diffSettings";
import { createDiffStartupSplitView, diffContentMinWidth, focusDiffSearchToolbarItem, setDiffViewerStartupSplitView } from "../diffWindowControls";
import { createFilePairDiffCommand, createFilePairUnifiedDiff } from "../filePairDiff";
import { DiffStartScreen } from "../start-screen/DiffStartScreen";
import { useDiffStartScreenController } from "../start-screen/useDiffStartScreenController";
import { getActiveDiffFile, getJoinedPath } from "../viewer/diffFilePresentation";
import { getAdjacentDiffHunkIndex } from "../viewer/diffHunkNavigation";
import { findFileIndexForRow, getFilesForSourceRowRange, useDiffLoadedModel, useDiffSideBySideRuntime, useVisibleDiffFileTokenizationScheduler } from "../viewer/diffLoadedDocumentModel";
import { type DiffRowRenderState, createDiffUnifiedHunkRowIndexSet, diffHunkHeaderHeight, diffSideBySideLineNumberWidth, diffSideBySideMarkerWidth, DiffSideBySideRow, diffUnifiedChangeBarWidth, diffUnifiedLineNumberWidth, diffUnifiedMarkerWidth, DiffUnifiedRow, getDiffRowPalette, getSideBySideDividerColor } from "../viewer/DiffRows";
import { type DiffSearchResult, getDiffSearchSubmitIndex } from "../viewer/diffSearch";
import { diffBackgroundTokenizeChunkBudgetMs, diffBackgroundTokenizeChunkRowCount, diffBackgroundTokenizePollMs, diffBackgroundTokenizeStartDelayMs, diffDocumentErrorHeight, diffDocumentPermissionErrorHeight, diffFileHeaderRowHeight, diffInitialRowCount, diffProgressiveInitialPaintRowCount, diffProgressiveItemCountExpandChunkRowCount, diffProgressiveItemCountExpandThresholdRows, diffProgressivePostInitialLoadPollMs, diffProgressivePostInitialLoadResumeMs, diffTitlebarTopInset } from "../viewer/diffViewerConstants";
import { DiffActionHandlersController, DiffFileWatcherController, DiffLaunchController, DiffLoadCompletionController, DiffWindowChromeController, DiffWindowToolbarItemController } from "../viewer/diffViewerControllers";
import { type DiffLoadSourceOptions, type DiffLoadTrace, type DiffViewerState, emptyDiffLoadProgressState, emptyDiffViewerState, unavailableDiffMergeState, useDiffViewerModel } from "../viewer/diffViewerModel";
import { createOpenError, createRefreshError, getDiffVisibleSourceModel, getErrorMessage, shouldPrepareMergeDraftsForSourceChange, sourcesMatch } from "../viewer/diffViewerSupport";
import { clearDiffMergeDraftFlag, getUnsavedDiffMergeDraftFiles } from "./diffMergeDrafts";
import { DiffLoadedContentPane, DiffLoadedSidebarPane, DiffSidebarFileRow, DiffSidebarFolderRow, DiffSplitBody } from "./DiffViewerPane";
import { DiffCompareRefPrompt, DiffDocumentErrorBody, DiffDownloadingBody, DiffDropSurface, DiffErrorPanel, DiffFatalBody, DiffNativeMenuSavingStateController, DiffNoChangesBody, DiffSearchStatusPanel, DiffStatisticsPanel, DiffUnsavedMergeDraftBannerWithSavingState } from "./DiffWindowChrome";
import { createDiffRowRenderState, createDiffSidebarRenderState, diffActiveSearchHighlightColor, diffActiveSearchRowHighlightColor, diffSearchHighlightColor, emptyDiffListIndexByFileIndex, getBackgroundTokenizationPlan, getDiffLineRowHeight, hashDiffNativeRowConfigVersion } from "./diffWindowRendering";
import { styles } from "./diffWindowStyles";
import { type DiffItemCountLimitState, type DiffLoadedCacheEntry, type DiffLoadedPayload, type DiffMergeDraftFile, type DiffMergeFileResolveQueue, type DiffNativeRowConfigProps, type DiffRowConfig, type DiffSidebarEntry, type DiffSidebarRenderState, type DiffViewerWindowProps } from "./diffWindowTypes";
import { applyDiffMergeDraftsToState, clearLoadedCache, createGitDiffCommandError, deleteLoadedCacheEntriesWithPrefix, deleteLoadedCacheEntry, disposeDiffDocument, disposeLoadedCacheEntry, getDiffGitFolderLoadCompareOptions, getDiffLoadedCacheKey, getDiffLoadProgressState, getDiffSourceCacheKey, shouldCacheLoadedDiff, shouldPublishInitialProgress, waitForDiffProgressPoll } from "./useDiffSourceLoader";

const macOSFilesAndFoldersSettingsUrl = "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders";
const diffMergeSaveWatchSuppressMs = 2000;
const saveDraftDefinitions = [{ id: "saveDraft", title: "Save Merge Drafts", defaultBindings: ["Cmd+S"] }];
const pasteSourceDefinitions = [{ id: "pasteSource", title: "Open Clipboard Source", defaultBindings: ["Cmd+V"] }];
const fileJumpDefinitions = [{ id: "fileJump", title: "Jump to File", defaultBindings: ["Cmd+P"] }];
const searchNavigationDefinitions = [
    { id: "previousSearch", title: "Previous Search Result", defaultBindings: ["Cmd+Shift+G"] },
    { id: "nextSearch", title: "Next Search Result", defaultBindings: ["Cmd+G"] },
];
export function DiffViewerWindowContent({ focusUrlInputRequestId, folderPath, source }: DiffViewerWindowProps) {
    "use no memo";
    // React Compiler does not yet support the async try/finally workflows in this controller.
    const windowIdentifier = useWindowId();
    const fontFamily = useDiffFontFamilySetting();
    const fontSize = useDiffFontSizeSetting();
    const highlightChangedCharacters = useDiffHighlightChangedCharactersSetting();
    const ignoreWhitespaceChanges = useDiffIgnoreWhitespaceChangesSetting();
    const previousIgnoreWhitespaceChangesRef = useRef(ignoreWhitespaceChanges);
    const adaptiveLightModeEnabled = useDiffAdaptiveLightModeEnabledSetting();
    const rowHeight = getDiffLineRowHeight(fontSize);
    const showOnlyHunks = useDiffShowOnlyHunksSetting();
    const showWhitespaceCharacters = useDiffShowWhitespaceCharactersSetting();
    const sidebarWidth = useDiffSidebarWidthSetting();
    const viewMode = useDiffViewModeSetting();
    const syntaxTheme = useDiffSyntaxTheme();
    const syntaxHighlightingEnabled = useDiffSyntaxHighlightingEnabledSetting();
    const nativeUnifiedRows = viewMode === "unified";
    const nativeSideBySideRows = viewMode !== "unified";
    const nativeDiffRows = true;
    const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
    const model = useDiffViewerModel();
    const { compareRepoState$, compareRefPromptVisible$, compareRefInput$, collapsedSidebarFolders$, searchQuery$, activeSearchResultIndex$, searchResults$, setSearchQuery, activeFileIndex$, collapsedFileIndexes$, diffPaneHeight$, documentError$, loadingSource$, mergeState$, openError$, setCollapsedFileIndexesValue, setDiffPaneHeightValue, setDocumentErrorValue, setLoadProgressValue, setLoadStatisticsValue, setLoadingSourceValue, setMergeStateValue, setOpenErrorValue, setSidebarCollapsedValue, setSplitPaneMetricsValue, setUrlInputErrorValue, setUrlInputValue, setViewerState, sidebarCollapsed$, splitPaneMetrics$, state$, urlInput$, urlInputError$, } = model;
    const state = useValue(state$);
    const documentError = useValue(documentError$);
    const loadingSource = useValue(loadingSource$);
    const mergeState = useValue(mergeState$);
    const sidebarCollapsed = useValue(sidebarCollapsed$);
    const collapsedFileIndexes = useValue(collapsedFileIndexes$);
    const unsavedMergeDraftFiles = useMemo(() => getUnsavedDiffMergeDraftFiles(mergeState), [mergeState]);
    const hasUnsavedMergeDrafts = unsavedMergeDraftFiles.length > 0;
    const listRef = useRef<VirtualizedFixedDocumentListRef | null>(null);
    const inlineListIndexByFileIndexRef = useRef<ReadonlyMap<number, number>>(emptyDiffListIndexByFileIndex);
    const urlInputRef = useRef<TextInput | null>(null);
    const [urlInputFocused, setUrlInputFocused] = useState(false);
    const loadRequestIdRef = useRef(0);
    const loadTraceRef = useRef<DiffLoadTrace | null>(null);
    const loadedCacheRef = useRef(new Map<string, DiffLoadedCacheEntry>());
    const activeProgressiveSessionRef = useRef<DiffLoadSession | null>(null);
    const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
    const preserveActiveFilePathRef = useRef<string | null>(null);
    const mergeDraftsRef = useRef(new Map<string, DiffMergeDraftFile>());
    const mergeDraftsSourceKeyRef = useRef<string | null>(null);
    const savingMergeDraftsRef = useRef(false);
    const suppressFileWatcherReloadUntilRef = useRef(0);
    const syntaxTokenizationState$ = useObservable({ ranges: "", version: 0 });
    const resolvingMergeConflictKeys$ = useObservable<Set<string>>(new Set());
    const mergeResolveQueuesRef = useRef(new Map<string, DiffMergeFileResolveQueue>());
    const prepareMergeDraftsForTransitionRef = useRef<(reason: UnsavedDiffMergeDraftReason) => Promise<boolean>>(async () => true);
    const sourceTransitionInFlightRef = useRef(false);
    const setCompareRepoState = compareRepoState$.set;
    const setCompareRefPromptVisible = compareRefPromptVisible$.set;
    const setCompareRefInput = compareRefInput$.set;
    const setCollapsedSidebarFolders = useCallback((next: Set<string> | ((current: Set<string>) => Set<string>)) => {
        collapsedSidebarFolders$.set(typeof next === "function" ? next(collapsedSidebarFolders$.peek()) : next);
    }, [collapsedSidebarFolders$]);
    const setActiveSearchResultIndex = activeSearchResultIndex$.set;
    const lastSubmittedSearchQueryRef = useRef("");
    useEffect(() => () => {
        loadRequestIdRef.current += 1;
        activeProgressiveSessionRef.current?.cancel();
        activeProgressiveSessionRef.current = null;
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
            disposeDiffDocument(currentState.document, "viewer.unmount");
        }
        clearLoadedCache(loadedCacheRef.current, "viewer.unmount.cache");
        loadTraceRef.current = null;
        loggedTraceDocumentRef.current = null;
        mergeDraftsRef.current = new Map();
        mergeDraftsSourceKeyRef.current = null;
        mergeResolveQueuesRef.current = new Map();
        // This model belongs to the discarded window. Resetting its observables
        // here wakes child chrome observers before their own unmount cleanup and
        // sends toolbar updates to a native window that has already closed.
    }, [state$]);
    const setResolvingMergeConflictKeyActive = useCallback((key: string, active: boolean) => {
        const currentKeys = resolvingMergeConflictKeys$.peek();
        if (currentKeys.has(key) !== active) {
            const nextKeys = new Set(currentKeys);
            if (active) {
                nextKeys.add(key);
            }
            else {
                nextKeys.delete(key);
            }
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
    const renderViewMode = viewMode;
    const visibleSourceModel = getDiffVisibleSourceModel(state, loadingSource);
    const { loadedFileCount, showSidebarControl, showViewModeToolbar, toolbarSource, visibleFolderPath, visibleSource, visibleSourceLabel } = visibleSourceModel;
    const compareRepoPath = toolbarSource?.kind === "folder"
        ? toolbarSource.value
        : toolbarSource?.kind === "git"
            ? toolbarSource.cwd
            : null;
    const compareRepoStateReady = compareRepoPath !== null &&
        toolbarSource !== null &&
        state.status === "loaded" &&
        state.loadComplete !== false &&
        sourcesMatch(state.source, toolbarSource);
    useEffect(() => {
        let cancelled = false;
        let firstFrameId: number | null = null;
        let secondFrameId: number | null = null;
        if (!compareRepoPath || !compareRepoStateReady) {
            setCompareRepoState(null);
        }
        else {
            firstFrameId = requestAnimationFrame(() => {
                secondFrameId = requestAnimationFrame(() => {
                    if (!cancelled) {
                        const startedAt = nowMs();
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
                                    remoteNames: [],
                                    repoPath: compareRepoPath,
                                    upstreamBranch: null,
                                });
                            }
                        });
                    }
                });
            });
        }
        return () => {
            cancelled = true;
            if (firstFrameId !== null) {
                cancelAnimationFrame(firstFrameId);
            }
            if (secondFrameId !== null) {
                cancelAnimationFrame(secondFrameId);
            }
        };
    }, [compareRepoPath, compareRepoStateReady, setCompareRepoState]);
    const diffPalette = useMemo(() => getDiffPalette(syntaxTheme, displayTheme.colors), [
        displayTheme.colors.border,
        displayTheme.colors.danger,
        displayTheme.colors.muted,
        displayTheme.colors.primary,
        displayTheme.colors.surface,
        displayTheme.colors.surfaceMuted,
        syntaxTheme.appearance,
        syntaxTheme.background,
        syntaxTheme.foreground,
    ]);
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
    const isProgressiveLoadIncomplete = state.status === "loaded" && state.loadComplete === false;
    const initialItemCountLimit = loadedDocument !== null &&
        isProgressiveLoadIncomplete &&
        loadedDocumentRowCount > diffProgressiveInitialPaintRowCount
        ? Math.min(loadedDocumentRowCount, currentItemCountLimit)
        : null;
    useEffect(() => {
        setCollapsedSidebarFolders(new Set());
    }, [loadedDocumentId, setCollapsedSidebarFolders]);
    const { collapsedFileIndexList, diffRows, fileHeaderRowIndexes, getRow, getVisibleListIndex, sideBySideFileHeaderByListIndex, sideBySideHunkHeaderIndexes, sideBySideDataSource, sideBySideListIndexByRowIndex, sideBySideRowCount, visibleItemIndexes, } = useDiffLoadedModel({
        collapsedFileIndexes,
        fontFamily,
        fontSize,
        initialItemCountLimit,
        nativeUnifiedRows,
        rowHeight,
        state,
        viewMode: renderViewMode,
    });
    // Progressive documents append hunk indexes without changing identity, so row count invalidates this snapshot.
    const unifiedHunkRowIndexSet = useMemo(() => createDiffUnifiedHunkRowIndexSet(renderViewMode === "unified" ? loadedDocument : null), [loadedDocument, loadedDocumentRowCount, renderViewMode]);
    const scheduleVisibleFileTokenization = useVisibleDiffFileTokenizationScheduler(syntaxHighlightingEnabled);
    useEffect(() => {
        if (loadedDocument) {
            return () => {
                const isCached = [...loadedCacheRef.current.values()].some((entry) => entry.loaded.document === loadedDocument);
                const currentState = state$.peek();
                const isCurrent = currentState.status === "loaded" && currentState.document === loadedDocument;
                if (isCached || isCurrent) {
                    loadedDocument.cancelTokenizationRequests("viewer.cleanup");
                }
                else {
                    disposeDiffDocument(loadedDocument, "viewer.cleanup");
                }
            };
        }
        return undefined;
    }, [loadedDocument, state$]);
    const { getSideBySideRow, handleSideBySideTopItemChanged, handleSideBySideVisibleRowsRequested, requestSideBySideRange, resetSideBySideRuntime, } = useDiffSideBySideRuntime({
        activeFileIndex$,
        diffPaneHeight$,
        nativeSideBySideRows,
        rowHeight,
        sideBySideDataSource,
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
                const nextLimit = Math.min(loadedDocumentRowCount, Math.max(Math.ceil(requestedMinimum), currentLimit + diffProgressiveItemCountExpandChunkRowCount));
                if (nextLimit > currentLimit) {
                    nextState = {
                        documentId,
                        limit: nextLimit,
                    };
                }
            }
            return nextState;
        });
    }, [loadedDocument, loadedDocumentId, loadedDocumentRowCount]);
    const maybeExpandItemCountLimitForVisibleRange = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo, viewKind: string) => {
        const isDemandRequest = info.reason === "scroll" || info.reason === "highlight";
        if (isDemandRequest && loadedDocument !== null && initialItemCountLimit !== null) {
            const visibleEnd = Math.max(0, Math.floor(start)) + Math.max(0, Math.ceil(count));
            const requestedMinimum = visibleEnd + diffProgressiveItemCountExpandThresholdRows;
            if (requestedMinimum >= initialItemCountLimit) {
                const reason = `${viewKind}:${info.reason}`;
                expandItemCountLimit(loadedDocumentId, requestedMinimum, reason);
            }
        }
    }, [expandItemCountLimit, initialItemCountLimit, loadedDocument, loadedDocumentId]);
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
                        ensureTreeGrammarsForPaths(filePaths)
                            .then(() => {
                            if (!cancelled) {
                                document.startBackgroundTokenization(diffBackgroundTokenizeChunkRowCount, diffBackgroundTokenizeChunkBudgetMs, backgroundPlan.rowLimit, backgroundPlan.sourceLineCount);
                            }
                        })
                            .catch((error: unknown) => {
                            console.error(getErrorMessage(error));
                        });
                    }
                    else {
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
    }, [
        state.status === "loaded" ? state.document : null,
        state.status === "loaded" ? state.loadComplete : true,
        syntaxHighlightingEnabled,
    ]);
    useEffect(() => {
        if (state.status === "loaded" && state.loadComplete !== false && syntaxHighlightingEnabled) {
            const document = state.document;
            const updateTokenizationVersion = () => {
                const tokenizationVersion = document.getTokenizedRowVersion();
                if (syntaxTokenizationState$.version.peek() !== tokenizationVersion) {
                    const ranges = document.consumeTokenizedRowRanges()
                        .map((range) => `${Math.floor(range.start)}:${Math.ceil(range.end)}`)
                        .join(",");
                    syntaxTokenizationState$.set({ ranges, version: tokenizationVersion });
                }
            };
            updateTokenizationVersion();
            const intervalHandle = setInterval(updateTokenizationVersion, diffBackgroundTokenizePollMs);
            return () => {
                clearInterval(intervalHandle);
            };
        }
        if (syntaxTokenizationState$.version.peek() !== 0) {
            syntaxTokenizationState$.set({ ranges: "", version: 0 });
        }
        return undefined;
    }, [
        state.status === "loaded" ? state.document : null,
        state.status === "loaded" ? state.loadComplete : true,
        syntaxHighlightingEnabled,
        syntaxTokenizationState$,
    ]);
    useEffect(() => {
        resetSideBySideRuntime();
        if (state.status === "loaded") {
            const preserveActiveFilePath = preserveActiveFilePathRef.current;
            preserveActiveFilePathRef.current = null;
            if (preserveActiveFilePath) {
                const preservedFile = state.files.find((file) => file.path === preserveActiveFilePath || file.oldPath === preserveActiveFilePath);
                activeFileIndex$.set(preservedFile?.index ?? state.files[0]?.index ?? null);
            }
            else {
                activeFileIndex$.set(state.files[0]?.index ?? null);
                setCollapsedFileIndexesValue((current) => current.size > 0 ? new Set() : current);
            }
        }
        else {
            activeFileIndex$.set(null);
        }
    }, [
        activeFileIndex$,
        resetSideBySideRuntime,
        setCollapsedFileIndexesValue,
        state.status === "loaded" ? state.document : null,
    ]);
    const handleVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
        maybeExpandItemCountLimitForVisibleRange(start, count, info, "unified");
        const currentState = state$.peek();
        if (syntaxHighlightingEnabled && currentState.status === "loaded" && currentState.loadComplete !== false) {
            const files = getFilesForSourceRowRange(currentState.files, start, count);
            scheduleVisibleFileTokenization(currentState.document, files, info);
        }
    }, [maybeExpandItemCountLimitForVisibleRange, scheduleVisibleFileTokenization, state$, syntaxHighlightingEnabled]);
    const handleLimitedSideBySideVisibleRowsRequested = useCallback((start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => {
        maybeExpandItemCountLimitForVisibleRange(start, count, info, "side-by-side");
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
    const loadSource = useCallback(async (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => {
        const stateBeforeTransition = state$.peek();
        const hasPendingMergeDraftWork = mergeDraftsRef.current.size > 0 || mergeResolveQueuesRef.current.size > 0;
        const shouldPrepareMergeDrafts = shouldPrepareMergeDraftsForSourceChange(stateBeforeTransition.source, nextSource, hasPendingMergeDraftWork);
        if (shouldPrepareMergeDrafts) {
            if (sourceTransitionInFlightRef.current) {
                return;
            }
            sourceTransitionInFlightRef.current = true;
            let canChangeSource = false;
            try {
                canChangeSource = await prepareMergeDraftsForTransitionRef.current("source");
            }
            finally {
                sourceTransitionInFlightRef.current = false;
            }
            if (!canChangeSource) {
                return;
            }
        }
        const requestId = loadRequestIdRef.current + 1;
        loadRequestIdRef.current = requestId;
        activeProgressiveSessionRef.current?.cancel();
        activeProgressiveSessionRef.current = null;
        const loadStartedAt = nowMs();
        updateSavedDiffWindowSource(windowIdentifier, nextSource);
        const initialRowCount = nativeDiffRows ? 0 : diffInitialRowCount;
        const loadShowOnlyHunks = getDiffShowOnlyHunksSetting();
        const loadIgnoreWhitespaceChanges = getDiffIgnoreWhitespaceChangesSetting();
        const sourceCacheKey = getDiffSourceCacheKey(nextSource);
        const loadedCacheKey = getDiffLoadedCacheKey(nextSource, loadShowOnlyHunks, loadIgnoreWhitespaceChanges);
        const stateBeforeLoad = state$.peek();
        const isBackgroundWatchRefresh = options?.reason === "watch" &&
            stateBeforeLoad.status === "loaded" &&
            sourcesMatch(stateBeforeLoad.source, nextSource);
        if (mergeDraftsSourceKeyRef.current !== null && mergeDraftsSourceKeyRef.current !== sourceCacheKey) {
            mergeDraftsRef.current = new Map();
            mergeDraftsSourceKeyRef.current = null;
        }
        if (options?.force) {
            deleteLoadedCacheEntriesWithPrefix(loadedCacheRef.current, `${sourceCacheKey}:`, "viewer.load.force");
        }
        else if (stateBeforeLoad.status === "loaded" && !sourcesMatch(stateBeforeLoad.source, nextSource)) {
            clearLoadedCache(loadedCacheRef.current, "viewer.load.sourceChange");
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
            addRecentDiffSource(nextSource);
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
        const shouldStartNativeBeforeLoadingState = options?.reason === "launch" &&
            !isBackgroundWatchRefresh &&
            (nextSource.kind === "folder" || nextSource.kind === "github");
        const publishLoadingState = () => {
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
            }
            else {
                setOpenErrorValue(null);
            }
        };
        if (!isBackgroundWatchRefresh && !shouldStartNativeBeforeLoadingState) {
            publishLoadingState();
        }
        const schedulePostLoadSideEffects = (loaded: DiffLoadedPayload) => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (loadRequestIdRef.current === requestId) {
                        addRecentDiffSource(nextSource);
                        const recentDocumentPath = getDiffRecentDocumentPath(nextSource);
                        if (recentDocumentPath) {
                            noteRecentDocument(recentDocumentPath);
                        }
                        if (nextSource.kind === "folder") {
                            loadDiffMergeState(nextSource.value)
                                .then((nextMergeState) => {
                                const currentState = state$.peek();
                                if (loadRequestIdRef.current === requestId && currentState.status === "loaded" && sourcesMatch(currentState.source, nextSource)) {
                                    setMergeStateValue(applyDiffMergeDraftsToState(nextMergeState, mergeDraftsRef.current));
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
                    disposeLoadedCacheEntry(loadedCacheRef.current.get(loadedCacheKey), "viewer.cache.replace");
                    loadedCacheRef.current.set(loadedCacheKey, {
                        loaded,
                        loadComplete,
                    });
                }
                else {
                    deleteLoadedCacheEntry(loadedCacheRef.current, loadedCacheKey, "viewer.cache.skip");
                }
                setLoadProgressValue(emptyDiffLoadProgressState);
            }
        };
        let loadError: unknown = null;
        let progressiveSession: DiffLoadSession | null = null;
        try {
            const nativeStartedAt = nowMs();
            let result: DiffLoadedPayload | null = null;
            if (nextSource.kind === "github") {
                if (loadIgnoreWhitespaceChanges) {
                    if (shouldStartNativeBeforeLoadingState) {
                        publishLoadingState();
                    }
                    result = await loadUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label, initialRowCount, true);
                }
                else {
                    progressiveSession = startUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label);
                    activeProgressiveSessionRef.current = progressiveSession;
                    if (shouldStartNativeBeforeLoadingState) {
                        publishLoadingState();
                    }
                    let progressStatus = progressiveSession.getProgress();
                    setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                    while (loadRequestIdRef.current === requestId &&
                        !shouldPublishInitialProgress(progressStatus, initialRowCount, nowMs() - nativeStartedAt)) {
                        await waitForDiffProgressPoll();
                        progressStatus = progressiveSession.getProgress();
                        setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                    }
                    if (loadRequestIdRef.current !== requestId) {
                        progressiveSession.cancel();
                    }
                    else if (progressStatus.error) {
                        loadError = new Error(progressStatus.error);
                    }
                    else {
                        result = progressiveSession.consumeChanges(initialRowCount);
                    }
                }
            }
            else if (nextSource.kind === "git") {
                const commandResult = await runCommand({
                    args: ["diff", ...(loadIgnoreWhitespaceChanges ? ["--ignore-all-space"] : []), ...nextSource.args],
                    target: { type: "command", name: "git" },
                    cwd: nextSource.cwd,
                    timeoutMs: 60000,
                });
                if ((commandResult.exit.type === "exited" ? commandResult.exit.code : -1) !== 0) {
                    loadError = createGitDiffCommandError(commandResult);
                }
                else {
                    result = await loadUnifiedDiff(decodeProcessText(commandResult.stdout), nextSource.label, initialRowCount, loadIgnoreWhitespaceChanges);
                }
            }
            else if (nextSource.kind === "filePair") {
                const diffCommand = createFilePairDiffCommand(nextSource, loadIgnoreWhitespaceChanges);
                const commandResult = await runCommand(diffCommand);
                if (commandResult.timedOut) {
                    loadError = new Error("File comparison timed out. The files may be too large to compare.");
                }
                else if ((commandResult.exit.type === "exited" ? commandResult.exit.code : -1) !== 0 && (commandResult.exit.type === "exited" ? commandResult.exit.code : -1) !== 1) {
                    loadError = new Error(decodeProcessText(commandResult.stderr) || `diff exited with code ${(commandResult.exit.type === "exited" ? commandResult.exit.code : -1)}.`);
                }
                else {
                    result = await loadUnifiedDiff(createFilePairUnifiedDiff(nextSource, commandResult), nextSource.label, initialRowCount, loadIgnoreWhitespaceChanges);
                }
            }
            else if (nextSource.kind === "diffFile") {
                result = await loadUnifiedDiffFile(nextSource.value, nextSource.label, initialRowCount, loadIgnoreWhitespaceChanges);
            }
            else {
                progressiveSession = startGitFolderDiff(nextSource.value, {
                    ...getDiffGitFolderLoadCompareOptions(nextSource),
                    ignoreWhitespaceChanges: loadIgnoreWhitespaceChanges,
                    showOnlyHunks: loadShowOnlyHunks,
                });
                activeProgressiveSessionRef.current = progressiveSession;
                if (shouldStartNativeBeforeLoadingState) {
                    publishLoadingState();
                }
                let progressStatus = progressiveSession.getProgress();
                setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                while (loadRequestIdRef.current === requestId &&
                    !shouldPublishInitialProgress(progressStatus, initialRowCount, nowMs() - nativeStartedAt)) {
                    await waitForDiffProgressPoll();
                    progressStatus = progressiveSession.getProgress();
                    setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                }
                if (loadRequestIdRef.current !== requestId) {
                    progressiveSession.cancel();
                }
                else if (progressStatus.error) {
                    loadError = new Error(progressStatus.error);
                }
                else {
                    result = progressiveSession.consumeChanges(initialRowCount);
                }
            }
            if (!loadError) {
                if (result) {
                    const loadedResult = result;
                    result = null;
                    const nativeResolvedAt = nowMs();
                    trace.nativeResolvedAt = nativeResolvedAt;
                    if (loadRequestIdRef.current === requestId) {
                        const initialLoadComplete = "complete" in loadedResult ? loadedResult.complete : true;
                        if (isBackgroundWatchRefresh && progressiveSession && "complete" in loadedResult && !loadedResult.complete) {
                            let progressStatus: DiffLoadStatus = loadedResult;
                            setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                            while (loadRequestIdRef.current === requestId && !progressStatus.complete && !progressStatus.error) {
                                await waitForDiffProgressPoll(diffProgressivePostInitialLoadPollMs);
                                progressStatus = progressiveSession.getProgress();
                                setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                            }
                            if (loadRequestIdRef.current !== requestId) {
                                progressiveSession.cancel();
                            }
                            else if (progressStatus.error) {
                                throw new Error(progressStatus.error);
                            }
                            else {
                                const completedProgress = progressiveSession.consumeChanges(0);
                                publishLoadedState(completedProgress, completedProgress.complete, "complete");
                                schedulePostLoadSideEffects(completedProgress);
                            }
                        }
                        else {
                            publishLoadedState(loadedResult, initialLoadComplete, "initial");
                            if (progressiveSession && "complete" in loadedResult && !loadedResult.complete) {
                                let lastFileVersion = loadedResult.fileVersion;
                                let lastRowVersion = loadedResult.rowVersion;
                                let progressStatus: DiffLoadStatus = loadedResult;
                                await waitForDiffProgressPoll(diffProgressivePostInitialLoadResumeMs);
                                while (loadRequestIdRef.current === requestId && !progressStatus.complete && !progressStatus.error) {
                                    await waitForDiffProgressPoll(diffProgressivePostInitialLoadPollMs);
                                    progressStatus = progressiveSession.getProgress();
                                    const hasChanges = progressStatus.rowVersion !== lastRowVersion ||
                                        progressStatus.fileVersion !== lastFileVersion ||
                                        progressStatus.complete ||
                                        !!progressStatus.error;
                                    if (hasChanges && loadRequestIdRef.current === requestId) {
                                        setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                                        lastFileVersion = progressStatus.fileVersion;
                                        lastRowVersion = progressStatus.rowVersion;
                                    }
                                }
                                if (loadRequestIdRef.current !== requestId) {
                                    progressiveSession.cancel();
                                }
                                else if (progressStatus.error) {
                                    throw new Error(progressStatus.error);
                                }
                                else {
                                    const completedProgress = progressiveSession.consumeChanges(0);
                                    publishLoadedState(completedProgress, true, "complete");
                                    schedulePostLoadSideEffects(completedProgress);
                                }
                            }
                            else {
                                schedulePostLoadSideEffects(loadedResult);
                            }
                        }
                    }
                    else {
                        progressiveSession?.cancel();
                    }
                }
            }
        }
        catch (error) {
            loadError = error;
        }
        finally {
            if (loadRequestIdRef.current !== requestId) {
                progressiveSession?.cancel();
            }
            if (activeProgressiveSessionRef.current === progressiveSession) {
                activeProgressiveSessionRef.current = null;
            }
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
            }
            else {
                setOpenErrorValue(createOpenError(nextSource, message));
                setViewerState(emptyDiffViewerState);
            }
        }
    }, [
        nativeDiffRows,
        setDocumentErrorValue,
        setLoadProgressValue,
        setLoadStatisticsValue,
        setLoadingSourceValue,
        setMergeStateValue,
        setOpenErrorValue,
        setViewerState,
        state$,
        windowIdentifier,
    ]);
    useEffect(() => {
        const changed = previousIgnoreWhitespaceChangesRef.current !== ignoreWhitespaceChanges;
        previousIgnoreWhitespaceChangesRef.current = ignoreWhitespaceChanges;
        if (changed) {
            const currentState = state$.peek();
            if (currentState.status === "loaded") {
                loadSource(currentState.source, { reason: "mode-toggle" }).catch((error: unknown) => {
                    setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
                });
            }
        }
    }, [ignoreWhitespaceChanges, loadSource, setDocumentErrorValue, state$]);
    const saveMergeDrafts = useCallback(async () => {
        if (savingMergeDraftsRef.current) {
            return false;
        }
        await waitForMergeResolveQueues();
        const currentState = state$.peek();
        const draftEntries = [...mergeDraftsRef.current.entries()];
        const sourceKey = currentState.source ? getDiffSourceCacheKey(currentState.source) : null;
        if (currentState.status !== "loaded" ||
            currentState.source.kind !== "folder" ||
            draftEntries.length === 0 ||
            mergeDraftsSourceKeyRef.current !== sourceKey ||
            resolvingMergeConflictKeys$.peek().size !== 0) {
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
            deleteLoadedCacheEntriesWithPrefix(loadedCacheRef.current, `${sourceKey}:`, "viewer.merge.save");
            mergeDraftsRef.current = new Map();
            mergeDraftsSourceKeyRef.current = null;
            const currentMergeState = mergeState$.peek();
            if (currentMergeState.status === "ready") {
                setMergeStateValue(createReadyMergeState(currentMergeState.files.map((file) => (draftPaths.has(file.path) ? clearDiffMergeDraftFlag(file) : file))));
            }
            return true;
        }
        catch (error: unknown) {
            setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
            return false;
        }
        finally {
            savingMergeDraftsRef.current = false;
            setResolvingMergeConflictKeyActive(diffMergeSaveConflictKey, false);
        }
    }, [
        mergeState$,
        setDocumentErrorValue,
        setMergeStateValue,
        setResolvingMergeConflictKeyActive,
        state$,
        waitForMergeResolveQueues,
        resolvingMergeConflictKeys$,
    ]);
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
            runCommand({ target: { type: "command", name: "pbpaste" }, timeoutMs: 1000 })
                .then((result) => {
                if ((result.exit.type === "exited" ? result.exit.code : -1) !== 0) {
                    throw new Error(decodeProcessText(result.stderr) || "Unable to read the clipboard.");
                }
                const nextSource = normalizeDiffOpenSource(decodeProcessText(result.stdout));
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
    useRoutedHotkeys({
        router: diffHotkeyRouter, definitions: saveDraftDefinitions, scope: { kind: "window", windowId: windowIdentifier },
        enabled: hasUnsavedMergeDrafts, handlers: { saveDraft: saveMergeDraftsFromCommand }, onError: console.error,
    });
    useRoutedHotkeys({
        router: diffHotkeyRouter, definitions: pasteSourceDefinitions, scope: { kind: "window", windowId: windowIdentifier },
        enabled: state.status === "empty" && !isLoading && !urlInputFocused,
        handlers: { pasteSource: openClipboardSourceFromStartScreen }, onError: console.error,
    });
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
        const resolvingKeys = resolvingMergeConflictKeys$.peek();
        const conflictKey = getMergeConflictKey(file, block);
        if (currentState.status === "loaded" &&
            currentState.source.kind === "folder" &&
            !savingMergeDraftsRef.current &&
            !isDiffMergeSavePending(resolvingKeys) &&
            !resolvingKeys.has(conflictKey)) {
            setResolvingMergeConflictKeyActive(conflictKey, true);
            setDocumentErrorValue(null);
            const originalBlockIndex = Math.max(0, file.markerBlocks.findIndex((candidate) => candidate === block || candidate.startLine === block.startLine));
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
                    const currentBlock = currentFile.markerBlocks[currentBlockIndex] ?? currentFile.markerBlocks.find((candidate) => (candidate.oursLines.length === block.oursLines.length &&
                        candidate.theirsLines.length === block.theirsLines.length &&
                        candidate.oursLines.every((line, index) => line === block.oursLines[index]) &&
                        candidate.theirsLines.every((line, index) => line === block.theirsLines[index])));
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
                        setMergeStateValue(createReadyMergeState(currentMergeState.files
                            .map((currentFile) => currentFile.path === file.path ? nextFile : currentFile)
                            .filter((currentFile) => currentFile.markerBlocks.length > 0 || currentFile.hasUnsavedDraft)));
                    }
                    queue.completedOriginalBlockIndexes.push(originalBlockIndex);
                }
                catch (error: unknown) {
                    setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
                }
                finally {
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
    }, [
        getCurrentMergeFileForResolve,
        mergeState$,
        setDocumentErrorValue,
        setMergeStateValue,
        setResolvingMergeConflictKeyActive,
        state$,
        resolvingMergeConflictKeys$,
    ]);
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
    const prepareMergeDraftsForTransition = useCallback(async (reason: UnsavedDiffMergeDraftReason) => {
        await waitForMergeResolveQueues();
        const currentState = state$.peek();
        const draftFiles = getUnsavedDiffMergeDraftFiles(mergeState$.peek());
        if (currentState.status !== "loaded" || draftFiles.length === 0) {
            return true;
        }
        const action = await confirmUnsavedDiffMergeDrafts({
            fileCount: draftFiles.length,
            reason,
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
    prepareMergeDraftsForTransitionRef.current = prepareMergeDraftsForTransition;
    useEffect(() => registerDiffWindowExitPreparation(windowIdentifier, prepareMergeDraftsForTransition), [prepareMergeDraftsForTransition, windowIdentifier]);
    const openFolder = useCallback(async () => {
        if (!loadingSource$.peek()) {
            const currentState = state$.peek();
            try {
                setOpenErrorValue(null);
                setDocumentErrorValue(null);
                const path = await openDiffFolderDialog();
                if (path) {
                    const nextSource = normalizeDiffOpenSource(path);
                    if (nextSource) {
                        await loadSource(nextSource);
                    }
                }
            }
            catch (error) {
                const nextError = {
                    message: getErrorMessage(error),
                    source: currentState.source,
                    title: "Couldn't choose folder",
                };
                if (currentState.status === "loaded") {
                    setDocumentErrorValue(nextError);
                }
                else {
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
                const nextSource = await openDiffFilePairDialog();
                if (nextSource) {
                    await loadSource(nextSource);
                }
            }
            catch (error) {
                const nextError = {
                    message: getErrorMessage(error),
                    source: currentState.source,
                    title: "Couldn't choose files",
                };
                if (currentState.status === "loaded") {
                    setDocumentErrorValue(nextError);
                }
                else {
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
    const handleDropDiff = useCallback((nativeEvent: DropEvent) => {
      void (async () => {
        if (!loadingSource$.peek()) {
            const nextSource = await getDroppedDiffSource(nativeEvent);
            if (nextSource) {
                await loadSource(nextSource);
            }
            else {
                const nextError = {
                    message: getUnsupportedDropMessage(nativeEvent),
                    source: null,
                    title: "Unsupported drop",
                };
                if (state$.peek().status === "loaded") {
                    setDocumentErrorValue(nextError);
                }
                else {
                    setOpenErrorValue(nextError);
                }
            }
        }
      })().catch(console.error);
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
        const nextSource = repoPath ? createDiffCompareSource(repoPath, selection, compareRepoState$.peek()) : null;
        if (!nextSource || loadingSource$.peek()) {
            return false;
        }
        loadSource(nextSource).catch((error: unknown) => {
            setDocumentErrorValue(createRefreshError(nextSource, getErrorMessage(error)));
        });
        return true;
    }, [compareRepoState$, loadSource, loadingSource$, setDocumentErrorValue, state$]);
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
    }, [loadingSource$, state$, setCompareRefInput, setCompareRefPromptVisible]);
    const closeCompareRefPrompt = useCallback(() => {
        setCompareRefPromptVisible(false);
        setCompareRefInput("");
    }, [setCompareRefPromptVisible, setCompareRefInput]);
    const submitCompareRefPrompt = useCallback(() => {
        const ref = compareRefInput$.peek().trim();
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
    }, [closeCompareRefPrompt, compareRefInput$, loadSource, loadingSource$, setDocumentErrorValue, state$]);
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
        revealInFileManager(currentVisibleFolderPath)
            .catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
        return true;
    }, [state$]);
    const copyText = useCallback((text: string) => {
        runCommand({ target: { type: "command", name: "pbcopy" }, input: text })
            .then((result) => {
            if ((result.exit.type === "exited" ? result.exit.code : -1) !== 0) {
                console.error(decodeProcessText(result.stderr) || "Unable to copy to clipboard.");
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
    const focusSearchWithValue = useCallback((value: string) => {
        const currentState = state$.peek();
        const currentLoadingSource = loadingSource$.peek();
        const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
        const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
        if (!currentToolbarSource) {
            return false;
        }
        setSearchQuery(value);
        focusDiffSearchToolbarItem(windowIdentifier, value).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
        return true;
    }, [loadingSource$, state$, windowIdentifier, setSearchQuery]);
    const focusSearch = useCallback(() => {
        return focusSearchWithValue(searchQuery$.peek());
    }, [focusSearchWithValue, searchQuery$]);
    const focusFileSearch = useCallback(() => {
        return focusSearchWithValue("@");
    }, [focusSearchWithValue]);
    const toggleFileCollapsed = useCallback((fileIndex: number) => {
        setCollapsedFileIndexesValue((current) => {
            const next = new Set(current);
            const collapsed = !next.has(fileIndex);
            if (next.has(fileIndex)) {
                next.delete(fileIndex);
            }
            else {
                next.add(fileIndex);
            }
            if (renderViewMode !== "unified") {
                sideBySideDataSource?.setFileCollapsed(fileIndex, collapsed);
            }
            return next;
        });
    }, [renderViewMode, setCollapsedFileIndexesValue, sideBySideDataSource]);
    const listSyntaxTheme = syntaxTheme.name;
    const rowConfig = useMemo<DiffRowConfig>(() => ({
        borderColor: diffPalette.border,
        collapsedFileIndexes,
        fileHeaderBackgroundColor,
        fontFamily,
        fontSize,
        foregroundColor,
        mutedColor,
        showOnlyHunks,
        syntaxHighlightingEnabled,
        syntaxTheme: listSyntaxTheme,
    }), [
        collapsedFileIndexes,
        diffPalette.border,
        fileHeaderBackgroundColor,
        fontFamily,
        fontSize,
        foregroundColor,
        listSyntaxTheme,
        mutedColor,
        showOnlyHunks,
        syntaxHighlightingEnabled,
    ]);
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
            highlightChangedCharacters,
            mutedColor,
            palette.addAccent,
            palette.addBackground,
            palette.removeAccent,
            palette.removeBackground,
            rowHeight,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            listSyntaxTheme,
        ]);
        return {
            addAccentColor: palette.addAccent,
            addBackgroundColor: palette.addBackground,
            activeSearchHighlightColor: diffActiveSearchHighlightColor,
            activeSearchRowHighlightColor: diffActiveSearchRowHighlightColor,
            changeBarWidth: diffUnifiedChangeBarWidth,
            collapsedFileIndexes: "",
            configId,
            configVersion,
            dividerColor: "transparent",
            documentId: loadedDocumentId,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            lineNumberWidth: diffUnifiedLineNumberWidth,
            markerWidth: diffUnifiedMarkerWidth,
            mutedColor,
            presentation: "unified",
            projectionId: 0,
            removeAccentColor: palette.removeAccent,
            removeBackgroundColor: palette.removeBackground,
            rowHeight,
            searchHighlightColor: diffSearchHighlightColor,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            themeName: listSyntaxTheme,
        };
    }, [
        fontFamily,
        fontSize,
        foregroundColor,
        highlightChangedCharacters,
        listSyntaxTheme,
        loadedDocumentId,
        mutedColor,
        rowHeight,
        showWhitespaceCharacters,
        syntaxHighlightingEnabled,
        syntaxTheme.appearance,
    ]);
    const nativeSideBySideRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
        const palette = getDiffRowPalette(syntaxTheme.appearance);
        const dividerColor = getSideBySideDividerColor(syntaxTheme.appearance);
        const configId = `diff:${loadedDocumentId}:blocks`;
        const projectionId = sideBySideDataSource?.getProjectionId() ?? 0;
        const configVersion = hashDiffNativeRowConfigVersion([
            configId,
            projectionId,
            dividerColor,
            diffSideBySideLineNumberWidth,
            diffSideBySideMarkerWidth,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            mutedColor,
            palette.addAccent,
            palette.addBackground,
            palette.removeAccent,
            palette.removeBackground,
            rowHeight,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            listSyntaxTheme,
        ]);
        return {
            addAccentColor: palette.addAccent,
            addBackgroundColor: palette.addBackground,
            activeSearchHighlightColor: diffActiveSearchHighlightColor,
            activeSearchRowHighlightColor: diffActiveSearchRowHighlightColor,
            changeBarWidth: 0,
            collapsedFileIndexes: "",
            configId,
            configVersion,
            dividerColor,
            documentId: loadedDocumentId,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            lineNumberWidth: diffSideBySideLineNumberWidth,
            markerWidth: diffSideBySideMarkerWidth,
            mutedColor,
            presentation: "blocks",
            projectionId,
            removeAccentColor: palette.removeAccent,
            removeBackgroundColor: palette.removeBackground,
            rowHeight,
            searchHighlightColor: diffSearchHighlightColor,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            themeName: listSyntaxTheme,
        };
    }, [
        fontFamily,
        fontSize,
        foregroundColor,
        highlightChangedCharacters,
        listSyntaxTheme,
        loadedDocumentId,
        mutedColor,
        rowHeight,
        sideBySideDataSource,
        showWhitespaceCharacters,
        syntaxHighlightingEnabled,
        syntaxTheme.appearance,
    ]);
    const rowRenderInitialState = useMemo(() => createDiffRowRenderState(state$, collapsedFileIndexes$), [collapsedFileIndexes$, state$]);
    const rowRender$ = useObservable(rowRenderInitialState) as unknown as Observable<DiffRowRenderState>;
    const hunkListIndexes = useMemo(() => {
        let indexes: number[] = [];
        if (loadedDocument) {
            if (viewMode === "unified") {
                indexes = [...unifiedHunkRowIndexSet]
                    .map((rowIndex) => getVisibleListIndex(rowIndex))
                    .filter((index): index is number => index !== undefined);
            }
            else {
                indexes = [...sideBySideHunkHeaderIndexes].sort((left, right) => left - right);
            }
        }
        return indexes;
    }, [getVisibleListIndex, loadedDocument, sideBySideHunkHeaderIndexes, unifiedHunkRowIndexSet, viewMode]);
    const navigateToHunk = useCallback((direction: -1 | 1) => {
        const list = listRef.current;
        const listState = list?.getState();
        const currentPosition = listState
            ? listState.scroll + (documentError ? diffTitlebarTopInset : 0)
            : 0;
        const targetIndex = getAdjacentDiffHunkIndex(hunkListIndexes, currentPosition, direction, listState?.positionAtIndex);
        let didNavigate = false;
        if (list && targetIndex !== null) {
            list.scrollToIndex({
                animated: true,
                index: targetIndex,
                viewOffset: diffTitlebarTopInset,
                viewPosition: 0,
            }).catch((error: unknown) => {
                console.error(error instanceof Error ? error.message : String(error));
            });
            didNavigate = true;
        }
        return didNavigate;
    }, [documentError, hunkListIndexes]);
    const navigateToNextHunk = useCallback(() => navigateToHunk(1), [navigateToHunk]);
    const navigateToPreviousHunk = useCallback(() => navigateToHunk(-1), [navigateToHunk]);
    const scrollToFile = useCallback((file: DiffFileSummary) => {
        const rowStart = Math.max(0, Math.floor(file.rowStart));
        const sourceListIndex = viewMode === "unified"
            ? getVisibleListIndex(rowStart)
            : sideBySideListIndexByRowIndex.get(rowStart);
        const listIndex = inlineListIndexByFileIndexRef.current.get(file.index) ?? sourceListIndex;
        if (listIndex !== undefined) {
            listRef.current?.scrollToIndex({
                animated: false,
                index: listIndex,
                viewOffset: diffTitlebarTopInset,
                viewPosition: 0,
            }).catch((error: unknown) => {
                console.error(error instanceof Error ? error.message : String(error));
            });
        }
    }, [getVisibleListIndex, sideBySideListIndexByRowIndex, viewMode]);
    const handleInlineListIndexesChanged = useCallback((indexes: ReadonlyMap<number, number>) => {
        inlineListIndexByFileIndexRef.current = indexes;
    }, []);
    const scrollToSearchListIndex = useCallback((listIndex: number) => {
        listRef.current?.scrollToIndex({
            animated: true,
            index: listIndex,
            viewOffset: diffTitlebarTopInset,
            viewPosition: 0.5,
        }).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
    }, []);
    const getSearchResultListIndex = useCallback((result: DiffSearchResult) => {
        if (viewMode === "unified") {
            return getVisibleListIndex(result.rowIndex);
        }
        if (!loadedDocument) {
            return undefined;
        }
        const collapsedIndexes = [...collapsedFileIndexList];
        const startIndex = sideBySideListIndexByRowIndex.get(result.rowIndex) ?? 0;
        for (let listIndex = startIndex; listIndex < sideBySideRowCount; listIndex += 1) {
            const row = loadedDocument.getPlainSideBySideRow(listIndex, collapsedIndexes);
            if (row.kind === "file-header") {
                if (row.sourceStart > result.rowIndex) {
                    break;
                }
            }
            else if (row.sourceStart <= result.rowIndex && result.rowIndex < row.sourceEnd) {
                return listIndex;
            }
        }
        return undefined;
    }, [
        collapsedFileIndexList,
        getVisibleListIndex,
        loadedDocument,
        sideBySideListIndexByRowIndex,
        sideBySideRowCount,
        viewMode,
    ]);
    const scrollToSearchResult = useCallback((result: DiffSearchResult) => {
        const currentState = state$.peek();
        if (currentState.status !== "loaded") {
            return;
        }
        const file = currentState.files.find((candidate) => candidate.index === result.fileIndex);
        if (!file) {
            return;
        }
        activeFileIndex$.set(result.fileIndex);
        if (result.kind === "file") {
            scrollToFile(file);
            return;
        }
        setCollapsedFileIndexesValue((currentIndexes) => {
            if (!currentIndexes.has(result.fileIndex)) {
                return currentIndexes;
            }
            const nextIndexes = new Set(currentIndexes);
            nextIndexes.delete(result.fileIndex);
            return nextIndexes;
        });
        const listIndex = getSearchResultListIndex(result);
        if (listIndex !== undefined) {
            scrollToSearchListIndex(listIndex);
        }
    }, [
        activeFileIndex$,
        getSearchResultListIndex,
        scrollToFile,
        scrollToSearchListIndex,
        setCollapsedFileIndexesValue,
        state$,
    ]);
    const activateSearchResult = useCallback((index: number, results: readonly DiffSearchResult[] = searchResults$.peek()) => {
        const resultCount = results.length;
        if (resultCount === 0) {
            return false;
        }
        const nextIndex = ((index % resultCount) + resultCount) % resultCount;
        setActiveSearchResultIndex(nextIndex);
        const result = results[nextIndex];
        if (result) {
            scrollToSearchResult(result);
        }
        return true;
    }, [scrollToSearchResult, searchResults$, setActiveSearchResultIndex]);
    const advanceSearchResult = useCallback((delta: number) => {
        return activateSearchResult(Math.min(activeSearchResultIndex$.peek(), Math.max(0, searchResults$.peek().length - 1)) + delta);
    }, [activateSearchResult, activeSearchResultIndex$, searchResults$]);
    const handleSearchChange = useCallback((value: string) => {
        if (value !== searchQuery$.peek()) {
            lastSubmittedSearchQueryRef.current = "";
        }
        setSearchQuery(value);
    }, [searchQuery$, setSearchQuery]);
    const handleSearchSubmit = useCallback((value: string, direction: 1 | -1) => {
        const existingQuery = value === lastSubmittedSearchQueryRef.current;
        lastSubmittedSearchQueryRef.current = value;
        setSearchQuery(value);
        const results = searchResults$.peek();
        const nextIndex = getDiffSearchSubmitIndex({
            activeIndex: Math.min(activeSearchResultIndex$.peek(), Math.max(0, searchResults$.peek().length - 1)),
            direction,
            repeatedQuery: existingQuery,
            resultCount: results.length,
        });
        return activateSearchResult(nextIndex, results);
    }, [activateSearchResult, setSearchQuery, searchResults$, activeSearchResultIndex$]);
    useRoutedHotkeys({
        router: diffHotkeyRouter, definitions: fileJumpDefinitions, scope: { kind: "window", windowId: windowIdentifier },
        enabled: Boolean(loadingSource || (state.status === "loaded" && state.files.length)),
        handlers: { fileJump: focusFileSearch }, onError: console.error,
    });
    const hasSearchResults = useValue(() => searchResults$.get().length > 0);
    useRoutedHotkeys({
        router: diffHotkeyRouter, definitions: searchNavigationDefinitions, scope: { kind: "window", windowId: windowIdentifier },
        enabled: hasSearchResults, handlers: { previousSearch: () => advanceSearchResult(-1), nextSearch: () => advanceSearchResult(1) }, onError: console.error,
    });
    const handleSidebarFilePress = useCallback((file: DiffFileSummary) => {
        activeFileIndex$.set(file.index);
        scrollToFile(file);
    }, [activeFileIndex$, scrollToFile]);
    const toggleSidebarFolder = useCallback((title: string) => {
        setCollapsedSidebarFolders((currentFolders) => {
            const nextFolders = new Set(currentFolders);
            if (nextFolders.has(title)) {
                nextFolders.delete(title);
            }
            else {
                nextFolders.add(title);
            }
            return nextFolders;
        });
    }, [setCollapsedSidebarFolders]);
    const sidebarRenderInitialState = useMemo(createDiffSidebarRenderState, []);
    const sidebarRender$ = useObservable(sidebarRenderInitialState) as unknown as Observable<DiffSidebarRenderState>;
    const renderSidebarEntry = useCallback(({ item }: LegendListRenderItemProps<DiffSidebarEntry>) => {
        let row: ReactElement;
        if (item.type === "folder") {
            row = (<DiffSidebarFolderRow collapsed={item.collapsed} onToggleFolder={toggleSidebarFolder} sidebarRender$={sidebarRender$} title={item.title}/>);
        }
        else {
            const file = item.file;
            row = (<DiffSidebarFileRow activeFileIndex$={activeFileIndex$} file={file} mergeState$={mergeState$} onPressFile={handleSidebarFilePress} sidebarRender$={sidebarRender$}/>);
        }
        return row;
    }, [activeFileIndex$, handleSidebarFilePress, mergeState$, sidebarRender$, toggleSidebarFolder]);
    const handleSplitViewResize = useCallback((event: SidebarSplitViewResizeEvent) => {
        const nextMetrics = {
            contentHeight: Math.round(event.contentHeight || event.height),
            contentWidth: Math.round(event.contentWidth),
            contentX: Math.round(event.contentX),
            sidebarHeight: Math.round(event.sidebarHeight || event.height),
            sidebarWidth: Math.round(event.sidebarWidth),
        };
        const previousDiffPaneHeight = diffPaneHeight$.peek();
        setSplitPaneMetricsValue(nextMetrics);
        const isSidebarCollapsed = sidebarCollapsed$.peek();
        const shouldSaveSidebarWidth = nextMetrics.sidebarWidth >= defaultDiffSidebarWidth &&
            !isSidebarCollapsed &&
            (nextMetrics.sidebarWidth >= sidebarWidth || nextMetrics.contentWidth > diffContentMinWidth);
        if (shouldSaveSidebarWidth) {
            setDiffSidebarWidthSetting(nextMetrics.sidebarWidth);
        }
        if (nextMetrics.contentHeight > 0 && previousDiffPaneHeight !== nextMetrics.contentHeight) {
            setDiffPaneHeightValue(nextMetrics.contentHeight);
        }
    }, [
        diffPaneHeight$,
        setDiffPaneHeightValue,
        setSplitPaneMetricsValue,
        sidebarCollapsed$,
        sidebarWidth,
        splitPaneMetrics$,
    ]);
    const handleDiffPaneLayout = useCallback((event: LayoutChangeEvent) => {
        const nextHeight = Math.round(event.nativeEvent.layout.height);
        const previousHeight = diffPaneHeight$.peek();
        if (nextHeight > 0 || previousHeight === 0) {
            setDiffPaneHeightValue(nextHeight);
        }
    }, [diffPaneHeight$, setDiffPaneHeightValue]);
    const handleSidebarListLayout = useCallback((event: LayoutChangeEvent) => {
        const currentState = state$.peek();
    }, [state$]);
    const getItemType = useCallback((index: number) => (fileHeaderRowIndexes.has(index) ? "file-header" : "diff-line"), [fileHeaderRowIndexes]);
    const getItemSize = useCallback((index: number) => {
        if (getItemType(index) === "file-header") {
            return diffFileHeaderRowHeight;
        }
        if (!showOnlyHunks) {
            return rowHeight;
        }
        return rowHeight + (unifiedHunkRowIndexSet.has(index) ? diffHunkHeaderHeight : 0);
    }, [getItemType, rowHeight, showOnlyHunks, unifiedHunkRowIndexSet]);
    const renderRow = useCallback(({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => {
        return (<DiffUnifiedRow adaptiveRender={adaptiveRender} collapsedFileIndexes$={collapsedFileIndexes$} hasHunkHeader={showOnlyHunks && unifiedHunkRowIndexSet.has(index)} index={index} isFileHeader={getItemType(index) === "file-header"} nativeConfigId={nativeUnifiedRowConfig.configId} nativeRowHeight={rowHeight} onToggleFileCollapsed={toggleFileCollapsed} rowRender$={rowRender$} row={row}/>);
    }, [collapsedFileIndexes$, getItemType, nativeUnifiedRowConfig.configId, rowHeight, rowRender$, showOnlyHunks, toggleFileCollapsed, unifiedHunkRowIndexSet]);
    const getSideBySideItemType = useCallback((index: number) => {
        return sideBySideDataSource?.getItemMetadata(index).kind === "file-header"
            ? "file-header"
            : "side-by-side-line";
    }, [sideBySideDataSource]);
    const getSideBySideItemSize = useCallback((index: number) => {
        const item = sideBySideDataSource?.getItemMetadata(index);
        if (item?.kind === "file-header") {
            return diffFileHeaderRowHeight;
        }
        return rowHeight + (showOnlyHunks && item?.hunkStart ? diffHunkHeaderHeight : 0);
    }, [rowHeight, showOnlyHunks, sideBySideDataSource]);
    const renderSideBySideRow = useCallback(({ adaptiveRender, index, row }: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => {
        const itemMetadata = sideBySideDataSource?.getItemMetadata(index);
        const sourceListIndex = sideBySideDataSource?.getItemLocation(index).listIndex ?? index;
        return (<DiffSideBySideRow adaptiveRender={adaptiveRender} collapsedFileIndexes$={collapsedFileIndexes$} index={index} itemMetadata={itemMetadata} listIndex={sourceListIndex} nativeConfigId={nativeSideBySideRowConfig.configId} nativeRowHeight={rowHeight} onToggleFileCollapsed={toggleFileCollapsed} rowRender$={rowRender$} row={row}/>);
    }, [collapsedFileIndexes$, nativeSideBySideRowConfig.configId, rowHeight, rowRender$, sideBySideDataSource, toggleFileCollapsed]);
    const documentErrorHeight = documentError
        ? documentError.kind === "permission"
            ? diffDocumentPermissionErrorHeight
            : diffDocumentErrorHeight
        : 0;
    const diffTopChromeContentHeight = documentErrorHeight;
    const diffTopChromeHeight = diffTopChromeContentHeight > 0 ? diffTitlebarTopInset + diffTopChromeContentHeight : 0;
    const activeItemCount = renderViewMode === "unified"
        ? visibleItemIndexes.length
        : sideBySideRowCount;
    const documentErrorBody = (<DiffDocumentErrorBody borderColor={diffPalette.border} documentError={documentError} foregroundColor={foregroundColor} mutedColor={mutedColor} onDismiss={dismissDocumentError} onOpenExternalUrl={openExternalErrorUrl} onOpenSystemSettings={openPermissionSettings} onRetry={reloadCurrentSource} surfaceColor={diffPalette.surface}/>);
    const unsavedMergeDraftBanner = hasUnsavedMergeDrafts ? (<DiffUnsavedMergeDraftBannerWithSavingState dangerColor={diffPalette.danger} fileCount={unsavedMergeDraftFiles.length} onDiscard={discardMergeDraftsFromCommand} onSave={saveMergeDraftsFromCommand} primaryColor={diffPalette.primary} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}/>) : null;
    const startScreenOpenErrorBody = startScreenController.openError ? (<DiffErrorPanel borderColor={diffPalette.border} chooseFolderLabel={startScreenController.openError.kind === "permission" ? "Choose Another Folder" : undefined} error={startScreenController.openError} foregroundColor={foregroundColor} mutedColor={mutedColor} onChooseFolder={openFolder} onDismiss={startScreenController.dismissOpenError} onOpenExternalUrl={openExternalErrorUrl} onOpenSystemSettings={startScreenController.openError.kind === "permission" ? openPermissionSettings : undefined} onRetry={startScreenController.openError.kind !== "permission" && startScreenController.openError.source ? startScreenController.retryOpenError : undefined} surfaceColor={diffPalette.surface}/>) : null;
    const initialLoadingSource = startScreenController.openError ? null : source ?? null;
    const emptyLoadingSource = state.status === "empty" ? loadingSource ?? initialLoadingSource : null;
    const restoreWindowsOnStartup = useDiffRestoreWindowsOnStartupSetting();
    const hasSplitBody = state.status === "loaded" || (state.status !== "fatal" && emptyLoadingSource !== null);
    useEffect(() => {
        // Match the actual body, including fatal and welcome screens which never
        // emit a split-view mount event. Save chrome for native window restoration.
        setDiffViewerStartupSplitView(windowIdentifier, hasSplitBody ? createDiffStartupSplitView({
            appearance: syntaxTheme.appearance,
            backgroundColor,
            sidebarBackgroundColor: diffPalette.sidebarBackground,
            sidebarWidth,

        }) : null).catch((error: unknown) => console.error("Failed to update Diff startup chrome:", error));
    }, [
        backgroundColor,
        diffPalette.sidebarBackground,
        hasSplitBody,
        restoreWindowsOnStartup,
        sidebarWidth,
        syntaxTheme.appearance,
        windowIdentifier,
    ]);
    let body: ReactNode;
    if (state.status === "fatal") {
        body = (<DiffFatalBody borderColor={diffPalette.border} error={state.error} foregroundColor={foregroundColor} mutedColor={mutedColor} onChooseFolder={openFolder} surfaceColor={diffPalette.surface}/>);
    }
    else if (state.status === "loaded") {
        body = (<DiffSplitBody backgroundColor={backgroundColor} content={(<DiffLoadedContentPane activeFileIndex$={activeFileIndex$} activeItemCount={activeItemCount} adaptiveLightModeEnabled={adaptiveLightModeEnabled} diffPaneHeight$={diffPaneHeight$} diffTopChromeHeight={diffTopChromeHeight} diffRows={diffRows} documentErrorBody={documentErrorBody} floatingDocumentBanner={unsavedMergeDraftBanner} getItemSize={getItemSize} getItemType={getItemType} getRow={getRow} getSideBySideItemSize={getSideBySideItemSize} getSideBySideItemType={getSideBySideItemType} getSideBySideRow={getSideBySideRow} handleDiffPaneLayout={handleDiffPaneLayout} handleSideBySideTopItemChanged={handleSideBySideTopItemChanged} handleSideBySideVisibleRowsRequested={handleLimitedSideBySideVisibleRowsRequested} handleTopItemChanged={handleTopItemChanged} handleVisibleRowsRequested={handleVisibleRowsRequested} rowConfig={rowConfig} listRef={listRef} mergeState={mergeState} mergeState$={mergeState$} nativeSideBySideRowConfig={nativeSideBySideRowConfig} nativeUnifiedRowConfig={nativeUnifiedRowConfig} noChangesBody={(<DiffNoChangesBody foregroundColor={foregroundColor} mutedColor={mutedColor} visibleSourceLabel={visibleSourceLabel}/>)} onInlineListIndexesChanged={handleInlineListIndexesChanged} renderRow={renderRow} renderSideBySideRow={renderSideBySideRow} requestSideBySideRange={requestSideBySideRange} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$} onResolveMergeConflict={resolveMergeConflict} rowHeight={rowHeight} sideBySideFileHeaderByListIndex={sideBySideFileHeaderByListIndex} sideBySideDataSource={sideBySideDataSource} splitPaneMetrics$={splitPaneMetrics$} state={state} syntaxTokenizationState$={syntaxTokenizationState$} viewMode={renderViewMode} visibleItemIndexes={visibleItemIndexes}/>)} debugPayload={{
                activeItemCount,
                rows: state.document.rowCount,
                viewMode: renderViewMode,
            }} handleSplitViewResize={handleSplitViewResize} sidebar={(<DiffLoadedSidebarPane backgroundColor={diffPalette.sidebarBackground} collapsedSidebarFolders$={collapsedSidebarFolders$} handleSidebarListLayout={handleSidebarListLayout} mutedColor={mutedColor} renderSidebarEntry={renderSidebarEntry} sidebarCollapsed={sidebarCollapsed} splitPaneMetrics$={splitPaneMetrics$} state={state}/>)} sidebarBackgroundColor={diffPalette.sidebarBackground} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} splitPaneMetrics$={splitPaneMetrics$} syntaxAppearance={syntaxTheme.appearance}/>);
    }
    else if (emptyLoadingSource) {
        body = (<DiffSplitBody backgroundColor={backgroundColor} content={(<View style={styles.diffPane}>
            <View style={styles.diffPaneContent}>
              <View style={styles.diffTitlebarSpacer}/>
              <DiffDownloadingBody foregroundColor={foregroundColor} mutedColor={mutedColor} source={emptyLoadingSource}/>
            </View>
          </View>)} debugPayload={{
                loadingSource: emptyLoadingSource,
                viewMode: renderViewMode,
            }} handleSplitViewResize={handleSplitViewResize} sidebar={(<View style={[styles.sidebar, { backgroundColor: Platform.OS === "macos" ? "transparent" : diffPalette.sidebarBackground }]}>
            <View style={styles.sidebarList}/>
          </View>)} sidebarBackgroundColor={diffPalette.sidebarBackground} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} splitPaneMetrics$={splitPaneMetrics$} syntaxAppearance={syntaxTheme.appearance}/>);
    }
    else {
        body = (<DiffStartScreen backgroundColor={backgroundColor} borderColor={diffPalette.border} dangerColor={diffPalette.danger} foregroundColor={foregroundColor} isLoading={isLoading} loadingSource={loadingSource} mutedColor={mutedColor} onChangeUrlInput={startScreenController.onChangeUrlInput} onChooseFolder={openFolder} onCompareFiles={compareFiles} onOpenRecentSource={startScreenController.onOpenRecentSource} onOpenUrl={startScreenController.onOpenUrl} openErrorBody={startScreenOpenErrorBody} recentFilter={startScreenController.recentFilter} recentSources={startScreenController.recentSources} setRecentFilter={startScreenController.setRecentFilter} sidebarBackgroundColor={diffPalette.sidebarBackground} urlInput={startScreenController.urlInput} urlInputError={startScreenController.urlInputError} urlInputRef={urlInputRef} onUrlInputFocusChange={setUrlInputFocused}/>);
    }
    return (<>
      <DiffWindowChromeController hasUnsavedMergeDrafts={hasUnsavedMergeDrafts}/>
      <DiffNativeMenuSavingStateController hasUnsavedMergeDrafts={hasUnsavedMergeDrafts} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}/>
      <DiffWindowToolbarItemController compareCurrentSource={compareCurrentSource} onSearchChange={handleSearchChange} onSearchSubmit={handleSearchSubmit} openCompareRefPrompt={openCompareRefPrompt} toggleSidebar={toggleSidebar}/>
      <DiffLaunchController focusUrlInputRequestId={focusUrlInputRequestId} folderPath={folderPath} loadRequestIdRef={loadRequestIdRef} loadSource={loadSource} loadTraceRef={loadTraceRef} source={source} urlInputRef={urlInputRef}/>
      <DiffLoadCompletionController loadTraceRef={loadTraceRef} loggedTraceDocumentRef={loggedTraceDocumentRef}/>
      <DiffFileWatcherController loadSource={loadSource} suppressReloadUntilRef={suppressFileWatcherReloadUntilRef}/>
      <DiffActionHandlersController copyCurrentFilePath={copyCurrentFilePath} copyCurrentRelativePath={copyCurrentRelativePath} copyCurrentSource={copyCurrentSource} focusSearch={focusSearch} navigateToNextHunk={navigateToNextHunk} navigateToPreviousHunk={navigateToPreviousHunk} reloadCurrentSource={reloadCurrentSource} revealCurrentFolder={revealCurrentFolder} saveMergeDrafts={saveMergeDraftsFromCommand} toggleShowOnlyHunks={toggleShowOnlyHunks} toggleSidebar={toggleSidebar}/>
      <DiffDropSurface backgroundColor={backgroundColor} borderColor={diffPalette.primary} foregroundColor={foregroundColor} mutedColor={mutedColor} onDropDiff={handleDropDiff} syntaxAppearance={syntaxTheme.appearance}>
        {body}
        <DiffStatisticsPanel borderColor={diffPalette.border} foregroundColor={foregroundColor} mutedColor={mutedColor} syntaxAppearance={syntaxTheme.appearance}/>
        <DiffSearchStatusPanel borderColor={diffPalette.border} foregroundColor={foregroundColor} mutedColor={mutedColor} syntaxAppearance={syntaxTheme.appearance}/>
        <DiffCompareRefPrompt backgroundColor={diffPalette.surface} borderColor={diffPalette.border} foregroundColor={foregroundColor} mutedColor={mutedColor} onCancel={closeCompareRefPrompt} onSubmit={submitCompareRefPrompt}/>
      </DiffDropSurface>
    </>);
}

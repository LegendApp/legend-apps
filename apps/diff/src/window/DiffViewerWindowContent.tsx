import { type DiffDocument, type DiffFileSummary, type DiffLoadSession, type DiffRenderRow, type DiffSideBySideRenderRow } from "@legend-apps/diff-parser";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { nowMs } from "@legend-apps/source-viewer";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { type VirtualizedFixedDocumentListRef, type VirtualizedFixedDocumentListRenderRowProps } from "@legend-apps/virtualized-document";
import { type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { type DropEvent } from "@legendapp/spark/drag-drop";
import { runCommand } from "@legendapp/spark/processes";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { type SidebarSplitViewResizeEvent } from "@legendapp/spark/ui/split-view";
import { useWindowId } from "@legendapp/spark/windows";
import { type Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Linking, Platform, TextInput, View } from "react-native";
import { type UnsavedDiffMergeDraftReason } from "../confirmUnsavedDiffMergeDrafts";
import { loadDiffCompareRepoState } from "../diffCompareTargets";
import { getDroppedDiffSource, getUnsupportedDropMessage } from "../diffDrop";
import { isDiffGitSource, normalizeDiffOpenSource, openDiffFilePairDialog, openDiffFolderDialog } from "../diffFiles";
import { diffHotkeyRouter } from "../diffHotkeys";
import { createReadyMergeState, writeDiffMergeFileContent } from "../diffMerge";
import { diffMergeSaveConflictKey } from "../diffMergeControls";
import { getDiffPalette } from "../diffPalette";
import { defaultDiffSidebarWidth, setDiffSidebarWidthSetting, useDiffAdaptiveLightModeEnabledSetting, useDiffFontFamilySetting, useDiffFontSizeSetting, useDiffHighlightChangedCharactersSetting, useDiffIgnoreWhitespaceChangesSetting, useDiffRestoreWindowsOnStartupSetting, useDiffShowOnlyHunksSetting, useDiffShowWhitespaceCharactersSetting, useDiffSidebarWidthSetting, useDiffSyntaxHighlightingEnabledSetting, useDiffSyntaxTheme, useDiffViewModeSetting } from "../diffSettings";
import { createDiffStartupSplitView, diffContentMinWidth, setDiffViewerStartupSplitView } from "../diffWindowControls";
import { DiffStartScreen } from "../start-screen/DiffStartScreen";
import { useDiffStartScreenController } from "../start-screen/useDiffStartScreenController";
import { diffHunkHeaderHeight, DiffSideBySideRow, DiffUnifiedRow } from "../viewer/DiffRows";
import { diffDocumentErrorHeight, diffDocumentPermissionErrorHeight, diffFileHeaderRowHeight, diffTitlebarTopInset } from "../viewer/diffViewerConstants";
import { DiffActionHandlersController, DiffLaunchController, DiffLoadCompletionController, DiffWindowChromeController, DiffWindowToolbarItemController } from "../viewer/diffViewerControllers";
import { type DiffLoadTrace, useDiffViewerModel } from "../viewer/diffViewerModel";
import { createRefreshError, getDiffVisibleSourceModel, getErrorMessage, sourcesMatch } from "../viewer/diffViewerSupport";
import { clearDiffMergeDraftFlag, getUnsavedDiffMergeDraftFiles, useDiffMergeDrafts } from "./diffMergeDrafts";
import { DiffLoadedContentPane, DiffLoadedSidebarPane, DiffSidebarFileRow, DiffSidebarFolderRow, DiffSplitBody } from "./DiffViewerPane";
import { DiffCompareRefPrompt, DiffRepoStateBanner, DiffDocumentErrorBody, DiffDownloadingBody, DiffDropSurface, DiffErrorPanel, DiffFatalBody, DiffNativeMenuSavingStateController, DiffNoChangesBody, DiffSearchStatusPanel, DiffStatisticsPanel, DiffUnsavedMergeDraftBannerWithSavingState } from "./DiffWindowChrome";
import { createDiffSidebarRenderState, emptyDiffListIndexByFileIndex, getDiffLineRowHeight } from "./diffWindowRendering";
import { styles } from "./diffWindowStyles";
import { type DiffRefreshViewState, type DiffLoadedCacheEntry, type DiffMergeDraftFile, type DiffMergeFileResolveQueue, type DiffSidebarEntry, type DiffSidebarRenderState, type DiffViewerWindowProps } from "./diffWindowTypes";
import { useDiffRowPresentation } from "./useDiffRowPresentation";
import { clearLoadedCache, deleteLoadedCacheEntriesWithPrefix, disposeDiffDocument, getDiffSourceCacheKey, useDiffSourceLoader } from "./useDiffSourceLoader";
import { useDiffViewerNavigation } from "./useDiffViewerNavigation";
import { useDiffViewerRuntime } from "./useDiffViewerRuntime";
import { DiffRepositoryController } from "./DiffRepositoryController";
import { useDiffWindowActions } from "./useDiffWindowActions";

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
    const [repoStateBanner, setRepoStateBanner] = useState<string | null>(null);
    const loadRequestIdRef = useRef(0);
    const loadTraceRef = useRef<DiffLoadTrace | null>(null);
    const loadedCacheRef = useRef(new Map<string, DiffLoadedCacheEntry>());
    const activeProgressiveSessionRef = useRef<DiffLoadSession | null>(null);
    const loggedTraceDocumentRef = useRef<DiffDocument | null>(null);
    const preserveViewStateRef = useRef<DiffRefreshViewState | null>(null);
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
        : toolbarSource && isDiffGitSource(toolbarSource)
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
    const { loadedDocument, loadedDocumentId, unifiedHunkRowIndexSet, collapsedFileIndexList, diffRows, fileHeaderRowIndexes, getRow, getVisibleListIndex, sideBySideFileHeaderByListIndex, sideBySideHunkHeaderIndexes, sideBySideDataSource, sideBySideListIndexByRowIndex, sideBySideRowCount, visibleItemIndexes, getSideBySideRow, handleSideBySideTopItemChanged, requestSideBySideRange, handleVisibleRowsRequested, handleLimitedSideBySideVisibleRowsRequested, handleTopItemChanged } = useDiffViewerRuntime({
        state,
        setCollapsedSidebarFolders,
        collapsedFileIndexes,
        fontFamily,
        fontSize,
        nativeUnifiedRows,
        rowHeight,
        renderViewMode,
        syntaxHighlightingEnabled,
        loadedCacheRef,
        state$,
        activeFileIndex$,
        diffPaneHeight$,
        nativeSideBySideRows,
        syntaxTokenizationState$,
        preserveViewStateRef,
        listRef,
        setCollapsedFileIndexesValue,
    });
    const loadSource = useDiffSourceLoader({
        state$,
        mergeDraftsRef,
        mergeResolveQueuesRef,
        sourceTransitionInFlightRef,
        prepareMergeDraftsForTransitionRef,
        loadRequestIdRef,
        activeProgressiveSessionRef,
        windowIdentifier,
        nativeDiffRows,
        mergeDraftsSourceKeyRef,
        loadedCacheRef,
        loadTraceRef,
        setLoadProgressValue,
        setLoadingSourceValue,
        setLoadStatisticsValue,
        setDocumentErrorValue,
        setOpenErrorValue,
        setViewerState,
        setMergeStateValue,
        preserveViewStateRef,
        listRef,
        activeFileIndex$,
        collapsedFileIndexes$,
    });
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
    const { resolveMergeConflict, discardMergeDraftsFromCommand } = useDiffMergeDrafts({
        mergeDraftsRef,
        mergeState$,
        state$,
        resolvingMergeConflictKeys$,
        savingMergeDraftsRef,
        setResolvingMergeConflictKeyActive,
        setDocumentErrorValue,
        mergeResolveQueuesRef,
        mergeDraftsSourceKeyRef,
        setMergeStateValue,
        waitForMergeResolveQueues,
        hasUnsavedMergeDrafts,
        saveMergeDrafts,
        prepareMergeDraftsForTransitionRef,
        windowIdentifier,
    });
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
    const { reloadCurrentSource, compareCurrentSource, openCompareRefPrompt, closeCompareRefPrompt, submitCompareRefPrompt, toggleShowOnlyHunks, revealCurrentFolder, copyCurrentSource, copyCurrentFilePath, copyCurrentRelativePath, toggleSidebar, focusSearch, focusFileSearch } = useDiffWindowActions({
        state$,
        loadSource,
        setDocumentErrorValue,
        loadingSource$,
        compareRepoState$,
        setCompareRefInput,
        setCompareRefPromptVisible,
        compareRefInput$,
        activeFileIndex$,
        setSidebarCollapsedValue,
        setSearchQuery,
        windowIdentifier,
        searchQuery$,
    });
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
    const { rowConfig, nativeUnifiedRowConfig, nativeSideBySideRowConfig, rowRender$ } = useDiffRowPresentation({
        syntaxTheme,
        diffPalette,
        collapsedFileIndexes,
        fileHeaderBackgroundColor,
        fontFamily,
        fontSize,
        foregroundColor,
        mutedColor,
        showOnlyHunks,
        syntaxHighlightingEnabled,
        loadedDocumentId,
        highlightChangedCharacters,
        rowHeight,
        showWhitespaceCharacters,
        sideBySideDataSource,
        state$,
        collapsedFileIndexes$,
    });
    const { navigateToNextHunk, navigateToPreviousHunk, scrollToFile, handleInlineListIndexesChanged, handleSearchChange, handleSearchSubmit, advanceSearchResult } = useDiffViewerNavigation({
        loadedDocument,
        viewMode,
        unifiedHunkRowIndexSet,
        getVisibleListIndex,
        sideBySideHunkHeaderIndexes,
        listRef,
        documentError,
        sideBySideListIndexByRowIndex,
        inlineListIndexByFileIndexRef,
        collapsedFileIndexList,
        sideBySideRowCount,
        state$,
        activeFileIndex$,
        setCollapsedFileIndexesValue,
        searchResults$,
        setActiveSearchResultIndex,
        activeSearchResultIndex$,
        searchQuery$,
        lastSubmittedSearchQueryRef,
        setSearchQuery,
    });
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
    const diffTopChromeContentHeight = documentErrorHeight + (repoStateBanner ? 28 : 0);
    const diffTopChromeHeight = diffTopChromeContentHeight > 0 ? diffTitlebarTopInset + diffTopChromeContentHeight : 0;
    const activeItemCount = renderViewMode === "unified"
        ? visibleItemIndexes.length
        : sideBySideRowCount;
    const documentErrorBody = (<><DiffRepoStateBanner text={repoStateBanner} borderColor={diffPalette.border} foregroundColor={foregroundColor} surfaceColor={diffPalette.surface}/><DiffDocumentErrorBody borderColor={diffPalette.border} documentError={documentError} foregroundColor={foregroundColor} mutedColor={mutedColor} onDismiss={dismissDocumentError} onOpenExternalUrl={openExternalErrorUrl} onOpenSystemSettings={openPermissionSettings} onRetry={reloadCurrentSource} surfaceColor={diffPalette.surface}/></>);
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
        body = (<DiffSplitBody backgroundColor={backgroundColor} content={(<DiffLoadedContentPane key={state.document.documentId} activeFileIndex$={activeFileIndex$} activeItemCount={activeItemCount} adaptiveLightModeEnabled={adaptiveLightModeEnabled} diffPaneHeight$={diffPaneHeight$} diffTopChromeHeight={diffTopChromeHeight} diffRows={diffRows} documentErrorBody={documentErrorBody} floatingDocumentBanner={unsavedMergeDraftBanner} getItemSize={getItemSize} getItemType={getItemType} getRow={getRow} getSideBySideItemSize={getSideBySideItemSize} getSideBySideItemType={getSideBySideItemType} getSideBySideRow={getSideBySideRow} handleDiffPaneLayout={handleDiffPaneLayout} handleSideBySideTopItemChanged={handleSideBySideTopItemChanged} handleSideBySideVisibleRowsRequested={handleLimitedSideBySideVisibleRowsRequested} handleTopItemChanged={handleTopItemChanged} handleVisibleRowsRequested={handleVisibleRowsRequested} rowConfig={rowConfig} listRef={listRef} mergeState={mergeState} mergeState$={mergeState$} nativeSideBySideRowConfig={nativeSideBySideRowConfig} nativeUnifiedRowConfig={nativeUnifiedRowConfig} noChangesBody={(<DiffNoChangesBody foregroundColor={foregroundColor} mutedColor={mutedColor} visibleSourceLabel={visibleSourceLabel}/>)} onInlineListIndexesChanged={handleInlineListIndexesChanged} renderRow={renderRow} renderSideBySideRow={renderSideBySideRow} requestSideBySideRange={requestSideBySideRange} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$} onResolveMergeConflict={resolveMergeConflict} rowHeight={rowHeight} sideBySideFileHeaderByListIndex={sideBySideFileHeaderByListIndex} sideBySideDataSource={sideBySideDataSource} splitPaneMetrics$={splitPaneMetrics$} state={state} syntaxTokenizationState$={syntaxTokenizationState$} viewMode={renderViewMode} visibleItemIndexes={visibleItemIndexes}/>)} debugPayload={{
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
      <DiffRepositoryController onBannerChange={setRepoStateBanner} loadSource={loadSource} suppressReloadUntilRef={suppressFileWatcherReloadUntilRef}/>
      <DiffActionHandlersController copyCurrentFilePath={copyCurrentFilePath} copyCurrentRelativePath={copyCurrentRelativePath} copyCurrentSource={copyCurrentSource} focusSearch={focusSearch} navigateToNextHunk={navigateToNextHunk} navigateToPreviousHunk={navigateToPreviousHunk} reloadCurrentSource={reloadCurrentSource} revealCurrentFolder={revealCurrentFolder} saveMergeDrafts={saveMergeDraftsFromCommand} toggleShowOnlyHunks={toggleShowOnlyHunks} toggleSidebar={toggleSidebar}/>
      <DiffDropSurface backgroundColor={backgroundColor} borderColor={diffPalette.primary} foregroundColor={foregroundColor} mutedColor={mutedColor} onDropDiff={handleDropDiff} syntaxAppearance={syntaxTheme.appearance}>
        {body}
        <DiffStatisticsPanel borderColor={diffPalette.border} foregroundColor={foregroundColor} mutedColor={mutedColor} syntaxAppearance={syntaxTheme.appearance}/>
        <DiffSearchStatusPanel borderColor={diffPalette.border} foregroundColor={foregroundColor} mutedColor={mutedColor} syntaxAppearance={syntaxTheme.appearance}/>
        <DiffCompareRefPrompt backgroundColor={diffPalette.surface} borderColor={diffPalette.border} foregroundColor={foregroundColor} mutedColor={mutedColor} onCancel={closeCompareRefPrompt} onSubmit={submitCompareRefPrompt}/>
      </DiffDropSurface>
    </>);
}

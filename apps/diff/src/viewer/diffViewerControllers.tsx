import type { DiffDocument } from "@legend-apps/diff-parser";
import { watch } from "@legendapp/spark/files";
import { useRoutedHotkeys, type HotkeyScope } from "@legendapp/spark/shortcuts/commands";
import { ownRegistration, type MenuState } from "@legend-apps/runtime-utils";
import { diffMenuState$, diffActiveMenuWindow$ } from "../diffMenuState";
type MenuItemState = MenuState & { id: string };
import { elapsedMs, measureAfterEffect, nowMs } from "@legend-apps/source-viewer";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";
import { addWindowListener } from "@legendapp/spark/windows";
import { useWindowId } from "@legendapp/spark/windows";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { TextInput } from "react-native";
import { diffMenuOwnerId } from "../appConstants";
import { diffCompareToolbarTargetChooseRef, type DiffCompareRepoState } from "../diffCompareTargets";
import { getDiffSourceLabel, normalizeDiffOpenSource, type DiffOpenSource } from "../diffFiles";
import {
  diffHotkeyDefinitions,
  diffHotkeyRouter,
  useDiffHotkeyBindings,
} from "../diffHotkeys";
import {
  getDiffShowOnlyHunksSetting,
  getDiffSyntaxTheme,
  getDiffViewModeSetting,
  isDiffViewMode,
  setDiffViewModeSetting,
} from "../diffSettings";
import { registerDiffViewerActionHandlers } from "../diffViewerActions";
import {
  diffCompareToolbarItemId,
  diffSearchToolbarItemId,
  diffSidebarToolbarItemId,
  diffViewModeToolbarItemId,
  setDiffViewerWindowAppearance,
  setDiffViewerWindowToolbarOptions,
} from "../diffWindowControls";
import {
  emptyDiffLoadProgressState,
  emptyDiffViewerState,
  useDiffViewerModel,
  type DiffLoadSourceOptions,
  type DiffStatisticsState,
  type DiffLoadTrace,
} from "./diffViewerModel";
import {
  createRefreshError,
  diffToolbarModelsEqual,
  getDiffWindowToolbarModel,
  getErrorMessage,
  sourcesMatch,
  type DiffWindowToolbarModel,
} from "./diffViewerSupport";

function nativeMenuPatchesEqual(
  previous: readonly MenuItemState[] | null,
  next: readonly MenuItemState[],
) {
  return previous !== null &&
    previous.length === next.length &&
    previous.every((previousPatch, index) => {
      const nextPatch = next[index];
      return previousPatch.id === nextPatch.id &&
        previousPatch.disabled === nextPatch.disabled &&
        previousPatch.checked === nextPatch.checked &&
        previousPatch.label === nextPatch.label && previousPatch.hidden === nextPatch.hidden;
    });
}

function getCopySourceMenuTitle(source: DiffOpenSource | null | undefined) {
  if (source?.kind === "github") {
    return "Copy Source URL";
  }
  if (source?.kind === "filePair") {
    return "Copy Compared File Paths";
  }
  if (source?.kind === "diffFile") {
    return "Copy Diff File Path";
  }
  return "Copy Folder Path";
}

function getCompareRepoStateKey(compareRepoState: DiffCompareRepoState | null) {
  return compareRepoState
    ? [
      compareRepoState.repoPath,
      compareRepoState.currentBranch ?? "",
      compareRepoState.defaultBranch ?? "",
      compareRepoState.upstreamBranch ?? "",
      compareRepoState.localBranches.join("\u0000"),
      compareRepoState.remoteBranches.join("\u0000"),
    ].join("\u0001")
    : "";
}

export function DiffNativeMenuController({
  hasUnsavedMergeDrafts,
  isSavingMergeDrafts,
}: {
  hasUnsavedMergeDrafts: boolean;
  isSavingMergeDrafts: boolean;
}) {
  const {
    loadingSource$,
    sidebarCollapsed$,
    state$,
  } = useDiffViewerModel();
  const windowIdentifier = useWindowId();
  const lastMenuPatchesRef = useRef<MenuItemState[] | null>(null);

  const updateDiffNativeMenuItems = useCallback((observe: boolean) => {
    const currentState = observe ? state$.get() : state$.peek();
    const currentShowOnlyHunks = getDiffShowOnlyHunksSetting();
    const currentViewMode = getDiffViewModeSetting();
    const currentLoadingSource = observe ? loadingSource$.get() : loadingSource$.peek();
    const currentSidebarCollapsed = observe ? sidebarCollapsed$.get() : sidebarCollapsed$.peek();
    const currentVisibleSource = currentState.source;
    const currentVisibleFolderPath = currentVisibleSource?.kind === "folder" ? currentVisibleSource.value : null;
    const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
    const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentVisibleSource : null);
    const currentShowViewModeToolbar = currentToolbarSource !== null;
    const currentShowSidebarControl = currentShowViewModeToolbar;
    const hasLoadedFiles = currentLoadedFileCount > 0;
    const patches: MenuItemState[] = [
      {
        disabled: !(currentState.status === "loaded"),
        id: "reload",
      },
      {
        disabled: !(hasUnsavedMergeDrafts && !isSavingMergeDrafts),
        hidden: !hasUnsavedMergeDrafts,
        id: "save",
      },
      {
        disabled: !(currentVisibleFolderPath !== null),
        id: "revealInFinder",
      },
      {
        disabled: !(currentVisibleSource !== null),
        id: "copySource",
        label: getCopySourceMenuTitle(currentVisibleSource),
      },
      {
        disabled: !(currentVisibleFolderPath !== null && hasLoadedFiles),
        id: "copyFilePath",
      },
      {
        disabled: !(hasLoadedFiles),
        id: "copyRelativePath",
      },
      {
        checked: currentShowSidebarControl && !currentSidebarCollapsed,
        disabled: !(currentShowSidebarControl),
        id: "toggleSidebar",
        label: currentSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar",
      },
      {
        disabled: !(currentShowSidebarControl),
        id: "filterFiles",
      },
      {
        disabled: !(hasLoadedFiles),
        id: "previousHunk",
      },
      {
        disabled: !(hasLoadedFiles),
        id: "nextHunk",
      },
      {
        checked: currentViewMode === "unified",
        disabled: !(currentShowViewModeToolbar),
        id: "viewUnified",
      },
      {
        checked: currentViewMode === "blocks",
        disabled: !(currentShowViewModeToolbar),
        id: "viewBlocks",
      },
      {
        checked: currentShowOnlyHunks,
        disabled: !(currentVisibleFolderPath !== null),
        id: "showOnlyHunks",
      },
    ];
    if (!nativeMenuPatchesEqual(lastMenuPatchesRef.current, patches)) {
      lastMenuPatchesRef.current = patches;
      diffMenuState$[windowIdentifier].set(Object.fromEntries(patches.map(({ id, ...state }) => [id, state])));
    }
  }, [hasUnsavedMergeDrafts, isSavingMergeDrafts, loadingSource$, sidebarCollapsed$, state$, windowIdentifier]);

  useEffect(() => () => { diffMenuState$[windowIdentifier].delete(); }, [windowIdentifier]);

  useObserveEffect(() => {
    updateDiffNativeMenuItems(true);
  });

  useEffect(() => {
    updateDiffNativeMenuItems(false);
  }, [updateDiffNativeMenuItems]);

  return null;
}

export function DiffWindowToolbarItemController({
  compareCurrentSource,
  onSearchChange,
  onSearchSubmit,
  openCompareRefPrompt,
  toggleSidebar,
}: {
  compareCurrentSource: (selection: string) => boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string, direction: 1 | -1) => void;
  openCompareRefPrompt: () => boolean;
  toggleSidebar: () => boolean;
}) {
  const windowIdentifier = useWindowId();

  useEffect(() => {
    const subscription = ownRegistration(addMacOSWindowListener(windowIdentifier, event => {
      if (event.type === "toolbarAction" && event.itemId === diffSidebarToolbarItemId) toggleSidebar();
      if (event.type === "toolbarMenuAction" && event.itemId === diffCompareToolbarItemId) {
        if (event.action.itemId === diffCompareToolbarTargetChooseRef) openCompareRefPrompt();
        else compareCurrentSource(event.action.itemId);
      }
      if (event.type === "toolbarSelectionChanged" && event.itemId === diffViewModeToolbarItemId && isDiffViewMode(event.value)) setDiffViewModeSetting(event.value);
      if ((event.type === "toolbarSearchChanged" || event.type === "toolbarSearchSubmitted") && event.itemId === diffSearchToolbarItemId) {
        onSearchChange(event.value);
        if (event.type === "toolbarSearchSubmitted") onSearchSubmit(event.value, event.shiftKey ? -1 : 1);
      }
    }));
    return () => { void subscription.remove().catch(console.error); };
  }, [compareCurrentSource, openCompareRefPrompt, toggleSidebar, windowIdentifier, onSearchChange, onSearchSubmit]);

  return null;
}

export function DiffWindowChromeController({
  hasUnsavedMergeDrafts,
}: {
  hasUnsavedMergeDrafts: boolean;
}) {
  const compareRepoState = useValue(useDiffViewerModel().compareRepoState$);
  const {
    loadingSource$,
    sidebarCollapsed$,
    state$,
  } = useDiffViewerModel();
  const windowIdentifier = useWindowId();
  const lastToolbarModelRef = useRef<DiffWindowToolbarModel | null>(null);
  const lastCompareRepoStateKeyRef = useRef("");

  const updateDiffWindowToolbar = useCallback((observe: boolean) => {
    const toolbarModel = getDiffWindowToolbarModel({
      hasUnsavedMergeDrafts,
      loadingSource: observe ? loadingSource$.get() : loadingSource$.peek(),
      sidebarCollapsed: observe ? sidebarCollapsed$.get() : sidebarCollapsed$.peek(),
      state: observe ? state$.get() : state$.peek(),
      viewMode: getDiffViewModeSetting(),
    });
    const compareRepoStateKey = getCompareRepoStateKey(compareRepoState);

    if (!diffToolbarModelsEqual(lastToolbarModelRef.current, toolbarModel) || lastCompareRepoStateKeyRef.current !== compareRepoStateKey) {
      lastToolbarModelRef.current = toolbarModel;
      lastCompareRepoStateKeyRef.current = compareRepoStateKey;
      setDiffViewerWindowToolbarOptions({
        compareRepoState,
        hasUnsavedMergeDrafts: toolbarModel.hasUnsavedMergeDrafts,
        source: toolbarModel.source,
        showSidebarControl: toolbarModel.showSidebarControl,
        showViewModeToolbar: toolbarModel.showViewModeToolbar,
        sidebarCollapsed: toolbarModel.sidebarCollapsed,
        title: toolbarModel.title,
        viewMode: toolbarModel.viewMode,
        windowIdentifier,
      }).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
      });
    }
  }, [compareRepoState, hasUnsavedMergeDrafts, loadingSource$, sidebarCollapsed$, state$, windowIdentifier]);

  useObserveEffect(() => {
    const syntaxTheme = getDiffSyntaxTheme();
    setDiffViewerWindowAppearance({
      appearance: syntaxTheme.appearance,
      windowIdentifier,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  });

  useObserveEffect(() => {
    updateDiffWindowToolbar(true);
  });

  useEffect(() => {
    updateDiffWindowToolbar(false);
  }, [updateDiffWindowToolbar]);

  return null;
}

export function DiffActionHandlersController({
  copyCurrentFilePath,
  copyCurrentRelativePath,
  copyCurrentSource,
  focusSearch,
  navigateToNextHunk,
  navigateToPreviousHunk,
  reloadCurrentSource,
  revealCurrentFolder,
  saveMergeDrafts,
  toggleShowOnlyHunks,
  toggleSidebar,
}: {
  copyCurrentFilePath: () => boolean;
  copyCurrentRelativePath: () => boolean;
  copyCurrentSource: () => boolean;
  focusSearch: () => boolean;
  navigateToNextHunk: () => boolean;
  navigateToPreviousHunk: () => boolean;
  reloadCurrentSource: () => boolean;
  revealCurrentFolder: () => boolean;
  saveMergeDrafts: () => boolean;
  toggleShowOnlyHunks: () => boolean;
  toggleSidebar: () => boolean;
}) {
  const bindings = useDiffHotkeyBindings();
  const windowIdentifier = useWindowId();
  const hotkeyScope = useMemo<HotkeyScope>(() => ({
    kind: "window",
    windowId: windowIdentifier,
  }), [windowIdentifier]);
  const hotkeyHandlers = useMemo(() => ({
    copyRelativePath: copyCurrentRelativePath,
    copySource: copyCurrentSource,
    filterFiles: focusSearch,
    nextHunk: navigateToNextHunk,
    previousHunk: navigateToPreviousHunk,
    reload: reloadCurrentSource,
    toggleSidebar,
    viewBlocks: () => setDiffViewModeSetting("blocks"),
    viewUnified: () => setDiffViewModeSetting("unified"),
  }), [
    copyCurrentRelativePath,
    copyCurrentSource,
    focusSearch,
    navigateToNextHunk,
    navigateToPreviousHunk,
    reloadCurrentSource,
    toggleSidebar,
    windowIdentifier,
  ]);

  useRoutedHotkeys({
    bindings,
    definitions: diffHotkeyDefinitions,
    handlers: hotkeyHandlers,
    router: diffHotkeyRouter,
    scope: hotkeyScope,
  });

  useEffect(() => {
    diffHotkeyRouter.setActiveWindowId(windowIdentifier);
    diffActiveMenuWindow$.set(windowIdentifier);
    const subscription = ownRegistration(addWindowListener(windowIdentifier, "focusChanged", event => {
      if (event.focused) { diffHotkeyRouter.setActiveWindowId(windowIdentifier); diffActiveMenuWindow$.set(windowIdentifier); }
    }));
    return () => { void subscription.remove().catch(console.error); };
  }, [windowIdentifier]);

  useEffect(() => registerDiffViewerActionHandlers(windowIdentifier, {
    copyFilePath: copyCurrentFilePath,
    copyRelativePath: copyCurrentRelativePath,
    copySource: copyCurrentSource,
    filterFiles: focusSearch,
    nextHunk: navigateToNextHunk,
    previousHunk: navigateToPreviousHunk,
    reload: reloadCurrentSource,
    revealInFinder: revealCurrentFolder,
    save: saveMergeDrafts,
    showOnlyHunks: toggleShowOnlyHunks,
    toggleSidebar,
  }), [
    copyCurrentFilePath,
    copyCurrentRelativePath,
    copyCurrentSource,
    focusSearch,
    navigateToNextHunk,
    navigateToPreviousHunk,
    reloadCurrentSource,
    revealCurrentFolder,
    saveMergeDrafts,
    toggleShowOnlyHunks,
    toggleSidebar,
    windowIdentifier,
  ]);

  return null;
}

export function DiffLoadCompletionController({
  loadTraceRef,
  loggedTraceDocumentRef,
}: {
  loadTraceRef: { current: DiffLoadTrace | null };
  loggedTraceDocumentRef: { current: DiffDocument | null };
}) {
  const {
    loadStatistics$,
    setLoadStatisticsValue,
    setLoadingSourceValue,
    state$,
  } = useDiffViewerModel();

  useObserveEffect(() => {
    const currentState = state$.get();
    const trace = loadTraceRef.current;
    if (currentState.status === "loaded" && trace?.document === currentState.document) {
      const currentStatistics = loadStatistics$.peek();
      const downloadMs = Number(Math.max(0, currentState.timing.fetchMs).toFixed(1));
      const nativeTotalMs = Number(Math.max(0, currentState.timing.nativeTotalMs).toFixed(1));

      if (loggedTraceDocumentRef.current !== currentState.document || currentStatistics?.requestId !== trace.requestId) {
        loggedTraceDocumentRef.current = currentState.document;
        const effectAt = nowMs();
        measureAfterEffect(({ frameAt, microtaskAt, secondFrameAt, timeoutAt }) => {
          setLoadingSourceValue((current) => sourcesMatch(current, currentState.source) ? null : current);
          const loadToFrameMs = Number(elapsedMs(trace.loadStartedAt, frameAt).toFixed(1));
          const setStateToFrameMs = Number(elapsedMs(trace.setStateAt, frameAt).toFixed(1));
          const statistics: DiffStatisticsState = {
            cacheHit: trace.cacheHit === true,
            downloadMs,
            fileCount: currentState.files.length,
            firstPaintMs: setStateToFrameMs,
            loadComplete: currentState.loadComplete !== false,
            loadToFrameMs,
            loadToNativeMs: Number(elapsedMs(trace.loadStartedAt, trace.nativeResolvedAt).toFixed(1)),
            nativeToSetStateMs: Number(elapsedMs(trace.nativeResolvedAt, trace.setStateAt).toFixed(1)),
            nativeTotalMs,
            requestId: trace.requestId,
            rowCount: currentState.document.rowCount,
            setStateToFrameMs,
          };
          setLoadStatisticsValue(statistics);
        });
      } else if (currentStatistics.requestId === trace.requestId) {
        setLoadStatisticsValue({
          ...currentStatistics,
          cacheHit: trace.cacheHit === true,
          downloadMs,
          fileCount: currentState.files.length,
          loadComplete: currentState.loadComplete !== false,
          nativeTotalMs,
          rowCount: currentState.document.rowCount,
        });
      }
    }
  });

  return null;
}

export function DiffLaunchController({
  focusUrlInputRequestId,
  folderPath,
  loadRequestIdRef,
  loadSource,
  loadTraceRef,
  source,
  urlInputRef,
}: {
  focusUrlInputRequestId?: number;
  folderPath?: string;
  loadRequestIdRef: { current: number };
  loadSource: (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => Promise<void>;
  loadTraceRef: { current: DiffLoadTrace | null };
  source?: DiffOpenSource;
  urlInputRef: RefObject<TextInput | null>;
}) {
  const {
    setDocumentErrorValue,
    setLoadProgressValue,
    setLoadStatisticsValue,
    setLoadingSourceValue,
    setOpenErrorValue,
    setUrlInputErrorValue,
    setUrlInputValue,
    setViewerState,
  } = useDiffViewerModel();

  useLayoutEffect(() => {
    const initialSource = normalizeDiffOpenSource(source ?? folderPath);
    if (initialSource) {
      loadSource(initialSource, { reason: "launch" }).catch((error: unknown) => {
        console.error(getErrorMessage(error));
      });
    }
    return undefined;
  }, [folderPath, loadSource, source]);

  useEffect(() => {
    const shouldFocusUrlInput = typeof focusUrlInputRequestId === "number" && !source && !folderPath;
    if (shouldFocusUrlInput) {
      loadRequestIdRef.current += 1;
      loadTraceRef.current = null;
      setLoadProgressValue(emptyDiffLoadProgressState);
      setLoadStatisticsValue(null);
      setLoadingSourceValue(null);
      setViewerState(emptyDiffViewerState);
      setOpenErrorValue(null);
      setDocumentErrorValue(null);
      setUrlInputValue("");
      setUrlInputErrorValue(null);
      requestAnimationFrame(() => {
        urlInputRef.current?.focus();
      });
    }
  }, [
    focusUrlInputRequestId,
    folderPath,
    loadRequestIdRef,
    loadTraceRef,
    setDocumentErrorValue,
    setLoadProgressValue,
    setLoadStatisticsValue,
    setLoadingSourceValue,
    setOpenErrorValue,
    setUrlInputErrorValue,
    setUrlInputValue,
    setViewerState,
    source,
    urlInputRef,
  ]);

  return null;
}

export function DiffFileWatcherController({
  loadSource,
  suppressReloadUntilRef,
}: {
  loadSource: (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => Promise<void>;
  suppressReloadUntilRef?: RefObject<number>;
}) {
  const {
    setDocumentErrorValue,
    state$,
  } = useDiffViewerModel();

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentVisibleSource = currentState.source;
    const currentVisibleFolderSource = currentVisibleSource?.kind === "folder" ? currentVisibleSource : null;
    if (!currentVisibleFolderSource) {
      return undefined;
    }

    let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
    const subscription = ownRegistration(watch(currentVisibleFolderSource.value, () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      if ((suppressReloadUntilRef?.current ?? 0) > Date.now()) {
        return;
      }
      reloadTimeout = setTimeout(() => {
        if ((suppressReloadUntilRef?.current ?? 0) <= Date.now()) {
          loadSource({
            ...(currentVisibleFolderSource.compareBase ? { compareBase: currentVisibleFolderSource.compareBase } : {}),
            kind: "folder",
            label: getDiffSourceLabel(currentVisibleFolderSource),
            value: currentVisibleFolderSource.value,
          }, { force: true, reason: "watch" }).catch((error: unknown) => {
            setDocumentErrorValue(createRefreshError(currentVisibleFolderSource, getErrorMessage(error)));
          });
        }
      }, 250);
    }, { recursive: true }));

    return () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      void subscription.remove().catch(console.error);
    };
  });

  return null;
}

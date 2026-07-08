import type { DiffDocument } from "@legend-desktop/diff-parser";
import { watchDirectories } from "@legend-desktop/file-system-watcher";
import { updateMenuItems, type NativeMenuItemPatch } from "@legend-desktop/native-menu";
import { elapsedMs, measureAfterEffect, nowMs } from "@legend-desktop/source-viewer";
import { addWindowToolbarItemSelectedListener, addWindowToolbarSearchListener } from "@legend-desktop/window-manager";
import { useWindowId } from "@legend-desktop/windows";
import { useObserveEffect } from "@legendapp/state/react";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { TextInput } from "react-native";
import { diffMenuOwnerId } from "../appConstants";
import { diffCompareToolbarTargetChooseRef, type DiffCompareRepoState } from "../diffCompareTargets";
import { getDiffSourceLabel, normalizeDiffOpenSource, type DiffOpenSource } from "../diffFiles";
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
} from "../diffWindows";
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
  logDiffOpenTiming,
  sourcesMatch,
  type DiffWindowToolbarModel,
} from "./diffViewerSupport";

function nativeMenuPatchesEqual(
  previous: readonly NativeMenuItemPatch[] | null,
  next: readonly NativeMenuItemPatch[],
) {
  return previous !== null &&
    previous.length === next.length &&
    previous.every((previousPatch, index) => {
      const nextPatch = next[index];
      return previousPatch.id === nextPatch.id &&
        previousPatch.enabled === nextPatch.enabled &&
        previousPatch.checked === nextPatch.checked &&
        previousPatch.title === nextPatch.title;
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
  const lastMenuPatchesRef = useRef<NativeMenuItemPatch[] | null>(null);

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
    const patches: NativeMenuItemPatch[] = [
      {
        enabled: currentState.status === "loaded",
        id: "reload",
      },
      {
        enabled: hasUnsavedMergeDrafts && !isSavingMergeDrafts,
        hidden: !hasUnsavedMergeDrafts,
        id: "save",
      },
      {
        enabled: currentVisibleFolderPath !== null,
        id: "revealInFinder",
      },
      {
        enabled: currentVisibleSource !== null,
        id: "copySource",
        title: getCopySourceMenuTitle(currentVisibleSource),
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
      {
        checked: currentShowOnlyHunks,
        enabled: currentVisibleFolderPath !== null,
        id: "showOnlyHunks",
      },
    ];
    if (!nativeMenuPatchesEqual(lastMenuPatchesRef.current, patches)) {
      lastMenuPatchesRef.current = patches;
      updateMenuItems(diffMenuOwnerId, patches);
    }
  }, [hasUnsavedMergeDrafts, isSavingMergeDrafts, loadingSource$, sidebarCollapsed$, state$]);

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
    const subscription = addWindowToolbarItemSelectedListener((event) => {
      if (event.identifier === windowIdentifier) {
        if (event.itemId === diffSidebarToolbarItemId) {
          toggleSidebar();
        } else if (event.itemId === diffCompareToolbarItemId && event.value === diffCompareToolbarTargetChooseRef) {
          openCompareRefPrompt();
        } else if (event.itemId === diffCompareToolbarItemId && event.value) {
          compareCurrentSource(event.value);
        } else if (event.itemId === diffViewModeToolbarItemId && isDiffViewMode(event.value)) {
          setDiffViewModeSetting(event.value);
        }
      }
    });
    return () => subscription.remove();
  }, [compareCurrentSource, openCompareRefPrompt, toggleSidebar, windowIdentifier]);

  useEffect(() => {
    const subscription = addWindowToolbarSearchListener((event) => {
      if (event.identifier === windowIdentifier && event.itemId === diffSearchToolbarItemId) {
        onSearchChange(event.value);
        if (event.submitted) {
          onSearchSubmit(event.value, event.shiftKey ? -1 : 1);
        }
      }
    });
    return () => subscription.remove();
  }, [onSearchChange, onSearchSubmit, windowIdentifier]);

  return null;
}

export function DiffWindowChromeController({
  compareRepoState,
  hasUnsavedMergeDrafts,
}: {
  compareRepoState: DiffCompareRepoState | null;
  hasUnsavedMergeDrafts: boolean;
}) {
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
      const startedAt = nowMs();
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
      })
        .then(() => {
          logDiffOpenTiming("viewer.toolbarOptions.finish", () => ({
            source: toolbarModel.source,
            setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
          }));
        })
        .catch((error: unknown) => {
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
  reloadCurrentSource: () => boolean;
  revealCurrentFolder: () => boolean;
  saveMergeDrafts: () => boolean;
  toggleShowOnlyHunks: () => boolean;
  toggleSidebar: () => boolean;
}) {
  useEffect(() => registerDiffViewerActionHandlers({
    copyFilePath: copyCurrentFilePath,
    copyRelativePath: copyCurrentRelativePath,
    copySource: copyCurrentSource,
    filterFiles: focusSearch,
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
    reloadCurrentSource,
    revealCurrentFolder,
    saveMergeDrafts,
    toggleShowOnlyHunks,
    toggleSidebar,
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
      const currentStatistics = loadStatistics$.get();
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
          logDiffOpenTiming("viewer.ui.loaded", () => ({
            effectToFrameMs: Number(elapsedMs(effectAt, frameAt).toFixed(1)),
            effectToMicrotaskMs: Number(elapsedMs(effectAt, microtaskAt).toFixed(1)),
            effectToSecondFrameMs: Number(elapsedMs(effectAt, secondFrameAt).toFixed(1)),
            effectToTimeoutMs: Number(elapsedMs(effectAt, timeoutAt).toFixed(1)),
            loadToEffectMs: Number(elapsedMs(trace.loadStartedAt, effectAt).toFixed(1)),
            loadToFrameMs,
            loadToNativeMs: Number(elapsedMs(trace.loadStartedAt, trace.nativeResolvedAt).toFixed(1)),
            loadToSecondFrameMs: Number(elapsedMs(trace.loadStartedAt, secondFrameAt).toFixed(1)),
            nativeToSetStateMs: Number(elapsedMs(trace.nativeResolvedAt, trace.setStateAt).toFixed(1)),
            setStateToEffectMs: Number(elapsedMs(trace.setStateAt, effectAt).toFixed(1)),
            statistics,
          }));
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
      logDiffOpenTiming("viewer.launchSource.effect", () => ({
        source: initialSource,
        phase: "layout",
      }));
      logDiffOpenTiming("viewer.launchSource.loadImmediate", () => ({
        source: initialSource,
      }));
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
    const subscription = watchDirectories([currentVisibleFolderSource.value], () => {
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
    });

    return () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      subscription.remove();
    };
  });

  return null;
}

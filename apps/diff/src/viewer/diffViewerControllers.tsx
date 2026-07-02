import type { DiffDocument } from "@legend-desktop/diff-parser";
import { watchDirectories } from "@legend-desktop/file-system-watcher";
import { updateMenuItems } from "@legend-desktop/native-menu";
import { elapsedMs, measureAfterEffect, nowMs } from "@legend-desktop/source-viewer";
import { addWindowToolbarItemSelectedListener } from "@legend-desktop/window-manager";
import { useWindowId } from "@legend-desktop/windows";
import { useObserveEffect } from "@legendapp/state/react";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { TextInput } from "react-native";
import { diffMenuOwnerId } from "../appConstants";
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
  diffSidebarToolbarItemId,
  diffViewModeToolbarItemId,
  setDiffViewerWindowAppearance,
  setDiffViewerWindowToolbarOptions,
} from "../diffWindows";
import {
  emptyDiffViewerState,
  useDiffViewerModel,
  type DiffLoadSourceOptions,
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
    updateMenuItems(diffMenuOwnerId, [
      {
        enabled: currentState.status === "loaded",
        id: "reload",
      },
      {
        enabled: hasUnsavedMergeDrafts && !isSavingMergeDrafts,
        id: "save",
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
      {
        checked: currentShowOnlyHunks,
        enabled: currentVisibleFolderPath !== null,
        id: "showOnlyHunks",
      },
    ]);
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
  toggleSidebar,
}: {
  toggleSidebar: () => boolean;
}) {
  const windowIdentifier = useWindowId();

  useEffect(() => {
    const subscription = addWindowToolbarItemSelectedListener((event) => {
      if (event.identifier === windowIdentifier) {
        if (event.itemId === diffSidebarToolbarItemId) {
          toggleSidebar();
        } else if (event.itemId === diffViewModeToolbarItemId && isDiffViewMode(event.value)) {
          setDiffViewModeSetting(event.value);
        }
      }
    });
    return () => subscription.remove();
  }, [toggleSidebar, windowIdentifier]);

  return null;
}

export function DiffWindowChromeController({
  hasUnsavedMergeDrafts,
}: {
  hasUnsavedMergeDrafts: boolean;
}) {
  const {
    loadingSource$,
    sidebarCollapsed$,
    state$,
  } = useDiffViewerModel();
  const windowIdentifier = useWindowId();
  const lastToolbarModelRef = useRef<DiffWindowToolbarModel | null>(null);

  const updateDiffWindowToolbar = useCallback((observe: boolean) => {
    const toolbarModel = getDiffWindowToolbarModel({
      hasUnsavedMergeDrafts,
      loadingSource: observe ? loadingSource$.get() : loadingSource$.peek(),
      sidebarCollapsed: observe ? sidebarCollapsed$.get() : sidebarCollapsed$.peek(),
      state: observe ? state$.get() : state$.peek(),
      viewMode: getDiffViewModeSetting(),
    });

    if (!diffToolbarModelsEqual(lastToolbarModelRef.current, toolbarModel)) {
      lastToolbarModelRef.current = toolbarModel;
      const startedAt = nowMs();
      setDiffViewerWindowToolbarOptions({
        hasUnsavedMergeDrafts: toolbarModel.hasUnsavedMergeDrafts,
        source: toolbarModel.source,
        showSidebarControl: toolbarModel.showSidebarControl,
        showViewModeToolbar: toolbarModel.showViewModeToolbar,
        sidebarCollapsed: toolbarModel.sidebarCollapsed,
        viewMode: toolbarModel.viewMode,
        windowIdentifier,
      })
        .then(() => {
          logDiffOpenTiming("viewer.toolbarOptions.finish", {
            source: toolbarModel.source,
            setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
          });
        })
        .catch((error: unknown) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
    }
  }, [hasUnsavedMergeDrafts, loadingSource$, sidebarCollapsed$, state$, windowIdentifier]);

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
  focusFileFilter,
  reloadCurrentSource,
  revealCurrentFolder,
  saveMergeDrafts,
  toggleShowOnlyHunks,
  toggleSidebar,
}: {
  copyCurrentFilePath: () => boolean;
  copyCurrentRelativePath: () => boolean;
  copyCurrentSource: () => boolean;
  focusFileFilter: () => boolean;
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
    filterFiles: focusFileFilter,
    reload: reloadCurrentSource,
    revealInFinder: revealCurrentFolder,
    save: saveMergeDrafts,
    showOnlyHunks: toggleShowOnlyHunks,
    toggleSidebar,
  }), [
    copyCurrentFilePath,
    copyCurrentRelativePath,
    copyCurrentSource,
    focusFileFilter,
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
    setLoadingSourceValue,
    state$,
  } = useDiffViewerModel();

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
    setLoadingSourceValue,
    setOpenErrorValue,
    setUrlInputErrorValue,
    setUrlInputValue,
    setViewerState,
  } = useDiffViewerModel();

  useEffect(() => {
    const initialSource = normalizeDiffOpenSource(source ?? folderPath);
    if (initialSource) {
      let loadTimeout: ReturnType<typeof setTimeout> | undefined;
      logDiffOpenTiming("viewer.launchSource.effect", {
        source: initialSource,
      });
      setLoadingSourceValue(initialSource);
      const frameHandle = requestAnimationFrame(() => {
        loadTimeout = setTimeout(() => {
          logDiffOpenTiming("viewer.launchSource.deferredLoad", {
            source: initialSource,
          });
          loadSource(initialSource, { reason: "launch" }).catch((error: unknown) => {
            console.error(getErrorMessage(error));
          });
        }, 0);
      });
      return () => {
        cancelAnimationFrame(frameHandle);
        if (loadTimeout) {
          clearTimeout(loadTimeout);
        }
      };
    }
    return undefined;
  }, [folderPath, loadSource, setLoadingSourceValue, source]);

  useEffect(() => {
    const shouldFocusUrlInput = typeof focusUrlInputRequestId === "number" && !source && !folderPath;
    if (shouldFocusUrlInput) {
      loadRequestIdRef.current += 1;
      loadTraceRef.current = null;
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
    const currentVisibleFolderPath = currentVisibleSource?.kind === "folder" ? currentVisibleSource.value : null;
    if (!currentVisibleFolderPath) {
      return undefined;
    }

    let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
    const subscription = watchDirectories([currentVisibleFolderPath], () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      if ((suppressReloadUntilRef?.current ?? 0) > Date.now()) {
        return;
      }
      reloadTimeout = setTimeout(() => {
        if ((suppressReloadUntilRef?.current ?? 0) <= Date.now()) {
          loadSource({ kind: "folder", label: getDiffSourceLabel(currentVisibleSource), value: currentVisibleFolderPath }, { force: true, reason: "watch" }).catch((error: unknown) => {
            setDocumentErrorValue(createRefreshError(currentVisibleSource, getErrorMessage(error)));
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

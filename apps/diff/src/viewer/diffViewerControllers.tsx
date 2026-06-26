import type { DiffDocument } from "@legend-desktop/diff-parser";
import { watchDirectories } from "@legend-desktop/file-system-watcher";
import { updateMenuItems } from "@legend-desktop/native-menu";
import { elapsedMs, measureAfterEffect, nowMs } from "@legend-desktop/source-viewer";
import { addWindowToolbarItemSelectedListener } from "@legend-desktop/window-manager";
import { useObserveEffect } from "@legendapp/state/react";
import { type RefObject, useEffect, useRef } from "react";
import type { TextInput } from "react-native";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "../appConstants";
import { getDiffSourceLabel, normalizeDiffOpenSource, type DiffOpenSource } from "../diffFiles";
import {
  getDiffSyntaxTheme,
  getDiffSyntaxThemeSetting,
  getDiffViewModeSetting,
  isDiffViewMode,
  setDiffViewModeSetting,
  type DiffSettingsFile,
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

export function DiffNativeMenuController() {
  const {
    loadingSource$,
    sidebarCollapsed$,
    state$,
  } = useDiffViewerModel();

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

  return null;
}

export function DiffWindowToolbarItemController({
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

  return null;
}

export function DiffWindowChromeController() {
  const {
    loadingSource$,
    sidebarCollapsed$,
    state$,
  } = useDiffViewerModel();
  const lastToolbarModelRef = useRef<DiffWindowToolbarModel | null>(null);

  useObserveEffect(() => {
    const syntaxTheme = getDiffSyntaxTheme();
    setDiffViewerWindowAppearance({
      appearance: syntaxTheme.appearance,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  });

  useObserveEffect(() => {
    const toolbarModel = getDiffWindowToolbarModel({
      loadingSource: loadingSource$.get(),
      sidebarCollapsed: sidebarCollapsed$.get(),
      state: state$.get(),
      viewMode: getDiffViewModeSetting(),
    });

    if (!diffToolbarModelsEqual(lastToolbarModelRef.current, toolbarModel)) {
      lastToolbarModelRef.current = toolbarModel;
      const startedAt = nowMs();
      setDiffViewerWindowToolbarOptions({
        source: toolbarModel.source,
        showSidebarControl: toolbarModel.showSidebarControl,
        showViewModeToolbar: toolbarModel.showViewModeToolbar,
        sidebarCollapsed: toolbarModel.sidebarCollapsed,
        viewMode: toolbarModel.viewMode,
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
  });

  return null;
}

export function DiffActionHandlersController({
  copyCurrentFilePath,
  copyCurrentRelativePath,
  copyCurrentSource,
  focusFileFilter,
  reloadCurrentSource,
  revealCurrentFolder,
  toggleSidebar,
}: {
  copyCurrentFilePath: () => boolean;
  copyCurrentRelativePath: () => boolean;
  copyCurrentSource: () => boolean;
  focusFileFilter: () => boolean;
  reloadCurrentSource: () => boolean;
  revealCurrentFolder: () => boolean;
  toggleSidebar: () => boolean;
}) {
  useEffect(() => registerDiffViewerActionHandlers({
    copyFilePath: copyCurrentFilePath,
    copyRelativePath: copyCurrentRelativePath,
    copySource: copyCurrentSource,
    filterFiles: focusFileFilter,
    reload: reloadCurrentSource,
    revealInFinder: revealCurrentFolder,
    toggleSidebar,
  }), [
    copyCurrentFilePath,
    copyCurrentRelativePath,
    copyCurrentSource,
    focusFileFilter,
    reloadCurrentSource,
    revealCurrentFolder,
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
  loadSource: (nextSource: DiffOpenSource, syntaxThemeName: DiffSettingsFile["syntaxTheme"]) => Promise<void>;
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
      const currentSyntaxTheme = getDiffSyntaxThemeSetting();
      logDiffOpenTiming("viewer.launchSource.effect", {
        source: initialSource,
        selectedSyntaxTheme: currentSyntaxTheme,
      });
      loadSource(initialSource, currentSyntaxTheme);
    }
  }, [folderPath, loadSource, source]);

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

export function DiffSyntaxThemeController({
  loadSource,
}: {
  loadSource: (nextSource: DiffOpenSource, syntaxThemeName: DiffSettingsFile["syntaxTheme"]) => Promise<void>;
}) {
  const {
    setDocumentErrorValue,
    state$,
  } = useDiffViewerModel();

  useObserveEffect(() => {
    const currentState = state$.get();
    const currentSyntaxTheme = getDiffSyntaxThemeSetting();
    if (currentState.status === "loaded" && currentState.syntaxTheme !== currentSyntaxTheme) {
      loadSource(currentState.source, currentSyntaxTheme).catch((error: unknown) => {
        setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
      });
    }
  });

  return null;
}

export function DiffFileWatcherController({
  loadSource,
}: {
  loadSource: (nextSource: DiffOpenSource, syntaxThemeName: DiffSettingsFile["syntaxTheme"]) => Promise<void>;
}) {
  const {
    setDocumentErrorValue,
    state$,
  } = useDiffViewerModel();

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

  return null;
}

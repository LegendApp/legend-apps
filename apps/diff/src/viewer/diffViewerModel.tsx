import type {
  DiffDocument,
  DiffFileSummary,
  DiffLoadTiming,
  DiffRenderRow,
} from "@legend-apps/diff-parser";
import type { Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { createContext, type ReactNode, type SetStateAction, useCallback, useContext, useMemo } from "react";
import type { DiffOpenSource } from "../diffFiles";
import type { DiffMergeState } from "../diffMerge";

export type DiffLoadTrace = {
  cacheHit?: boolean;
  document: DiffDocument | null;
  folderPath: string;
  loadStartedAt: number;
  nativeResolvedAt: number;
  requestId: number;
  setStateAt: number;
};

export type DiffStatisticsState = {
  cacheHit: boolean;
  downloadMs: number;
  fileCount: number;
  firstPaintMs: number;
  loadComplete: boolean;
  loadToFrameMs: number;
  loadToNativeMs: number;
  nativeToSetStateMs: number;
  nativeTotalMs: number;
  requestId: number;
  rowCount: number;
  setStateToFrameMs: number;
};

export type DiffLoadSourceOptions = {
  force?: boolean;
  reason?: "launch" | "manual" | "merge-resolve" | "mode-toggle" | "reload" | "watch";
};

export type DiffLoadProgressState = {
  complete: boolean;
  fileCount: number;
  fileVersion: number;
  requestId: number;
  rowCount: number;
  rowVersion: number;
  source: DiffOpenSource | null;
  visible: boolean;
};

export type DiffSplitPaneMetrics = {
  contentHeight: number;
  contentWidth: number;
  contentX: number;
  sidebarHeight: number;
  sidebarWidth: number;
};

export type DiffFatalError = {
  message: string;
  title: string;
};

export type DiffRecoverableError = {
  externalUrl?: string;
  externalUrlLabel?: string;
  kind?: "generic" | "github-auth" | "github-network" | "github-timeout" | "github-unavailable" | "permission";
  message: string;
  recoverySteps?: string[];
  source: DiffOpenSource | null;
  title: string;
};

export type DiffViewerState =
  | {
    status: "empty";
    folderPath: null;
    source: null;
  }
  | {
    status: "loaded";
    folderPath: string;
    source: DiffOpenSource;
    document: DiffDocument;
    files: DiffFileSummary[];
    initialRows: DiffRenderRow[];
    loadComplete?: boolean;
    timing: DiffLoadTiming;
  }
  | {
    status: "fatal";
    error: DiffFatalError;
    folderPath: string | null;
    source: DiffOpenSource | null;
  };

export type DiffLoadedState = Extract<DiffViewerState, { status: "loaded" }>;

export const emptyDiffViewerState: DiffViewerState = {
  status: "empty",
  folderPath: null,
  source: null,
};

export const unavailableDiffMergeState: DiffMergeState = {
  status: "unavailable",
  reason: "Merge mode is available for local Git repositories.",
};

export const emptyDiffLoadProgressState: DiffLoadProgressState = {
  complete: false,
  fileCount: 0,
  fileVersion: 0,
  requestId: 0,
  rowCount: 0,
  rowVersion: 0,
  source: null,
  visible: false,
};

export type DiffViewerModel = {
  activeFileIndex$: Observable<number | null>;
  collapsedFileIndexes$: Observable<Set<number>>;
  diffPaneHeight$: Observable<number>;
  documentError$: Observable<DiffRecoverableError | null>;
  loadProgress$: Observable<DiffLoadProgressState>;
  loadStatistics$: Observable<DiffStatisticsState | null>;
  loadingSource$: Observable<DiffOpenSource | null>;
  mergeState$: Observable<DiffMergeState>;
  openError$: Observable<DiffRecoverableError | null>;
  setCollapsedFileIndexesValue: (nextValue: SetStateAction<Set<number>>) => void;
  setDiffPaneHeightValue: (nextHeight: number) => void;
  setDocumentErrorValue: (nextError: DiffRecoverableError | null) => void;
  setLoadProgressValue: (nextProgress: DiffLoadProgressState) => void;
  setLoadStatisticsValue: (nextStatistics: DiffStatisticsState | null) => void;
  setLoadingSourceValue: (nextValue: SetStateAction<DiffOpenSource | null>) => void;
  setMergeStateValue: (nextMergeState: DiffMergeState) => void;
  setOpenErrorValue: (nextError: DiffRecoverableError | null) => void;
  setSidebarCollapsedValue: (nextValue: SetStateAction<boolean>) => void;
  setSplitPaneMetricsValue: (nextMetrics: DiffSplitPaneMetrics) => void;
  setUrlInputErrorValue: (nextError: string | null) => void;
  setUrlInputValue: (nextValue: string) => void;
  setViewerState: (nextState: DiffViewerState) => void;
  sidebarCollapsed$: Observable<boolean>;
  splitPaneMetrics$: Observable<DiffSplitPaneMetrics>;
  state$: Observable<DiffViewerState>;
  urlInput$: Observable<string>;
  urlInputError$: Observable<string | null>;
};

const DiffViewerModelContext = createContext<DiffViewerModel | null>(null);

function resolveSetStateAction<T>(currentValue: T, nextValue: SetStateAction<T>) {
  return typeof nextValue === "function"
    ? (nextValue as (value: T) => T)(currentValue)
    : nextValue;
}

export function DiffViewerModelProvider({
  children,
  initialSplitPaneMetrics,
}: {
  children: ReactNode;
  initialSplitPaneMetrics?: DiffSplitPaneMetrics | null;
}) {
  const initialDiffPaneHeight = initialSplitPaneMetrics?.contentHeight && initialSplitPaneMetrics.contentHeight > 0
    ? initialSplitPaneMetrics.contentHeight
    : 0;
  const state$ = useObservable<DiffViewerState>(emptyDiffViewerState);
  const urlInput$ = useObservable("");
  const urlInputError$ = useObservable<string | null>(null);
  const openError$ = useObservable<DiffRecoverableError | null>(null);
  const documentError$ = useObservable<DiffRecoverableError | null>(null);
  const loadProgress$ = useObservable<DiffLoadProgressState>(emptyDiffLoadProgressState);
  const loadStatistics$ = useObservable<DiffStatisticsState | null>(null);
  const loadingSource$ = useObservable<DiffOpenSource | null>(null);
  const mergeState$ = useObservable<DiffMergeState>(unavailableDiffMergeState);
  const sidebarCollapsed$ = useObservable(false);
  const collapsedFileIndexes$ = useObservable<Set<number>>(new Set());
  const splitPaneMetrics$ = useObservable<DiffSplitPaneMetrics>(initialSplitPaneMetrics ?? {
    contentHeight: 0,
    contentWidth: 0,
    contentX: 0,
    sidebarHeight: 0,
    sidebarWidth: 0,
  });
  const diffPaneHeight$ = useObservable(initialDiffPaneHeight);
  const activeFileIndex$ = useObservable<number | null>(null);
  const setViewerState = useCallback((nextState: DiffViewerState) => {
    state$.set(nextState);
  }, [state$]);
  const setUrlInputValue = useCallback((nextValue: string) => {
    urlInput$.set(nextValue);
  }, [urlInput$]);
  const setUrlInputErrorValue = useCallback((nextError: string | null) => {
    urlInputError$.set(nextError);
  }, [urlInputError$]);
  const setOpenErrorValue = useCallback((nextError: DiffRecoverableError | null) => {
    openError$.set(nextError);
  }, [openError$]);
  const setDocumentErrorValue = useCallback((nextError: DiffRecoverableError | null) => {
    documentError$.set(nextError);
  }, [documentError$]);
  const setLoadProgressValue = useCallback((nextProgress: DiffLoadProgressState) => {
    const currentProgress = loadProgress$.peek();
    if (
      currentProgress.complete !== nextProgress.complete ||
      currentProgress.fileCount !== nextProgress.fileCount ||
      currentProgress.fileVersion !== nextProgress.fileVersion ||
      currentProgress.requestId !== nextProgress.requestId ||
      currentProgress.rowCount !== nextProgress.rowCount ||
      currentProgress.rowVersion !== nextProgress.rowVersion ||
      currentProgress.source !== nextProgress.source ||
      currentProgress.visible !== nextProgress.visible
    ) {
      loadProgress$.set(nextProgress);
    }
  }, [loadProgress$]);
  const setLoadStatisticsValue = useCallback((nextStatistics: DiffStatisticsState | null) => {
    const currentStatistics = loadStatistics$.peek();
    if (
      currentStatistics?.cacheHit !== nextStatistics?.cacheHit ||
      currentStatistics?.downloadMs !== nextStatistics?.downloadMs ||
      currentStatistics?.fileCount !== nextStatistics?.fileCount ||
      currentStatistics?.firstPaintMs !== nextStatistics?.firstPaintMs ||
      currentStatistics?.loadComplete !== nextStatistics?.loadComplete ||
      currentStatistics?.loadToFrameMs !== nextStatistics?.loadToFrameMs ||
      currentStatistics?.loadToNativeMs !== nextStatistics?.loadToNativeMs ||
      currentStatistics?.nativeToSetStateMs !== nextStatistics?.nativeToSetStateMs ||
      currentStatistics?.nativeTotalMs !== nextStatistics?.nativeTotalMs ||
      currentStatistics?.requestId !== nextStatistics?.requestId ||
      currentStatistics?.rowCount !== nextStatistics?.rowCount ||
      currentStatistics?.setStateToFrameMs !== nextStatistics?.setStateToFrameMs
    ) {
      loadStatistics$.set(nextStatistics);
    }
  }, [loadStatistics$]);
  const setLoadingSourceValue = useCallback((nextValue: SetStateAction<DiffOpenSource | null>) => {
    const currentLoadingSource = loadingSource$.peek();
    const nextLoadingSource = resolveSetStateAction(currentLoadingSource, nextValue);
    if (nextLoadingSource !== currentLoadingSource) {
      loadingSource$.set(nextLoadingSource);
    }
  }, [loadingSource$]);
  const setMergeStateValue = useCallback((nextMergeState: DiffMergeState) => {
    mergeState$.set(nextMergeState);
  }, [mergeState$]);
  const setSidebarCollapsedValue = useCallback((nextValue: SetStateAction<boolean>) => {
    const currentSidebarCollapsed = sidebarCollapsed$.peek();
    const nextSidebarCollapsed = resolveSetStateAction(currentSidebarCollapsed, nextValue);
    if (nextSidebarCollapsed !== currentSidebarCollapsed) {
      sidebarCollapsed$.set(nextSidebarCollapsed);
    }
  }, [sidebarCollapsed$]);
  const setCollapsedFileIndexesValue = useCallback((nextValue: SetStateAction<Set<number>>) => {
    const currentIndexes = collapsedFileIndexes$.peek();
    const nextIndexes = resolveSetStateAction(currentIndexes, nextValue);
    if (nextIndexes !== currentIndexes) {
      collapsedFileIndexes$.set(nextIndexes);
    }
  }, [collapsedFileIndexes$]);
  const setSplitPaneMetricsValue = useCallback((nextMetrics: DiffSplitPaneMetrics) => {
    const currentMetrics = splitPaneMetrics$.peek();
    if (
      currentMetrics.contentHeight !== nextMetrics.contentHeight ||
      currentMetrics.contentWidth !== nextMetrics.contentWidth ||
      currentMetrics.contentX !== nextMetrics.contentX ||
      currentMetrics.sidebarHeight !== nextMetrics.sidebarHeight ||
      currentMetrics.sidebarWidth !== nextMetrics.sidebarWidth
    ) {
      splitPaneMetrics$.set(nextMetrics);
    }
  }, [splitPaneMetrics$]);
  const setDiffPaneHeightValue = useCallback((nextHeight: number) => {
    diffPaneHeight$.set(nextHeight);
  }, [diffPaneHeight$]);
  const model = useMemo<DiffViewerModel>(
    () => ({
      activeFileIndex$,
      collapsedFileIndexes$,
      diffPaneHeight$,
      documentError$,
      loadProgress$,
      loadStatistics$,
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
    }),
    [
      activeFileIndex$,
      collapsedFileIndexes$,
      diffPaneHeight$,
      documentError$,
      loadProgress$,
      loadStatistics$,
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
    ],
  );

  return (
    <DiffViewerModelContext.Provider value={model}>
      {children}
    </DiffViewerModelContext.Provider>
  );
}

export function useDiffViewerModel() {
  const model = useContext(DiffViewerModelContext);
  if (!model) {
    throw new Error("useDiffViewerModel must be used within DiffViewerModelProvider");
  }
  return model;
}

import type { DiffLoadTiming } from "@legend-desktop/diff-parser";
import { getDiffSourceLabel, type DiffOpenSource } from "../diffFiles";
import { getDiffViewModeSetting } from "../diffSettings";
import type { DiffRecoverableError, DiffViewerState } from "./diffViewerModel";

export type DiffVisibleSourceModel = {
  loadedFileCount: number;
  showSidebarControl: boolean;
  showViewModeToolbar: boolean;
  toolbarSource: DiffOpenSource | null;
  visibleFolderPath: string | null;
  visibleSource: DiffOpenSource | null;
  visibleSourceLabel: string;
};

export type DiffWindowToolbarModel = {
  showSidebarControl: boolean;
  showViewModeToolbar: boolean;
  sidebarCollapsed: boolean;
  source: DiffOpenSource | null;
  toolbarSource: DiffOpenSource | null;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
};

export function logDiffOpenTiming(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffOpenTiming] ${event} ${JSON.stringify(payload)}`);
}

export function logDiffMemoryMark(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffMemory] js.${event} ${JSON.stringify(payload)}`);
}

export function sourcesMatch(left: DiffOpenSource | null, right: DiffOpenSource) {
  return left?.kind === right.kind && left.value === right.value;
}

export function logDiffLoadTiming(folderPath: string, timing: DiffLoadTiming) {
  logDiffOpenTiming("viewer.native.loaded", {
    copyFilesMs: Number(timing.copyFilesMs.toFixed(1)),
    copyInitialRowsMs: Number(timing.copyInitialRowsMs.toFixed(1)),
    createDiffMs: Number(timing.createDiffMs.toFixed(1)),
    diffMs: Number(timing.diffMs.toFixed(1)),
    documentMs: Number(timing.documentMs.toFixed(1)),
    fetchMs: Number(timing.fetchMs.toFixed(1)),
    fileCount: timing.fileCount,
    folderPath,
    nativeTotalMs: Number(timing.nativeTotalMs.toFixed(1)),
    openRepoMs: Number(timing.openRepoMs.toFixed(1)),
    rowCount: timing.rowCount,
    walkDiffMs: Number(timing.walkDiffMs.toFixed(1)),
  });
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isPermissionDeniedMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("operation not permitted")
    || normalizedMessage.includes("permission denied")
    || normalizedMessage.includes("eperm");
}

function getPermissionFolderLabel(source: DiffOpenSource | null, message: string) {
  let folderLabel = "this folder";
  const path = source?.kind === "folder" ? source.value : message;
  const protectedFolders = ["Documents", "Desktop", "Downloads"];
  const matchedFolder = protectedFolders.find((folder) => path.includes(`/${folder}/`) || path.endsWith(`/${folder}`));
  if (matchedFolder) {
    folderLabel = `your ${matchedFolder} folder`;
  }
  return folderLabel;
}

function createPermissionDeniedError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  const folderLabel = getPermissionFolderLabel(source, message);
  return {
    kind: "permission",
    message: `Access to ${folderLabel} was denied. Allow Legend Diff in System Settings, or choose a different folder.`,
    recoverySteps: [
      "Open Privacy & Security in System Settings.",
      "Go to Files and Folders.",
      "Allow Legend Diff to access the folder, then try opening it again.",
    ],
    source,
    title: "Legend Diff can't access this folder",
  };
}

export function createOpenError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  return source?.kind === "folder" && isPermissionDeniedMessage(message)
    ? createPermissionDeniedError(source, message)
    : {
      kind: "generic",
      message,
      source,
      title: source?.kind === "github" ? "Couldn't open URL" : "Couldn't open repository",
    };
}

export function createRefreshError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  return source?.kind === "folder" && isPermissionDeniedMessage(message)
    ? createPermissionDeniedError(source, message)
    : {
      kind: "generic",
      message,
      source,
      title: "Couldn't refresh changes",
    };
}

export function getDiffVisibleSourceModel(state: DiffViewerState, loadingSource: DiffOpenSource | null): DiffVisibleSourceModel {
  const visibleSource = state.source;
  const visibleFolderPath = visibleSource?.kind === "folder" ? visibleSource.value : null;
  const visibleSourceLabel = getDiffSourceLabel(visibleSource);
  const loadedFileCount = state.status === "loaded" ? state.files.length : 0;
  const toolbarSource = loadingSource ?? (loadedFileCount > 0 ? visibleSource : null);
  const showViewModeToolbar = toolbarSource !== null;
  const showSidebarControl = showViewModeToolbar;
  return {
    loadedFileCount,
    showSidebarControl,
    showViewModeToolbar,
    toolbarSource,
    visibleFolderPath,
    visibleSource,
    visibleSourceLabel,
  };
}

export function getDiffWindowToolbarModel({
  loadingSource,
  sidebarCollapsed,
  state,
  viewMode,
}: {
  loadingSource: DiffOpenSource | null;
  sidebarCollapsed: boolean;
  state: DiffViewerState;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
}): DiffWindowToolbarModel {
  const loadedFileCount = state.status === "loaded" ? state.files.length : 0;
  const toolbarSource = loadingSource ?? (loadedFileCount > 0 ? state.source : null);
  const showViewModeToolbar = toolbarSource !== null;

  return {
    showSidebarControl: showViewModeToolbar,
    showViewModeToolbar,
    sidebarCollapsed,
    source: toolbarSource ?? state.source,
    toolbarSource,
    viewMode,
  };
}

function diffOpenSourcesEqual(left: DiffOpenSource | null, right: DiffOpenSource | null) {
  return left === null
    ? right === null
    : right !== null &&
      left.kind === right.kind &&
      left.label === right.label &&
      left.value === right.value &&
      (left.kind !== "github" || (right.kind === "github" && left.diffUrl === right.diffUrl));
}

export function diffToolbarModelsEqual(left: DiffWindowToolbarModel | null, right: DiffWindowToolbarModel) {
  return left !== null &&
    left.showSidebarControl === right.showSidebarControl &&
    left.showViewModeToolbar === right.showViewModeToolbar &&
    left.sidebarCollapsed === right.sidebarCollapsed &&
    left.viewMode === right.viewMode &&
    diffOpenSourcesEqual(left.source, right.source) &&
    diffOpenSourcesEqual(left.toolbarSource, right.toolbarSource);
}

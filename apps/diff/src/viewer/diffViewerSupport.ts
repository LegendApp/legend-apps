import type { DiffLoadTiming } from "@legend-desktop/diff-parser";
import { getDiffSourceLabel, type DiffOpenSource } from "../diffFiles";
import { logDiffMemoryMark, logDiffOpenTiming } from "../diffInstrumentation";
import { getDiffViewModeSetting } from "../diffSettings";
import { diffViewerWindowTitle } from "../diffWindowTitle";
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
  hasUnsavedMergeDrafts: boolean;
  showSidebarControl: boolean;
  showViewModeToolbar: boolean;
  sidebarCollapsed: boolean;
  source: DiffOpenSource | null;
  title: string;
  toolbarSource: DiffOpenSource | null;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
};

export function sourcesMatch(left: DiffOpenSource | null, right: DiffOpenSource) {
  return left?.kind === right.kind && left.value === right.value;
}

export function logDiffLoadTiming(folderPath: string, timing: DiffLoadTiming) {
  logDiffOpenTiming("viewer.native.loaded", () => ({
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
  }));
}

export { logDiffMemoryMark, logDiffOpenTiming };

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

function getDiffUrlStatusCode(message: string) {
  const match = message.match(/Failed to fetch diff URL \((\d+)\)/i);
  return match ? Number(match[1]) : null;
}

function isNetworkUnavailableMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("not connected to the internet") ||
    normalizedMessage.includes("internet connection appears to be offline") ||
    normalizedMessage.includes("cannot find host") ||
    normalizedMessage.includes("could not connect") ||
    normalizedMessage.includes("network connection was lost") ||
    normalizedMessage.includes("server with the specified hostname could not be found");
}

function isTimeoutMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("timeout");
}

function createGithubDiffError(source: DiffOpenSource, message: string, refresh: boolean): DiffRecoverableError {
  const statusCode = getDiffUrlStatusCode(message);
  const externalUrl = source.value;
  const sourceLabel = getDiffSourceLabel(source);
  const retryStep = refresh ? "Try refreshing the diff again." : "Try opening the URL again.";

  if (statusCode === 401 || statusCode === 403) {
    return {
      externalUrl,
      externalUrlLabel: "Open in Browser",
      kind: "github-auth",
      message: `GitHub did not allow Legend Diff to download ${sourceLabel}. Private repository authentication is not available in Legend Diff yet.`,
      recoverySteps: [
        "Open the PR or commit in your browser and confirm you have access.",
        "Use a public GitHub PR or commit URL, or compare a local checkout instead.",
        retryStep,
      ],
      source,
      title: "GitHub access is required",
    };
  }

  if (statusCode === 404) {
    return {
      externalUrl,
      externalUrlLabel: "Open in Browser",
      kind: "github-unavailable",
      message: `GitHub could not find a downloadable diff for ${sourceLabel}. The PR or commit may be private, deleted, or mistyped.`,
      recoverySteps: [
        "Open the URL in your browser to check whether GitHub can load it.",
        "Confirm the URL points to a GitHub pull request or commit.",
        "For private repositories, compare a local checkout for now.",
      ],
      source,
      title: "GitHub diff isn't available",
    };
  }

  if (statusCode !== null) {
    return {
      externalUrl,
      externalUrlLabel: "Open in Browser",
      kind: "github-unavailable",
      message: `GitHub returned HTTP ${statusCode} while Legend Diff was downloading ${sourceLabel}.`,
      recoverySteps: [
        "Open the URL in your browser to check the current GitHub response.",
        retryStep,
      ],
      source,
      title: "GitHub couldn't provide the diff",
    };
  }

  if (isTimeoutMessage(message)) {
    return {
      externalUrl,
      externalUrlLabel: "Open in Browser",
      kind: "github-timeout",
      message: `Downloading ${sourceLabel} took too long. This can happen with very large diffs or a slow connection.`,
      recoverySteps: [
        retryStep,
        "Open the PR in your browser to check whether the diff is unusually large.",
        "For very large changes, compare a local checkout instead.",
      ],
      source,
      title: "GitHub diff download timed out",
    };
  }

  if (isNetworkUnavailableMessage(message)) {
    return {
      externalUrl,
      externalUrlLabel: "Open in Browser",
      kind: "github-network",
      message: `Legend Diff couldn't reach GitHub while opening ${sourceLabel}.`,
      recoverySteps: [
        "Check your internet connection.",
        "Open github.com in your browser to confirm it is reachable.",
        retryStep,
      ],
      source,
      title: "GitHub is unreachable",
    };
  }

  return {
    externalUrl,
    externalUrlLabel: "Open in Browser",
    kind: "generic",
    message,
    recoverySteps: [
      "Open the URL in your browser to check whether GitHub can load the diff.",
      retryStep,
    ],
    source,
    title: refresh ? "Couldn't refresh GitHub diff" : "Couldn't open GitHub diff",
  };
}

export function createOpenError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  if (source?.kind === "folder" && isPermissionDeniedMessage(message)) {
    return createPermissionDeniedError(source, message);
  }
  if (source?.kind === "github") {
    return createGithubDiffError(source, message, false);
  }
  return {
    kind: "generic",
    message,
    source,
    title: "Couldn't open repository",
  };
}

export function createRefreshError(source: DiffOpenSource | null, message: string): DiffRecoverableError {
  if (source?.kind === "folder" && isPermissionDeniedMessage(message)) {
    return createPermissionDeniedError(source, message);
  }
  if (source?.kind === "github") {
    return createGithubDiffError(source, message, true);
  }
  return {
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
  hasUnsavedMergeDrafts,
  sidebarCollapsed,
  state,
  viewMode,
}: {
  loadingSource: DiffOpenSource | null;
  hasUnsavedMergeDrafts: boolean;
  sidebarCollapsed: boolean;
  state: DiffViewerState;
  viewMode: ReturnType<typeof getDiffViewModeSetting>;
}): DiffWindowToolbarModel {
  const loadedFileCount = state.status === "loaded" ? state.files.length : 0;
  const toolbarSource = loadingSource ?? (loadedFileCount > 0 ? state.source : null);
  const showViewModeToolbar = toolbarSource !== null;
  const source = toolbarSource ?? state.source;
  const title = diffViewerWindowTitle({ hasUnsavedMergeDrafts, source });

  return {
    hasUnsavedMergeDrafts,
    showSidebarControl: showViewModeToolbar,
    showViewModeToolbar,
    sidebarCollapsed,
    source,
    title,
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
    left.hasUnsavedMergeDrafts === right.hasUnsavedMergeDrafts &&
    left.showViewModeToolbar === right.showViewModeToolbar &&
    left.sidebarCollapsed === right.sidebarCollapsed &&
    left.title === right.title &&
    left.viewMode === right.viewMode &&
    diffOpenSourcesEqual(left.source, right.source) &&
    diffOpenSourcesEqual(left.toolbarSource, right.toolbarSource);
}

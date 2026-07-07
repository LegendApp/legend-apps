import type { DiffOpenSource } from "../../diffFiles";
import type { DiffLoadedState, DiffViewerState } from "../diffViewerModel";
import {
  createOpenError,
  createRefreshError,
  diffToolbarModelsEqual,
  getDiffVisibleSourceModel,
  getDiffWindowToolbarModel,
  getErrorMessage,
  sourcesMatch,
} from "../diffViewerSupport";

const folderSource: DiffOpenSource = {
  kind: "folder",
  label: "repo",
  value: "/Users/jay/Documents/repo",
};

const githubSource: DiffOpenSource = {
  diffUrl: "https://github.com/owner/repo/pull/1.diff",
  kind: "github",
  label: "owner/repo#1",
  value: "https://github.com/owner/repo/pull/1",
};

function createLoadedState(source: DiffOpenSource = folderSource): DiffLoadedState {
  return {
    document: {} as never,
    files: [{
      additions: 1,
      deletions: 0,
      index: 0,
      isBinary: false,
      oldPath: "",
      path: "src/App.tsx",
      rowCount: 3,
      rowStart: 0,
      status: "modified",
    }],
    folderPath: source.value,
    initialRows: [],
    source,
    status: "loaded",
    timing: {
      copyFilesMs: 0,
      copyInitialRowsMs: 0,
      createDiffMs: 0,
      diffMs: 0,
      documentMs: 0,
      fetchMs: 0,
      fileCount: 1,
      nativeTotalMs: 0,
      openRepoMs: 0,
      rowCount: 3,
      walkDiffMs: 0,
    },
  };
}

function createNoChangesLoadedState(source: DiffOpenSource = folderSource): DiffLoadedState {
  const state = createLoadedState(source);
  return {
    ...state,
    files: [],
    timing: {
      ...state.timing,
      fileCount: 0,
      rowCount: 0,
    },
  };
}

describe("diffViewerSupport", () => {
  it("compares open sources by kind and value", () => {
    expect(sourcesMatch(folderSource, { ...folderSource, label: "other" })).toBe(true);
    expect(sourcesMatch(folderSource, githubSource)).toBe(false);
    expect(sourcesMatch(null, folderSource)).toBe(false);
  });

  it("normalizes thrown values to messages", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("plain")).toBe("plain");
  });

  it("turns permission failures into recoverable permission errors", () => {
    expect(createOpenError({
      kind: "folder",
      label: "Documents",
      value: "/Users/jay/Documents/project",
    }, "operation not permitted")).toMatchObject({
      kind: "permission",
      message: "Access to your Documents folder was denied. Allow Legend Diff in System Settings, or choose a different folder.",
      title: "Legend Diff can't access this folder",
    });
    expect(createRefreshError(folderSource, "EPERM")).toMatchObject({
      kind: "permission",
      title: "Legend Diff can't access this folder",
    });
  });

  it("uses a generic open title for repository failures", () => {
    expect(createOpenError(folderSource, "not a repository")).toMatchObject({
      kind: "generic",
      title: "Couldn't open repository",
    });
  });

  it("turns GitHub auth failures into actionable access errors", () => {
    expect(createOpenError(githubSource, "Failed to fetch diff URL (403)")).toMatchObject({
      externalUrl: githubSource.value,
      externalUrlLabel: "Open in Browser",
      kind: "github-auth",
      message: "GitHub did not allow Legend Diff to download owner/repo#1. Private repository authentication is not available in Legend Diff yet.",
      recoverySteps: [
        "Open the PR or commit in your browser and confirm you have access.",
        "Use a public GitHub PR or commit URL, or compare a local checkout instead.",
        "Try opening the URL again.",
      ],
      title: "GitHub access is required",
    });
  });

  it("turns missing GitHub diffs into private-or-missing errors", () => {
    expect(createOpenError(githubSource, "Failed to fetch diff URL (404)")).toMatchObject({
      kind: "github-unavailable",
      message: "GitHub could not find a downloadable diff for owner/repo#1. The PR or commit may be private, deleted, or mistyped.",
      recoverySteps: [
        "Open the URL in your browser to check whether GitHub can load it.",
        "Confirm the URL points to a GitHub pull request or commit.",
        "For private repositories, compare a local checkout for now.",
      ],
      title: "GitHub diff isn't available",
    });
  });

  it("turns unavailable networks into connection errors", () => {
    expect(createOpenError(githubSource, "Failed to fetch diff URL: The Internet connection appears to be offline.")).toMatchObject({
      kind: "github-network",
      message: "Legend Diff couldn't reach GitHub while opening owner/repo#1.",
      recoverySteps: [
        "Check your internet connection.",
        "Open github.com in your browser to confirm it is reachable.",
        "Try opening the URL again.",
      ],
      title: "GitHub is unreachable",
    });
  });

  it("turns timeout failures into large-download guidance", () => {
    expect(createOpenError(githubSource, "Failed to fetch diff URL: The request timed out.")).toMatchObject({
      kind: "github-timeout",
      message: "Downloading owner/repo#1 took too long. This can happen with very large diffs or a slow connection.",
      recoverySteps: [
        "Try opening the URL again.",
        "Open the PR in your browser to check whether the diff is unusually large.",
        "For very large changes, compare a local checkout instead.",
      ],
      title: "GitHub diff download timed out",
    });
  });

  it("uses refresh wording for GitHub refresh failures", () => {
    expect(createRefreshError(githubSource, "Failed to fetch diff URL (500)")).toMatchObject({
      kind: "github-unavailable",
      recoverySteps: [
        "Open the URL in your browser to check the current GitHub response.",
        "Try refreshing the diff again.",
      ],
      title: "GitHub couldn't provide the diff",
    });
  });

  it("shows toolbar controls while loading or while a source is loaded", () => {
    const emptyState: DiffViewerState = { folderPath: null, source: null, status: "empty" };
    expect(getDiffVisibleSourceModel(emptyState, null)).toMatchObject({
      loadedFileCount: 0,
      showSidebarControl: false,
      showViewModeToolbar: false,
      toolbarSource: null,
      visibleSourceLabel: "Legend Diff",
    });

    expect(getDiffVisibleSourceModel(emptyState, folderSource)).toMatchObject({
      showSidebarControl: true,
      showViewModeToolbar: true,
      toolbarSource: folderSource,
    });

    expect(getDiffVisibleSourceModel(createLoadedState(), null)).toMatchObject({
      loadedFileCount: 1,
      showSidebarControl: true,
      toolbarSource: folderSource,
      visibleFolderPath: folderSource.value,
      visibleSourceLabel: "repo",
    });

    expect(getDiffVisibleSourceModel(createNoChangesLoadedState(), null)).toMatchObject({
      loadedFileCount: 0,
      showSidebarControl: true,
      showViewModeToolbar: true,
      toolbarSource: folderSource,
      visibleFolderPath: folderSource.value,
      visibleSourceLabel: "repo",
    });
  });

  it("builds comparable toolbar models", () => {
    const state = createLoadedState();
    const model = getDiffWindowToolbarModel({
      hasUnsavedMergeDrafts: false,
      loadingSource: null,
      sidebarCollapsed: false,
      state,
      viewMode: "unified",
    });

    expect(model.title.trim()).toBe("repo");
    expect(diffToolbarModelsEqual(model, { ...model })).toBe(true);
    expect(diffToolbarModelsEqual(model, { ...model, hasUnsavedMergeDrafts: true })).toBe(false);
    expect(diffToolbarModelsEqual(model, { ...model, sidebarCollapsed: true })).toBe(false);
    expect(diffToolbarModelsEqual(model, { ...model, title: "" })).toBe(false);
    expect(diffToolbarModelsEqual(model, { ...model, viewMode: "blocks" })).toBe(false);
  });

  it("uses the app window title for the empty start screen", () => {
    const emptyState: DiffViewerState = { folderPath: null, source: null, status: "empty" };
    expect(getDiffWindowToolbarModel({
      hasUnsavedMergeDrafts: false,
      loadingSource: null,
      sidebarCollapsed: false,
      state: emptyState,
      viewMode: "unified",
    })).toMatchObject({
      source: null,
      title: "Legend Diff  ",
      toolbarSource: null,
    });

    expect(getDiffWindowToolbarModel({
      hasUnsavedMergeDrafts: false,
      loadingSource: folderSource,
      sidebarCollapsed: false,
      state: emptyState,
      viewMode: "unified",
    })).toMatchObject({
      source: folderSource,
      title: "repo  ",
      toolbarSource: folderSource,
    });
  });

  it("keeps toolbar models available for loaded sources with no files", () => {
    const model = getDiffWindowToolbarModel({
      hasUnsavedMergeDrafts: false,
      loadingSource: null,
      sidebarCollapsed: false,
      state: createNoChangesLoadedState(),
      viewMode: "unified",
    });

    expect(model).toMatchObject({
      showSidebarControl: true,
      showViewModeToolbar: true,
      source: folderSource,
      toolbarSource: folderSource,
    });
  });
});

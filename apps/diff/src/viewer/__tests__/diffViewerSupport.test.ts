import type { DiffOpenSource } from "../../diffFiles";
import type { DiffViewerState } from "../diffViewerModel";
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

function createLoadedState(source: DiffOpenSource = folderSource): DiffViewerState {
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

  it("uses generic open titles for repository and URL failures", () => {
    expect(createOpenError(folderSource, "not a repository")).toMatchObject({
      kind: "generic",
      title: "Couldn't open repository",
    });
    expect(createOpenError(githubSource, "404")).toMatchObject({
      kind: "generic",
      title: "Couldn't open URL",
    });
    expect(createRefreshError(githubSource, "network")).toMatchObject({
      kind: "generic",
      title: "Couldn't refresh changes",
    });
  });

  it("shows toolbar controls only while loading or when loaded files exist", () => {
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

    expect(diffToolbarModelsEqual(model, { ...model })).toBe(true);
    expect(diffToolbarModelsEqual(model, { ...model, hasUnsavedMergeDrafts: true })).toBe(false);
    expect(diffToolbarModelsEqual(model, { ...model, sidebarCollapsed: true })).toBe(false);
    expect(diffToolbarModelsEqual(model, { ...model, viewMode: "blocks" })).toBe(false);
  });
});

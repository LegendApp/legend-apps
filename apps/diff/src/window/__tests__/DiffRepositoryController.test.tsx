import { watchDirectories, type DirectoryChangeEvent } from "@legend-apps/file-system-watcher";
import { observable } from "@legendapp/state";
import { act, render } from "@testing-library/react-native";
import { createDiffGitSource, type DiffOpenSource } from "../../diffFiles";
import { diffSettings$ } from "../../diffSettings";
import { getGitService, GitIndexLockedError, type GitRepoState, type GitService } from "../../git/GitService";
import { emptyDiffViewerState, type DiffViewerState } from "../../viewer/diffViewerModel";
import { DiffRepositoryController } from "../DiffRepositoryController";

jest.mock("@legend-apps/file-system-watcher", () => ({ watchDirectories: jest.fn() }));
jest.mock("../../git/GitService", () => ({ ...jest.requireActual("../../git/GitService"), getGitService: jest.fn() }));
jest.mock("../../viewer/diffViewerModel", () => ({
  ...jest.requireActual("../../viewer/diffViewerModel"),
  useDiffViewerModel: () => mockModel,
}));
const mockModel = {
  state$: observable<DiffViewerState>(emptyDiffViewerState),
  loadingSource$: observable<DiffOpenSource | null>(null),
  setDocumentErrorValue: jest.fn(),
};
const normal: GitRepoState = {
  gitDir: "/repo/.git", branch: "main", detachedCommit: null, detached: false,
  merging: false, rebasing: null, cherryPicking: false, reverting: false, bisecting: false,
};
let mockDocumentId = 0;
function loaded(source: DiffOpenSource) {
  return { status: "loaded", source, document: { documentId: ++mockDocumentId }, files: [], initialRows: [] } as unknown as DiffViewerState;
}
function setup(source: DiffOpenSource) {
  mockModel.state$.set(loaded(source));
  let notify!: (event: DirectoryChangeEvent) => void;
  const remove = jest.fn();
  jest.mocked(watchDirectories).mockImplementation((_directories, listener) => { notify = listener; return { remove }; });
  const repoState = jest.fn(async () => normal);
  const watchLocations = jest.fn(async (): Promise<Awaited<ReturnType<GitService["watchLocations"]>>> => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] }));
  jest.mocked(getGitService).mockReturnValue({ repoState, watchLocations } as unknown as GitService);
  const loadSource = jest.fn(async () => {});
  const onBannerChange = jest.fn();
  const props = { loadSource, onBannerChange, suppressReloadUntilRef: { current: 0 } };
  return { props, remove, loadSource, onBannerChange, repoState, watchLocations, notify: () => notify({ path: "/repo", filePath: "/repo/file", type: "change", contentChanged: true }) };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  diffSettings$.autoRefresh.set(true);
  mockModel.loadingSource$.set(null);
});
afterEach(() => jest.useRealTimers());

it.each([
  { kind: "folder", value: "/repo", label: "repo" } as DiffOpenSource,
  { kind: "git", cwd: "/repo", args: ["--cached"], value: "/repo", label: "repo" } as DiffOpenSource,
  createDiffGitSource("/repo", { kind: "index-vs-workdir" }),
  createDiffGitSource("/repo", { kind: "head-vs-index" }),
])("refreshes $kind through the loader and keeps one watcher across document replacement", async (source) => {
  const test = setup(source);
  const screen = await render(<DiffRepositoryController {...test.props} />);
  expect(watchDirectories).toHaveBeenCalledTimes(1);
  test.repoState.mockResolvedValue({ ...normal, merging: true });
  test.notify();
  test.notify();
  await act(() => jest.advanceTimersByTimeAsync(300));
  expect(test.loadSource).toHaveBeenCalledTimes(1);
  expect(test.loadSource).toHaveBeenCalledWith(source, { force: true, reason: "watch" });
  expect(test.onBannerChange).toHaveBeenLastCalledWith("Merging — main");
  await act(() => { mockModel.state$.set(loaded(source)); });
  expect(watchDirectories).toHaveBeenCalledTimes(1);
  expect(test.watchLocations).toHaveBeenCalledTimes(1);
  await screen.unmount();
  expect(test.remove).toHaveBeenCalledTimes(1);
  test.notify();
  await act(() => jest.advanceTimersByTimeAsync(600));
  expect(test.loadSource).toHaveBeenCalledTimes(1);
});

it("checks the index lock before loading and retries without a second event", async () => {
  const test = setup(createDiffGitSource("/repo", { kind: "index-vs-workdir" }));
  const screen = await render(<DiffRepositoryController {...test.props} />);
  test.repoState.mockRejectedValueOnce(new GitIndexLockedError("/repo/.git/index.lock"));
  test.notify();
  await act(() => jest.advanceTimersByTimeAsync(300));
  expect(test.loadSource).not.toHaveBeenCalled();
  expect(mockModel.setDocumentErrorValue).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTimeAsync(300));
  expect(test.loadSource).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

it("stops watching when autoRefresh is disabled and still updates the banner on manual reload", async () => {
  const source = createDiffGitSource("/repo", { kind: "head-vs-index" });
  const test = setup(source);
  const screen = await render(<DiffRepositoryController {...test.props} />);
  await act(() => { diffSettings$.autoRefresh.set(false); });
  expect(test.remove).toHaveBeenCalledTimes(1);
  test.repoState.mockResolvedValue({ ...normal, reverting: true });
  await act(() => { mockModel.state$.set(loaded(source)); });
  expect(test.onBannerChange).toHaveBeenLastCalledWith("Reverting — main");
  expect(watchDirectories).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

it.each([
  createDiffGitSource("/repo", { kind: "commit", sha: "abc" }),
  createDiffGitSource("/repo", { kind: "range", range: "base..head" }),
  { kind: "diffFile", value: "/repo/file.patch", label: "file.patch" } as DiffOpenSource,
])("does not watch a fixed $kind source", async (source) => {
  const test = setup(source);
  const screen = await render(<DiffRepositoryController {...test.props} />);
  expect(watchDirectories).not.toHaveBeenCalled();
  await screen.unmount();
});

it("does not attach an asynchronously discovered watcher after the window closes", async () => {
  const test = setup(createDiffGitSource("/repo", { kind: "index-vs-workdir" }));
  let finish!: (value: Awaited<ReturnType<GitService["watchLocations"]>>) => void;
  test.watchLocations.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const screen = await render(<DiffRepositoryController {...test.props} />);
  await screen.unmount();
  await act(async () => { finish({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] }); });
  expect(watchDirectories).not.toHaveBeenCalled();
});

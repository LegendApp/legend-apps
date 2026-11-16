import { loadUnifiedDiff, type DiffLoadResult } from "@legend-apps/diff-parser";
import { observable } from "@legendapp/state";
import { act, renderHook } from "@testing-library/react-native";
import { createDiffGitSource } from "../../diffFiles";
import { GitIndexLockedError } from "../../git/GitService";
import { readDiffGitSource } from "../../git/diffGitSource";
import { emptyDiffViewerState, type DiffViewerState } from "../../viewer/diffViewerModel";
import { useDiffSourceLoader } from "../useDiffSourceLoader";

jest.mock("../../git/diffGitSource", () => ({ readDiffGitSource: jest.fn() }));
jest.mock("../../diffAppMetadata", () => ({ addRecentDiffSource: jest.fn(), updateSavedDiffWindowSource: jest.fn() }));
jest.mock("@legendapp/spark/app/documents", () => ({ noteRecentDocument: jest.fn() }));
jest.mock("@legendapp/spark/windows", () => ({ useWindowId: jest.fn() }));

function loaderOptions(): Parameters<typeof useDiffSourceLoader>[0] {
  const state$ = observable<DiffViewerState>(emptyDiffViewerState);
  return {
    state$,
    mergeDraftsRef: { current: new Map() },
    mergeResolveQueuesRef: { current: new Map() },
    sourceTransitionInFlightRef: { current: false },
    prepareMergeDraftsForTransitionRef: { current: async () => true },
    loadRequestIdRef: { current: 0 },
    activeProgressiveSessionRef: { current: null },
    windowIdentifier: "test",
    nativeDiffRows: false,
    mergeDraftsSourceKeyRef: { current: null },
    loadedCacheRef: { current: new Map() },
    loadTraceRef: { current: null },
    setLoadProgressValue: jest.fn(),
    setLoadingSourceValue: jest.fn(),
    setLoadStatisticsValue: jest.fn(),
    setDocumentErrorValue: jest.fn(),
    setOpenErrorValue: jest.fn(),
    setViewerState: jest.fn((next) => state$.set(next)),
    setMergeStateValue: jest.fn(),
    preserveViewStateRef: { current: null },
    listRef: { current: null },
    collapsedFileIndexes$: observable<Set<number>>(new Set()),
    activeFileIndex$: observable<number | null>(null),
  };
}

const loaded = { document: { rowCount: 1, cancelTokenizationRequests: jest.fn(), releaseNativeResources: jest.fn() }, files: [], initialRows: [], timing: {} } as unknown as DiffLoadResult;
const originalAnimationFrame = global.requestAnimationFrame;
beforeEach(() => {
  jest.clearAllMocks();
  global.requestAnimationFrame = jest.fn(() => 0);
  jest.mocked(readDiffGitSource).mockResolvedValue("diff --git a/file b/file\n");
  jest.mocked(loadUnifiedDiff).mockResolvedValue(loaded);
});
afterEach(() => { global.requestAnimationFrame = originalAnimationFrame; });

it.each([
  { kind: "index-vs-workdir" as const },
  { kind: "head-vs-index" as const },
  { kind: "commit" as const, sha: "abc123" },
  { kind: "range" as const, range: "base...head" },
])("routes $kind text into the existing native parser and publishes its document", async (comparison) => {
  const options = loaderOptions();
  const { result, unmount } = await renderHook(() => useDiffSourceLoader(options));
  const source = createDiffGitSource("/repo", comparison);
  await act(() => result.current(source));
  expect(readDiffGitSource).toHaveBeenCalledWith(source, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(loadUnifiedDiff).toHaveBeenCalledWith("diff --git a/file b/file\n", source.label, expect.any(Number), expect.any(Boolean));
  expect(options.state$.peek()).toMatchObject({ status: "loaded", source, document: loaded.document });
  await unmount();
});

it("aborts superseded Git loads, discards their late results, and aborts on unmount", async () => {
  const options = loaderOptions();
  const { result, unmount } = await renderHook(() => useDiffSourceLoader(options));
  let finishFirst!: (value: string) => void;
  jest.mocked(readDiffGitSource).mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  const firstSource = createDiffGitSource("/repo", { kind: "index-vs-workdir" });
  let first!: Promise<void>;
  await act(() => { first = result.current(firstSource); });
  const firstSignal = jest.mocked(readDiffGitSource).mock.calls[0]![1]!.signal!;
  const secondSource = createDiffGitSource("/repo", { kind: "head-vs-index" });
  await act(() => result.current(secondSource));
  expect(firstSignal.aborted).toBe(true);
  await act(async () => { finishFirst("late patch"); await first; });
  expect(options.state$.peek()).toMatchObject({ status: "loaded", source: secondSource });
  expect(options.setOpenErrorValue).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  jest.mocked(readDiffGitSource).mockImplementationOnce((_source, settings) => new Promise((_resolve, reject) => {
    settings?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
  }));
  let last!: Promise<void>;
  await act(() => { last = result.current(firstSource); });
  const lastSignal = jest.mocked(readDiffGitSource).mock.calls.at(-1)![1]!.signal!;
  await unmount();
  expect(lastSignal.aborted).toBe(true);
  await last;
});

it("keeps the cached document alive until a watch replacement is ready and remaps view state by path", async () => {
  const options = loaderOptions();
  const first = {
    ...loaded,
    document: { ...loaded.document, documentId: 1 },
    files: [{ index: 0, path: "a.ts", oldPath: "a.ts" }, { index: 1, path: "z.ts", oldPath: "z.ts" }],
  } as DiffLoadResult;
  jest.mocked(loadUnifiedDiff).mockResolvedValueOnce(first);
  const { result, unmount } = await renderHook(() => useDiffSourceLoader(options));
  const source = createDiffGitSource("/repo", { kind: "index-vs-workdir" });
  await act(() => result.current(source));
  options.activeFileIndex$.set(1);
  options.collapsedFileIndexes$.set(new Set([1]));
  options.listRef.current = { getState: () => ({ scroll: 640 }) } as NonNullable<typeof options.listRef.current>;
  jest.clearAllMocks();
  let finish!: (value: DiffLoadResult) => void;
  jest.mocked(loadUnifiedDiff).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let refresh!: Promise<void>;
  await act(() => { refresh = result.current(source, { force: true, reason: "watch" }); });
  expect(options.state$.peek()).toMatchObject({ status: "loaded", document: first.document });
  expect(first.document.releaseNativeResources).not.toHaveBeenCalled();
  expect(options.setLoadingSourceValue).not.toHaveBeenCalled();
  expect(options.setViewerState).not.toHaveBeenCalled();
  const replacement = {
    ...loaded,
    document: { ...loaded.document, documentId: 2 },
    files: [{ index: 0, path: "0-new.ts", oldPath: "0-new.ts" }, { index: 1, path: "a.ts", oldPath: "a.ts" }, { index: 2, path: "renamed-z.ts", oldPath: "z.ts" }],
  } as DiffLoadResult;
  await act(async () => { finish(replacement); await refresh; });
  expect(options.state$.peek()).toMatchObject({ document: replacement.document });
  expect(options.preserveViewStateRef.current).toEqual({ activeFilePath: "z.ts", scrollOffset: 640 });
  expect(options.collapsedFileIndexes$.peek()).toEqual(new Set([2]));
  expect(first.document.releaseNativeResources).not.toHaveBeenCalled();
  await unmount();
});

it("keeps the visible document on refresh failure and lets a lock race retry without an error banner", async () => {
  const options = loaderOptions();
  const { result, unmount } = await renderHook(() => useDiffSourceLoader(options));
  const source = createDiffGitSource("/repo", { kind: "head-vs-index" });
  await act(() => result.current(source));
  jest.clearAllMocks();
  jest.mocked(readDiffGitSource).mockRejectedValueOnce(new Error("read failed"));
  await act(() => result.current(source, { force: true, reason: "watch" }));
  expect(options.state$.peek()).toMatchObject({ document: loaded.document });
  expect(loaded.document.releaseNativeResources).not.toHaveBeenCalled();
  expect(options.setDocumentErrorValue).toHaveBeenCalledWith(expect.objectContaining({ message: "read failed" }));
  jest.clearAllMocks();
  jest.mocked(readDiffGitSource).mockRejectedValueOnce(new GitIndexLockedError("/repo/.git/index.lock"));
  await act(async () => {
    await expect(result.current(source, { force: true, reason: "watch" })).rejects.toMatchObject({ code: "index-locked" });
  });
  expect(options.setDocumentErrorValue).not.toHaveBeenCalled();
  expect(options.state$.peek()).toMatchObject({ document: loaded.document });
  await unmount();
});

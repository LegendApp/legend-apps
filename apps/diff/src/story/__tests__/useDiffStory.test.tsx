import { getAICommandAvailability } from "@legendapp/spark/ai";
import { observable } from "@legendapp/state";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { DiffViewerModel, DiffViewerState } from "../../viewer/diffViewerModel";
import { storyRunner } from "../storyRunner";
import { storyStore } from "../storyStore";
import { useDiffStory } from "../useDiffStory";
import { fixtureDocument, fixtureResult, repoSource } from "./storyFixtures";

jest.mock("@legendapp/spark/ai", () => ({ getAICommandAvailability: jest.fn(async () => ({ codex: true, claude: false })), selectPreferredAITool: (available: { codex: boolean; claude: boolean }) => available.codex ? "codex" : available.claude ? "claude" : undefined }));
jest.mock("../../git/GitService", () => ({ getGitService: () => ({ watchLocations: async () => ({ root: "/repo" }) }) }));
jest.mock("@legend-apps/storage", () => ({ ...jest.requireActual("@legend-apps/storage"), createStorage: () => ({
  read: (path: string) => mockStorage.get(path), write: (path: string, value: string) => mockStorage.set(path, value),
}) }));
const mockStorage = new Map<string, string>();
const mockRunner = { run: jest.spyOn(storyRunner, "run"), cancel: jest.spyOn(storyRunner, "cancel") };
function loaded(text = "after") { return { status: "loaded", source: repoSource, document: fixtureDocument({ text }), loadComplete: true } as unknown as DiffViewerState; }
function setup() {
  const state$ = observable(loaded()) as DiffViewerModel["state$"];
  return { state$, cache: storyStore };
}
beforeEach(() => {
  jest.clearAllMocks(); mockStorage.clear();
  mockRunner.run.mockResolvedValue(fixtureResult());
  jest.mocked(getAICommandAvailability).mockResolvedValue({ codex: true, claude: false, preferredTool: "codex" });
});

it("does not generate on load or tab selection, and enables a repository only after its notice", async () => {
  const test = setup();
  const hook = await renderHook(() => useDiffStory("first", test.state$));
  expect(mockRunner.run).not.toHaveBeenCalled();
  expect(getAICommandAvailability).not.toHaveBeenCalled();
  await act(() => hook.result.current.setTab("story"));
  await waitFor(() => expect(hook.result.current.request).not.toBeNull());
  expect(mockRunner.run).not.toHaveBeenCalled();
  await act(() => hook.result.current.openStory());
  expect(hook.result.current.notice?.tool).toBe("codex");
  await act(() => hook.result.current.consent(false));
  expect(mockRunner.run).not.toHaveBeenCalled();
  await act(() => hook.result.current.openStory());
  await act(() => hook.result.current.consent(true));
  await waitFor(() => expect(hook.result.current.story.status).toBe("done"));
  expect(test.cache.isEnabled("repo:/repo", "codex")).toBe(true);
  expect(mockRunner.run).toHaveBeenCalledTimes(1);
  await act(() => hook.result.current.openStory());
  expect(mockRunner.run).toHaveBeenCalledTimes(1);
  await act(() => hook.result.current.disable());
  expect(test.cache.isEnabled("repo:/repo", "codex")).toBe(false);
  await hook.unmount();
  expect(storyStore.state$.peek()).toEqual({});
});

it("the toolbar opens and requests generation after preparing the complete diff; refresh retains a stale snapshot", async () => {
  const test = setup();
  test.cache.setEnabled("repo:/repo", "codex", true);
  const hook = await renderHook(() => useDiffStory("second", test.state$));
  await act(() => hook.result.current.openStory());
  await waitFor(() => expect(hook.result.current.story.status).toBe("done"));
  const original = hook.result.current.story.input;
  await act(() => test.state$.set(loaded("changed")));
  await waitFor(() => expect(hook.result.current.story.status).toBe("stale"));
  expect(hook.result.current.story.input?.diffHash).toBe(original?.diffHash);
  expect(mockRunner.run).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it("rejects incomplete documents at the command boundary", async () => {
  const test = setup();
  test.state$.set({ ...loaded(), loadComplete: false } as DiffViewerState);
  const hook = await renderHook(() => useDiffStory("third", test.state$));
  expect(hook.result.current.openStory()).toBe(false);
  expect(getAICommandAvailability).not.toHaveBeenCalled();
  await hook.unmount();
});

it("opens cached stories even if neither CLI is currently installed", async () => {
  const test = setup();
  test.cache.setEnabled("repo:/repo", "codex", true);
  const first = await renderHook(() => useDiffStory("cached-first", test.state$));
  await act(() => first.result.current.openStory());
  await waitFor(() => expect(first.result.current.story.status).toBe("done"));
  await first.unmount();
  jest.mocked(getAICommandAvailability).mockResolvedValue({ codex: false, claude: false, preferredTool: null });
  const second = await renderHook(() => useDiffStory("cached-second", test.state$));
  await act(() => second.result.current.openStory());
  await waitFor(() => expect(second.result.current.story.status).toBe("done"));
  expect(mockRunner.run).toHaveBeenCalledTimes(1);
  await second.unmount();
});

it("defers story indexing and cache reads while refreshed Files are visible", async () => {
  const test = setup();
  test.cache.setEnabled("repo:/repo", "codex", true);
  const hook = await renderHook(() => useDiffStory("deferred", test.state$));
  await act(() => hook.result.current.openStory());
  await waitFor(() => expect(hook.result.current.story.status).toBe("done"));
  await act(() => hook.result.current.setTab("files"));
  jest.mocked(getAICommandAvailability).mockClear();
  const next = loaded("changed") as Extract<DiffViewerState, { status: "loaded" }>;
  const readRows = jest.spyOn(next.document, "getPlainRows");
  await act(() => test.state$.set(next));
  expect(readRows).not.toHaveBeenCalled();
  expect(getAICommandAvailability).not.toHaveBeenCalled();
  await act(() => hook.result.current.setTab("story"));
  await waitFor(() => expect(hook.result.current.story.status).toBe("stale"));
  expect(readRows).toHaveBeenCalled();
  expect(mockRunner.run).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

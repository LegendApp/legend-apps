import { getAICommandAvailability } from "@legendapp/spark/ai";
import { observable } from "@legendapp/state";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { DiffViewerModel, DiffViewerState } from "../../viewer/diffViewerModel";
import { storyRunner } from "../storyRunner";
import { storyStore } from "../storyStore";
import { useDiffStory } from "../useDiffStory";
import { changeStorySkill, builtInStorySkills } from "../storySkill";
import { diffSkillApprovals$ } from "../../diffSettings";
import { skillPreviewTargets } from "../skillRuntime";
import { fixtureDocument, fixtureResult, repoSource } from "./storyFixtures";

jest.mock("@legendapp/spark/ai", () => ({ getAICommandAvailability: jest.fn(async () => ({ codex: true, claude: false })), selectPreferredAITool: (available: { codex: boolean; claude: boolean }) => available.codex ? "codex" : available.claude ? "claude" : undefined }));
jest.mock("../../git/GitService", () => ({ getGitService: () => ({ watchLocations: async () => ({ root: "/repo" }) }) }));
jest.mock("@legend-apps/storage", () => ({ ...jest.requireActual("@legend-apps/storage"), createStorage: () => ({
  read: (path: string) => mockStorage.get(path), write: (path: string, value: string) => mockStorage.set(path, value),
}) }));

jest.mock("../skillRuntime", () => {
  const { observable } = require("@legendapp/state");
  const { useValue } = require("@legendapp/state/react");
  return { skillEditorContext$: observable({}), skillViewerContexts$: observable({}), skillPreviewTargets: new Map(),
    useSkillLibrary: () => ({ state: useValue(mockSkillState$) }) };
});
const mockSkillState$ = observable({ entries: builtInStorySkills, active: builtInStorySkills, errors: [] as string[], ready: true });

const mockStorage = new Map<string, string>();
const mockRunner = { run: jest.spyOn(storyRunner, "run"), cancel: jest.spyOn(storyRunner, "cancel") };
function loaded(text = "after") { return { status: "loaded", source: repoSource, document: fixtureDocument({ text }), loadComplete: true } as unknown as DiffViewerState; }
function setup() {
  const state$ = observable(loaded()) as DiffViewerModel["state$"];
  return { state$, cache: storyStore };
}
beforeEach(() => {
  jest.clearAllMocks(); mockStorage.clear(); diffSkillApprovals$.set({});
  mockSkillState$.set({ entries: builtInStorySkills, active: builtInStorySkills, errors: [], ready: true });
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

it("loads a selected skill's cache and uses its tool, then reloads changed prompt hashes", async () => {
  const test = setup();
  const fixed = { ...changeStorySkill, name: "focused-story", tool: "claude" as const, layer: "user" as const };
  mockSkillState$.active.set([changeStorySkill, fixed]);
  const hook = await renderHook(() => useDiffStory("picker", test.state$));
  await act(() => hook.result.current.setTab("story"));
  await waitFor(() => expect(hook.result.current.request).not.toBeNull());
  await act(() => hook.result.current.selectSkill(fixed.name));
  await waitFor(() => expect(hook.result.current.request?.skill?.name).toBe(fixed.name));
  expect(hook.result.current.tool).toBe("claude");
  await act(() => hook.result.current.setTool("codex"));
  expect(hook.result.current.request?.tool).toBe("claude");
  await act(() => hook.result.current.generate(true));
  expect(hook.result.current.notice?.tool).toBe("claude");
  await act(() => hook.result.current.consent(false));
  const edited = { ...fixed, hash: "new-hash", body: "Edited prompt" };
  await act(() => mockSkillState$.active.set([changeStorySkill, edited]));
  await waitFor(() => expect(hook.result.current.request?.skill?.hash).toBe("new-hash"));
  expect(mockRunner.run).not.toHaveBeenCalled();
  await hook.unmount();
});
it("shows repo trust before provider consent, and requires new approval after watcher reload", async () => {
  const test = setup();
  const repoSkill = { ...changeStorySkill, layer: "repo" as const, repoRoot: "/repo", path: "/repo/.legend-diff/skills/story.md" };
  mockSkillState$.active.set([repoSkill]);
  const hook = await renderHook(() => useDiffStory("trust", test.state$));
  await act(() => hook.result.current.openStory());
  await waitFor(() => expect(hook.result.current.trustNotice?.skill?.hash).toBe(repoSkill.hash));
  expect(hook.result.current.notice).toBeNull(); expect(mockRunner.run).not.toHaveBeenCalled();
  await act(() => hook.result.current.approve(false));
  expect(mockRunner.run).not.toHaveBeenCalled();
  await act(() => hook.result.current.generate(true));
  await act(() => hook.result.current.approve(true));
  expect(hook.result.current.notice?.tool).toBe("codex");
  await act(() => hook.result.current.consent(true));
  await waitFor(() => expect(hook.result.current.story.status).toBe("done"));
  await act(() => mockSkillState$.active.set([{ ...repoSkill, hash: "edited-hash" }]));
  await waitFor(() => expect(hook.result.current.request?.skill?.hash).toBe("edited-hash"));
  await act(() => hook.result.current.generate(true));
  expect(hook.result.current.trustNotice?.skill?.hash).toBe("edited-hash");
  expect(mockRunner.run).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
it("tries an unsaved prompt in a viewer preview and restores the saved story on dismissal", async () => {
  const test = setup(); test.cache.setEnabled("repo:/repo", "codex", true);
  const hook = await renderHook(() => useDiffStory("preview", test.state$));
  await act(() => hook.result.current.openStory());
  await waitFor(() => expect(hook.result.current.story.status).toBe("done"));
  const original = hook.result.current.story.result;
  mockRunner.run.mockResolvedValueOnce({ ...fixtureResult(), story: { ...fixtureResult().story, title: "Unsaved preview" } });
  await act(() => skillPreviewTargets.get("preview")!({ ...changeStorySkill, body: "An unsaved prompt" }));
  await waitFor(() => expect(hook.result.current.story.result?.story.title).toBe("Unsaved preview"));
  expect(hook.result.current.preview).toBe(true);
  expect(storyStore.state("preview").result.peek()).toEqual(original);
  await act(() => hook.result.current.dismissPreview());
  expect(hook.result.current.preview).toBe(false);
  expect(hook.result.current.story.result).toEqual(original);
  await hook.unmount(); expect(skillPreviewTargets.has("preview")).toBe(false);
});

it("keeps streamed byte updates inside the Story pane without rerendering the viewer controller", async () => {
  const test = setup(); test.cache.setEnabled("repo:/repo", "codex", true);
  let renders = 0;
  const hook = await renderHook(() => { renders++; return useDiffStory("stream", test.state$); });
  await act(() => hook.result.current.openStory());
  await waitFor(() => expect(hook.result.current.story.status).toBe("done"));
  await act(() => storyStore.state("stream").assign({ status: "progress", progress: { phase: "output", receivedBytes: 1 } }));
  const before = renders;
  await act(() => storyStore.state("stream").progress.set({ phase: "output", receivedBytes: 100 }));
  expect(renders).toBe(before);
  expect(hook.result.current.story$.progress.receivedBytes.peek()).toBe(100);
  await hook.unmount();
});

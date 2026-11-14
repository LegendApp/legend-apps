import { getAICommandAvailability } from "@legendapp/spark/ai";
import { observable } from "@legendapp/state";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { DiffViewerModel, DiffViewerState } from "../../viewer/diffViewerModel";
import { fixtureDocument, repoSource } from "../../story/__tests__/storyFixtures";
import { diffSkillApprovals$ } from "../../diffSettings";
import type { DiffViewerTab } from "../../story/useDiffStory";
import { builtInWorkflowSkills } from "../workflowSkills";
import { workflowStore } from "../workflowStore";
import { workflowRunner } from "../workflowRunner";
import { workflowResult } from "./workflowFixtures";
import { useDiffWorkflows } from "../useDiffWorkflows";

jest.mock("@legendapp/spark/ai", () => ({ getAICommandAvailability: jest.fn(async () => ({ codex: true, claude: false })), selectPreferredAITool: () => "codex" }));
jest.mock("@legend-apps/storage", () => ({ ...jest.requireActual("@legend-apps/storage"), createStorage: () => ({ read: (path: string) => mockStorage.get(path), write: (path: string, value: string) => mockStorage.set(path, value) }) }));
jest.mock("../../story/skillRuntime", () => {
  const { useValue } = require("@legendapp/state/react");
  return { useSkillLibrary: (_root: string | undefined, enabled: boolean) => { mockLibraryEnabled(enabled); return { state: useValue(() => enabled ? mockSkills$.get() : undefined) }; } };
});
const mockStorage = new Map<string, string>();
const mockLibraryEnabled = jest.fn();
const mockSkills$ = observable({ active: builtInWorkflowSkills, ready: true, errors: [] });
const run = jest.spyOn(workflowRunner, "run");
function setup() {
  const state$ = observable({ status: "loaded", source: repoSource, document: fixtureDocument(), loadComplete: true } as unknown as DiffViewerState) as DiffViewerModel["state$"];
  return { state$ };
}
beforeEach(() => {
  jest.clearAllMocks(); mockStorage.clear(); diffSkillApprovals$.set({});
  mockSkills$.set({ active: builtInWorkflowSkills, ready: true, errors: [] });
  run.mockImplementation(async (input, options) => workflowResult(options.skill!, input));
});
afterEach(() => workflowStore.closeWindow("workflows-hook"));

it("keeps Files lazy, loads workflows without running, and requires consent before the selected batch", async () => {
  const test = setup(); const onOpen = jest.fn();
  const hook = await renderHook(({ tab }: { tab: DiffViewerTab }) => useDiffWorkflows("workflows-hook", test.state$, tab, "/repo", true, onOpen), { initialProps: { tab: "files" } });
  expect(getAICommandAvailability).not.toHaveBeenCalled();
  expect(mockLibraryEnabled.mock.calls.every(([enabled]) => !enabled)).toBe(true);
  await hook.rerender({ tab: "workflows" });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(run).not.toHaveBeenCalled();
  await act(() => hook.result.current.setSelected([builtInWorkflowSkills[0].name, builtInWorkflowSkills[1].name]));
  await act(() => hook.result.current.runSelected());
  expect(hook.result.current.pending?.type).toBe("consent");
  expect(run).not.toHaveBeenCalled();
  await act(() => hook.result.current.approve(false));
  expect(run).not.toHaveBeenCalled();
  await act(() => hook.result.current.runSelected());
  await act(() => hook.result.current.approve(true));
  await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  expect(workflowStore.state("workflows-hook", builtInWorkflowSkills[0].name).status.peek()).toBe("done");
  await hook.unmount();
  expect(workflowStore.state$.peek()).toEqual({});
});

it("approves repository hashes before provider consent, and preserves explicit missing preset selections", async () => {
  const test = setup();
  mockSkills$.active.set([{ ...builtInWorkflowSkills[0], layer: "repo", repoRoot: "/repo", path: "/repo/.legend-diff/skills/review.md" }]);
  const hook = await renderHook(() => useDiffWorkflows("workflows-hook", test.state$, "workflows", "/repo", true, jest.fn()));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(() => hook.result.current.setSelected([builtInWorkflowSkills[0].name]));
  await act(() => hook.result.current.runSelected());
  expect(hook.result.current.pending?.type).toBe("trust");
  await act(() => hook.result.current.approve(true));
  expect(hook.result.current.pending?.type).toBe("consent");
  await act(() => hook.result.current.approve(false));
  await act(() => hook.result.current.savePreset("Pre-PR checks"));
  expect(hook.result.current.presets[0]).toMatchObject({ name: "Pre-PR checks", skills: [builtInWorkflowSkills[0].name] });
  await act(() => hook.result.current.setSelected(["missing-skill"]));
  await act(() => hook.result.current.runSelected());
  expect(hook.result.current.error).toContain("unavailable");
  expect(run).not.toHaveBeenCalled();
  await hook.unmount();
});

it("stops skill watching and indexing after merely visiting Workflows, without results or runs", async () => {
  const test = setup();
  const hook = await renderHook(({ tab }: { tab: DiffViewerTab }) => useDiffWorkflows("workflows-hook", test.state$, tab, "/repo", true, jest.fn()), { initialProps: { tab: "workflows" } });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await hook.rerender({ tab: "files" });
  expect(mockLibraryEnabled).toHaveBeenLastCalledWith(false);
  const document = fixtureDocument({ text: "changed" });
  const read = jest.spyOn(document, "getPlainRows");
  await act(() => test.state$.set({ status: "loaded", source: repoSource, document, loadComplete: true } as unknown as DiffViewerState));
  expect(read).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  await hook.unmount();
});

it("reanchors completed comments while Files is visible and keeps progress updates out of the controller", async () => {
  const test = setup(); const skill = builtInWorkflowSkills[0];
  workflowStore.setEnabled("repo:/repo", "codex", true);
  run.mockImplementation(async input => ({ ...workflowResult(skill, input), output: { contractVersion: 1, kind: "comments", summary: "Review", comments: [
    { ref: { hunk: "h1", side: "new", startLine: 41, endLine: 41 }, severity: "warn", body: "Check this" },
  ] } }));
  let renders = 0;
  const hook = await renderHook(({ tab }: { tab: DiffViewerTab }) => { renders++; return useDiffWorkflows("workflows-hook", test.state$, tab, "/repo", true, jest.fn()); }, { initialProps: { tab: "workflows" } });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(() => hook.result.current.setSelected([skill.name]));
  await act(() => hook.result.current.runSelected());
  await waitFor(() => expect(hook.result.current.comments).toHaveLength(1));
  const before = renders;
  await act(() => workflowStore.state("workflows-hook", skill.name).progress.set({ phase: "output", receivedBytes: 100 }));
  expect(renders).toBe(before);
  await hook.rerender({ tab: "files" });
  await act(() => test.state$.set({ status: "loaded", source: repoSource, document: fixtureDocument({ shift: 15, extra: true }), loadComplete: true } as unknown as DiffViewerState));
  await waitFor(() => expect(hook.result.current.comments[0].ref.startLine).toBe(56));
  expect(hook.result.current.gutter.comments$.peek()["1:new:56"]).toHaveLength(1);
  await act(() => hook.result.current.setCommentState(hook.result.current.comments[0].id, "resolved"));
  expect(hook.result.current.gutter.comments$.peek()).toEqual({});
  expect(run).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

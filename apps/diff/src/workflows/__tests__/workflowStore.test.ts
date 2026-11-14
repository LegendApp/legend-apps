import { fixtureInput, memoryStorage, patchSource, repoSource } from "../../story/__tests__/storyFixtures";
import type { StorySkill } from "../../story/storySkill";
import { createWorkflowCache } from "../workflowCache";
import { createWorkflowStore, workflowElapsed, type WorkflowRequest } from "../workflowStore";
import { builtInWorkflowSkills } from "../workflowSkills";
import { fakeWorkflowCLI, flush, workflowOutput } from "./workflowFixtures";

function setup() {
  const cli = fakeWorkflowCLI(), storage = memoryStorage(), cache = createWorkflowCache(storage);
  const consent = { isEnabled: jest.fn(() => true), setEnabled: jest.fn() }, trust = { isTrusted: jest.fn(() => true) };
  const store = createWorkflowStore({ runner: cli.runner, cache: () => cache, consent, trust });
  const request = (skill = builtInWorkflowSkills[0]): WorkflowRequest => ({ input: fixtureInput(), source: repoSource, repoRoot: "/repo", skill, tool: "codex" });
  const complete = (index: number, kind: StorySkill["output"]) => cli.children[index].complete(JSON.stringify(workflowOutput(kind)));
  return { cli, cache, store, consent, trust, request, complete, storage };
}
it("starts two selected workflows, queues the rest, and persists completed results", async () => {
  const t = setup(), requests = builtInWorkflowSkills.map(t.request);
  const pending = t.store.runSelected("w", requests);
  await flush(); expect(t.cli.children).toHaveLength(2);
  expect(t.store.state("w", requests[2].skill.name).peek()).toMatchObject({ status: "queued", startedAt: null });
  expect(workflowElapsed(t.store.state("w", requests[2].skill.name).peek())).toBe(0);
  t.complete(0, "comments"); await flush(); expect(t.cli.children).toHaveLength(3);
  t.complete(1, "check"); t.complete(2, "patch");
  expect((await pending).every(Boolean)).toBe(true);
  for (const request of requests) {
    const state = t.store.state("w", request.skill.name).peek();
    expect(state.status).toBe("done"); expect(state.startedAt).not.toBeNull(); expect(state.endedAt).not.toBeNull();
    expect(workflowElapsed(state, 999999)).toBe(state.endedAt! - state.startedAt!);
  }
  t.store.closeWindow("w");
  t.store.load("new", requests[1]);
  expect(t.store.state("new", requests[1].skill.name).peek()).toMatchObject({ status: "done", result: { output: { kind: "check" } } });
});
it("cancels queued work without spawning and holds an active slot until termination drains", async () => {
  const t = setup();
  const fourth = { ...builtInWorkflowSkills[1], name: "another-check" };
  const requests = [...builtInWorkflowSkills, fourth].map(t.request);
  const pending = t.store.runSelected("w", requests); await flush();
  t.store.cancel("w", requests[2].skill.name);
  expect(t.store.state("w", requests[2].skill.name).status.peek()).toBe("cancelled");
  let finish!: () => void;
  t.cli.children[0].terminate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  t.store.cancel("w", requests[0].skill.name);
  t.complete(0, "comments"); await flush();
  expect(t.cli.children).toHaveLength(2);
  expect(t.store.state("w", requests[0].skill.name).status.peek()).toBe("cancelling");
  finish(); await flush();
  expect(t.cli.children).toHaveLength(3);
  t.complete(1, "check"); t.complete(2, "check");
  const results = await pending;
  expect(results[0]).toBeUndefined(); expect(results[2]).toBeUndefined(); expect(results[3]?.output.kind).toBe("check");
  expect(t.store.state("w", requests[0].skill.name).status.peek()).toBe("cancelled");
});
it("rejects duplicate runs and atomically checks consent and trust for a selection", async () => {
  const t = setup();
  t.consent.isEnabled.mockReturnValueOnce(true).mockReturnValueOnce(false);
  expect(() => t.store.runSelected("w", builtInWorkflowSkills.slice(0, 2).map(t.request))).toThrow("Enable AI");
  expect(t.cli.spawn).not.toHaveBeenCalled();
  t.consent.isEnabled.mockReturnValue(true); t.trust.isTrusted.mockReturnValue(false);
  expect(() => t.store.runSelected("w", [t.request()])).toThrow("from this repository");
  t.trust.isTrusted.mockReturnValue(true);
  const pending = t.store.run("w", t.request()); await flush();
  expect(() => t.store.run("w", t.request())).toThrow("already queued");
  t.store.cancel("w"); await pending;
});
it("rechecks approval when queued work starts and honors skill tool preference", async () => {
  const t = setup();
  const requests = builtInWorkflowSkills.map(t.request);
  requests[2].skill = { ...requests[2].skill, tool: "claude" };
  const pending = t.store.runSelected("w", requests); await flush();
  t.consent.isEnabled.mockImplementation((_scope?: string, tool?: string) => tool !== "claude");
  t.complete(0, "comments"); t.complete(1, "check"); await pending;
  expect(t.cli.children).toHaveLength(2);
  expect(t.store.state("w", requests[2].skill.name).peek()).toMatchObject({ status: "error", error: { code: "consent" } });
});
it("marks late results stale after reload and clears/cancels runs on source switch or close", async () => {
  const t = setup(), request = t.request();
  const pending = t.store.run("w", request); await flush();
  t.store.setDiff("w", fixtureInput({ text: "changed" }), repoSource, "/repo");
  t.complete(0, "comments"); await pending;
  expect(t.store.state("w", request.skill.name).status.peek()).toBe("stale");
  t.store.setDiff("w", request.input, repoSource, "/repo");
  expect(t.store.state("w", request.skill.name).status.peek()).toBe("done");
  const active = t.store.runSelected("w", builtInWorkflowSkills.map(t.request)); await flush();
  t.store.setDiff("w", request.input, patchSource);
  expect(t.store.state$.peek().w).toBeUndefined(); await active;
  expect(t.store.state$.peek().w).toBeUndefined();
  expect(t.cli.children.slice(1).every(child => child.terminate.mock.calls.length === 1)).toBe(true);
});
it("cancels all selected work on external abort and does not revive closed windows", async () => {
  const t = setup(), controller = new AbortController();
  const pending = t.store.runSelected("w", builtInWorkflowSkills.map(t.request), { signal: controller.signal }); await flush();
  controller.abort(); t.store.closeWindow("w"); await pending;
  expect(t.store.state$.peek().w).toBeUndefined(); expect(t.cli.children).toHaveLength(2);
  const before = new AbortController(); before.abort();
  await t.store.runSelected("other", builtInWorkflowSkills.map(t.request), { signal: before.signal });
  expect(t.cli.children).toHaveLength(2);
});
it("runs persisted named sets and refuses unavailable presets without starting work", async () => {
  const t = setup();
  t.store.savePreset("repo:/repo", "Pre-PR checks", ["tests-cover-change", "review-risks"]);
  const { skill: _skill, ...context } = t.request();
  const pending = t.store.runPreset("w", "Pre-PR checks", context, builtInWorkflowSkills); await flush();
  expect(t.cli.children).toHaveLength(2); t.complete(0, "check"); t.complete(1, "comments"); await pending;
  t.store.savePreset("repo:/repo", "Missing", ["removed-workflow"]);
  expect(() => t.store.runPreset("w", "Missing", context, builtInWorkflowSkills)).toThrow("unavailable");
  expect(t.cli.children).toHaveLength(2);
});
it("retains raw invalid output and process errors as reviewable run failures", async () => {
  const t = setup(); const pending = t.store.run("w", t.request()); await flush();
  t.cli.children[0].complete("invalid"); await flush(); t.cli.children[1].complete("still invalid"); await pending;
  expect(t.store.state("w", builtInWorkflowSkills[0].name).peek()).toMatchObject({ status: "error", error: { rawOutput: "still invalid" } });
});
it("waits for a cancelled skill to drain before starting its replacement after source switch", async () => {
  const t = setup(), request = t.request();
  const first = t.store.run("w", request); await flush();
  let finish!: () => void;
  t.cli.children[0].terminate.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  t.store.setDiff("w", request.input, patchSource);
  const replacement = t.store.run("w", { ...request, source: patchSource, repoRoot: undefined });
  await flush();
  const waitingStatus = t.store.state("w", request.skill.name).status.peek();
  const waitingChildren = t.cli.children.length;
  t.complete(0, "comments"); finish(); await first; await flush();
  if (t.cli.children[1]) t.complete(1, "comments");
  await replacement;
  expect(waitingChildren).toBe(1);
  expect(waitingStatus).toBe("queued");
  expect(t.cli.children).toHaveLength(2);
  expect(t.store.state("w", request.skill.name).status.peek()).toBe("done");
});

import { observable } from "@legendapp/state";
import type { DiffOpenSource } from "../diffFiles";
import { storyCacheIdentity } from "../story/storyCache";
import type { StoryInput } from "../story/storyHunks";
import { getStoryCwd, getStoryScope } from "../story/storySource";
import { selectStoryTool, StoryOutputError, StoryRunError, type StoryProgress, type StoryTool } from "../story/storyRunner";
import { storyStore } from "../story/storyStore";
import type { StorySkill } from "../story/storySkill";
import { repoSkillNotice, skillTrust } from "../story/skillTrust";
import { storyContractVersion } from "../story/storyContract";
import { createWorkflowCache } from "./workflowCache";
import { workflowRunner, type WorkflowRunResult } from "./workflowRunner";
import type { WorkflowOutput } from "./workflowContract";

export type WorkflowRequest = { input: StoryInput; source: DiffOpenSource; repoRoot?: string; skill: StorySkill; tool: StoryTool; model?: string };
export type WorkflowRunState = {
  status: "idle" | "queued" | "running" | "cancelling" | "cancelled" | "done" | "stale" | "error";
  queuedAt: number | null; startedAt: number | null; endedAt: number | null;
  progress: StoryProgress | null; result: WorkflowRunResult | null; input: StoryInput | null;
  error: { message: string; code?: string; rawOutput?: string } | null;
};
export function workflowElapsed(state: WorkflowRunState, now = Date.now()) {
  return state.startedAt === null ? 0 : Math.max(0, (state.endedAt ?? now) - state.startedAt);
}
export function workflowPrivacyNotice(tool: StoryTool) {
  return `Run workflows with ${tool === "codex" ? "Codex" : "Claude"} CLI using the account signed into that tool. The skill, file paths, hunk index and selected diff text are sent to its provider and may contain private code. The CLI runs read-only; results are cached locally. Diff does not upload them. Patches require explicit review and Apply. Enable AI for this source?`;
}

type Task = { windowId: string; skillName: string; controller: AbortController; execute: () => Promise<void>; cancelQueued: () => void };
export function createWorkflowStore(dependencies: {
  runner: typeof workflowRunner; cache: () => ReturnType<typeof createWorkflowCache>;
  consent: Pick<typeof storyStore, "isEnabled" | "setEnabled">; trust: Pick<typeof skillTrust, "isTrusted">;
  parallelism?: number;
} = { runner: workflowRunner, cache: () => cache ??= createWorkflowCache(), consent: storyStore, trust: skillTrust }) {
  const limit = dependencies.parallelism ?? 2;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Workflow parallelism must be a positive integer.");
  const state$ = observable<Record<string, Record<string, WorkflowRunState>>>({});
  const operations = new Map<string, Map<string, Task>>();
  const current = new Map<string, { hash: string; scope: string }>();
  const queue: Task[] = [];
  const running = new Set<Task>();
  function state(windowId: string, skillName: string) {
    if (!state$[windowId].peek()) state$[windowId].set({});
    if (!state$[windowId][skillName].peek()) state$[windowId][skillName].set({ status: "idle", queuedAt: null, startedAt: null, endedAt: null, progress: null, result: null, input: null, error: null });
    return state$[windowId][skillName];
  }
  function pump() {
    while (running.size < limit && queue.length) {
      const index = queue.findIndex(task => !Array.from(running).some(active => active.windowId === task.windowId && active.skillName === task.skillName));
      if (index < 0) break;
      const task = queue.splice(index, 1)[0];
      running.add(task);
      void task.execute().finally(() => { running.delete(task); pump(); });
    }
  }
  function cancel(windowId: string, skillName?: string) {
    for (const task of operations.get(windowId)?.values() ?? []) {
      if (skillName && task.skillName !== skillName) continue;
      task.controller.abort();
      const index = queue.indexOf(task);
      if (index >= 0) { queue.splice(index, 1); task.cancelQueued(); }
      else state(windowId, task.skillName).status.set("cancelling");
    }
  }
  function closeWindow(windowId: string) {
    cancel(windowId); operations.delete(windowId); current.delete(windowId); state$[windowId].delete();
  }
  function setDiff(windowId: string, input: StoryInput, source: DiffOpenSource, repoRoot?: string) {
    const scope = getStoryScope(source, repoRoot);
    if (current.get(windowId) && current.get(windowId)!.scope !== scope) closeWindow(windowId);
    current.set(windowId, { hash: input.diffHash, scope });
    for (const name of Object.keys(state$[windowId].peek() ?? {})) {
      const node = state$[windowId][name], value = node.peek();
      if (value.result && !operations.get(windowId)?.has(name) && (value.status === "done" || value.status === "stale")) node.status.set(value.result.diffHash === input.diffHash ? "done" : "stale");
    }
  }
  function load(windowId: string, request: WorkflowRequest) {
    setDiff(windowId, request.input, request.source, request.repoRoot);
    if (operations.get(windowId)?.has(request.skill.name)) return;
    const tool = selectStoryTool(request.skill, request.tool)!;
    const cached = dependencies.cache().load(storyCacheIdentity(getStoryScope(request.source, request.repoRoot), request.input, request.skill, tool, request.model));
    const node = state(windowId, request.skill.name);
    node.assign({ status: cached ? cached.stale ? "stale" : "done" : "idle", result: cached?.result ?? null, input: cached?.input ?? null,
      progress: null, error: null, queuedAt: null, startedAt: null, endedAt: null });
  }
  function runSelected(windowId: string, requests: WorkflowRequest[], options: { signal?: AbortSignal } = {}) {
    const names = new Set<string>();
    const scope = requests[0] && getStoryScope(requests[0].source, requests[0].repoRoot);
    const hash = requests[0]?.input.diffHash;
    for (const request of requests) {
      const { skill } = request;
      if (skill.kind !== "workflow" || skill.output === "story") throw new StoryRunError("process", "Select workflow skills to run.");
      if (scope !== getStoryScope(request.source, request.repoRoot) || hash !== request.input.diffHash) throw new Error("Selected workflows must use the same source and diff.");
      if (names.has(skill.name) || operations.get(windowId)?.has(skill.name)) throw new StoryRunError("busy", "This skill is already queued or running in this window.");
      names.add(skill.name);
      const tool = selectStoryTool(skill, request.tool)!;
      if (!dependencies.consent.isEnabled(scope!, tool)) throw new StoryRunError("consent", workflowPrivacyNotice(tool));
      if (!dependencies.trust.isTrusted(skill, request.repoRoot)) throw new StoryRunError("trust", repoSkillNotice(skill));
    }
    if (!requests.length) return Promise.resolve([]);
    setDiff(windowId, requests[0].input, requests[0].source, requests[0].repoRoot);
    const promises = requests.map(original => {
      const request = { ...original, tool: selectStoryTool(original.skill, original.tool)! };
      const { skill } = request;
      const node = state(windowId, skill.name);
      node.assign({ status: "queued", queuedAt: Date.now(), startedAt: null, endedAt: null, progress: null, error: null, result: null, input: request.input });
      const controller = new AbortController();
      const window = operations.get(windowId) ?? new Map<string, Task>();
      operations.set(windowId, window);
      let resolve!: (result: WorkflowRunResult | undefined) => void;
      const promise = new Promise<WorkflowRunResult | undefined>(done => { resolve = done; });
      const isCurrent = () => operations.get(windowId)?.get(skill.name) === task;
      function finish() {
        options.signal?.removeEventListener("abort", abort);
        if (isCurrent()) { window.delete(skill.name); if (!window.size) operations.delete(windowId); }
      }
      const abort = () => cancel(windowId, skill.name);
      const task: Task = { windowId, skillName: skill.name, controller,
        cancelQueued() {
          node.assign({ status: "cancelled", endedAt: Date.now() }); finish(); resolve(undefined);
        },
        async execute() {
          if (isCurrent()) node.assign({ status: "running", startedAt: Date.now() });
          let result: WorkflowRunResult | undefined;
          try {
            // Approval can be revoked while a workflow waits for a slot.
            if (!dependencies.consent.isEnabled(scope!, request.tool)) throw new StoryRunError("consent", workflowPrivacyNotice(request.tool));
            if (!dependencies.trust.isTrusted(skill, request.repoRoot)) throw new StoryRunError("trust", repoSkillNotice(skill));
            result = await dependencies.runner.run(request.input, { windowId, skill, tool: request.tool, model: request.model,
              cwd: getStoryCwd(request.source, request.repoRoot), signal: controller.signal,
              onProgress: progress => { if (isCurrent() && !controller.signal.aborted) node.progress.set(progress); } });
            if (controller.signal.aborted) throw new StoryRunError("cancelled", "Workflow cancelled.");
            if (isCurrent()) {
              dependencies.cache().save(storyCacheIdentity(scope!, request.input, skill, result.tool, result.model), result, request.input);
              node.assign({ status: current.get(windowId)?.hash === result.diffHash ? "done" : "stale", result, progress: null, endedAt: Date.now() });
            }
          } catch (error) {
            result = undefined;
            if (isCurrent()) node.assign({ status: controller.signal.aborted ? "cancelled" : "error", progress: null, endedAt: Date.now(),
              error: controller.signal.aborted ? null : { message: error instanceof Error ? error.message : String(error),
                ...(error instanceof StoryOutputError ? { rawOutput: error.rawOutput } : {}), ...(error instanceof StoryRunError ? { code: error.code } : {}) } });
          } finally { finish(); resolve(result); }
        },
      };
      window.set(skill.name, task); queue.push(task);
      options.signal?.addEventListener("abort", abort, { once: true });
      if (options.signal?.aborted) abort();
      return promise;
    });
    pump();
    return Promise.all(promises);
  }
  return { state$, state, setDiff, load, runSelected, cancel, closeWindow,
    discard(windowId: string, skillName: string, output: WorkflowOutput) {
      const node = state(windowId, skillName), value = node.peek(), scope = current.get(windowId)?.scope;
      if (operations.get(windowId)?.has(skillName) || value.result?.output.kind !== "patch" || value.result.output !== output || !scope) return;
      const result = value.result;
      dependencies.cache().discard({ scope, diffHash: result.diffHash, skillName: result.skillName, skillHash: result.skillHash,
        contractVersion: storyContractVersion, tool: result.tool, model: result.model });
      node.assign({ status: "idle", result: null, input: null, error: null });
    },
    run: (windowId: string, request: WorkflowRequest, options?: { signal?: AbortSignal }) => runSelected(windowId, [request], options).then(results => results[0]),
    isEnabled: dependencies.consent.isEnabled, setEnabled: dependencies.consent.setEnabled,
    presets: (scope: string) => dependencies.cache().presets(scope),
    savePreset: (scope: string, name: string, skills: string[]) => dependencies.cache().savePreset(scope, name, skills),
    deletePreset: (scope: string, name: string) => dependencies.cache().deletePreset(scope, name),
    runPreset(windowId: string, name: string, context: Omit<WorkflowRequest, "skill">, skills: StorySkill[]) {
      const preset = dependencies.cache().presets(getStoryScope(context.source, context.repoRoot)).find(entry => entry.name === name);
      if (!preset) throw new Error("Workflow preset not found.");
      const requests = preset.skills.map(name => {
        const skill = skills.find(entry => entry.name === name && entry.kind === "workflow");
        if (!skill) throw new Error(`Workflow “${name}” is unavailable. Edit the preset before running it.`);
        return { ...context, skill };
      });
      return runSelected(windowId, requests);
    },
  };
}
let cache: ReturnType<typeof createWorkflowCache> | undefined;
export const workflowStore = createWorkflowStore();

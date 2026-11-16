import { observable } from "@legendapp/state";
import type { DiffOpenSource } from "../diffFiles";
import { createStoryCache, storyCacheIdentity } from "./storyCache";
import type { StoryInput } from "./storyHunks";
import { getStoryCwd, getStoryScope } from "./storySource";
import { selectStoryTool, StoryOutputError, StoryRunError, storyRunner, type StoryProgress, type StoryRunResult, type StoryTool } from "./storyRunner";
import { skillTrust, repoSkillNotice } from "./skillTrust";
import { changeStorySkill, type StorySkill } from "./storySkill";

export type StoryRunState = {
  status: "idle" | "running" | "progress" | "done" | "error" | "stale";
  progress: StoryProgress | null; result: StoryRunResult | null; input: StoryInput | null;
  error: { message: string; rawOutput?: string; code?: string } | null;
};
export type StoryRequest = { input: StoryInput; source: DiffOpenSource; repoRoot?: string; skill?: StorySkill; tool: StoryTool; model?: string };

export function storyPrivacyNotice(tool: StoryTool) {
  return `Generate with ${tool === "codex" ? "Codex" : "Claude"} CLI using the account signed into that tool. The skill, file paths, hunk index and selected diff text are sent to its provider and may contain private code. The CLI runs read-only. Stories are cached locally; Diff does not upload them. Enable story generation for this source?`;
}

export function createStoryStore(dependencies: { runner: typeof storyRunner; cache: () => ReturnType<typeof createStoryCache> } = {
  runner: storyRunner, cache: () => cache ??= createStoryCache(),
}) {
  const state$ = observable<Record<string, Record<string, StoryRunState>>>({});
  const operations = new Map<string, Map<string, object>>();
  const current = new Map<string, { hash: string; scope: string }>();

  function state(windowId: string, skillName = changeStorySkill.name) {
    if (!state$[windowId].peek()) state$[windowId].set({});
    if (!state$[windowId][skillName].peek()) state$[windowId][skillName].set({ status: "idle", progress: null, result: null, input: null, error: null });
    return state$[windowId][skillName];
  }

  function setDiff(windowId: string, input: StoryInput, source: DiffOpenSource, repoRoot?: string) {
    const scope = getStoryScope(source, repoRoot);
    const previous = current.get(windowId);
    current.set(windowId, { hash: input.diffHash, scope });
    if (previous && previous.scope !== scope) {
      dependencies.runner.cancel(windowId); operations.delete(windowId); state$[windowId].delete();
    } else {
      for (const name of Object.keys(state$[windowId].peek() ?? {})) {
        const node = state$[windowId][name], value = node.peek();
        if (value.result && value.status !== "running" && value.status !== "progress") node.status.set(value.result.diffHash === input.diffHash ? "done" : "stale");
      }
    }
  }

  function load(windowId: string, request: StoryRequest) {
    setDiff(windowId, request.input, request.source, request.repoRoot);
    const skill = request.skill ?? changeStorySkill;
    request = { ...request, tool: selectStoryTool(skill, request.tool)! };
    const node = state(windowId, skill.name);
    if (operations.get(windowId)?.has(skill.name)) return;
    const cached = dependencies.cache().load(storyCacheIdentity(getStoryScope(request.source, request.repoRoot), request.input, skill, request.tool, request.model));
    if (cached) node.set({ status: cached.stale ? "stale" : "done", progress: null, error: null, result: cached.result, input: cached.input });
    else node.set({ status: "idle", progress: null, error: null, result: null, input: null });
  }

  async function run(windowId: string, request: StoryRequest, options: { signal?: AbortSignal; timeoutMs?: number; preview?: boolean } = {}) {
    const skill = request.skill ?? changeStorySkill;
    request = { ...request, tool: selectStoryTool(skill, request.tool)! };
    const runnerWindowId = windowId;
    if (options.preview) windowId = `${windowId}:preview`;
    if (operations.get(windowId)?.has(skill.name)) throw new StoryRunError("busy", "This skill is already running in this window.");
    if (!dependencies.cache().isEnabled(getStoryScope(request.source, request.repoRoot), request.tool)) throw new StoryRunError("consent", storyPrivacyNotice(request.tool));
    if (!skillTrust.isTrusted(skill, request.repoRoot)) throw new StoryRunError("trust", repoSkillNotice(skill));
    setDiff(windowId, request.input, request.source, request.repoRoot);
    const scope = getStoryScope(request.source, request.repoRoot);
    const operation = {};
    const window = operations.get(windowId) ?? new Map<string, object>();
    window.set(skill.name, operation); operations.set(windowId, window);
    const node = state(windowId, skill.name);
    node.assign({ status: "running", progress: null, error: null });
    const isCurrent = () => operations.get(windowId)?.get(skill.name) === operation;
    try {
      const result = await dependencies.runner.run(request.input, { signal: options.signal, timeoutMs: options.timeoutMs, windowId: runnerWindowId, skill, tool: request.tool, model: request.model,
        cwd: getStoryCwd(request.source, request.repoRoot), onProgress: progress => {
          if (isCurrent()) node.assign({ status: "progress", progress });
        } });
      if (!isCurrent()) return;
      node.assign({ status: (current.get(runnerWindowId) ?? current.get(windowId))?.hash === result.diffHash ? "done" : "stale", result, input: request.input, progress: null });
      if (!options.preview) dependencies.cache().save(storyCacheIdentity(scope, request.input, skill, result.tool, result.model), result, request.input);
      return result;
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof StoryRunError && error.code === "cancelled") {
        const result = node.result.peek();
        node.assign({ status: result ? result.diffHash === current.get(windowId)?.hash ? "done" : "stale" : "idle", progress: null });
      } else node.assign({ status: "error", progress: null, error: { message: error instanceof Error ? error.message : String(error),
        ...(error instanceof StoryOutputError ? { rawOutput: error.rawOutput } : {}), ...(error instanceof StoryRunError ? { code: error.code } : {}) } });
    } finally {
      if (isCurrent()) { window.delete(skill.name); if (!window.size) operations.delete(windowId); }
    }
  }

  function closeWindow(windowId: string) {
    dependencies.runner.cancel(windowId); operations.delete(windowId); current.delete(windowId); state$[windowId].delete();
    const previewId = `${windowId}:preview`;
    operations.delete(previewId); current.delete(previewId); state$[previewId].delete();
  }

  return { state$, state, setDiff, load, run,
    previewState: (windowId: string, skillName = changeStorySkill.name) => state(`${windowId}:preview`, skillName),
    preview: (windowId: string, request: StoryRequest, options: { signal?: AbortSignal } = {}) => run(windowId, request, { ...options, preview: true }),
    clearPreview(windowId: string) {
      const id = `${windowId}:preview`;
      operations.get(id)?.forEach((_operation, skillName) => dependencies.runner.cancel(windowId, skillName));
      operations.delete(id); current.delete(id); state$[id].delete();
    },
    isEnabled: (scope: string, tool: StoryTool) => dependencies.cache().isEnabled(scope, tool),
    setEnabled: (scope: string, tool: StoryTool, enabled: boolean) => dependencies.cache().setEnabled(scope, tool, enabled),
    cancel: (windowId: string, skillName?: string) => dependencies.runner.cancel(windowId, skillName),
    closeWindow,
  };
}

let cache: ReturnType<typeof createStoryCache> | undefined;
export const storyStore = createStoryStore();

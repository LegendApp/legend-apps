import { getAICommandAvailability, selectPreferredAITool } from "@legendapp/spark/ai";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { buildStoryInput, type StoryInput } from "../story/storyHunks";
import { useSkillLibrary } from "../story/skillRuntime";
import { skillTrust } from "../story/skillTrust";
import { getStoryScope } from "../story/storySource";
import { selectStoryTool, type StoryTool } from "../story/storyRunner";
import type { DiffViewerTab } from "../story/useDiffStory";
import type { WorkflowPreset } from "./workflowCache";
import { workflowStore, type WorkflowRequest } from "./workflowStore";
import { workflowGutterModel, workflowReviewComments, type WorkflowReviewComment } from "./workflowReview";

export function useDiffWorkflows(windowId: string, state$: DiffViewerModel["state$"], tab: DiffViewerTab, repoRoot: string | undefined, sourceReady: boolean, onOpen: (comment: WorkflowReviewComment) => void) {
  const state = useValue(state$);
  const source = state.source;
  const document = state.status === "loaded" && state.loadComplete !== false ? state.document : null;
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<StoryTool>("codex");
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ requests: WorkflowRequest[]; type: "trust" | "consent"; request: WorkflowRequest } | null>(null);
  const [presets, setPresets] = useState<WorkflowPreset[]>([]);
  const [commentStates, setCommentStates] = useState<Record<string, WorkflowReviewComment["state"]>>({});
  const inputs = useRef(new WeakMap<object, StoryInput>());
  const comments$ = useObservable<Record<string, WorkflowReviewComment[]>>({});
  const runs = useValue(() => {
    const node = workflowStore.state$[windowId];
    return Object.keys(node.get(true) ?? {}).map(name => ({ name, result: node[name].result.get(), input: node[name].input.get() }));
  });
  const enabled = tab === "workflows" || runs.some(run => run.input !== null);
  const input = useMemo(() => {
    if (!enabled || !document || !source) return null;
    let value = inputs.current.get(document);
    if (!value) { value = buildStoryInput(document, source); inputs.current.set(document, value); }
    return value;
  }, [enabled, document, source]);
  const scope = source && sourceReady ? getStoryScope(source, repoRoot) : null;
  const library = useSkillLibrary(repoRoot, tab === "workflows" && sourceReady);
  const skills = useMemo(() => library.state?.active.filter(skill => skill.kind === "workflow") ?? [], [library.state?.active]);
  useEffect(() => {
    if (!enabled || availabilityReady) return;
    let cancelled = false;
    void getAICommandAvailability().then(value => { if (!cancelled) { setTool(selectPreferredAITool(value) ?? "codex"); setAvailabilityReady(true); } })
      .catch((reason: unknown) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [enabled, availabilityReady]);
  const requests = useMemo<WorkflowRequest[]>(() => input && source && sourceReady && library.state?.ready && availabilityReady
    ? skills.map(skill => ({ input, source, repoRoot, skill, tool: selectStoryTool(skill, tool)! })) : [],
  [input, source, sourceReady, library.state?.ready, availabilityReady, skills, repoRoot, tool]);
  useEffect(() => {
    setPending(null); setError(null);
    if (input && source && sourceReady) workflowStore.setDiff(windowId, input, source, repoRoot);
  }, [input, source, sourceReady, repoRoot, windowId]);
  useEffect(() => {
    for (const request of requests) {
      const current = workflowStore.state(windowId, request.skill.name).peek();
      if (!current.result || current.result.skillHash !== request.skill.hash || current.result.tool !== request.tool) workflowStore.load(windowId, request);
    }
  }, [requests, windowId]);
  useEffect(() => { setPresets(scope && enabled ? workflowStore.presets(scope) : []); }, [scope, enabled]);
  useEffect(() => () => workflowStore.closeWindow(windowId), [windowId]);
  const comments = useMemo(() => input && scope ? runs.flatMap(run => run.result && run.input
    ? workflowReviewComments(run.name, run.result, run.input, input, commentStates) : []) : [], [runs, input, scope, commentStates]);
  useEffect(() => { comments$.set(input ? workflowGutterModel(comments, input) : {}); }, [comments, input, comments$]);
  const start = useCallback((requests: WorkflowRequest[]) => {
    setError(null);
    const untrusted = requests.find(request => !skillTrust.isTrusted(request.skill, request.repoRoot));
    if (untrusted) { setPending({ type: "trust", requests, request: untrusted }); return; }
    const unapproved = requests.find(request => !workflowStore.isEnabled(getStoryScope(request.source, request.repoRoot), request.tool));
    if (unapproved) { setPending({ type: "consent", requests, request: unapproved }); return; }
    setPending(null);
    try { void workflowStore.runSelected(windowId, requests).catch((reason: unknown) => setError(String(reason))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [windowId]);
  const runSelected = () => {
    const available = new Map(requests.map(request => [request.skill.name, request]));
    const missing = selected.find(name => !available.has(name));
    if (missing) { setError(`Workflow “${missing}” is unavailable. Edit the selection before running it.`); return; }
    start(selected.map(name => available.get(name)!));
  };
  const approve = (approved: boolean) => {
    if (!pending) return;
    setPending(null);
    if (!approved) return;
    if (pending.type === "trust" && pending.request.repoRoot) skillTrust.approve(pending.request.skill, pending.request.repoRoot);
    if (pending.type === "consent") workflowStore.setEnabled(getStoryScope(pending.request.source, pending.request.repoRoot), pending.request.tool, true);
    start(pending.requests);
  };
  const savePreset = (name: string) => {
    if (!scope) return;
    try { workflowStore.savePreset(scope, name, selected); setPresets(workflowStore.presets(scope)); setError(null); }
    catch (reason) { setError(String(reason)); }
  };
  return { windowId, input, source, repoRoot, scope, skills, selected, setSelected, tool, setTool, pending, approve,
    error: error ?? library.error, skillErrors: library.state?.errors ?? [], ready: !!input && sourceReady && !!library.state?.ready && availabilityReady,
    runSelected, presets, savePreset,
    deletePreset: (name: string) => { if (scope) { workflowStore.deletePreset(scope, name); setPresets(workflowStore.presets(scope)); } },
    comments, setCommentState: (id: string, value: WorkflowReviewComment["state"]) => setCommentStates(current => ({ ...current, [id]: value })),
    gutter: useMemo(() => ({ comments$, onOpen }), [comments$, onOpen]),
  };
}

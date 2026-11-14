import { getAICommandAvailability, selectPreferredAITool } from "@legendapp/spark/ai";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGitService } from "../git/GitService";
import { isDiffGitSource } from "../diffFiles";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { buildStoryInput, type StoryInput } from "./storyHunks";
import type { StoryTool } from "./storyRunner";
import { getStoryScope } from "./storySource";
import { storyStore, type StoryRequest } from "./storyStore";

export type DiffViewerTab = "files" | "story";
export function storyOpenAction(hasResult: boolean, running: boolean, regenerate: boolean) {
  return running || (hasResult && !regenerate) ? "open" : "generate";
}

export function useDiffStory(windowId: string, state$: DiffViewerModel["state$"]) {
  const [tab, setTab] = useState<DiffViewerTab>("files");
  const story$ = storyStore.state(windowId);
  useValue(story$.result);
  useValue(story$.status);
  const story = story$.peek();
  const state = useValue(state$);
  const [tool, setTool] = useState<StoryTool | null>(null);
  const [notice, setNotice] = useState<StoryRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const preparation = useRef(0);
  const [request, setRequest] = useState<StoryRequest | null>(null);
  const document = state.status === "loaded" && state.loadComplete !== false ? state.document : null;
  const source = state.source;
  const inputs = useRef(new WeakMap<object, StoryInput>());
  const input = useMemo(() => {
    if (!document || !source || tab !== "story") return null;
    let value = inputs.current.get(document);
    if (!value) { value = buildStoryInput(document, source); inputs.current.set(document, value); }
    return value;
  }, [document, source, tab]);
  useEffect(() => {
    const id = ++preparation.current;
    setNotice(null); setRequest(null); setError(null);
    if (!input || !source) { setPreparing(false); return; }
    setPreparing(true);
    const repoPath = source.kind === "folder" ? source.value : isDiffGitSource(source) ? source.cwd : null;
    void Promise.all([
      repoPath ? getGitService(repoPath).watchLocations().then(locations => locations.root) : Promise.resolve(undefined),
      getAICommandAvailability(),
    ]).then(([repoRoot, availability]) => {
      if (id !== preparation.current) return;
      const selected = tool ?? selectPreferredAITool(availability) ?? "codex";
      const next: StoryRequest = { input, source, repoRoot, tool: selected };
      setRequest(next);
      storyStore.setDiff(windowId, input, source, repoRoot);
      const current = storyStore.state(windowId).peek();
      if (current.status !== "running" && current.status !== "progress") storyStore.load(windowId, next);
    }).catch((reason: unknown) => {
      if (id === preparation.current) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (id === preparation.current) setPreparing(false); });
    return () => { preparation.current++; };
  }, [input, source, tool, windowId]);
  useEffect(() => () => storyStore.closeWindow(windowId), [windowId]);
  const generate = useCallback((regenerate = false) => {
    setTab("story");
    if (!request) return false;
    const current = storyStore.state(windowId).peek();
    if (storyOpenAction(!!current.result, current.status === "running" || current.status === "progress", regenerate) === "open") return true;
    const scope = getStoryScope(request.source, request.repoRoot);
    if (!storyStore.isEnabled(scope, request.tool)) setNotice(request);
    else void storyStore.run(windowId, request).catch((reason: unknown) => setError(String(reason)));
    return true;
  }, [request, windowId]);
  const generateOnReady = useRef<object | null>(null);
  const openStory = useCallback(() => {
    if (!document) return false;
    setTab("story");
    if (request && request.input === input) generate(); else generateOnReady.current = document;
    return true;
  }, [document, input, request, generate]);
  useEffect(() => {
    if (request && generateOnReady.current) {
      const requestedDocument = generateOnReady.current;
      generateOnReady.current = null;
      if (requestedDocument === document) generate();
    }
  }, [request, generate, document]);
  const consent = useCallback((enabled: boolean) => {
    if (!notice) return;
    storyStore.setEnabled(getStoryScope(notice.source, notice.repoRoot), notice.tool, enabled);
    setNotice(null);
    if (enabled) void storyStore.run(windowId, notice).catch((reason: unknown) => setError(String(reason)));
  }, [notice, windowId]);
  const disable = useCallback(() => {
    if (request) storyStore.setEnabled(getStoryScope(request.source, request.repoRoot), request.tool, false);
  }, [request]);
  return { tab, setTab, story, story$, tool: request?.tool ?? tool, setTool, request, notice, consent, error, preparing,
    openStory, generate, disable, cancel: () => storyStore.cancel(windowId) };
}

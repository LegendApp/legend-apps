import { getAICommandAvailability, selectPreferredAITool } from "@legendapp/spark/ai";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getGitService } from "../git/GitService";
import { isDiffGitSource, type DiffOpenSource } from "../diffFiles";
import { diffSettingsPage$ } from "../diffSettings";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { buildStoryInput, type StoryInput } from "./storyHunks";
import { selectStoryTool, type StoryTool } from "./storyRunner";
import { getStoryScope } from "./storySource";
import { storyStore, type StoryRequest } from "./storyStore";
import { changeStorySkill, type StorySkill } from "./storySkill";
import { skillEditorContext$, skillPreviewTargets, skillViewerContexts$, useSkillLibrary } from "./skillRuntime";
import { skillTrust } from "./skillTrust";

export type DiffViewerTab = "files" | "story";
export function storyOpenAction(hasResult: boolean, running: boolean, regenerate: boolean) {
  return running || (hasResult && !regenerate) ? "open" : "generate";
}

type PendingRun = { request: StoryRequest; preview: boolean };
export function useDiffStory(windowId: string, state$: DiffViewerModel["state$"]) {
  const [tab, setTab] = useState<DiffViewerTab>("files");
  const [skillName, setSkillName] = useState(changeStorySkill.name);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [tool, setTool] = useState<StoryTool | null>(null);
  const [notice, setNotice] = useState<PendingRun | null>(null);
  const [trustNotice, setTrustNotice] = useState<PendingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoInfo, setRepoInfo] = useState<{ source: DiffOpenSource; root?: string }>();
  const [resolved, setResolved] = useState<{ input: StoryInput; repoRoot?: string; availability: { codex: boolean; claude: boolean } }>();
  const [request, setRequest] = useState<StoryRequest | null>(null);
  const state = useValue(state$);
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
    let cancelled = false;
    setRepoInfo(undefined);
    if (!source) return;
    const repoPath = source.kind === "folder" ? source.value : isDiffGitSource(source) ? source.cwd : null;
    void (repoPath ? getGitService(repoPath).watchLocations().then(locations => locations.root) : Promise.resolve(undefined)).then(root => {
      if (!cancelled) setRepoInfo({ source, root });
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [source]);
  useEffect(() => {
    let cancelled = false;
    setResolved(undefined); setError(null);
    if (!input || !source || repoInfo?.source !== source) return;
    void getAICommandAvailability().then(availability => {
      if (!cancelled) setResolved({ input, repoRoot: repoInfo.root, availability });
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [input, source, repoInfo]);
  const { state: skills, error: libraryError } = useSkillLibrary(repoInfo?.root, !!repoInfo && repoInfo.source === source);
  const storySkills = skills?.active.filter(skill => skill.kind === "story" && skill.output === "story") ?? [];
  const skill = storySkills.find(skill => skill.name === skillName) ?? storySkills.find(skill => skill.name === changeStorySkill.name) ?? storySkills[0];
  const story$ = previewName ? storyStore.previewState(windowId, previewName) : storyStore.state(windowId, skill?.name ?? skillName);
  useValue(story$.result);
  useValue(story$.status);
  const story = story$.peek();
  useEffect(() => {
    setNotice(null); setTrustNotice(null); setRequest(null);
    if (!input || !source || resolved?.input !== input || !skills?.ready || !skill) return;
    const selected = selectStoryTool(skill, tool ?? selectPreferredAITool(resolved.availability) ?? "codex")!;
    const next: StoryRequest = { input, source, repoRoot: resolved.repoRoot, tool: selected, skill };
    setRequest(next);
    storyStore.setDiff(windowId, input, source, resolved.repoRoot);
    const current = storyStore.state(windowId, skill.name).peek();
    if (current.status !== "running" && current.status !== "progress") storyStore.load(windowId, next);
  }, [input, source, resolved, skills?.ready, skill, tool, windowId]);
  useEffect(() => () => storyStore.closeWindow(windowId), [windowId]);

  const start = useCallback((pending: PendingRun) => {
    const { request, preview } = pending;
    const selectedSkill = request.skill ?? changeStorySkill;
    if (!skillTrust.isTrusted(selectedSkill, request.repoRoot)) { setTrustNotice(pending); return; }
    if (!storyStore.isEnabled(getStoryScope(request.source, request.repoRoot), request.tool)) { setNotice(pending); return; }
    setError(null);
    void (preview ? storyStore.preview(windowId, request) : storyStore.run(windowId, request)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [windowId]);
  const generate = useCallback((regenerate = false) => {
    setTab("story");
    if (!request) return false;
    setPreviewName(null);
    const current = storyStore.state(windowId, request.skill?.name).peek();
    if (storyOpenAction(!!current.result, current.status === "running" || current.status === "progress", regenerate) === "open") return true;
    start({ request, preview: false });
    return true;
  }, [request, start, windowId]);
  const generateOnReady = useRef<object | null>(null);
  const previewOnReady = useRef<{ document: object; skill: StorySkill } | null>(null);
  const openStory = useCallback(() => {
    if (!document) return false;
    setTab("story");
    if (request && request.input === input) generate(); else generateOnReady.current = document;
    return true;
  }, [document, input, request, generate]);
  useEffect(() => {
    if (!request) return;
    const preview = previewOnReady.current;
    if (preview) {
      previewOnReady.current = null;
      if (preview.document === document) {
        const previewRequest = { ...request, skill: preview.skill, tool: selectStoryTool(preview.skill, request.tool)! };
        setPreviewName(preview.skill.name);
        start({ request: previewRequest, preview: true });
      }
    } else if (generateOnReady.current) {
      const requestedDocument = generateOnReady.current;
      generateOnReady.current = null;
      if (requestedDocument === document) generate();
    }
  }, [request, generate, document, start]);
  useEffect(() => {
    skillViewerContexts$[windowId].set({ repoRoot: repoInfo?.root, hasDiff: !!document });
    skillPreviewTargets.set(windowId, selectedSkill => {
      if (!document || selectedSkill.kind !== "story" || selectedSkill.output !== "story") return false;
      if (selectedSkill.layer === "repo" && selectedSkill.repoRoot !== repoInfo?.root) return false;
      generateOnReady.current = null;
      setTab("story");
      if (request && request.input === input) {
        setPreviewName(selectedSkill.name);
        start({ request: { ...request, skill: selectedSkill, tool: selectStoryTool(selectedSkill, request.tool)! }, preview: true });
      } else previewOnReady.current = { document, skill: selectedSkill };
      return true;
    });
    return () => { skillPreviewTargets.delete(windowId); skillViewerContexts$[windowId].delete(); };
  }, [document, input, request, repoInfo?.root, start, windowId]);
  const consent = useCallback((enabled: boolean) => {
    if (!notice) return;
    storyStore.setEnabled(getStoryScope(notice.request.source, notice.request.repoRoot), notice.request.tool, enabled);
    setNotice(null);
    if (enabled) start(notice);
  }, [notice, start]);
  const approve = useCallback((approved: boolean) => {
    if (!trustNotice) return;
    setTrustNotice(null);
    if (approved && trustNotice.request.repoRoot && trustNotice.request.skill) {
      skillTrust.approve(trustNotice.request.skill, trustNotice.request.repoRoot);
      start(trustNotice);
    }
  }, [trustNotice, start]);
  const disable = useCallback(() => {
    if (request) storyStore.setEnabled(getStoryScope(request.source, request.repoRoot), request.tool, false);
  }, [request]);
  const editSkill = useCallback(() => {
    skillEditorContext$.set({ windowId, skillName: skill?.name });
    diffSettingsPage$.set("aiSkills");
    void import("../diffWindows").then(windows => windows.openDiffSettingsWindow()).catch((reason: unknown) => setError(String(reason)));
  }, [windowId, skill?.name]);
  return { tab, setTab, story, story$, tool: request?.tool ?? tool, setTool, request, notice: notice?.request ?? null, consent,
    trustNotice: trustNotice?.request ?? null, approve, error: error ?? libraryError, preparing: !!input && !request,
    openStory, generate, disable, cancel: () => storyStore.cancel(windowId, previewName ?? skill?.name), skill, skills: storySkills, skillErrors: skills?.errors ?? [],
    selectSkill: (name: string) => { setSkillName(name); setPreviewName(null); }, editSkill,
    preview: !!previewName, dismissPreview: () => { storyStore.clearPreview(windowId); setPreviewName(null); setNotice(null); setTrustNotice(null); },
  };
}

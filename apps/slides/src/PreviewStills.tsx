import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePreparationTask } from "@legend-apps/presentation";
import { ActivityIndicator, Image, PixelRatio, StyleSheet, Text, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { useBackgroundIntensitySetting, useTitleAnimationSpeedSetting } from "./slidesSettings";
import * as previewFiles from "@legendapp/spark/files";
import { createPreviewCache, type PreviewCacheSnapshot } from "./previewCache";
import { getSlideStepCount, slidesState$ } from "./slidesStore";
import { SurfaceStillContext, type SurfaceStillRequest } from "./SlideCaptureContext";

/** Width of the hidden render, in points; roughly a large presenter preview on a Retina screen. */
const STILL_WIDTH = 960;
/** Decoded stills kept mounted on each side of a target, so the usual step shows without a decode. */
const STILL_WINDOW = 2;
/** A slide without a GPU background says nothing; once one announces itself it may need to compile pipelines. */
const NO_SURFACE_MS = 400;
const SURFACE_MS = 8000;

const previewCache = createPreviewCache(previewFiles);
// Bump when host rendering or frozen preview sampling changes.
const PREVIEW_RENDER_VERSION = 1;

export const stillKey = (slide: number, step: number) => `${slide}:${step}`;

/** Bake step backgrounds before presenting; keep only nearby images decoded. */
export function usePreviewStills(aspect: number, current: string, next: string) {
  const revision = useValue(slidesState$.revision);
  const intensity = useBackgroundIntensitySetting();
  const speed = useTitleAnimationSpeedSetting();
  const identity = useValue(slidesState$.previewIdentity);
  const deck = identity?.deck;
  const slides = useValue(slidesState$.slides);
  const targets = useMemo(() => slides.flatMap((slide, index) =>
    Array.from({ length: getSlideStepCount(slide) }, (_, step) => stillKey(index, step))), [slides]);
  const cacheKey = JSON.stringify([PREVIEW_RENDER_VERSION, identity?.content, intensity, aspect, speed, PixelRatio.get(), STILL_WIDTH]);
  const generation = `${revision}:${cacheKey}:${deck ? "" : targets.length}`;
  const [stills, setStills] = useState<{ generation: string; byKey: Record<string, string>; noSurface: number[]; loading: boolean }>({ generation, byKey: {}, noSurface: [], loading: !!deck });
  if (stills.generation !== generation) setStills({ generation, byKey: {}, noSurface: [], loading: !!deck });
  const active = useRef(generation);
  useLayoutEffect(() => { active.current = generation; return () => { active.current = ""; }; }, [generation]);
  useEffect(() => {
    if (!deck) return;
    let retired = false;
    void previewCache.read(deck, cacheKey).then(cached => {
      if (!retired) setStills(state => state.generation === generation
        ? { ...state, byKey: cached?.stills ?? state.byKey, noSurface: cached?.noSurface ?? [], loading: false } : state);
    });
    return () => { retired = true; };
  }, [deck, cacheKey, generation]);
  const save = useCallback((snapshot: PreviewCacheSnapshot, from: string) => {
    if (deck && from === active.current) void previewCache.save(deck, cacheKey, snapshot);
  }, [deck, cacheKey]);
  const add = useCallback((key: string, uri: string, from: string) => setStills(state => {
    if (state.generation !== from || state.byKey[key] === uri) return state;
    return { ...state, byKey: { ...state.byKey, [key]: uri } };
  }), []);
  const nearby = targets.filter(key => key === current || key === next);
  const remaining = targets.filter(key => key !== current && key !== next);
  return { stills: stills.byKey, targets, sweep: { add, aspect, generation, targets: [...nearby, ...remaining], stills: stills.byKey, loading: stills.loading, knownNoSurface: stills.noSurface, save } };
}

function useStillRequest(target: string | undefined, paused: boolean, generation: string, add: (key: string, uri: string, generation: string) => void) {
  const announced = useRef<string | undefined>(undefined);
  const currentRequest = useRef<SurfaceStillRequest | undefined>(undefined);
  const request = useMemo((): SurfaceStillRequest => ({
    id: paused ? undefined : target,
    announce: () => { announced.current = target; },
    deliver: (id, uri) => { if (id !== target || currentRequest.current !== request || !request.id) return; add(id, uri, generation); },
  }), [target, paused, generation, add]);
  useLayoutEffect(() => {
    currentRequest.current = request;
    return () => { currentRequest.current = undefined; };
  }, [request]);
  return { request, announced };
}

/** Capture a preview already on screen, without mounting another GPU surface. */
export function PreviewStillCapture({ children, target, paused, generation, add }: { children: ReactNode; target: string; paused: boolean; generation: string; add(key: string, uri: string, generation: string): void }) {
  const { request } = useStillRequest(target, paused, generation, add);
  return <SurfaceStillContext.Provider value={request}>{children}</SurfaceStillContext.Provider>;
}

/** Bake one target at a time, never during audience playback. Key it by generation. */
export function PreviewStillSweep({ add, aspect, generation, paused, targets, stills, loading = false, knownNoSurface = [], save }: { add(key: string, uri: string, generation: string): void; aspect: number; generation: string; paused: boolean; targets: string[]; stills: Record<string, string>; loading?: boolean; knownNoSurface?: number[]; save?(snapshot: PreviewCacheSnapshot, generation: string): void }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const noSurface = useRef(new Set<number>());
  const missing = targets.filter(key => !stills[key] && !noSurface.current.has(Number(key.split(":")[0])) && !knownNoSurface.includes(Number(key.split(":")[0])));
  const unavailable = missing.filter(key => skipped.includes(key)).length;
  const target = missing.find(key => !skipped.includes(key));
  const completed = targets.length - missing.length;
  const { request, announced } = useStillRequest(target, paused || loading, generation, add);
  useEffect(() => {
    if (loading || paused || !target) return;
    const skip = () => setSkipped(previous => [...previous, target]);
    let timer = setTimeout(() => {
      if (announced.current === target) timer = setTimeout(skip, SURFACE_MS);
      else { noSurface.current.add(Number(target.split(":")[0])); skip(); }
    }, NO_SURFACE_MS);
    return () => clearTimeout(timer);
  }, [target, paused, loading]);
  useEffect(() => {
    if (!loading && !paused && !target && !unavailable && targets.length) save?.({ stills, noSurface: [...new Set([...knownNoSurface, ...noSurface.current])], targets }, generation);
  }, [loading, paused, target, unavailable, stills, knownNoSurface, save, generation, targets]);
  if (targets.length === 0 || !loading && (paused || !target)) return null;
  const label = loading ? "Loading saved previews" : `Preparing previews · ${completed}/${targets.length}`;
  const [slide, step] = target?.split(":").map(Number) ?? [];
  return <>
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: targets.length, now: completed }} className="flex-row items-center gap-2 px-3 py-1">
      <ActivityIndicator size="small" color="#a1a1aa" accessibilityLabel="Preparing previews" />
      <Text className="text-xs text-zinc-400">{label}</Text>
    </View>
    {!loading && !paused && target && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.sweep, { width: STILL_WIDTH, height: STILL_WIDTH / aspect }]}>
      <SurfaceStillContext.Provider value={request}>
        <SlideCanvas targetIndex={slide} targetStep={step} isPreview backgroundIsPreview><DeckRenderer isPreview targetIndex={slide} targetStep={step} /></SlideCanvas>
      </SurfaceStillContext.Provider>
    </View>}
  </>;
}

export function PreviewStillStack({ stills, targets, target }: { stills: Record<string, string>; targets: string[]; target: string }) {
  const at = targets.indexOf(target);
  return <>{targets.slice(Math.max(0, at - STILL_WINDOW), at + STILL_WINDOW + 1).map(key => stills[key]
    ? <PreviewStillImage key={key} uri={stills[key]} active={key === target} />
    : null)}</>;
}

function PreviewStillImage({ uri, active }: { uri: string; active: boolean }) {
  const [state, setState] = useState({ uri, ready: false, error: false });
  if (state.uri !== uri) setState({ uri, ready: false, error: false });
  usePreparationTask(active && (state.uri !== uri || !state.ready));
  const finish = (error: boolean) => setState(current => current.uri !== uri || current.ready ? current : { uri, ready: true, error });
  return state.error ? <View style={[StyleSheet.absoluteFill, !active && styles.hidden, styles.unavailable]}><Text style={{ color: "#e4e4e7" }}>Preview unavailable</Text></View>
    : <Image source={{ uri }} resizeMode="contain" onLoad={() => finish(false)} onError={() => finish(true)} style={[StyleSheet.absoluteFill, !active && styles.hidden]} />;
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  unavailable: { alignItems: "center", justifyContent: "center", backgroundColor: "#18181b" },
  sweep: { left: 0, opacity: 0, position: "absolute", top: 0 },
});

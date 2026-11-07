import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePreparationTask } from "@legend-apps/presentation";
import { Image, StyleSheet, Text, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { useBackgroundIntensitySetting } from "./slidesSettings";
import { getSlideStepCount, slidesState$ } from "./slidesStore";
import { SurfaceStillContext, type SurfaceStillRequest } from "./SlideCaptureContext";

/** Width of the hidden render, in points; roughly a large presenter preview on a Retina screen. */
const STILL_WIDTH = 960;
/** Decoded stills kept mounted on each side of a target, so the usual step shows without a decode. */
const STILL_WINDOW = 2;
const MAX_STILLS = 12;
/** A slide without a GPU background says nothing; once one announces itself it may need to compile pipelines. */
const NO_SURFACE_MS = 400;
const SURFACE_MS = 8000;

export const stillKey = (slide: number, step: number) => `${slide}:${step}`;

/** Cache visited previews without rendering the rest of the deck in the background. */
export function usePreviewStills(aspect: number, current: string, next: string, retained?: readonly string[]) {
  const revision = useValue(slidesState$.revision);
  const intensity = useBackgroundIntensitySetting();
  const slides = useValue(slidesState$.slides);
  const targets = useMemo(() => slides.flatMap((slide, index) =>
    Array.from({ length: getSlideStepCount(slide) }, (_, step) => stillKey(index, step))), [slides]);
  const generation = `${revision}:${intensity}:${aspect}:${targets.length}`;
  const [stills, setStills] = useState<{ generation: string; byKey: Record<string, string> }>({ generation, byKey: {} });
  if (stills.generation !== generation) setStills({ generation, byKey: {} });
  const visible = useRef([current, next, ...retained ?? []]);
  useLayoutEffect(() => { visible.current = [current, next, ...retained ?? []]; }, [current, next, retained]);
  const add = useCallback((key: string, uri: string, from: string) => setStills(state => {
    if (state.generation !== from || state.byKey[key] === uri) return state;
    const byKey = { ...state.byKey, [key]: uri };
    for (const candidate of Object.keys(byKey)) {
      if (Object.keys(byKey).length <= MAX_STILLS) break;
      if (!visible.current.includes(candidate)) delete byKey[candidate];
    }
    return { generation: from, byKey };
  }), []);
  const nearby = targets.filter(key => key === current || key === next);
  return { stills: stills.byKey, targets, sweep: { add, aspect, generation, targets: nearby, stills: stills.byKey } };
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

/** Capture missing nearby previews between navigation, never while the audience is playing. Key it by generation. */
export function PreviewStillSweep({ add, aspect, generation, paused, targets, stills }: { add(key: string, uri: string, generation: string): void; aspect: number; generation: string; paused: boolean; targets: string[]; stills: Record<string, string> }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const noSurface = useRef(new Set<number>());
  const target = targets.find(key => !stills[key] && !skipped.includes(key) && !noSurface.current.has(Number(key.split(":")[0])));
  const { request, announced } = useStillRequest(target, paused, generation, add);
  useEffect(() => {
    if (paused || !target) return;
    const skip = () => setSkipped(previous => [...previous, target]);
    let timer = setTimeout(() => {
      if (announced.current === target) timer = setTimeout(skip, SURFACE_MS);
      else { noSurface.current.add(Number(target.split(":")[0])); skip(); }
    }, NO_SURFACE_MS);
    return () => clearTimeout(timer);
  }, [target, paused]);
  if (paused || !target) return null;
  const [slide, step] = target.split(":").map(Number);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.sweep, { width: STILL_WIDTH, height: STILL_WIDTH / aspect }]}>
    <SurfaceStillContext.Provider value={request}>
      <SlideCanvas targetIndex={slide} targetStep={step} isPreview backgroundIsPreview><DeckRenderer isPreview targetIndex={slide} targetStep={step} /></SlideCanvas>
    </SurfaceStillContext.Provider>
  </View>;
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

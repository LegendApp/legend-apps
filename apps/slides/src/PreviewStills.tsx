import { useValue } from "@legendapp/state/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { useBackgroundIntensitySetting } from "./slidesSettings";
import { getSlideStepCount, slidesState$ } from "./slidesStore";
import { SurfaceStillContext, type SurfaceStillRequest } from "./SlideCaptureContext";

/** Width of the hidden render, in points; roughly a large presenter preview on a Retina screen. */
const STILL_WIDTH = 960;
/** Decoded stills kept mounted on each side of a target, so the usual step shows without a decode. */
const STILL_WINDOW = 2;
/** A slide without a GPU background says nothing; once one announces itself it may need to compile pipelines. */
const NO_SURFACE_MS = 400;
const SURFACE_MS = 8000;

export const stillKey = (slide: number, step: number) => `${slide}:${step}`;

/** Cache visited previews without rendering the rest of the deck in the background. */
export function usePreviewStills(aspect: number, current: string, next: string) {
  const revision = useValue(slidesState$.revision);
  const intensity = useBackgroundIntensitySetting();
  const slides = useValue(slidesState$.slides);
  const targets = useMemo(() => slides.flatMap((slide, index) =>
    Array.from({ length: getSlideStepCount(slide) }, (_, step) => stillKey(index, step))), [slides]);
  const generation = `${revision}:${intensity}:${aspect}:${targets.length}`;
  const [stills, setStills] = useState<{ generation: string; byKey: Record<string, string> }>({ generation, byKey: {} });
  if (stills.generation !== generation) setStills({ generation, byKey: {} });
  const add = (key: string, uri: string, from: string) => setStills(state => state.generation === from
    ? { generation: from, byKey: { ...state.byKey, [key]: uri } } : state);
  const nearby = targets.filter(key => key === current || key === next);
  return { stills: stills.byKey, targets, sweep: { add, aspect, generation, targets: nearby, stills: stills.byKey } };
}

/** Capture missing nearby previews between navigation, never while the audience is playing. Key it by generation. */
export function PreviewStillSweep({ add, aspect, generation, paused, targets, stills }: { add(key: string, uri: string, generation: string): void; aspect: number; generation: string; paused: boolean; targets: string[]; stills: Record<string, string> }) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const announced = useRef<string | undefined>(undefined);
  const noSurface = useRef(new Set<number>());
  const target = targets.find(key => !stills[key] && !skipped.includes(key) && !noSurface.current.has(Number(key.split(":")[0])));
  const currentRequest = useRef<SurfaceStillRequest | undefined>(undefined);
  const request = useMemo((): SurfaceStillRequest => ({
    id: paused ? undefined : target,
    announce: () => { announced.current = target; },
    deliver: (id, uri) => { if (id !== target || currentRequest.current !== request || !request.id) return; add(id, uri, generation); },
  }), [target, paused, generation]);
  useLayoutEffect(() => {
    currentRequest.current = request;
    return () => { currentRequest.current = undefined; };
  }, [request]);
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
    ? <Image key={key} source={{ uri: stills[key] }} resizeMode="contain" style={[StyleSheet.absoluteFill, key !== target && styles.hidden]} />
    : null)}</>;
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  sweep: { left: 0, opacity: 0, position: "absolute", top: 0 },
});

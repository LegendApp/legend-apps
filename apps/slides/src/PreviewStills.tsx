import { useValue } from "@legendapp/state/react";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** Stills of every step's settled frame, thrown away whenever the deck or its look changes. */
export function usePreviewStills(aspect = 16 / 9) {
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
  return { stills: stills.byKey, targets, sweep: { add, aspect, generation, targets } };
}

/** Renders each step once, hidden, ahead of the talk; while the caller navigates it holds its place. Key it by generation. */
export function PreviewStillSweep({ add, aspect, generation, paused, targets }: { add(key: string, uri: string, generation: string): void; aspect: number; generation: string; paused: boolean; targets: string[] }) {
  const [position, setPosition] = useState(0);
  const target = targets[position];
  const announced = useRef<string | undefined>(undefined);
  const noSurface = useRef(new Set<number>());
  const nextPosition = (from: number) => {
    let next = from + 1;
    while (next < targets.length && noSurface.current.has(Number(targets[next]!.split(":")[0]))) next++;
    return next;
  };
  const request = useMemo((): SurfaceStillRequest => ({
    id: paused ? undefined : target,
    announce: () => { announced.current = target; },
    deliver: (id, uri) => { if (id !== target) return; add(id, uri, generation); setPosition(nextPosition); },
  }), [target, paused, generation]);
  useEffect(() => {
    if (paused || !target) return;
    const skip = () => setPosition(nextPosition);
    let timer = setTimeout(() => {
      if (announced.current === target) timer = setTimeout(skip, SURFACE_MS);
      else { noSurface.current.add(Number(target.split(":")[0])); skip(); }
    }, NO_SURFACE_MS);
    return () => clearTimeout(timer);
  }, [target, paused]);
  if (!target) return null;
  const [slide, step] = target.split(":").map(Number);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.sweep, { width: STILL_WIDTH, height: STILL_WIDTH / aspect }]}>
    <SurfaceStillContext.Provider value={request}>
      <SlideCanvas targetIndex={slide} isPreview backgroundIsPreview><DeckRenderer isPreview targetIndex={slide} targetStep={step} /></SlideCanvas>
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

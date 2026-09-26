import { createContext, useContext, type ReactNode } from "react";
import { observable, type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import type { PresentationRuntime } from "./types";
import { PlaybackProvider, samplePlayback, usePlayback } from "./playback";
import { useDerivedValue } from "react-native-reanimated";

const defaultRuntime: PresentationRuntime = {
  currentSlide: 0,
  currentStep: 0,
  goTo() {},
  isActive: false,
  isPreview: false,
  next() {},
  previous() {},
  slideCount: 0,
  slideIndex: 0,
  stepCount: 1,
  stepIndex: 0,
};

const PresentationContext = createContext(observable(defaultRuntime));

// Both names share the caller-owned observable without wrapping or copying it.
export function PresentationProvider({ value, children }: { value: Observable<PresentationRuntime>; children?: ReactNode }) {
  return <PresentationContext.Provider value={value}>
    <PlaybackProvider runtime$={value}>{children}</PlaybackProvider>
  </PresentationContext.Provider>;
}
export const PresentationObservableProvider = PresentationProvider;

export function usePresentation$() {
  return useContext(PresentationContext);
}

export function usePresentationValue<K extends Exclude<keyof PresentationRuntime, "goTo" | "next" | "previous">>(key: K): PresentationRuntime[K] {
  const runtime$ = usePresentation$();
  return useValue(() => runtime$[key].get()) as PresentationRuntime[K];
}

export function usePresentation() {
  return useValue(usePresentation$());
}

export function useSlideLifecycle() {
  const isActive = usePresentationValue("isActive");
  const isPreview = usePresentationValue("isPreview");
  const isPreparing = usePresentationValue("isPreparing");
  const slideIndex = usePresentationValue("slideIndex");
  const startedAt = usePresentationValue("startedAt");
  const stepCount = usePresentationValue("stepCount");
  const stepIndex = usePresentationValue("stepIndex");
  const stepStartedAt = usePresentationValue("stepStartedAt");
  return { isActive, isPreview, isPreparing, slideIndex, startedAt, stepCount, stepIndex, stepStartedAt };
}

/** Step 0 is the initial state; step 1 is the first advance. */
export function useStep(at: number) {
  const runtime$ = usePresentation$();
  const reached = useValue(() => runtime$.stepIndex.get() >= at);
  const isCurrent = useValue(() => runtime$.stepIndex.get() === at);
  const epoch = useValue(() => runtime$.stepEpochs[at].get());
  const direction = usePresentationValue("direction");
  const playback = usePlayback();
  const elapsed = useDerivedValue(() => {
    const state = playback.value;
    return state.phase === "preview" ? 0 : samplePlayback(state, 0, at);
  }, [at]);
  return { reached, isCurrent, elapsed, startedAt: epoch, direction: direction ?? "forward" };
}

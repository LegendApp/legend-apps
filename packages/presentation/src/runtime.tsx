import { createContext, useContext, useEffect, useState } from "react";
import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import type { PresentationRuntime } from "./types";

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
export const PresentationProvider = PresentationContext.Provider;
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
  const { isActive, isPreview, isPreparing, slideIndex, startedAt, stepCount, stepIndex, stepStartedAt } = usePresentation();
  return { isActive, isPreview, isPreparing, slideIndex, startedAt, stepCount, stepIndex, stepStartedAt };
}

/** Step 0 is the initial state; step 1 is the first advance. */
export function useStep(at: number) {
  const runtime = usePresentation();
  const reached = runtime.stepIndex >= at;
  const epoch = runtime.stepEpochs?.[at];
  const [clock, setClock] = useState({ epoch, elapsed: 0 });
  useEffect(() => {
    if (!reached || !runtime.isActive || runtime.isPreview || epoch === undefined) return;
    let frame = 0;
    const tick = () => {
      setClock({ epoch, elapsed: Math.max(0, performance.now() - epoch) / 1000 });
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [epoch, reached, runtime.isActive, runtime.isPreview]);
  return { reached, isCurrent: runtime.stepIndex === at,
    elapsed: reached && !runtime.isPreview && clock.epoch === epoch ? clock.elapsed : 0,
    startedAt: epoch, direction: runtime.direction ?? "forward" };
}

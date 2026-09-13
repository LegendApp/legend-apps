import { observable, ObservableHint, type OpaqueObject } from "@legendapp/state";
import type { ComponentType } from "react";
import type { DeckConfig, PresentationTemplates, SlideConfig } from "@legend-apps/presentation";
import type { CompileDeckSuccess } from "@legend-apps/presentation";

export type DeckSlide = {
  metadata: SlideConfig;
  notes: string;
};

export type SlidesState = {
  deckLocked: boolean;
  displayMessage: string;
  runtimeErrors: string[];
  retryRevision: number;
  pendingDeck: { path: string; result: CompileDeckSuccess; remember: boolean } | null;
  audienceOpen: boolean;
  blackout: boolean;
  buildErrors: string[];
  buildWarnings: string[];
  component: ComponentType<any> | null;
  config: DeckConfig;
  currentSlide: number;
  currentStep: number;
  slideStartedAt: number;
  stepStartedAt: number;
  stepEpochs: Record<number, number>;
  direction: "forward" | "backward";
  deckPath: string | null;
  revision: number;
  slides: DeckSlide[];
  status: "idle" | "building" | "ready" | "error";
  templates: PresentationTemplates;
};

// Compiled components and template functions are data, not computed observables.
type SlidesObservableState = Omit<SlidesState, "component"> & {
  compiled: OpaqueObject<{ component: ComponentType<any> }> | null;
};

export const slidesState$ = observable<SlidesObservableState>({
  deckLocked: false,
  displayMessage: "",
  runtimeErrors: [],
  retryRevision: 0,
  pendingDeck: null,
  audienceOpen: false,
  blackout: false,
  buildErrors: [],
  buildWarnings: [],
  compiled: null,
  config: {},
  currentSlide: 0,
  currentStep: 0,
  slideStartedAt: performance.now(),
  stepStartedAt: performance.now(),
  stepEpochs: {},
  direction: "forward",
  deckPath: null,
  revision: 0,
  slides: [],
  status: "idle",
  templates: ObservableHint.opaque({}),
});

export function getSlidesState() {
  const { compiled, ...state } = slidesState$.peek();
  return { ...state, component: compiled?.component ?? null };
}

export function setSlidesState(update: Partial<SlidesState> | ((current: SlidesState) => Partial<SlidesState>)) {
  const state = getSlidesState();
  const next = { ...state, ...(typeof update === "function" ? update(state) : update) };
  next.currentStep = Math.max(0, Math.min(next.currentStep, getSlideStepCount(next.slides[next.currentSlide]) - 1));
  // Both windows share one clock, including when the audience opens mid-slide.
  const slideRestarted = next.currentSlide !== state.currentSlide || next.revision !== state.revision
    || next.retryRevision !== state.retryRevision || (next.audienceOpen && !state.audienceOpen);
  if (slideRestarted) {
    next.slideStartedAt = performance.now();
  }
  if (slideRestarted || next.currentStep !== state.currentStep) {
    next.stepStartedAt = performance.now();
  }
  if (slideRestarted) {
    next.stepEpochs = Object.fromEntries(Array.from({ length: next.currentStep + 1 }, (_, step) => [step, next.stepStartedAt]));
  } else if (next.currentStep !== state.currentStep) {
    next.direction = next.currentStep > state.currentStep ? "forward" : "backward";
    next.stepEpochs = Object.fromEntries(Object.entries(state.stepEpochs).filter(([step]) => Number(step) <= next.currentStep));
    if (next.currentStep > state.currentStep) next.stepEpochs[next.currentStep] = next.stepStartedAt;
  }
  const { component, ...data } = next;
  const compiled = slidesState$.compiled.peek();
  slidesState$.set({
    ...data,
    compiled: component === compiled?.component ? compiled : component ? ObservableHint.opaque({ component }) : null,
    pendingDeck: data.pendingDeck ? ObservableHint.opaque(data.pendingDeck) : null,
    templates: ObservableHint.opaque(data.templates),
  });
}

export function getSlideStepCount(slide: DeckSlide | undefined) {
  const steps = slide?.metadata?.steps;
  return typeof steps === "number" && Number.isFinite(steps) ? Math.max(1, Math.floor(steps)) : 1;
}

export function getNextPresentationTarget(current: Pick<SlidesState, "currentSlide" | "currentStep" | "slides">) {
  const stepCount = getSlideStepCount(current.slides[current.currentSlide]);
  if (current.currentStep + 1 < stepCount) {
    return { slideIndex: current.currentSlide, stepIndex: current.currentStep + 1 };
  }
  return {
    slideIndex: Math.min(current.currentSlide + 1, Math.max(0, current.slides.length - 1)),
    stepIndex: current.currentSlide + 1 < current.slides.length ? 0 : current.currentStep,
  };
}

export function setCurrentSlide(index: number) {
  setSlidesState((current) => ({
    currentSlide: Math.max(0, Math.min(index, Math.max(0, current.slides.length - 1))),
    currentStep: 0,
  }));
}

export function nextSlide() {
  const state = getSlidesState();
  const target = getNextPresentationTarget(state);
  if (target.slideIndex === state.currentSlide && target.stepIndex !== state.currentStep) {
    setSlidesState({ currentStep: target.stepIndex });
    return;
  }
  if (target.slideIndex !== state.currentSlide) {
    setCurrentSlide(target.slideIndex);
  }
}

export function previousSlide() {
  const state = getSlidesState();
  if (state.currentStep > 0) {
    setSlidesState({ currentStep: state.currentStep - 1 });
    return;
  }
  if (state.currentSlide > 0) {
    const previousIndex = state.currentSlide - 1;
    setSlidesState({
      currentSlide: previousIndex,
      currentStep: getSlideStepCount(state.slides[previousIndex]) - 1,
    });
  }
}

export function reportSlideError(error: unknown, slideIndex: number, isPreview: boolean) {
  const state = getSlidesState();
  const message = `Slide ${slideIndex + 1}${isPreview ? " (preview)" : ""}: ${error instanceof Error ? error.message : String(error)}`;
  if (!state.runtimeErrors.includes(message)) {
    setSlidesState({ runtimeErrors: [...state.runtimeErrors.slice(-19), message] });
  }
}

export function retrySlideContent() {
  const state = getSlidesState();
  setSlidesState({ retryRevision: state.retryRevision + 1, runtimeErrors: [] });
}

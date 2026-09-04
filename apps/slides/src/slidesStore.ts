import { useSyncExternalStore } from "react";
import type { ComponentType } from "react";
import type { DeckConfig, SlideConfig } from "@legend-apps/presentation";
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
  deckPath: string | null;
  revision: number;
  slides: DeckSlide[];
  status: "idle" | "building" | "ready" | "error";
};

let state: SlidesState = {
  deckLocked: false,
  displayMessage: "",
  runtimeErrors: [],
  retryRevision: 0,
  pendingDeck: null,
  audienceOpen: false,
  blackout: false,
  buildErrors: [],
  buildWarnings: [],
  component: null,
  config: {},
  currentSlide: 0,
  deckPath: null,
  revision: 0,
  slides: [],
  status: "idle",
};
const listeners = new Set<() => void>();

export function getSlidesState() {
  return state;
}

export function setSlidesState(update: Partial<SlidesState> | ((current: SlidesState) => Partial<SlidesState>)) {
  state = { ...state, ...(typeof update === "function" ? update(state) : update) };
  listeners.forEach((listener) => listener());
}

export function useSlidesState<T>(selector: (value: SlidesState) => T) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(state),
  );
}

export function setCurrentSlide(index: number) {
  setSlidesState((current) => ({
    currentSlide: Math.max(0, Math.min(index, Math.max(0, current.slides.length - 1))),
  }));
}

export function nextSlide() {
  setCurrentSlide(state.currentSlide + 1);
}

export function previousSlide() {
  setCurrentSlide(state.currentSlide - 1);
}

export function reportSlideError(error: unknown, slideIndex: number, isPreview: boolean) {
  const message = `Slide ${slideIndex + 1}${isPreview ? " (preview)" : ""}: ${error instanceof Error ? error.message : String(error)}`;
  if (!state.runtimeErrors.includes(message)) {
    setSlidesState({ runtimeErrors: [...state.runtimeErrors.slice(-19), message] });
  }
}

export function retrySlideContent() {
  setSlidesState({ retryRevision: state.retryRevision + 1, runtimeErrors: [] });
}

import type { ComponentType } from "react";
import type { CompileDeckFailure, PresentationTemplates } from "@legend-apps/presentation";
import type { SlidesState } from "./slidesStore";

export function shouldDeferDeckUpdate(current: Pick<SlidesState, "deckLocked" | "audienceOpen" | "component">) {
  return current.deckLocked && current.component !== null;
}

export function failedDeckUpdate(result: CompileDeckFailure): Partial<SlidesState> {
  return {
    buildErrors: result.errors,
    buildWarnings: result.warnings,
    status: "error",
  };
}

export function successfulDeckUpdate(
  current: SlidesState,
  component: ComponentType<any>,
  templates: PresentationTemplates,
  path: string,
  warnings: string[],
): Partial<SlidesState> {
  return {
    buildErrors: [],
    buildWarnings: warnings,
    component,
    pendingDeck: null,
    runtimeErrors: [],
    currentSlide: current.deckPath === path ? current.currentSlide : 0,
    currentStep: current.deckPath === path ? current.currentStep : 0,
    deckPath: path,
    revision: current.revision + 1,
    status: "ready",
    templates,
  };
}

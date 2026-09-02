import type { ComponentType } from "react";
import type { CompileDeckFailure } from "@legend-apps/presentation";
import type { SlidesState } from "./slidesStore";

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
  path: string,
  warnings: string[],
): Partial<SlidesState> {
  return {
    buildErrors: [],
    buildWarnings: warnings,
    component,
    currentSlide: current.currentSlide,
    deckPath: path,
    revision: current.revision + 1,
    status: "ready",
  };
}

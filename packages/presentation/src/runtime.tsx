import { createContext, useContext, type ReactNode } from "react";
import type { PresentationRuntime } from "./types";

const defaultRuntime: PresentationRuntime = {
  currentSlide: 0,
  goTo() {},
  isActive: false,
  isPreview: false,
  next() {},
  previous() {},
  slideCount: 0,
  slideIndex: 0,
};

const PresentationContext = createContext(defaultRuntime);

export function PresentationProvider({ children, value }: { children: ReactNode; value: PresentationRuntime }) {
  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation() {
  return useContext(PresentationContext);
}

export function useSlideLifecycle() {
  const { isActive, isPreview, isPreparing, slideIndex, startedAt } = usePresentation();
  return { isActive, isPreview, isPreparing, slideIndex, startedAt };
}

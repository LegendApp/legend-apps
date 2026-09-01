import type { ReactNode } from "react";

export type SlideTransition = "none" | "fade" | "slide";

export type PresentationTheme = {
  backgroundColor?: string;
  color?: string;
  fontFamily?: string;
};

export type DeckConfig = {
  aspectRatio?: string;
  height?: number;
  presenter?: {
    showNext?: boolean;
    showNotes?: boolean;
  };
  theme?: PresentationTheme;
  title?: string;
  transition?: SlideTransition;
  width?: number;
};

export type SlideConfig = {
  transition?: SlideTransition;
  [key: string]: unknown;
};

export type PresentationRuntime = {
  currentSlide: number;
  goTo(slideIndex: number): void;
  isActive: boolean;
  isPreview: boolean;
  next(): void;
  previous(): void;
  slideCount: number;
  slideIndex: number;
};

export type CompiledSlideProps = {
  children?: ReactNode;
  index: string;
  metadataJson: string;
  notes: string;
};

export type CompiledDeckProps = {
  children?: ReactNode;
  configJson: string;
};

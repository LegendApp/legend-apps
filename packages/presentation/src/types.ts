import type { ComponentType, ReactNode } from "react";

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
  template?: string;
  theme?: PresentationTheme;
  title?: string;
  transition?: SlideTransition;
  width?: number;
};

export type SlideConfig = {
  template?: string | false;
  transition?: SlideTransition;
  [key: string]: unknown;
};

export type PresentationTemplateProps = {
  children?: ReactNode;
  deck: DeckConfig;
  slide: SlideConfig;
};

export type PresentationTemplates = Record<string, ComponentType<PresentationTemplateProps>>;

export type PresentationRuntime = {
  currentSlide: number;
  goTo(slideIndex: number): void;
  isActive: boolean;
  isPreview: boolean;
  /** Full-size audience surface being prepared offscreen. */
  isPreparing?: boolean;
  next(): void;
  previous(): void;
  slideCount: number;
  slideIndex: number;
  /** Shared performance.now() epoch for the active slide animation. */
  startedAt?: number;
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

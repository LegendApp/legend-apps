export { Background, BackgroundHost, useBackgroundSize, useBackgroundHost, useHasBackground } from "./background";
export { PresentationProvider, usePresentation, useSlideLifecycle, useStep } from "./runtime";
export { defineTypeGPUScene } from "./typegpu";
export { renderNativeChildren } from "./nativeChildren";
export { persistSlideSpeakerNotesWithFileAccess, updateSlideSpeakerNotes } from "./speakerNotesSource";
export type { SpeakerNotesFileAccess } from "./speakerNotesSource";
export type {
  CompiledDeckProps,
  CompiledSlideProps,
  DeckConfig,
  PresentationRuntime,
  PresentationTemplateProps,
  PresentationTemplates,
  PresentationTheme,
  SlideConfig,
  SlideTransition,
} from "./types";
export type { CompileDeckFailure, CompileDeckResult, CompileDeckSuccess } from "./compiler/types";
export type {
  TypeGPUFrameContext,
  TypeGPUScene,
  TypeGPUSceneContext,
  TypeGPUSceneInstance,
  TypeGPUSceneSize,
} from "./typegpu";

export { useRuntimeProjection } from "./useRuntimeProjection";
export { Background, BackgroundHost, useBackgroundSize, useBackgroundHost, useHasBackground } from "./background";
export { PresentationProvider, PresentationObservableProvider, usePresentation$, usePresentationValue, usePresentation, useSlideLifecycle, useStep } from "./runtime";
export { defineTypeGPUScene } from "./typegpu";
export { renderNativeChildren } from "./nativeChildren";
export { FocusRegion, SharedElement, FocusStage, FocusSurfaceContext, createFocusSurface, measureFocusSurface, createFocusMotion } from "./focus";
export type { FocusMotion, FocusSurface } from "./focus";
export { normalizeTransition, resolveTransition, focusCamera } from "./focusGeometry";
export { persistSlideSpeakerNotesWithFileAccess, updateSlideSpeakerNotes } from "./speakerNotesSource";
export { getDeckSourceStructure, slideAtSourceOffset } from "./speakerNotesSource";
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
  FocusTransition,
} from "./types";
export type { CompileDeckFailure, CompileDeckResult, CompileDeckSuccess } from "./compiler/types";
export type {
  TypeGPUFrameContext,
  TypeGPUScene,
  TypeGPUSceneContext,
  TypeGPUSceneInstance,
  TypeGPUSceneSize,
} from "./typegpu";

export { columnWeights, layoutOverflows } from "./layout";
export type { LayoutProps, LayoutKind } from "./layout";

export { defineTransition, builtinTransitionSources } from "./transitions";
export type { TransitionDefinition, TransitionContext, PresentationTransitions } from "./transitions";

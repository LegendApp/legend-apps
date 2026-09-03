export { PresentationProvider, usePresentation, useSlideLifecycle } from "./runtime";
export { defineTypeGPUScene } from "./typegpu";
export { renderNativeChildren } from "./nativeChildren";
export type {
  CompiledDeckProps,
  CompiledSlideProps,
  DeckConfig,
  PresentationRuntime,
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

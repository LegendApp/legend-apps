export { useRuntimeProjection } from "./useRuntimeProjection";
export { PresentationCanvas, PresentationCanvasScaleContext } from "./PresentationCanvas";
export { PreparationBoundary, usePreparationTask } from "./PreparationBoundary";
export { ProgressivePreparation } from "./ProgressivePreparation";
export { Background, BackgroundHost, useBackgroundIntensity, useBackgroundSize, useBackgroundHost, useHasBackground } from "./background";
export { PresentationProvider, PresentationObservableProvider, usePresentation$, usePresentationValue, usePresentation, useSlideLifecycle, useStep } from "./runtime";
export { defineTypeGPUScene } from "./typegpu";
export { renderNativeChildren } from "./nativeChildren";
export { FocusRegion, SharedElement, useSharedElementTransition, FocusStage, FocusSurfaceContext, createFocusSurface, prepareFocusSurface, invalidateFocusSurface, measureFocusSurface, measureFocusPair, createFocusMotion } from "./focus";
export type { FocusMotion, FocusSurface } from "./focus";
export { normalizeTransition, resolveTransition, focusCamera } from "./focusGeometry";
export { getSpeakerNotesTargets, persistSlideSpeakerNotesWithFileAccess, updateSlideSpeakerNotes, SpeakerNotesConflictError } from "./speakerNotesSource";
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
export { SceneMotionView, type ScenePose } from "./SceneMotionView";
export { useAnimatedShaderUniforms, useBackgroundInteractionUniforms } from "./useAnimatedShaderUniforms";

export { ScenePositionView } from "./ScenePositionView";

export { usePlayback, samplePlayback } from "./playback";
export type { PlaybackPhase, PlaybackState } from "./playbackState";
export { PlaybackKeyframeView, type PlaybackKeyframe } from "./PlaybackKeyframeView";

export { usePlaybackTween } from "./usePlaybackTween";
export { NavigationTransitionContext, NavigationExitView } from "./navigation";
export { useSharedElementEntrance } from "./useSharedElementEntrance";
export { liquidGlassShader } from "./liquidGlassShader";
export { useLiquidGlassPlayback } from "./useLiquidGlassPlayback";

export { SnapshotCaptureBoundary } from "./SnapshotCaptureBoundary";
export { snapshotCaptureQueue } from "./snapshotCaptureQueue";
export { createSnapshotImageCache } from "./snapshotImageCache";
export { useAdvanceAfterStep } from "./useAdvanceAfterStep";

export { useNativeVideo } from "./useNativeVideo";
export { NativeVideoView } from "./NativeVideoView";

export { createTransitionProgress, interpolateTransition, subtractTransition, divideTransition, sampleTransitionValue, resolveTransitionStyle, useTransitionStyle, type TransitionProgress, type TransitionStyle } from "./transitionValues";

export { GPUShader, GPUShaderProvider, useGPUShaderAvailable, type GPUShaderProps } from "./GPUShader";

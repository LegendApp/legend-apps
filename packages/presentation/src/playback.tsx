import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { runOnUI, useFrameCallback, useSharedValue, type SharedValue } from "react-native-reanimated";
import type { PresentationRuntime } from "./types";
import { advancePlayback, createPlaybackState, transitionPlayback, type PlaybackPhase, type PlaybackState } from "./playbackState";

const PlaybackContext = createContext<SharedValue<PlaybackState> | null>(null);

/** One UI-thread clock per slide surface, shared by shaders and native content. */
export function PlaybackProvider({ runtime$, children }: { runtime$: Observable<PresentationRuntime>; children: ReactNode }) {
  const phase = useValue((): PlaybackPhase => runtime$.playbackPhase.get()
    ?? (runtime$.isPreparing.get() ? "preparing" : runtime$.isPreview.get() ? "preview"
      : runtime$.isActive.get() ? "playing" : "paused"));
  const slideKey = useValue(() => runtime$.playbackScope.get() === "background" ? "background"
    : `${runtime$.slideIndex.get()}:${runtime$.startedAt.get() ?? 0}`);
  const stepKey = useValue(() => `${runtime$.stepIndex.get()}:${runtime$.stepStartedAt.get() ?? 0}`);
  const stepIndex = useValue(runtime$.stepIndex);
  const state = useSharedValue(createPlaybackState({ phase, slideKey, stepKey, stepIndex }));
  const frame = useFrameCallback(({ timestamp }) => {
    state.value = advancePlayback(state.value, timestamp);
  }, false);
  // This is an external UI-runtime lifecycle boundary, not mirrored React state.
  // Publish phase, navigation identity and resets as one UI-thread transaction.
  useLayoutEffect(() => {
    runOnUI(() => {
      "worklet";
      state.value = transitionPlayback(state.value, { phase, slideKey, stepKey, stepIndex });
    })();
    frame.setActive(phase === "playing");
    return () => frame.setActive(false);
  }, [phase, slideKey, stepKey, stepIndex, frame, state]);
  return <PlaybackContext.Provider value={state}>{children}</PlaybackContext.Provider>;
}

export function usePlayback() {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("Animation must be inside a presentation surface and outside the Skia Canvas renderer.");
  return playback;
}

/** Preview sampling never mutates the running clock. */
export function samplePlayback(state: PlaybackState, previewTime: number, clock: "slide" | "step" = "slide") {
  "worklet";
  if (state.phase === "preview") return previewTime;
  if (state.phase === "preparing") return 0;
  return clock === "step" ? state.stepTime : state.slideTime;
}

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { runOnUI, useFrameCallback, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import type { PresentationRuntime } from "./types";
import { advancePlayback, createPlaybackState, transitionPlayback, type PlaybackInput, type PlaybackState } from "./playbackState";

type PlaybackScope = Readonly<{ clock: SharedValue<PlaybackState>; input: Readonly<PlaybackInput> }>;
const PlaybackContext = createContext<PlaybackScope | null>(null);

/** One UI-thread clock per slide surface, shared by shaders and native content. */
export function PlaybackProvider({ runtime$, children }: { runtime$: Observable<PresentationRuntime>; children: ReactNode }) {
  // Read navigation as one narrow snapshot, rather than subscribing to its
  // fields independently. Content and animation consumers share this identity.
  const navigation = useValue((): PlaybackInput => ({
    phase: runtime$.playbackPhase.get()
      ?? (runtime$.isPreparing.get() ? "preparing" : runtime$.isPreview.get() ? "preview"
        : runtime$.isActive.get() ? "playing" : "paused"),
    slideKey: runtime$.playbackScope.get() === "background" ? "background"
      : `${runtime$.slideIndex.get()}:${runtime$.startedAt.get() ?? 0}`,
    stepKey: `${runtime$.stepIndex.get()}:${runtime$.stepStartedAt.get() ?? 0}`,
    stepIndex: runtime$.stepIndex.get(),
  }));
  const { phase, slideKey, stepKey, stepIndex } = navigation;
  const input = useMemo(() => Object.freeze({ phase, slideKey, stepKey, stepIndex }), [phase, slideKey, stepKey, stepIndex]);
  const state = useSharedValue(createPlaybackState({ phase, slideKey, stepKey, stepIndex }));
  const frame = useFrameCallback(({ timestamp }) => {
    state.value = advancePlayback(state.value, timestamp);
  }, false);
  // This is an external UI-runtime lifecycle boundary, not mirrored React state.
  // Publish phase, navigation identity and resets as one UI-thread transaction.
  useLayoutEffect(() => {
    runOnUI(() => {
      "worklet";
      state.value = transitionPlayback(state.value, input);
    })();
    frame.setActive(phase === "playing");
    return () => frame.setActive(false);
  }, [input, phase, frame, state]);
  const scope = useMemo(() => Object.freeze({ clock: state, input }), [state, input]);
  return <PlaybackContext.Provider value={scope}>{children}</PlaybackContext.Provider>;
}

/** The only public clock is scoped to the navigation that rendered its consumer.
 * New content immediately samples its initial state; no hidden frame, extra
 * timer, or JS read of the running UI clock is needed during navigation.
 */
export function usePlayback() {
  const scope = useContext(PlaybackContext);
  if (!scope) throw new Error("Animation must be inside a presentation surface and outside the Skia Canvas renderer.");
  return useDerivedValue(() => transitionPlayback(scope.clock.value, scope.input), [scope]);
}

/** Preview sampling never mutates the running clock. */
export function samplePlayback(state: PlaybackState, previewTime: number, clock: "slide" | "step" | number = "slide") {
  "worklet";
  if (state.phase === "preview") return previewTime;
  if (state.phase === "preparing") return 0;
  if (typeof clock === "number") return state.stepIndex < clock ? 0 : Math.max(0, state.slideTime - (state.stepOrigins[clock] ?? 0));
  return clock === "step" ? state.stepTime : state.slideTime;
}

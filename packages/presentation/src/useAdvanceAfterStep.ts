import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import { usePlayback } from "./playback";
import { usePresentation$, usePresentationValue } from "./runtime";

const completed = new Set<string>();

/** One completion event from the shared UI clock; stale/duplicate surface events are ignored. */
export function useAdvanceAfterStep(step: number, seconds: number) {
  const playback = usePlayback();
  const runtime$ = usePresentation$();
  const slide = usePresentationValue("slideIndex");
  const advance = (key: string) => {
    const runtime = runtime$.peek();
    if (runtime.playbackPhase === "playing" && runtime.currentSlide === slide && runtime.currentStep === step && !completed.has(key)) {
      completed.add(key);
      if (completed.size > 64) completed.delete(completed.values().next().value!);
      runtime.next();
    }
  };
  useAnimatedReaction(() => {
    const state = playback.value;
    return state.phase === "playing" && state.stepIndex === step && state.stepTime >= seconds ? state.slideKey + ":" + state.stepKey : null;
  }, (key, previous) => { if (key && key !== previous) runOnJS(advance)(key); }, [step, seconds, slide, runtime$]);
}

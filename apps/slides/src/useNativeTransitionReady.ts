import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import type { TransitionProgress } from "@legend-apps/presentation";

/** Only the first advancing UI frame signals JS; animation frames stay on UI. */
export function useNativeTransitionReady(progress: TransitionProgress, transitioning: boolean) {
  const [started, setStarted] = useState<TransitionProgress | null>(null);
  const current = useRef<TransitionProgress | null>(progress);
  useLayoutEffect(() => { current.current = progress; return () => { current.current = null; }; }, [progress]);
  const markStarted = useCallback(() => {
    if (current.current === progress) setStarted(progress);
  }, [progress]);
  useAnimatedReaction(() => transitioning && progress.value > 0, (ready, previous) => {
    if (ready && !previous) runOnJS(markStarted)();
  }, [progress, transitioning]);
  return !transitioning || started === progress;
}

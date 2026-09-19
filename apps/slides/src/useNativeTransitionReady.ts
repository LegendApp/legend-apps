import { useLayoutEffect, useState } from "react";
import type { Animated } from "react-native";

/** Reveal once native Animated has actually advanced the installed graph.
 * This is a one-shot lifecycle signal, never a JS animation-frame driver. */
export function useNativeTransitionReady(progress: Animated.Value, transitioning: boolean) {
  const [started, setStarted] = useState<Animated.Value | null>(null);
  useLayoutEffect(() => {
    if (!transitioning) return;
    let alive = true;
    const listener = progress.addListener(({ value }) => {
      if (!alive || value <= 0) return;
      alive = false;
      progress.removeListener(listener);
      setStarted(progress);
    });
    return () => {
      alive = false;
      progress.removeListener(listener);
    };
  }, [progress, transitioning]);
  return !transitioning || started === progress;
}

import { useAnimatedReaction, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { usePlayback } from "./playback";

export type PlaybackEasing = "cubic" | "smoothstep";
type Values = Record<string, number>;
function equal(a: Values, b: Values) {
  "worklet";
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
function interpolate(from: Values, to: Values, elapsed: number, duration: number, easing: PlaybackEasing) {
  "worklet";
  const p = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed * 1000 / duration));
  const t = easing === "smoothstep" ? p * p * (3 - 2 * p) : p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const result: Values = {};
  for (const key of Object.keys(to)) result[key] = from[key] + (to[key] - from[key]) * t;
  return result;
}

/** Interrupted targets continue from the displayed pose on the shared step clock. */
export function usePlaybackTween<T extends Values>(target: T, duration = 650, initial?: T, easing: PlaybackEasing = "cubic", delay = 0) {
  const playback = usePlayback();
  const entrance = initial !== undefined;
  const from = initial ?? target;
  const motion = useSharedValue({ from, to: target, start: 0, pending: false, slideKey: "", stepKey: "", played: false, settled: false, last: from });
  useAnimatedReaction(() => ({ clock: playback.value, target, from, entrance }), ({ clock, target: to, from, entrance }) => {
    const old = motion.value;
    if (clock.phase === "outgoing" || clock.phase === "paused") return;
    if (clock.phase === "preview" || clock.phase === "preparing") {
      if (old.played) motion.value = { ...old, played: false };
      return;
    }
    const first = !old.played || old.slideKey !== clock.slideKey;
    if (first || !equal(old.to, to)) {
      const start = first ? 0 : old.stepKey !== clock.stepKey ? clock.slideTime - clock.stepTime : clock.slideTime;
      const origin = first ? entrance ? from : to : old.last;
      motion.value = { from: origin, to, start, pending: !first && old.stepKey !== clock.stepKey && clock.stepPending,
        slideKey: clock.slideKey, stepKey: clock.stepKey, played: true, settled: equal(origin, to), last: origin };
    } else if (old.stepKey !== clock.stepKey) {
      motion.value = { ...old, stepKey: clock.stepKey };
    }
    if (motion.value.pending && !clock.stepPending) {
      motion.value = { ...motion.value, pending: false, start: clock.slideTime - clock.stepTime };
    }
    const next = motion.value;
    // A settled pose must not keep invalidating every downstream native style
    // and Skia uniform while the slide's ambient clock continues to tick.
    if (next.settled) return;
    const elapsed = (next.pending ? 0 : clock.slideTime - next.start) - delay / 1000;
    motion.value = { ...next, settled: elapsed * 1000 >= duration,
      last: interpolate(next.from, next.to, elapsed, duration, easing) as T };
  }, [target, from, entrance, duration, easing, delay]);
  return useDerivedValue(() => playback.value.phase === "preview" ? target
    : playback.value.phase === "preparing" ? from : motion.value.last, [target, from]);
}

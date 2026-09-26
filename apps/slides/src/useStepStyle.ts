import type { ViewStyle } from "react-native";
import { useAnimatedReaction, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { usePlayback } from "@legend-apps/presentation";

function colorChannels(color: string) {
  "worklet";
  let hex = color.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = hex.split("").map(value => value + value).join("");
  if (hex.length === 6) hex += "ff";
  if (!/^[0-9a-f]{8}$/i.test(hex)) return undefined;
  return [0, 2, 4, 6].map(index => parseInt(hex.slice(index, index + 2), 16));
}

/** Preserve legacy numeric, transform and hex-color styles without JS frame work. */
export function interpolateStepStyle(from: unknown, to: unknown, progress: number): any {
  "worklet";
  if (typeof from === "number" && typeof to === "number") return from + (to - from) * progress;
  if (typeof from === "string" && typeof to === "string" && from.startsWith("#") && to.startsWith("#")) {
    const a = colorChannels(from), b = colorChannels(to);
    if (a && b) {
      const channels = b.map((value, index) => a[index] + (value - a[index]) * progress);
      return `rgba(${Math.round(channels[0])},${Math.round(channels[1])},${Math.round(channels[2])},${channels[3] / 255})`;
    }
  }
  if (Array.isArray(to)) return to.map((value, index) => interpolateStepStyle(Array.isArray(from) ? from[index] : value, value, progress));
  if (to && typeof to === "object") return Object.fromEntries(Object.entries(to).map(([key, value]) =>
    [key, interpolateStepStyle(from && typeof from === "object" ? (from as Record<string, unknown>)[key] : value, value, progress)]));
  return to;
}

export function useStepStyle(target: ViewStyle, duration: number) {
  const playback = usePlayback();
  const key = JSON.stringify(target);
  const motion = useSharedValue({ from: target, last: target, key, slideKey: "", stepKey: "", start: 0, played: false, settled: true });
  useAnimatedReaction(() => playback.value, clock => {
    if (clock.phase === "outgoing" || clock.phase === "paused") return;
    const old = motion.value;
    if (clock.phase === "preview" || clock.phase === "preparing") {
      if (old.played) motion.value = { ...old, played: false };
      return;
    }
    const first = !old.played || old.slideKey !== clock.slideKey;
    if (first || old.key !== key || old.stepKey !== clock.stepKey) {
      // Retarget from the displayed value, including interrupted transitions.
      const from = first ? target : old.last;
      motion.value = { from, last: from, key, slideKey: clock.slideKey, stepKey: clock.stepKey,
        start: first || old.stepKey !== clock.stepKey ? 0 : clock.stepTime, played: true, settled: false };
    }
    const next = motion.value;
    if (next.settled) return;
    const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, (clock.stepTime - next.start) * 1000 / duration));
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    motion.value = { ...next, settled: progress === 1, last: progress === 1 ? target : interpolateStepStyle(next.from, target, eased) };
  }, [target, key, duration]);
  return useAnimatedStyle(() => playback.value.phase === "preview" || playback.value.phase === "preparing"
    ? target : motion.value.last, [target]);
}

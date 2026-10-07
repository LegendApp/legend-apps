import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { samplePlayback, usePlayback } from "./playback";

export type PlaybackKeyframe = { time: number; x: number; y: number; opacity: number };

/** Native keyframes sample the same clock as shaders, including preview/exit. */
export function PlaybackKeyframeView({ children, keyframes, delay = 0, repeatDuration, previewTime = 4,
  clock = "step", style }: { children?: ReactNode; keyframes: PlaybackKeyframe[]; delay?: number;
  repeatDuration?: number; previewTime?: number; clock?: "slide" | "step"; style?: StyleProp<ViewStyle> }) {
  const playback = usePlayback();
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  const waiting = { x: first.x, y: first.y, opacity: 0 };
  const pose = useDerivedValue(() => {
    const elapsed = samplePlayback(playback.value, previewTime, clock) * 1000 - delay;
    if (elapsed < 0) return waiting;
    if (!repeatDuration && elapsed >= last.time) return last;
    const time = repeatDuration ? elapsed % repeatDuration : elapsed;
    let index = 0;
    while (index < keyframes.length - 2 && keyframes[index + 1].time < time) index++;
    const a = keyframes[index];
    const b = keyframes[Math.min(index + 1, keyframes.length - 1)];
    const fraction = b.time === a.time ? 1 : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
    return {
      opacity: a.opacity + (b.opacity - a.opacity) * fraction,
      x: a.x + (b.x - a.x) * fraction,
      y: a.y + (b.y - a.y) * fraction,
    };
  }, [keyframes, delay, repeatDuration, previewTime, clock, waiting, last]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pose.value.opacity,
    transform: [{ translateX: pose.value.x }, { translateY: pose.value.y }],
  }));
  return <Animated.View pointerEvents="none" style={[style, animatedStyle]}>{children}</Animated.View>;
}

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { samplePlayback, useRenderPlayback } from "./playback";

export type PlaybackKeyframe = { time: number; x: number; y: number; opacity: number };

/** Native keyframes sample the same clock as shaders, including preview/exit. */
export function PlaybackKeyframeView({ children, keyframes, delay = 0, repeatDuration, previewTime = 4,
  clock = "step", style }: { children?: ReactNode; keyframes: PlaybackKeyframe[]; delay?: number;
  repeatDuration?: number; previewTime?: number; clock?: "slide" | "step"; style?: StyleProp<ViewStyle> }) {
  const playback = useRenderPlayback();
  const animatedStyle = useAnimatedStyle(() => {
    const elapsed = samplePlayback(playback.value, previewTime, clock) * 1000 - delay;
    const time = elapsed < 0 ? 0 : repeatDuration ? elapsed % repeatDuration : elapsed;
    let index = 0;
    while (index < keyframes.length - 2 && keyframes[index + 1].time < time) index++;
    const a = keyframes[index];
    const b = keyframes[Math.min(index + 1, keyframes.length - 1)];
    const fraction = b.time === a.time ? 1 : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
    return {
      opacity: elapsed < 0 ? 0 : a.opacity + (b.opacity - a.opacity) * fraction,
      transform: [{ translateX: a.x + (b.x - a.x) * fraction }, { translateY: a.y + (b.y - a.y) * fraction }],
    };
  }, [keyframes, delay, repeatDuration, previewTime, clock]);
  return <Animated.View pointerEvents="none" style={[style, animatedStyle]}>{children}</Animated.View>;
}

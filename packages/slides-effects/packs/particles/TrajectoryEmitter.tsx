import { PlaybackKeyframeView, type PlaybackKeyframe } from "@legend-apps/presentation";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
export function TrajectoryEmitter({ trajectories, renderParticle, interval = 300, start = 0, initialEmissions = [], previewTime = 4, clock = "step", style }: {
  trajectories: PlaybackKeyframe[][]; renderParticle: (index: number, initial: boolean) => ReactNode; interval?: number; start?: number;
  initialEmissions?: { trajectory: number; delay: number }[]; previewTime?: number; clock?: "slide" | "step"; style?: StyleProp<ViewStyle>;
}) {
  if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(start) || start < 0 ||
    trajectories.some(path => path.length < 2 || path.some((frame, index) =>
      ![frame.time, frame.x, frame.y, frame.opacity].every(Number.isFinite) || frame.time < 0 ||
      index > 0 && frame.time < path[index - 1].time)) ||
    initialEmissions.some(item => !trajectories[item.trajectory] || !Number.isFinite(item.delay) || item.delay < 0)) {
    throw new Error("Invalid trajectory emission schedule");
  }
  const repeatDuration = trajectories.length * interval;
  return <>
    {trajectories.map((keyframes, index) => <PlaybackKeyframeView key={index} keyframes={keyframes}
      delay={start + index * interval} repeatDuration={repeatDuration} previewTime={previewTime} clock={clock} style={style}>{renderParticle(index, false)}</PlaybackKeyframeView>)}
    {initialEmissions.map(({trajectory, delay}, index) => <PlaybackKeyframeView key={`intro-${index}`} keyframes={trajectories[trajectory]}
      delay={delay} previewTime={previewTime} clock={clock} style={style}>{renderParticle(trajectory, true)}</PlaybackKeyframeView>)}
  </>;
}

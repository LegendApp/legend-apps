import type { ReactNode } from "react";
import type { StyleProp, ViewStyle, ViewProps } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { usePlayback } from "./playback";

export type ScenePose = { x?: number; y?: number; scaleX?: number; scaleY?: number; opacity?: number };
type Pose = Required<ScenePose>;
const poseDefaults: Pose = { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 };
function samePose(a: Pose, b: Pose) {
  "worklet";
  return a.x === b.x && a.y === b.y && a.scaleX === b.scaleX && a.scaleY === b.scaleY && a.opacity === b.opacity;
}
function interpolatePose(from: Pose, to: Pose, elapsed: number, duration: number): Pose {
  "worklet";
  const p = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed * 1000 / duration));
  const t = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
    scaleX: from.scaleX + (to.scaleX - from.scaleX) * t,
    scaleY: from.scaleY + (to.scaleY - from.scaleY) * t, opacity: from.opacity + (to.opacity - from.opacity) * t };
}

/** Native poses and shaders share the same surface timeline and freeze rules. */
export function SceneMotionView({ pose, style, children, duration = 650, hidden = false, initialPose, pointerEvents = "none" }: {
  pointerEvents?: ViewProps["pointerEvents"]; pose: ScenePose; initialPose?: ScenePose;
  style?: StyleProp<ViewStyle>; children?: ReactNode; duration?: number; hidden?: boolean;
}) {
  const playback = usePlayback();
  const target = { ...poseDefaults, ...pose };
  const entrance = initialPose !== undefined;
  const initial = { ...target, ...initialPose };
  const motion = useSharedValue({ from: initial, to: target, start: 0, slideKey: "", stepKey: "", played: false, last: initial });
  useAnimatedReaction(() => ({ clock: playback.value, target, initial, entrance }), ({ clock, target: to, initial: from, entrance: enter }) => {
    const old = motion.value;
    if (clock.phase === "outgoing" || clock.phase === "paused") return;
    if (clock.phase === "preview" || clock.phase === "preparing") {
      if (old.played) motion.value = { ...old, played: false };
      return;
    }
    const first = !old.played || old.slideKey !== clock.slideKey;
    if (first || old.stepKey !== clock.stepKey || !samePose(old.to, to)) {
      const start = first || old.stepKey !== clock.stepKey ? 0 : clock.stepTime;
      motion.value = { from: first ? enter ? from : to : old.last, to, start,
        slideKey: clock.slideKey, stepKey: clock.stepKey, played: true, last: first ? enter ? from : to : old.last };
    }
    const next = motion.value;
    motion.value = { ...next, last: interpolatePose(next.from, next.to, clock.stepTime - next.start, duration) };
  }, [target, initial, entrance, duration]);
  const animatedStyle = useAnimatedStyle(() => {
    const phase = playback.value.phase;
    const value = phase === "preview" ? target : phase === "preparing" ? initial : motion.value.last;
    return { opacity: value.opacity, transform: [{ translateX: value.x }, { translateY: value.y },
      { scaleX: value.scaleX }, { scaleY: value.scaleY }] };
  }, [target, initial]);
  return <Animated.View pointerEvents={hidden ? "none" : pointerEvents} accessibilityElementsHidden={hidden}
    importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} style={[style, animatedStyle]}>{children}</Animated.View>;
}

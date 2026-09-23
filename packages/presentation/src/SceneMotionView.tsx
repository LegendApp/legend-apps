import type { ReactNode } from "react";
import type { StyleProp, ViewStyle, ViewProps } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { usePlaybackTween } from "./usePlaybackTween";

export type ScenePose = { x?: number; y?: number; scaleX?: number; scaleY?: number; opacity?: number };
type Pose = Required<ScenePose>;
const poseDefaults: Pose = { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 };
/** Native poses and shaders share the same surface timeline and freeze rules. */
export function SceneMotionView({ pose, style, children, duration = 650, delay = 0, hidden = false, initialPose, pointerEvents = "none" }: {
  pointerEvents?: ViewProps["pointerEvents"]; pose: ScenePose; initialPose?: ScenePose;
  style?: StyleProp<ViewStyle>; children?: ReactNode; duration?: number; delay?: number; hidden?: boolean;
}) {
  const target = { ...poseDefaults, ...pose };
  const motion = usePlaybackTween(target, duration, initialPose ? { ...target, ...initialPose } : undefined, "cubic", delay);
  const animatedStyle = useAnimatedStyle(() => {
    const value = motion.value;
    return { opacity: value.opacity, transform: [{ translateX: value.x }, { translateY: value.y },
      { scaleX: value.scaleX }, { scaleY: value.scaleY }] };
  });
  return <Animated.View pointerEvents={hidden ? "none" : pointerEvents} accessibilityElementsHidden={hidden}
    importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} style={[style, animatedStyle]}>{children}</Animated.View>;
}

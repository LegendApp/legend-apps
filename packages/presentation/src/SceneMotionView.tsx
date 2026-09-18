import { useEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

export type ScenePose = {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
};

/** Decks pass poses as data; this host-compiled worklet animates on the UI thread. */
export function SceneMotionView({ pose, style, children, duration = 650, hidden = false }: {
  pose: ScenePose;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  duration?: number;
  hidden?: boolean;
}) {
  const preview = usePresentationValue("isPreview");
  const active = usePresentationValue("isActive");
  const { x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1 } = pose;
  const translateX = useSharedValue(x);
  const translateY = useSharedValue(y);
  const horizontalScale = useSharedValue(scaleX);
  const verticalScale = useSharedValue(scaleY);
  const alpha = useSharedValue(opacity);
  useEffect(() => {
    const config = { duration, easing: Easing.inOut(Easing.cubic) };
    translateX.value = preview || !active ? x : withTiming(x, config);
    translateY.value = preview || !active ? y : withTiming(y, config);
    horizontalScale.value = preview || !active ? scaleX : withTiming(scaleX, config);
    verticalScale.value = preview || !active ? scaleY : withTiming(scaleY, config);
    alpha.value = preview || !active ? opacity : withTiming(opacity, config);
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(horizontalScale);
      cancelAnimation(verticalScale);
      cancelAnimation(alpha);
    };
  }, [x, y, scaleX, scaleY, opacity, duration, preview, active, translateX, translateY, horizontalScale, verticalScale, alpha]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: alpha.value,
    transform: [
      { translateX: translateX.value }, { translateY: translateY.value },
      { scaleX: horizontalScale.value }, { scaleY: verticalScale.value },
    ],
  }));
  return <Animated.View pointerEvents="none" accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} style={[style, animatedStyle]}>{children}</Animated.View>;
}

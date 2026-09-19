import { useLayoutEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

/** Keep destination layout measurable while the UI thread interpolates its position. */
export function ScenePositionView({ y, children, style, duration = 650 }: {
  y: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const position = useSharedValue(y);
  useLayoutEffect(() => {
    position.value = active && !preview
      ? withTiming(y, { duration, easing: Easing.inOut(Easing.cubic) }) : y;
    return () => cancelAnimation(position);
  }, [active, preview, y, duration, position]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: position.value - y }] }), [y]);
  return <Animated.View style={[style, { position: "absolute", top: y }, motion]}>{children}</Animated.View>;
}

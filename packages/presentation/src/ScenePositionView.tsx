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
  // Commit the destination layout and its compensation together on the UI
  // thread. A React-driven top update can otherwise precede the new transform
  // by a frame, briefly flashing the row at its destination before it moves.
  const motion = useAnimatedStyle(() => ({ top: y, transform: [{ translateY: position.value - y }] }), [y]);
  return <Animated.View style={[style, { position: "absolute" }, motion]}>{children}</Animated.View>;
}

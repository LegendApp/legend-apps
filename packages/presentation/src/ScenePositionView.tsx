import { useContext, useLayoutEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";
import { FocusLayoutOffsetContext } from "./focus";

/** Move only the transform; expose destination geometry to shared measurement. */
export function ScenePositionView({ y, children, style, duration = 650 }: {
  y: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const ancestorOffset = useContext(FocusLayoutOffsetContext);
  const position = useSharedValue(y);
  useLayoutEffect(() => {
    position.value = active && !preview
      ? withTiming(y, { duration, easing: Easing.inOut(Easing.cubic) }) : y;
    return () => cancelAnimation(position);
  }, [active, preview, y, duration, position]);
  // Never relocate native layout during motion. Fabric layout and transform
  // updates can land separately even when issued by the same animated style.
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: position.value }] }));
  return <Animated.View style={[style, { position: "absolute", top: 0 }, motion]}>
    <FocusLayoutOffsetContext.Provider value={ancestorOffset + y}>{children}</FocusLayoutOffsetContext.Provider>
  </Animated.View>;
}

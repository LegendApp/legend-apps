import { useLayoutEffect, type ReactNode } from "react";
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
export function SceneMotionView({ pose, style, children, duration = 650, hidden = false, initialPose }: {
  pose: ScenePose;
  /** Entrance pose, replayed when the slide becomes active. Previews show the target. */
  initialPose?: ScenePose;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  duration?: number;
  hidden?: boolean;
}) {
  const preview = usePresentationValue("isPreview");
  const active = usePresentationValue("isActive");
  const preparing = usePresentationValue("isPreparing");
  const startedAt = usePresentationValue("startedAt");
  const entranceEpoch = initialPose ? startedAt : undefined;
  const { x = 0, y = 0, scaleX = 1, scaleY = 1, opacity = 1 } = pose;
  const fromX = initialPose?.x ?? x;
  const fromY = initialPose?.y ?? y;
  const fromScaleX = initialPose?.scaleX ?? scaleX;
  const fromScaleY = initialPose?.scaleY ?? scaleY;
  const fromOpacity = initialPose?.opacity ?? opacity;
  const entrance = initialPose !== undefined;
  const translateX = useSharedValue(preview ? x : fromX);
  const translateY = useSharedValue(preview ? y : fromY);
  const horizontalScale = useSharedValue(preview ? scaleX : fromScaleX);
  const verticalScale = useSharedValue(preview ? scaleY : fromScaleY);
  const alpha = useSharedValue(preview ? opacity : fromOpacity);
  useLayoutEffect(() => {
    const config = { duration, easing: Easing.inOut(Easing.cubic) };
    if (entrance && !preview) {
      translateX.value = fromX;
      translateY.value = fromY;
      horizontalScale.value = fromScaleX;
      verticalScale.value = fromScaleY;
      alpha.value = fromOpacity;
    }
    if (preview || active && (!entrance || !preparing) || !entrance) {
      const animate = active && !preview;
      translateX.value = animate ? withTiming(x, config) : x;
      translateY.value = animate ? withTiming(y, config) : y;
      horizontalScale.value = animate ? withTiming(scaleX, config) : scaleX;
      verticalScale.value = animate ? withTiming(scaleY, config) : scaleY;
      alpha.value = animate ? withTiming(opacity, config) : opacity;
    }
    return () => {
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(horizontalScale);
      cancelAnimation(verticalScale);
      cancelAnimation(alpha);
    };
  }, [x, y, scaleX, scaleY, opacity, fromX, fromY, fromScaleX, fromScaleY, fromOpacity, entrance, entranceEpoch, preparing, duration, preview, active, translateX, translateY, horizontalScale, verticalScale, alpha]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: alpha.value,
    transform: [
      { translateX: translateX.value }, { translateY: translateY.value },
      { scaleX: horizontalScale.value }, { scaleY: verticalScale.value },
    ],
  }));
  return <Animated.View pointerEvents="none" accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"} style={[style, animatedStyle]}>{children}</Animated.View>;
}

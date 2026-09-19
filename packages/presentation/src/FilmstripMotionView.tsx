import { useLayoutEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, withTiming, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

/** Step-controlled filmstrip. Targets come from JS; interpolation stays on the UI thread. */
export function FilmstripMotionView({ index, count, enabled, position = 0, children, style }: {
  index: number; count: number; enabled: boolean; position?: number; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const selected = Math.max(0, Math.min(count - 1, position));
  const progress = useSharedValue(selected);
  const played = useSharedValue(false);
  const exit = useSharedValue(0);
  useLayoutEffect(() => {
    const config = { duration: 500, easing: Easing.inOut(Easing.cubic) };
    if (active && !preview && !preparing) {
      progress.value = withTiming(selected, config);
      played.value = true;
      exit.value = 0;
    } else if (preparing || !played.value) {
      progress.value = selected;
      played.value = false;
      exit.value = 0;
    } else if (enabled) {
      exit.value = withTiming(1, { ...config, duration: 450 });
    }
    return () => { cancelAnimation(progress); cancelAnimation(exit); };
  }, [selected, active, preview, preparing, enabled, progress, played, exit]);
  const motionStyle = useAnimatedStyle(() => {
    if (!enabled) return { transform: [{ translateX: 0 }, { scale: 1 }], opacity: 1 };
    const distance = Math.abs(index - progress.value);
    const scale = 1 - 0.38 * Math.min(1, distance) - 0.1 * Math.min(1, Math.max(0, distance - 1));
    const initialScale = index === 0 ? 1 : index === 1 ? 0.62 : 0.52;
    const opacity = distance < 1 ? 1 - distance * 0.3 : Math.max(0.25, 0.7 - (distance - 1) * 0.2);
    return { zIndex: Math.round(1000 - distance * 100), transform: [{ translateX: -progress.value * 900 }, { scale: scale / initialScale * (1 - exit.value * 0.12) }], opacity: opacity * (1 - exit.value) };
  });
  return <Animated.View style={[style, motionStyle]}>{children}</Animated.View>;
}

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { cancelAnimation, Easing, withTiming, useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

/** Finite, UI-thread filmstrip. Children start in their measured shared-element slots. */
export function FilmstripMotionView({ index, count, enabled, children, style }: {
  index: number; count: number; enabled: boolean; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const startedAt = usePresentationValue("startedAt");
  const elapsed = useSharedValue(0);
  const played = useSharedValue(false);
  const exit = useSharedValue(0);
  const frame = useFrameCallback(({ timeSincePreviousFrame }: { timeSincePreviousFrame: number | null }) => {
    elapsed.value = Math.min(700 + (count - 1) * 2000, elapsed.value + (timeSincePreviousFrame ?? 0));
  }, false);
  useLayoutEffect(() => {
    if (active && !preview && !preparing) {
      elapsed.value = 0;
      played.value = true;
      exit.value = 0;
    } else if (preparing) {
      played.value = false;
      elapsed.value = 0;
      exit.value = 0;
    } else if (played.value && enabled) {
      exit.value = withTiming(1, { duration: 450, easing: Easing.inOut(Easing.cubic) });
    }
    return () => cancelAnimation(exit);
  }, [startedAt, active, preview, preparing, enabled, elapsed, played, exit]);
  useEffect(() => {
    frame.setActive(enabled && active && !preview && !preparing);
    return () => frame.setActive(false);
  }, [enabled, active, preview, preparing, frame]);
  const motionStyle = useAnimatedStyle(() => {
    if (!enabled || preparing || preview && !played.value) return { transform: [{ translateX: 0 }, { scale: 1 }], opacity: 1 };
    const time = Math.max(0, elapsed.value - 700);
    const fraction = Math.max(0, (time % 2000 - 1500) / 500);
    const position = Math.min(count - 1, Math.floor(time / 2000) + fraction * fraction * (3 - 2 * fraction));
    const distance = Math.abs(index - position);
    const scale = 1 - 0.38 * Math.min(1, distance) - 0.1 * Math.min(1, Math.max(0, distance - 1));
    const initialScale = index === 0 ? 1 : index === 1 ? 0.62 : 0.52;
    const opacity = distance < 1 ? 1 - distance * 0.3 : Math.max(0.25, 0.7 - (distance - 1) * 0.2);
    return { zIndex: Math.round(1000 - distance * 100), transform: [{ translateX: -position * 900 }, { scale: scale / initialScale * (1 - exit.value * 0.12) }], opacity: opacity * (1 - exit.value) };
  });
  return <Animated.View style={[style, motionStyle]}>{children}</Animated.View>;
}

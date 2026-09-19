import { useEffect, type ReactNode } from "react";
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

/** Finite, UI-thread filmstrip. Children start in their measured shared-element slots. */
export function FilmstripMotionView({ index, count, enabled, children }: {
  index: number; count: number; enabled: boolean; children: ReactNode;
}) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const startedAt = usePresentationValue("startedAt");
  const elapsed = useSharedValue(0);
  const frame = useFrameCallback(({ timeSincePreviousFrame }: { timeSincePreviousFrame: number | null }) => {
    elapsed.value = Math.min(700 + (count - 1) * 2000, elapsed.value + (timeSincePreviousFrame ?? 0));
  }, false);
  useEffect(() => { elapsed.value = 0; }, [startedAt, elapsed]);
  useEffect(() => {
    frame.setActive(enabled && active && !preview && !preparing);
    return () => frame.setActive(false);
  }, [enabled, active, preview, preparing, frame]);
  const style = useAnimatedStyle(() => {
    if (!enabled || preview || preparing) return { transform: [{ translateX: 0 }, { scale: 1 }], opacity: 1 };
    const time = Math.max(0, elapsed.value - 700);
    const fraction = Math.max(0, (time % 2000 - 1500) / 500);
    const position = Math.min(count - 1, Math.floor(time / 2000) + fraction * fraction * (3 - 2 * fraction));
    const distance = Math.abs(index - position);
    const scale = 1 - 0.38 * Math.min(1, distance) - 0.1 * Math.min(1, Math.max(0, distance - 1));
    const initialScale = index === 0 ? 1 : index === 1 ? 0.62 : 0.52;
    const opacity = distance < 1 ? 1 - distance * 0.3 : Math.max(0.25, 0.7 - (distance - 1) * 0.2);
    return { transform: [{ translateX: -position * 900 }, { scale: scale / initialScale }], opacity };
  });
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

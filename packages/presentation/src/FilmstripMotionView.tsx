import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { usePlaybackTween } from "./usePlaybackTween";
import { NavigationExitView } from "./navigation";

/** Carousel placement uses slide playback; exit uses the host's navigation progress. */
export function FilmstripMotionView({ index, count, enabled, position = 0, children, style }: {
  index: number; count: number; enabled: boolean; position?: number; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const selected = Math.max(0, Math.min(count - 1, position));
  const progress = usePlaybackTween({ position: selected }, 500);
  const motionStyle = useAnimatedStyle(() => {
    if (!enabled) return { transform: [{ translateX: 0 }, { scale: 1 }], opacity: 1 };
    const distance = Math.abs(index - progress.value.position);
    const scale = 1 - 0.38 * Math.min(1, distance) - 0.1 * Math.min(1, Math.max(0, distance - 1));
    const initialScale = index === 0 ? 1 : index === 1 ? 0.62 : 0.52;
    const opacity = distance < 1 ? 1 - distance * 0.3 : Math.max(0.25, 0.7 - (distance - 1) * 0.2);
    return { zIndex: Math.round(1000 - distance * 100),
      transform: [{ translateX: -progress.value.position * 900 }, { scale: scale / initialScale }], opacity };
  });
  return <Animated.View style={[style, motionStyle]}>
    <NavigationExitView enabled={enabled} style={{ flex: 1 }}>{children}</NavigationExitView>
  </Animated.View>;
}

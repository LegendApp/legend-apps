import type { SlideTransition } from "@legend-apps/presentation";
import { Animated } from "react-native";

/** Built-in audience-layer effects. Progress runs from 0 to 1 with cubic easing. */
export function slideTransitionStyles(
  kind: SlideTransition | "focus",
  progress: Animated.Value,
  hasBackground: boolean,
  hasSharedMotion: boolean,
) {
  const fadeOut = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const entering: Animated.WithAnimatedObject<import("react-native").ViewStyle> = { opacity: progress };
  const outgoing: Animated.WithAnimatedObject<import("react-native").ViewStyle> = {
    // Opaque legacy slides must keep their background solid during a crossfade.
    opacity: hasBackground ? fadeOut : 1,
  };
  if (!hasSharedMotion) {
    if (kind === "slide") {
      entering.transform = [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [180, 0] }) }];
      outgoing.opacity = fadeOut;
      outgoing.transform = [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -90] }) }];
    } else if (kind === "reveal-up") {
      entering.transform = [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }];
    }
  }
  return { entering, outgoing };
}

import type { SlideTransition } from "@legend-apps/presentation";
import { Animated } from "react-native";

const builtinGraphs = new WeakMap<Animated.Value, Map<string, ReturnType<typeof createSlideTransitionStyles>>>();
const visibleGraphs = new WeakMap<Animated.Value, ReturnType<typeof createVisibleSlideStyle>>();

export function slideTransitionStyles(kind: SlideTransition | "focus", progress: Animated.Value, hasBackground: boolean, hasSharedMotion: boolean) {
  let graphs = builtinGraphs.get(progress);
  if (!graphs) { graphs = new Map(); builtinGraphs.set(progress, graphs); }
  const key = `${kind}:${hasBackground}:${hasSharedMotion}`;
  let style = graphs.get(key);
  if (!style) { style = createSlideTransitionStyles(kind, progress, hasBackground, hasSharedMotion); graphs.set(key, style); }
  return style;
}

/** Built-in audience-layer effects. Progress runs from 0 to 1 with cubic easing. */
function createSlideTransitionStyles(
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

/** Fabric does not restore native-driven opacity when its style is removed. */
export function visibleSlideStyle(progress: Animated.Value) {
  let style = visibleGraphs.get(progress);
  if (!style) { style = createVisibleSlideStyle(progress); visibleGraphs.set(progress, style); }
  return style;
}
function createVisibleSlideStyle(progress: Animated.Value) {
  return { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1] }) };
}

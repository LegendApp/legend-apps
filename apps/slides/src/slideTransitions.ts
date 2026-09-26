import { interpolateTransition, type TransitionProgress, type TransitionStyle } from "@legend-apps/presentation";
import type { SlideTransition } from "@legend-apps/presentation";


const builtinGraphs = new WeakMap<TransitionProgress, Map<string, ReturnType<typeof createSlideTransitionStyles>>>();
const visibleGraphs = new WeakMap<TransitionProgress, ReturnType<typeof createVisibleSlideStyle>>();

export function slideTransitionStyles(kind: SlideTransition | "focus", progress: TransitionProgress, hasBackground: boolean, hasSharedMotion: boolean) {
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
  progress: TransitionProgress,
  hasBackground: boolean,
  hasSharedMotion: boolean,
) {
  const fadeOut = interpolateTransition(progress, { inputRange: [0, 1], outputRange: [1, 0] });
  const entering: TransitionStyle = { opacity: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [0, 1] }) };
  const outgoing: TransitionStyle = {
    // Opaque legacy slides must keep their background solid during a crossfade.
    opacity: hasBackground ? fadeOut : 1,
  };
  if (!hasSharedMotion) {
    if (kind === "slide") {
      entering.transform = [{ translateX: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [180, 0] }) }];
      outgoing.opacity = fadeOut;
      outgoing.transform = [{ translateX: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [0, -90] }) }];
    } else if (kind === "reveal-up") {
      entering.transform = [{ translateY: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [20, 0] }) }];
    }
  }
  return { entering, outgoing };
}

/** Fabric does not restore native-driven opacity when its style is removed. */
export function visibleSlideStyle(progress: TransitionProgress) {
  let style = visibleGraphs.get(progress);
  if (!style) { style = createVisibleSlideStyle(progress); visibleGraphs.set(progress, style); }
  return style;
}
function createVisibleSlideStyle(progress: TransitionProgress) {
  return { opacity: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [1, 1] }) };
}

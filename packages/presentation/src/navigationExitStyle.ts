import { Animated } from "react-native";

const graphs = new WeakMap<Animated.Value, Map<number, ReturnType<typeof createStyle>>>();
function createStyle(progress: Animated.Value, scale: number) {
  return {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }],
  };
}
export function navigationExitStyle(progress: Animated.Value, scale: number) {
  let scales = graphs.get(progress);
  if (!scales) { scales = new Map(); graphs.set(progress, scales); }
  let style = scales.get(scale);
  if (!style) { style = createStyle(progress, scale); scales.set(scale, style); }
  return style;
}

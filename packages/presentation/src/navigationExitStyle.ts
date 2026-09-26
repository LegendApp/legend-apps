import { interpolateTransition, type TransitionProgress } from "./transitionValues";


const graphs = new WeakMap<TransitionProgress, Map<number, ReturnType<typeof createStyle>>>();
function createStyle(progress: TransitionProgress, scale: number) {
  return {
    opacity: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [1, scale] }) }],
  };
}
export function navigationExitStyle(progress: TransitionProgress, scale: number) {
  let scales = graphs.get(progress);
  if (!scales) { scales = new Map(); graphs.set(progress, scales); }
  let style = scales.get(scale);
  if (!style) { style = createStyle(progress, scale); scales.set(scale, style); }
  return style;
}

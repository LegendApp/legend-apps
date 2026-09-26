import { interpolateTransition, subtractTransition, divideTransition, type TransitionProgress } from "./transitionValues";

import type { FocusMotion } from "./focus";

type Pair = FocusMotion["elements"] extends Map<string, infer P> ? P : never;
const interpolate = (progress: TransitionProgress, from: number, to: number) =>
  interpolateTransition(progress, { inputRange: [0, 1], outputRange: [from, to] });
const graphs = new WeakMap<FocusMotion, { signature: string; progress: TransitionProgress;
  camera?: ReturnType<typeof createCameraStyle>;
  elements: WeakMap<Pair, Map<string, ReturnType<typeof createElementTransform>>> }>();
function graphFor(motion: FocusMotion) {
  const { cameraFrom: a, cameraTo: b } = motion;
  const signature = `${a.x}:${a.y}:${a.scale}:${b.x}:${b.y}:${b.scale}`;
  let graph = graphs.get(motion);
  if (!graph || graph.signature !== signature || graph.progress !== motion.progress) {
    graph = { signature, progress: motion.progress, elements: new WeakMap() };
    graphs.set(motion, graph);
  }
  return graph;
}
export function focusCameraStyle(motion?: FocusMotion) {
  if (!motion) return undefined;
  const graph = graphFor(motion);
  return graph.camera ??= createCameraStyle(motion);
}
function createCameraStyle(motion: FocusMotion) {
  return {
    transformOrigin: "0px 0px" as const,
    transform: [
      { translateX: interpolate(motion.progress, motion.cameraFrom.x, motion.cameraTo.x) },
      { translateY: interpolate(motion.progress, motion.cameraFrom.y, motion.cameraTo.y) },
      { scale: interpolate(motion.progress, motion.cameraFrom.scale, motion.cameraTo.scale) },
    ],
  };
}
export function sharedElementTransform(motion: FocusMotion, pair: Pair, resize: "stretch" | "preserve") {
  const graph = graphFor(motion);
  let entries = graph.elements.get(pair);
  if (!entries) { entries = new Map(); graph.elements.set(pair, entries); }
  const key = `${resize}:${pair.from.x}:${pair.from.y}:${pair.from.width}:${pair.from.height}:${pair.to.x}:${pair.to.y}:${pair.to.width}:${pair.to.height}:${pair.own.x}:${pair.own.y}:${pair.own.width}:${pair.own.height}`;
  let transform = entries.get(key);
  if (!transform) { transform = createElementTransform(motion, pair, resize); entries.set(key, transform); }
  return transform;
}
function createElementTransform(motion: FocusMotion, pair: Pair, resize: "stretch" | "preserve") {
    const { progress, cameraFrom, cameraTo } = motion;
    const cameraScale = interpolate(progress, cameraFrom.scale, cameraTo.scale);
    // Both live copies follow the same screen rectangle. Undo the enclosing
    // camera on the overview copy so it doesn't receive the zoom twice.
    return [
      { translateX: subtractTransition(divideTransition(subtractTransition(
        interpolate(progress, pair.from.x + pair.from.width / 2, pair.to.x + pair.to.width / 2),
        interpolate(progress, cameraFrom.x, cameraTo.x)), cameraScale), pair.own.x + pair.own.width / 2) },
      { translateY: subtractTransition(divideTransition(subtractTransition(
        interpolate(progress, pair.from.y + pair.from.height / 2, pair.to.y + pair.to.height / 2),
        interpolate(progress, cameraFrom.y, cameraTo.y)), cameraScale), pair.own.y + pair.own.height / 2) },
      { scaleX: divideTransition(resize === "preserve" ? 1 : interpolate(progress, pair.from.width / pair.own.width, pair.to.width / pair.own.width), cameraScale) },
      { scaleY: divideTransition(resize === "preserve" ? 1 : interpolate(progress, pair.from.height / pair.own.height, pair.to.height / pair.own.height), cameraScale) },
    ];
}

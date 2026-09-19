import type { TransitionDefinition, TransitionContext } from "@legend-apps/presentation";
import { Animated, type ViewStyle } from "react-native";

/** Compile the numeric authoring callback once; native Animated owns every frame. */
export function nativeTransitionStyles(
  definition: TransitionDefinition,
  progress: Animated.Value,
  context: Omit<TransitionContext, "progress">,
  incoming: boolean,
  shared: boolean,
): Animated.WithAnimatedObject<ViewStyle> {
  const inputRange = Array.from({ length: 61 }, (_, i) => i / 60);
  const samples = inputRange.map((value) => {
    const result = definition.styles({ ...context, progress: value });
    const style = incoming ? result.incoming : result.outgoing;
    if (!style || typeof style !== "object" || Array.isArray(style)) {
      throw new Error("styles must return incoming and outgoing style objects");
    }
    return style;
  });
  const interpolate = (values: unknown[], property: string, supported: boolean): unknown => {
    if (values.every((value) => value === values[0])) return values[0];
    if (!supported) throw new Error(`${property} cannot animate on the native driver; use opacity or transforms`);
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value)) &&
        !values.every((value) => typeof value === "string" && /^-?[\d.]+(deg|rad)$/.test(value))) {
      throw new Error(`${property} must have compatible numeric values throughout the transition`);
    }
    return progress.interpolate({ inputRange, outputRange: values as number[] | string[], extrapolate: "clamp" });
  };
  const output: Record<string, unknown> = {};
  const keys = new Set(samples.flatMap((style) => Object.keys(style)));
  for (const key of keys) {
    if (key === "transform") {
      if (shared) continue;
      const transforms = samples.map((style) => style.transform);
      if (!transforms.every(Array.isArray)) throw new Error("transform must be an array throughout the transition");
      const arrays = transforms as Record<string, unknown>[][];
      const first = arrays[0]!;
      if (!arrays.every((array) => array.length === first.length)) throw new Error("transform structure must stay constant");
      output.transform = first.map((entry, index) => {
        const name = Object.keys(entry)[0]!;
        if (!arrays.every((array) => Object.keys(array[index]!).length === 1 && name in array[index]!)) {
          throw new Error("transform structure must stay constant");
        }
        return { [name]: interpolate(arrays.map((array) => array[index]![name]), name, true) };
      });
    } else {
      output[key] = interpolate(samples.map((style) => (style as Record<string, unknown>)[key]), key, key === "opacity");
    }
  }
  return output as Animated.WithAnimatedObject<ViewStyle>;
}

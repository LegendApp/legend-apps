import { interpolateTransition, type TransitionProgress, type TransitionStyle } from "@legend-apps/presentation";
import type { TransitionDefinition, TransitionContext } from "@legend-apps/presentation";


type Context = Omit<TransitionContext, "progress">;
type NativeStyle = TransitionStyle;
type Compilation = { definition: TransitionDefinition; context: Context;
  samples: ReturnType<TransitionDefinition["styles"]>[]; styles: Map<string, NativeStyle> };
// UI transition nodes are resources owned by one transition progress value.
// Preserve them across readiness/layout rerenders instead of rebuilding a graph
// just after its first native frame. Weak ownership releases completed graphs.
const compilations = new WeakMap<TransitionProgress, Compilation[]>();
function sameContext(a: Context, b: Context) {
  return a.direction === b.direction && a.width === b.width && a.height === b.height
    && a.hasBackground === b.hasBackground && Object.keys(a.options).length === Object.keys(b.options).length
    && Object.keys(a.options).every(key => a.options[key] === b.options[key]);
}

/** Compile the numeric authoring callback once; UI runtime owns every frame. */
export function nativeTransitionStyles(
  definition: TransitionDefinition,
  progress: TransitionProgress,
  context: Omit<TransitionContext, "progress">,
  incoming: boolean,
  shared: boolean,
): TransitionStyle {
  const inputRange = Array.from({ length: 61 }, (_, i) => i / 60);
  let entries = compilations.get(progress);
  if (!entries) { entries = []; compilations.set(progress, entries); }
  let compiled = entries.find(entry => entry.definition === definition && sameContext(entry.context, context));
  if (!compiled) {
    compiled = { definition, context: { ...context, options: { ...context.options } },
      samples: inputRange.map(value => definition.styles({ ...context, progress: value })), styles: new Map() };
    entries.push(compiled);
  }
  const cacheKey = `${incoming}:${shared}`;
  const cached = compiled.styles.get(cacheKey);
  if (cached) return cached;
  const samples = compiled.samples.map(result => {
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
    return interpolateTransition(progress, { inputRange, outputRange: values as number[] | string[], extrapolate: "clamp" });
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
  const style = output as NativeStyle;
  compiled.styles.set(cacheKey, style);
  return style;
}

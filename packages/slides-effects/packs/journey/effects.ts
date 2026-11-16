import { d } from "typegpu";
import { floatLayout, loaderCode, type FloatField, type FloatFields } from "./layout";
import type { Animated } from "./scene";
import type { Vec3 } from "./camera";

/** Effect parameters are scalars or 3-vectors; the same TypeGPU struct types the TS writer and the WGSL `params()` loader. */
export type JourneyEffectParam = FloatField;
export type JourneyEffectParams = FloatFields;
type ParamValue<T> = T extends d.Vec3f ? Animated<Vec3 | string> : Animated<number>;
export type JourneyEffectValues<P extends JourneyEffectParams> = { [K in keyof P]?: ParamValue<P[K]> };

export type JourneyEffectStage = "scene" | "fog" | "dof" | "bloom" | "tonemap";
/** One fullscreen pass. `reads` names WGSL texture bindings: `{ source: ctx.input, depth: "depth" }` declares `source` and `depth`. */
export type JourneyEffectPass = { id: string; wgsl: string; fragment: string; reads: Record<string, string>; output: string };
export type JourneyEffectTarget = { id: string; scale?: number; mips?: number };
export type JourneyEffectGraph = {
  targets?: JourneyEffectTarget[]; passes: JourneyEffectPass[];
  /** Adds `source` scaled by the WGSL expression `gain` onto the incoming color, folded into the tone map when nothing follows. */
  add?: { source: string; gain: string };
};
export type JourneyEffectContext<O> = {
  /** Color target the effect reads; its result replaces it. */
  input: string; options: O; quality: "auto" | "low" | "medium" | "high";
  /** Scene render scale, the quality's default sample count and bloom mip levels. */
  scale: number; samples: number; levels: number;
  /** Namespaces a pass or target id: `id("blur")` is `<effect>-blur`, `id()` is `<effect>`. */
  id(name?: string): string;
};
export type JourneyEffectDefinition<P extends JourneyEffectParams, O> = {
  name: string; params: P; defaults: { [K in keyof P]: ParamValue<P[K]> };
  /** Default placement; a deck can override it with `before` or `after`. */
  after?: JourneyEffectStage;
  build(context: JourneyEffectContext<O>): JourneyEffectGraph;
};
export type JourneyEffect<P extends JourneyEffectParams = JourneyEffectParams, O = Record<string, unknown>> = {
  definition: JourneyEffectDefinition<P, O>; struct: d.WgslStruct<P>;
  /** Float offset of each param from the effect's base, and their total. */
  offsets: Record<keyof P, number>; size: number;
  (values?: JourneyEffectValues<P>, options?: O): JourneyEffectUse;
};
/** A deck's configured effect. Options must be JSON: they select pipeline topology; animated values travel as params. */
export type JourneyEffectUse = { effect: string; values: Record<string, Animated<number | Vec3 | string>>; options: Record<string, unknown> };

const registry = new Map<string, JourneyEffect<any, any>>();
export function journeyEffect(name: string) {
  const effect = registry.get(name);
  if (!effect) throw new Error(`Unknown Journey effect: ${name}`);
  return effect;
}

/** Declares a TypeGPU post effect for the Journey render graph. Re-defining a name replaces it, so hot reload picks up edits. */
export function defineJourneyEffect<P extends JourneyEffectParams, O = Record<string, unknown>>(definition: JourneyEffectDefinition<P, O>): JourneyEffect<P, O> {
  if (!/^[a-z][a-z0-9-]*$/.test(definition.name)) throw new Error(`Journey effect name must be kebab-case: ${definition.name}`);
  const struct = d.struct(definition.params).$name(`${definition.name.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase())}Params`);
  const { offsets, size } = floatLayout(definition.params);
  const effect = Object.assign((values: JourneyEffectValues<P> = {}, options = {} as O): JourneyEffectUse => {
    for (const key of Object.keys(values)) if (!(key in definition.params)) throw new Error(`Journey effect ${definition.name} has no param ${key}`);
    return { effect: definition.name, values: { ...definition.defaults, ...values } as JourneyEffectUse["values"], options: options as Record<string, unknown> };
  }, { definition, struct, offsets, size }) as JourneyEffect<P, O>;
  registry.set(definition.name, effect);
  return effect;
}

/**
 * WGSL for the typed params struct and `params()`, which loads it from the Journey uniform array.
 * `slots` binds fields to fixed header indices instead of the effect's appended block (built-in effects only).
 */
export function paramsCode(effect: JourneyEffect<any, any>, base: number, slots?: Record<string, number>) {
  // WGSL has no empty structs.
  if (!effect.size) return "";
  return loaderCode(effect.struct, "fn params()", key => `${slots?.[key] ?? base + effect.offsets[key]}u`);
}

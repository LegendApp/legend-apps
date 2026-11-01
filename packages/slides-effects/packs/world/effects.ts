import { d } from "typegpu";
import { floatLayout, loaderCode, type FloatField, type FloatFields } from "./layout";
import type { Animated } from "./scene";
import type { Vec3 } from "./camera";

/** Effect parameters are scalars or 3-vectors; the same TypeGPU struct types the TS writer and the WGSL `params()` loader. */
export type WorldEffectParam = FloatField;
export type WorldEffectParams = FloatFields;
type ParamValue<T> = T extends d.Vec3f ? Animated<Vec3 | string> : Animated<number>;
export type WorldEffectValues<P extends WorldEffectParams> = { [K in keyof P]?: ParamValue<P[K]> };

export type WorldEffectStage = "scene" | "fog" | "dof" | "bloom" | "tonemap";
/** One fullscreen pass. `reads` names WGSL texture bindings: `{ source: ctx.input, depth: "depth" }` declares `source` and `depth`. */
export type WorldEffectPass = { id: string; wgsl: string; fragment: string; reads: Record<string, string>; output: string };
export type WorldEffectTarget = { id: string; scale?: number; mips?: number };
export type WorldEffectGraph = {
  targets?: WorldEffectTarget[]; passes: WorldEffectPass[];
  /** Adds `source` scaled by the WGSL expression `gain` onto the incoming color, folded into the tone map when nothing follows. */
  add?: { source: string; gain: string };
};
export type WorldEffectContext<O> = {
  /** Color target the effect reads; its result replaces it. */
  input: string; options: O; quality: "auto" | "low" | "medium" | "high";
  /** Scene render scale, the quality's default sample count and bloom mip levels. */
  scale: number; samples: number; levels: number;
  /** Namespaces a pass or target id: `id("blur")` is `<effect>-blur`, `id()` is `<effect>`. */
  id(name?: string): string;
};
export type WorldEffectDefinition<P extends WorldEffectParams, O> = {
  name: string; params: P; defaults: { [K in keyof P]: ParamValue<P[K]> };
  /** Default placement; a deck can override it with `before` or `after`. */
  after?: WorldEffectStage;
  build(context: WorldEffectContext<O>): WorldEffectGraph;
};
export type WorldEffect<P extends WorldEffectParams = WorldEffectParams, O = Record<string, unknown>> = {
  definition: WorldEffectDefinition<P, O>; struct: d.WgslStruct<P>;
  /** Float offset of each param from the effect's base, and their total. */
  offsets: Record<keyof P, number>; size: number;
  (values?: WorldEffectValues<P>, options?: O): WorldEffectUse;
};
/** A deck's configured effect. Options must be JSON: they select pipeline topology; animated values travel as params. */
export type WorldEffectUse = { effect: string; values: Record<string, Animated<number | Vec3 | string>>; options: Record<string, unknown> };

const registry = new Map<string, WorldEffect<any, any>>();
export function worldEffect(name: string) {
  const effect = registry.get(name);
  if (!effect) throw new Error(`Unknown World effect: ${name}`);
  return effect;
}

/** Declares a TypeGPU post effect for the World render graph. Re-defining a name replaces it, so hot reload picks up edits. */
export function defineWorldEffect<P extends WorldEffectParams, O = Record<string, unknown>>(definition: WorldEffectDefinition<P, O>): WorldEffect<P, O> {
  if (!/^[a-z][a-z0-9-]*$/.test(definition.name)) throw new Error(`World effect name must be kebab-case: ${definition.name}`);
  const struct = d.struct(definition.params).$name(`${definition.name.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase())}Params`);
  const { offsets, size } = floatLayout(definition.params);
  const effect = Object.assign((values: WorldEffectValues<P> = {}, options = {} as O): WorldEffectUse => {
    for (const key of Object.keys(values)) if (!(key in definition.params)) throw new Error(`World effect ${definition.name} has no param ${key}`);
    return { effect: definition.name, values: { ...definition.defaults, ...values } as WorldEffectUse["values"], options: options as Record<string, unknown> };
  }, { definition, struct, offsets, size }) as WorldEffect<P, O>;
  registry.set(definition.name, effect);
  return effect;
}

/**
 * WGSL for the typed params struct and `params()`, which loads it from the World uniform array.
 * `slots` binds fields to fixed header indices instead of the effect's appended block (built-in effects only).
 */
export function paramsCode(effect: WorldEffect<any, any>, base: number, slots?: Record<string, number>) {
  // WGSL has no empty structs.
  if (!effect.size) return "";
  return loaderCode(effect.struct, "fn params()", key => `${slots?.[key] ?? base + effect.offsets[key]}u`);
}

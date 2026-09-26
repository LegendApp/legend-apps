import { makeMutable, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import type { ViewStyle } from "react-native";

export type TransitionProgress = SharedValue<number>;
type Value = number | TransitionValue;
export type TransitionValue = { transitionValue: true } & (
  { kind: "sample"; progress: TransitionProgress; input: number[]; output: (number | string)[] }
  | { kind: "subtract"; a: Value; b: Value }
  | { kind: "divide"; a: Value; b: Value }
);
export type TransitionStyle = Record<string, unknown>;
export const createTransitionProgress = (value: number) => makeMutable(value);
export function interpolateTransition(progress: TransitionProgress, options: { inputRange: number[]; outputRange: (number | string)[]; extrapolate?: string }): TransitionValue {
  return { transitionValue: true, kind: "sample", progress, input: options.inputRange, output: options.outputRange };
}
export const subtractTransition = (a: Value, b: Value): TransitionValue => ({ transitionValue: true, kind: "subtract", a, b });
export const divideTransition = (a: Value, b: Value): TransitionValue => ({ transitionValue: true, kind: "divide", a, b });

/** Declarative samples cross once; only this worklet evaluates them per frame. */
export function sampleTransitionValue(value: Value): number | string {
  "worklet";
  if (typeof value === "number") return value;
  if (value.kind === "subtract") return Number(sampleTransitionValue(value.a)) - Number(sampleTransitionValue(value.b));
  if (value.kind === "divide") return Number(sampleTransitionValue(value.a)) / Number(sampleTransitionValue(value.b));
  const p = Math.max(value.input[0], Math.min(value.input[value.input.length - 1], value.progress.value));
  // Binary search bounds the cost for user transitions with many samples.
  let low = 0, high = value.input.length - 1;
  while (high - low > 1) { const mid = (low + high) >>> 1; if (value.input[mid] <= p) low = mid; else high = mid; }
  const a = value.output[low], b = value.output[high];
  const t = (p - value.input[low]) / (value.input[high] - value.input[low]);
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
  const unit = String(a).endsWith("deg") ? "deg" : "rad";
  return `${parseFloat(String(a)) + (parseFloat(String(b)) - parseFloat(String(a))) * t}${unit}`;
}
export function resolveTransitionStyle(value: unknown): any {
  "worklet";
  if (!value || typeof value !== "object") return value;
  if ("transitionValue" in value) return sampleTransitionValue(value as TransitionValue);
  if (Array.isArray(value)) return value.map(resolveTransitionStyle);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) result[key] = resolveTransitionStyle((value as Record<string, unknown>)[key]);
  return result;
}
export function useTransitionStyle(style: TransitionStyle | undefined) {
  return useAnimatedStyle(() => resolveTransitionStyle(style ?? {}) as ViewStyle, [style]);
}

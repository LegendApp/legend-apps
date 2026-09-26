// @ts-nocheck Bun test types are not included in the app TypeScript project.
import { expect, test } from "bun:test";
import { createTransitionProgress, resolveTransitionStyle } from "@legend-apps/presentation";
import { visibleSlideStyle } from "../slideTransitions";
import { nativeTransitionStyles } from "../nativeTransitionStyles";

const context = { direction: "forward" as const, width: 1920, height: 1080, options: {}, hasBackground: true };
const valueOf = (value: unknown) => resolveTransitionStyle(value);

test("custom fades follow the native clock without JS listeners or callback evaluation per frame", () => {
  const progress = createTransitionProgress(0);
  let evaluations = 0;
  const definition = { styles: ({ progress }: { progress: number }) => {
    evaluations++;
    return { incoming: { opacity: progress }, outgoing: { opacity: 1 - progress } };
  } };
  const incoming = nativeTransitionStyles(definition, progress, context, true, true);
  const outgoing = nativeTransitionStyles(definition, progress, context, false, true);
  const setupEvaluations = evaluations;
  // Simulate native progress, deliberately bypassing JS listener notification.
  Object.assign(progress, { value: 0.5 });
  expect(valueOf(incoming.opacity)).toBeCloseTo(0.5);
  expect(valueOf(outgoing.opacity)).toBeCloseTo(0.5);
  expect(evaluations).toBe(setupEvaluations);
});

test("samples nonlinear transitions and leaves shared transforms to shared motion", () => {
  const progress = createTransitionProgress(0.5);
  const definition = { styles: ({ progress }: { progress: number }) => ({
    incoming: { opacity: progress * progress, transform: [{ translateX: 100 * (1 - progress) }] }, outgoing: {},
  }) };
  const style = nativeTransitionStyles(definition, progress, context, true, true);
  expect(valueOf(style.opacity)).toBeCloseTo(0.25);
  expect(style.transform).toBeUndefined();
  const independent = nativeTransitionStyles(definition, progress, context, true, false);
  expect(independent.transform).toHaveLength(1);
});

test("rejects animated layout rather than falling back to JavaScript frames", () => {
  expect(() => nativeTransitionStyles({ styles: ({ progress }) => ({
    incoming: { width: progress * 100 }, outgoing: {},
  }) }, createTransitionProgress(0), context, true, false)).toThrow("width cannot animate on the native driver");
});


test("idle slide opacity is explicitly restored through the native graph after fading out", () => {
  const progress = createTransitionProgress(1);
  const fading = nativeTransitionStyles({ styles: ({ progress }) => ({
    incoming: { opacity: progress }, outgoing: { opacity: 1 - progress },
  }) }, progress, context, false, false);
  expect(valueOf(fading.opacity)).toBe(0);
  const restored = visibleSlideStyle(progress);
  expect(valueOf(restored.opacity)).toBe(1);
  // Preparation and return can share a fresh clock at any point in its range.
  progress.value = 0;
  expect(valueOf(restored.opacity)).toBe(1);
  progress.value = 0.5;
  expect(valueOf(restored.opacity)).toBe(1);
});

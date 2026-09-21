import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");
function load(name, base = "../") {
  const code = transformSync(readFileSync(new URL(`${base}${name}.ts`, import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} };
  Function("require", "module", "exports", code)(() => ({ Animated: { subtract: (...args) => ({ subtract: args }), divide: (...args) => ({ divide: args }) } }), module, module.exports);
  return module.exports;
}
const { nativeTransitionStyles } = load("nativeTransitionStyles");
const { slideTransitionStyles, visibleSlideStyle } = load("slideTransitions");
const context = { direction: "forward", width: 1920, height: 1080, options: {}, hasBackground: true };
function clock() {
  let nodes = 0;
  return { interpolate(config) { nodes++; return { config }; }, get nodes() { return nodes; } };
}
test("readiness rerenders retain custom graphs and sample both directions only once", () => {
  let evaluations = 0;
  const definition = { styles: ({ progress }) => {
    evaluations++;
    return { incoming: { opacity: progress, transform: [{ translateY: 100 * (1 - progress) }] }, outgoing: { opacity: 1 - progress } };
  } };
  const progress = clock();
  const incoming = nativeTransitionStyles(definition, progress, context, true, false);
  const outgoing = nativeTransitionStyles(definition, progress, context, false, false);
  const nodes = progress.nodes;
  for (let i = 0; i < 10; i++) {
    assert.equal(nativeTransitionStyles(definition, progress, { ...context, options: {} }, true, false), incoming);
    assert.equal(nativeTransitionStyles(definition, progress, context, false, false), outgoing);
  }
  assert.equal(evaluations, 61);
  assert.equal(progress.nodes, nodes);
  const shared = nativeTransitionStyles(definition, progress, context, true, true);
  assert.equal(shared.transform, undefined);
  assert.equal(evaluations, 61);
  nativeTransitionStyles(definition, progress, { ...context, width: 1000 }, true, false);
  assert.equal(evaluations, 122);
  nativeTransitionStyles(definition, clock(), context, true, false);
  assert.equal(evaluations, 183, "another transition owns another native graph");
});
test("transition options invalidate compilation, including mutated option values", () => {
  let calls = 0;
  const definition = { styles: ({ progress, options }) => { calls++; return { incoming: { opacity: progress * options.strength }, outgoing: {} }; } };
  const options = { strength: 1 }; const progress = clock();
  const first = nativeTransitionStyles(definition, progress, { ...context, options }, true, false);
  options.strength = 0.5;
  const next = nativeTransitionStyles(definition, progress, { ...context, options }, true, false);
  assert.notEqual(first, next); assert.equal(calls, 122);
});
test("built-in and visibility graphs remain stable across unrelated rerenders", () => {
  const progress = clock();
  const first = slideTransitionStyles("slide", progress, true, false);
  const visible = visibleSlideStyle(progress); const nodes = progress.nodes;
  for (let i = 0; i < 10; i++) {
    assert.equal(slideTransitionStyles("slide", progress, true, false), first);
    assert.equal(visibleSlideStyle(progress), visible);
  }
  assert.equal(progress.nodes, nodes);
  assert.notEqual(slideTransitionStyles("slide", progress, true, true), first);
  assert.notEqual(visibleSlideStyle(clock()), visible);
});

const { focusCameraStyle, sharedElementTransform } = load("focusMotionStyles", "../../../../packages/presentation/src/");
const { navigationExitStyle } = load("navigationExitStyle", "../../../../packages/presentation/src/");
test("camera, shared-element and exit graphs survive readiness rerenders", () => {
  const progress = clock();
  const motion = { progress, cameraFrom: { x: 0, y: 0, scale: 1 }, cameraTo: { x: 100, y: 40, scale: 2 }, elements: new Map() };
  const pair = { from: { x: 0, y: 0, width: 100, height: 40 }, to: { x: 10, y: 20, width: 200, height: 80 }, own: { x: 0, y: 0, width: 100, height: 40 } };
  const camera = focusCameraStyle(motion);
  const marker = sharedElementTransform(motion, pair, "preserve");
  const exit = navigationExitStyle(progress, 0.88);
  const nodes = progress.nodes;
  for (let i = 0; i < 10; i++) {
    assert.equal(focusCameraStyle(motion), camera);
    assert.equal(sharedElementTransform(motion, pair, "preserve"), marker);
    assert.equal(navigationExitStyle(progress, 0.88), exit);
  }
  assert.equal(progress.nodes, nodes);
  assert.notEqual(sharedElementTransform(motion, pair, "stretch"), marker);
  pair.to.x = 90;
  assert.notEqual(sharedElementTransform(motion, pair, "preserve"), marker);
  motion.cameraTo.x = 200;
  assert.notEqual(focusCameraStyle(motion), camera);
  assert.notEqual(navigationExitStyle(progress, 0.5), exit);
});

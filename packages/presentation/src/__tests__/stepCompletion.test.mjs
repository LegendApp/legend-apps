import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { transformSync } = require("esbuild");
test("completion runs only while playing and advances once across two surfaces", () => {
  const reactions = [];
  let advances = 0;
  const runtime = { playbackPhase: "playing", currentSlide: 0, currentStep: 2, next: () => advances++ };
  const clock = { value: { phase: "preparing", stepIndex: 2, stepTime: 0, slideKey: "slide", stepKey: "a" } };
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL("../useAdvanceAfterStep.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const mocks = {
    "react-native-reanimated": { runOnJS: fn => fn, useAnimatedReaction: (read, apply) => reactions.push({ read, apply, previous: null }) },
    "./playback": { usePlayback: () => clock },
    "./runtime": { usePresentation$: () => ({ peek: () => runtime }), usePresentationValue: () => 0 },
  };
  Function("require", "module", "exports", code)(name => mocks[name], module, module.exports);
  module.exports.useAdvanceAfterStep(2, 3.6);
  module.exports.useAdvanceAfterStep(2, 3.6);
  const tick = () => reactions.forEach(r => { const next = r.read(); r.apply(next, r.previous); r.previous = next; });
  clock.value.stepTime = 10; tick(); assert.equal(advances, 0);
  clock.value.phase = "playing"; clock.value.stepTime = 3.5; tick(); assert.equal(advances, 0);
  clock.value.stepTime = 3.6; tick(); assert.equal(advances, 1);
  tick(); assert.equal(advances, 1);
  clock.value.stepKey = "replay"; clock.value.stepTime = 0; tick();
  clock.value.stepTime = 4; tick(); assert.equal(advances, 2);
  clock.value.stepKey = "stale"; runtime.currentStep = 0; tick(); assert.equal(advances, 2);
});

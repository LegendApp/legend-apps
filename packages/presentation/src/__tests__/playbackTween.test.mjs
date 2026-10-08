import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

function harness(source, initial, delay = 0) {
  const clock = { value: { phase: "playing", slideKey: "slide", stepKey: "step-0", slideTime: 0, stepTime: 0 } };
  let run, shared, writes = 0;
  const mocks = {
    "./playback": { usePlayback: () => clock },
    "react-native-reanimated": {
      useSharedValue(value) { return shared ??= { get value() { return value; }, set value(next) { writes++; value = next; } }; },
      useAnimatedReaction(prepare, react) { run = () => react(prepare()); },
      useDerivedValue: read => ({ get value() { return read(); } }),
    },
  };
  const module = { exports: {} };
  const code = transformSync(source, { loader: "ts", format: "cjs" }).code;
  Function("require", "module", "exports", code)(name => mocks[name], module, module.exports);
  let target = { x: 100 };
  let output = module.exports.usePlaybackTween(target, 500, initial, "cubic", delay);
  let stepKey = clock.value.stepKey;
  return { retarget(x) { target = { x }; output = module.exports.usePlaybackTween(target, 500, initial, "cubic", delay); }, get output() { return output; }, clock, tick(time) {
    clock.value.slideTime += stepKey === clock.value.stepKey ? time - clock.value.stepTime : time;
    stepKey = clock.value.stepKey;
    clock.value.stepTime = time; run();
  }, get writes() { return writes; } };
}
const source = readFileSync(new URL("../usePlaybackTween.ts", import.meta.url), "utf8");
test("settled poses stop publishing through an idle slide", () => {
  const h = harness(source, { x: 0 });
  for (let i = 0; i <= 30; i++) h.tick(i / 60);
  assert.equal(h.output.value.x, 100);
  const count = h.writes;
  for (let i = 31; i <= 600; i++) h.tick(i / 60);
  assert.equal(h.writes, count);
  h.retarget(200);
  h.tick(10);
  assert.equal(h.output.value.x, 100);
  h.tick(10.25);
  assert.equal(h.output.value.x, 150);
  h.tick(10.5);
  assert.equal(h.output.value.x, 200);
});
test("unchanged initial targets publish only initialization, and a new step can retarget", () => {
  const h = harness(source);
  for (let i = 0; i < 600; i++) h.tick(i / 60);
  assert.equal(h.writes, 1);
  h.retarget(50);
  h.clock.value.stepKey = "step-1";
  h.tick(0);
  assert.equal(h.output.value.x, 100);
  h.tick(0.5);
  assert.equal(h.output.value.x, 50);
});
test("interrupted motion continues from its displayed pose and outgoing freezes", () => {
  const h = harness(source, { x: 0 });
  h.tick(0); h.tick(0.25);
  assert.equal(h.output.value.x, 50);
  h.retarget(200);
  h.tick(0.25);
  assert.equal(h.output.value.x, 50);
  h.tick(0.5);
  assert.equal(h.output.value.x, 125);
  const count = h.writes;
  h.clock.value.phase = "outgoing";
  h.tick(4);
  assert.equal(h.output.value.x, 125);
  assert.equal(h.writes, count);
});

test("delayed crossfades hold the old text and use the step clock in both directions", () => {
  const h = harness(source, undefined, 320);
  h.tick(0);
  h.retarget(0);
  h.clock.value.stepKey = "step-1";
  h.tick(0); h.tick(0.3);
  assert.equal(h.output.value.x, 100);
  h.tick(0.57);
  assert.ok(Math.abs(h.output.value.x - 50) < 0.001);
  h.tick(0.83);
  assert.equal(h.output.value.x, 0);
  h.retarget(100);
  h.clock.value.stepKey = "step-0";
  h.tick(0); h.tick(0.3);
  assert.equal(h.output.value.x, 0);
  h.tick(0.83);
  assert.equal(h.output.value.x, 100);
});

test("an unrelated step does not restart an unfinished entrance or its delay", () => {
  const h = harness(source, { x: 0 }, 100);
  h.tick(0); h.tick(0.35);
  assert.ok(Math.abs(h.output.value.x - 50) < 0.001);
  h.clock.value.stepKey = "step-1";
  h.tick(0);
  assert.ok(Math.abs(h.output.value.x - 50) < 0.001);
  h.tick(0.25);
  assert.equal(h.output.value.x, 100, "the original entrance finishes at its original deadline");
});

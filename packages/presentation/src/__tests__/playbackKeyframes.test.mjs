import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import React from "react";
import { samplePlayback } from "../playback.tsx";

const code = transformSync(readFileSync(new URL("../PlaybackKeyframeView.tsx", import.meta.url), "utf8"),
  { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
const keyframes = [{ time: 0, x: 12, y: 34, opacity: 1 }, { time: 800, x: 90, y: 10, opacity: 0 }];
function harness(props = {}) {
  const playback = { value: { phase: "playing", stepTime: 0, slideTime: 0 } };
  let sample;
  const mocks = {
    "react/jsx-runtime": { jsx: React.createElement },
    "./playback": { usePlayback: () => playback, samplePlayback },
    "react-native-reanimated": {
      __esModule: true, default: { View: "animated" },
      useDerivedValue(read) { sample = read; return { get value() { return read(); } }; },
      useAnimatedStyle: read => read,
    },
  };
  const module = { exports: {} };
  Function("require", "module", "exports", code)(name => mocks[name], module, module.exports);
  const view = module.exports.PlaybackKeyframeView({ keyframes, ...props });
  return { playback, sample: () => sample(), style: () => view.props.style[1]() };
}

test("completed keyframes keep one pose through idle frames and restart on replay", () => {
  const h = harness();
  h.playback.value.stepTime = 0.4;
  assert.deepEqual(h.style(), { opacity: 0.5, transform: [{ translateX: 51 }, { translateY: 22 }] });
  h.playback.value.stepTime = 0.8;
  const settled = h.sample();
  for (let i = 49; i < 600; i++) {
    h.playback.value.stepTime = i / 60;
    assert.equal(h.sample(), settled, "same identity prevents downstream native style updates");
  }
  h.playback.value.stepTime = 0;
  assert.deepEqual(h.style(), { opacity: 1, transform: [{ translateX: 12 }, { translateY: 34 }] });
});

test("delays stay hidden at the first position; repeats continue after a cycle", () => {
  const delayed = harness({ delay: 500 });
  const waiting = delayed.sample();
  delayed.playback.value.stepTime = 0.25;
  assert.equal(delayed.sample(), waiting);
  assert.deepEqual(delayed.style(), { opacity: 0, transform: [{ translateX: 12 }, { translateY: 34 }] });
  delayed.playback.value.stepTime = 0.5;
  assert.equal(delayed.style().opacity, 1);
  const repeat = harness({ repeatDuration: 800 });
  repeat.playback.value.stepTime = 1.2;
  assert.equal(repeat.style().opacity, 0.5);
});

test("preparation starts at zero, previews settle, and outgoing motion holds its last time", () => {
  const h = harness();
  h.playback.value = { phase: "preparing", stepTime: 9 };
  assert.equal(h.style().opacity, 1);
  h.playback.value = { phase: "preview", stepTime: 0 };
  assert.equal(h.style().opacity, 0);
  h.playback.value = { phase: "outgoing", stepTime: 0.4 };
  assert.equal(h.style().opacity, 0.5);
});

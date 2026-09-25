// @ts-nocheck Native worklets are sampled synchronously by this focused hook test.
import { expect, mock, test } from "bun:test";
import React, { useRef } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
let reads = 0;
const state = { phase: "playing", slideTime: 12, stepTime: 3, stepIndex: 2, stepOrigins: { 2: 9 } };
mock.module("../../../../packages/presentation/src/playback", () => ({
  usePlayback: () => ({ get value() { reads++; return state; } }),
  samplePlayback: (value, preview, clock) => typeof clock === "number" ? value.slideTime - value.stepOrigins[clock] : clock === "step" ? value.stepTime : value.slideTime,
}));
mock.module("../../../../packages/presentation/src/runtime", () => ({ usePresentationValue: () => 0 }));
mock.module("../../../../packages/presentation/src/background", () => ({ useBackgroundBrightnessScale: () => null, useBackgroundMotion: () => null }));
mock.module("react-native-reanimated", () => ({
  useSharedValue: value => useRef({ value }).current,
  useDerivedValue: read => ({ get value() { return read(); } }),
  useAnimatedReaction: prepare => prepare(),
}));
const { useAnimatedShaderUniforms } = await import("../../../../packages/presentation/src/useAnimatedShaderUniforms");
test("inactive shader stops reading playback and resumes the current step clock", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let uniforms;
  function Probe({ active }) {
    uniforms = useAnimatedShaderUniforms({ stage: 2 }, 8, { active, clock: 2, clocks: { extra: 2 } });
    return null;
  }
  let tree;
  await act(() => { tree = create(<Probe active={false} />); });
  reads = 0;
  expect(uniforms.value).toMatchObject({ stage: 2, time: 8, extra: 8 });
  state.slideTime = 20;
  expect(uniforms.value.time).toBe(8);
  expect(reads).toBe(0);
  await act(() => tree.update(<Probe active />));
  expect(uniforms.value.time).toBe(11);
  expect(reads).toBeGreaterThan(0);
  await act(() => tree.unmount());
});

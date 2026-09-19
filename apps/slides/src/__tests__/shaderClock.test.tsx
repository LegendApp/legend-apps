// @ts-nocheck The Reanimated mock exposes its UI-thread clock for lifecycle checks.
import { expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
import React, { useMemo, useRef } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";

const frames = [];
mock.module("react-native-reanimated", () => ({
  useSharedValue: (value) => useRef({ value }).current,
  useDerivedValue: (read) => ({ get value() { return read(); } }),
  useFrameCallback: (callback) => {
    const latest = useRef(callback);
    latest.current = callback;
    return useMemo(() => {
      const frame = { active: false, setActive(value) { this.active = value; },
        tick() { if (this.active) latest.current({ timeSincePreviousFrame: 32 }); } };
      frames.push(frame);
      return frame;
    }, []);
  },
}));
const { PresentationProvider } = await import("../../../../packages/presentation/src/runtime");
const { useAnimatedShaderUniforms } = await import("../../../../packages/presentation/src/useAnimatedShaderUniforms");

test("outgoing shaders retain their last frame; fresh previews stay still and reflect intensity", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let uniforms;
  function Probe({ brightness }) {
    uniforms = useAnimatedShaderUniforms({ brightness }, 8);
    return null;
  }
  const render = (isActive, isPreview, isPreparing = false, brightness = 1) =>
    <PresentationProvider value={observable({ slideIndex: 0, isActive, isPreview, isPreparing })}>
      <Probe brightness={brightness} />
    </PresentationProvider>;
  let tree;
  try {
    await act(() => { tree = create(render(true, false)); });
    const frame = frames.at(-1);
    frame.tick();
    const lastTime = uniforms.value.time;
    expect(lastTime).toBeGreaterThan(0);
    await act(() => tree.update(render(false, true)));
    expect(frame.active).toBe(false);
    frame.tick();
    expect(uniforms.value.time).toBe(lastTime);
    await act(() => tree.update(render(false, true, true)));
    expect(uniforms.value.time).toBe(8);
    await act(() => tree.update(render(false, true, false, 3)));
    expect(uniforms.value).toEqual({ brightness: 3, time: 8 });
    expect(frame.active).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

// @ts-nocheck Exercise the deck background against the host playback clock.
import { expect, mock, spyOn, test } from "bun:test";
import { frames as uiFrames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import React from "react";
import { observable } from "@legendapp/state";
import { act, create } from "react-test-renderer";
import { PresentationProvider } from "@legend-apps/presentation";
import "../../../apps/slides/src/__tests__/nativeMock";
let canvasRenders = 0;
mock.module("@shopify/react-native-skia", () => ({
  Canvas: props => { canvasRenders++; return React.createElement("canvas", props); },
  Fill: "fill", Shader: "aurora-shader", Skia: { RuntimeEffect: { Make: () => ({}) } },
}));

test("Aurora ticks only its shader and cancels its clock when inactive or unmounted", async () => {
  const { AmbientAurora } = await import("../packs/backgrounds/AmbientAurora");
  const frames = new Map();
  let frameId = 0;
  let now = 1000;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const clock = spyOn(performance, "now").mockImplementation(() => now);
  const log = spyOn(console, "error").mockImplementation(() => {});
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const runtime$ = observable({});
  const content = (isActive, isPreview = false) => {
    runtime$.set({ isActive, isPreview });
    return <PresentationProvider value={runtime$}><AmbientAurora /></PresentationProvider>;
  };
  let tree;
  try {
    await act(() => { tree = create(content(true)); });
    flushUI();
    const frame = uiFrames.at(-1);
    frame.tick(1000);
    const before = canvasRenders;
    for (const timestamp of [1016, 1032, 1048]) {
      now = timestamp;
      await act(() => frame.tick(now));
      expect(tree.root.findByType("aurora-shader").props.uniforms.value.time).toBeCloseTo((now - 1000) / 1000);
    }
    expect(canvasRenders).toBe(before);
    await act(() => tree.update(content(false)));
    flushUI();
    expect(frame.active).toBe(false);
    expect(frames.size).toBe(0);
    await act(() => tree.update(content(false, true)));
    flushUI();
    expect(tree.root.findByType("aurora-shader").props.uniforms.value.time).toBeCloseTo(8);
    expect(frames.size).toBe(0);
    await act(() => tree.update(content(true)));
    flushUI();
    expect(frame.active).toBe(true);
    expect(frames.size).toBe(0);
  } finally {
    if (tree) await act(() => tree.unmount());
    expect(uiFrames.at(-1).active).toBe(false);
    expect(frames.size).toBe(0);
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    clock.mockRestore(); log.mockRestore();
  }
});

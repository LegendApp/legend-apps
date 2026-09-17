// @ts-nocheck Native rendering is mocked; this test exercises capture lifecycle.
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { observable } from "@legendapp/state";
import { act, create } from "react-test-renderer";
import { PresentationProvider } from "@legend-apps/presentation";
import { SlideCaptureContext } from "../SlideCaptureContext";
import "./nativeMock";

const captures = [];
const captureTargets = [];
const runtimeEffect = {};
let canvasRenders = 0;
mock.module("@shopify/react-native-skia", () => ({
  Blur: "blur", Canvas: ({ children, ...props }) => { canvasRenders++; return <canvas {...props}>{children}</canvas>; },
  Fill: "fill", Shader: "aurora-shader", vec: (x, y) => [x, y], Group: ({ children, layer, ...props }) => <group {...props}>{layer}{children}</group>, Image: "image", Paint: "paint", RuntimeShader: "shader",
  Skia: { RuntimeEffect: { Make: () => runtimeEffect } },
  makeImageFromView: (ref) => {
    captureTargets.push(ref.current);
    return new Promise((resolve) => captures.push(resolve));
  },
}));
const { Effect } = await import("../Effect");

test("captures only a visible, measured stage and recaptures after scale changes", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const frames = new Map();
  let frameId = 0;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const flushFrame = async (timestamp = 0) => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(timestamp));
  });
  const runtime$ = observable({});
  const content = (scale, runtime = { isPreview: true, isActive: false }, effectProps = {}) => {
    runtime$.set(runtime);
    return <PresentationProvider value={runtime$}>
      <SlideCaptureContext.Provider value={scale}><Effect {...effectProps}><text>Visible</text></Effect></SlideCaptureContext.Provider>
    </PresentationProvider>;
  };
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  const first = { dispose: mock() };
  const late = { dispose: mock() };
  try {
    await act(() => { renderer = create(content(0), { createNodeMock: (element) => element.props }); });
    await act(() => renderer.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 800, height: 200 } } }));
    await flushFrame(); await flushFrame();
    expect(captures).toHaveLength(0);
    await act(() => renderer.update(content(0.5)));
    await flushFrame(); await flushFrame();
    expect(captures).toHaveLength(1);
    await act(() => captures.shift()(first));
    expect(renderer.root.findByType("image").props.image).toBe(first);
    const source = renderer.root.findByProps({ collapsable: false });
    expect(captureTargets[0]).toBe(source.props.ref.current);
    expect(source.findAllByType("canvas")).toHaveLength(0);
    expect(source.props.style).toBeUndefined();
    const blur$ = observable(0);
    const progress$ = observable(0);
    await act(() => renderer.update(content(0.5, { isPreview: true, isActive: false }, {
      blur: blur$, uniforms: () => ({ progress: progress$.get() }),
    })));
    const beforeAnimation = canvasRenders;
    for (const value of [0.25, 0.5, 1]) {
      await act(() => { blur$.set(value * 24); progress$.set(value); });
      expect(renderer.root.findByType("shader").props.uniforms.progress).toBe(value);
      expect(renderer.root.findByType("blur").props.blur).toBe(value * 24 * 2);
    }
    expect(canvasRenders).toBe(beforeAnimation);
    expect(captures).toHaveLength(0);
    await act(() => renderer.update(content(0.5, { isPreview: false, isActive: true, startedAt: 1000 })));
    await flushFrame(3500);
    expect(renderer.root.findByType("shader").props.uniforms.time).toBe(2.5);
    await act(() => renderer.update(content(0.5, { isPreview: false, isActive: true, startedAt: 3500 })));
    await flushFrame(3750);
    expect(renderer.root.findByType("shader").props.uniforms.time).toBe(0.25);
    await act(() => renderer.update(content(
      0.5,
      { isPreview: false, isActive: true, startedAt: 1000, stepIndex: 0, stepStartedAt: 4000 },
      { active: false },
    )));
    await flushFrame(4500);
    expect(renderer.root.findByType("shader").props.uniforms.time).toBe(0);
    await act(() => renderer.update(content(
      0.5,
      { isPreview: false, isActive: true, startedAt: 1000, stepIndex: 1, stepStartedAt: 4500 },
      { active: true },
    )));
    await flushFrame(5000);
    expect(renderer.root.findByType("shader").props.uniforms.time).toBe(0.5);
    expect(captures).toHaveLength(0);
    await act(() => renderer.update(content(
      0.5,
      { isPreview: false, isActive: true, startedAt: 1000, stepIndex: 2, stepStartedAt: 5000 },
      { active: true },
    )));
    await flushFrame(5500);
    expect(renderer.root.findByType("shader").props.uniforms.time).toBe(1);
    await act(() => renderer.update(content(1)));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType("image")).toHaveLength(0);
    await flushFrame(); await flushFrame();
    expect(captures).toHaveLength(1);
    await act(() => renderer.update(content(0)));
    await act(() => captures.shift()(late));
    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType("image")).toHaveLength(0);
    await flushFrame(); await flushFrame();
    expect(captures).toHaveLength(0);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    log.mockRestore();
  }
});

test("Aurora ticks only its shader and cancels its clock when inactive or unmounted", async () => {
  const { AmbientAurora } = await import("../../decks/react-native-desktop/packs/backgrounds/AmbientAurora");
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
    const before = canvasRenders;
    for (const timestamp of [1016, 1032, 1048]) {
      now = timestamp;
      await act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(now)); });
      expect(tree.root.findByType("aurora-shader").props.uniforms.time).toBeCloseTo((now - 1000) / 1000);
    }
    expect(canvasRenders).toBe(before);
    await act(() => tree.update(content(false)));
    expect(frames.size).toBe(0);
    await act(() => tree.update(content(false, true)));
    expect(tree.root.findByType("aurora-shader").props.uniforms.time).toBe(8);
    expect(frames.size).toBe(0);
    await act(() => tree.update(content(true)));
    expect(frames.size).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
    expect(frames.size).toBe(0);
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    clock.mockRestore(); log.mockRestore();
  }
});

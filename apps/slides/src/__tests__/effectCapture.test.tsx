// @ts-nocheck Native rendering is mocked; this test exercises capture lifecycle.
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { PresentationProvider } from "@legend-apps/presentation";
import { SlideCaptureContext } from "../SlideCaptureContext";
import "./nativeMock";

const captures = [];
const captureTargets = [];
const runtimeEffect = {};
mock.module("@shopify/react-native-skia", () => ({
  Canvas: "canvas", Group: "group", Image: "image", Paint: "paint", RuntimeShader: "shader",
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
  const content = (scale, runtime = { isPreview: true, isActive: false }) => (
    <PresentationProvider value={runtime}>
      <SlideCaptureContext.Provider value={scale}><Effect><text>Visible</text></Effect></SlideCaptureContext.Provider>
    </PresentationProvider>
  );
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
    await act(() => renderer.update(content(0.5, { isPreview: false, isActive: true, startedAt: 1000 })));
    await flushFrame(3500);
    expect(renderer.root.findAllByType("group").find((group) => group.props.layer).props.layer.props.children.props.uniforms.time).toBe(2.5);
    await act(() => renderer.update(content(0.5, { isPreview: false, isActive: true, startedAt: 3500 })));
    await flushFrame(3750);
    expect(renderer.root.findAllByType("group").find((group) => group.props.layer).props.layer.props.children.props.uniforms.time).toBe(0.25);
    expect(captures).toHaveLength(0);
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

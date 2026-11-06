// @ts-nocheck Controlled UI callbacks exercise the real guard, sampler and HUD ownership.
import { expect, mock, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
import { frames, flushUI } from "./uiClockMock";
import { createFrameCadence, sampleFrameCadence } from "../frameCadence";
mock.module("react-native", () => ({
  SafeAreaView: "safe-area", View: "view", Text: "text",
  StyleSheet: { create: value => value, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
}));
const { PerformanceHUD } = await import("../PerformanceHUD");
const { getSlidesState, setSlidesState } = await import("../slidesStore");
const { toggleSlideReferences } = await import("../slideReferences");

test("frame sampling uses elapsed time, rolls over one second and publishes at most 2 Hz", () => {
  const sample = createFrameCadence();
  const publishes = [];
  for (let time = 0; time <= 1000; time += 10) {
    if (sampleFrameCadence(sample, time)) publishes.push(time);
  }
  expect(publishes).toEqual([500, 1000]);
  expect(sample.fps).toBe(100);
  expect(sample.averageMs).toBe(10);
  expect(sampleFrameCadence(sample, 1000)).toBe(false);
  expect(sampleFrameCadence(sample, 999)).toBe(false);
  // Old fast frames age out; delayed callbacks count toward actual cadence.
  expect(sampleFrameCadence(sample, 1500)).toBe(true);
  expect(sample.fps).toBe(51);
  expect(sample.averageMs).toBeCloseTo(1000 / 51);
  expect(sampleFrameCadence(sample, 2000)).toBe(true);
  expect(sample.fps).toBe(2);
  expect(sample.averageMs).toBe(500);
});

test("I-key debug guard mounts one callback, isolates updates, and stops on OFF/unmount", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState(), previousDev = globalThis.__DEV__;
  let tree, hostRenders = 0, worldRenders = 0, commits = 0;
  function World() { worldRenders++; return <world />; }
  function Host() { hostRenders++; return <><World /><Profiler id="hud" onRender={() => commits++}><PerformanceHUD /></Profiler></>; }
  try {
    globalThis.__DEV__ = true;
    setSlidesState({ slideReferences: false, config: {}, deckLocked: false });
    const before = frames.length;
    await act(() => { tree = create(<Host />); flushUI(); });
    expect(frames.length).toBe(before);
    await act(() => toggleSlideReferences());
    const frame = frames.at(-1);
    expect(frames.length).toBe(before + 1);
    expect(frame.active).toBe(true);
    expect(tree.root.findByType("safe-area").props.pointerEvents).toBe("none");
    expect(tree.root.findByType("safe-area").props.style.alignItems).toBe("flex-end");
    const beforeSamples = commits;
    for (let time = 0; time <= 1000; time += 10) await act(() => frame.tick(time));
    expect(tree.root.findByType("text").children.join("")).toBe("UI FPS 100.0 · avg frame 10.0 ms");
    // The second unchanged sample is a React state no-op.
    expect(commits - beforeSamples).toBeLessThanOrEqual(2);
    expect(hostRenders).toBe(1);
    expect(worldRenders).toBe(1);
    await act(() => toggleSlideReferences());
    expect(frame.active).toBe(false);
    expect(tree.root.findAllByType("safe-area")).toHaveLength(0);
    await act(() => toggleSlideReferences());
    expect(frames.at(-1).active).toBe(true);
    expect(tree.root.findByType("text").children.join("")).toContain("UI FPS —");
    await act(() => tree.unmount());
    expect(frames.every(frame => !frame.active)).toBe(true);
    tree = null;
  } finally {
    if (tree) await act(() => tree.unmount());
    globalThis.__DEV__ = previousDev;
    setSlidesState(initial);
  }
});

test("release and undefined debug flag hide HUD even with explicit overlays enabled", async () => {
  const initial = getSlidesState(), previousDev = globalThis.__DEV__;
  try {
    setSlidesState({ slideReferences: true, config: { slideReferences: true }, deckLocked: false });
    const before = frames.length;
    for (const dev of [false, undefined]) {
      globalThis.__DEV__ = dev;
      let tree;
      await act(() => { tree = create(<PerformanceHUD />); });
      expect(tree.toJSON()).toBeNull();
      expect(frames.length).toBe(before);
      await act(() => tree.unmount());
    }
  } finally {
    globalThis.__DEV__ = previousDev;
    setSlidesState(initial);
  }
});

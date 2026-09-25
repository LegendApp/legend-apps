// @ts-nocheck Native leaves are replaced; the transition runs with controlled frames.
import { expect, spyOn, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { frames as uiFrames, flushUI } from "./uiClockMock";
import * as Reanimated from "react-native-reanimated";
import * as Presentation from "@legend-apps/presentation";
import { PresentationProvider } from "@legend-apps/presentation";
import "./nativeMock";
import { Steps, resolveSteps } from "../steps";

function loadGlass(onRender = () => {}) {
  const filename = `${import.meta.dir}/../LiquidGlass.tsx`;
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name === "./Effect") return { Effect: "effect" };
      if (name === "react-native-reanimated") return Reanimated;
      const exports = name === "@legend-apps/presentation" ? Presentation : require(name);
      return name === "@legend-apps/presentation" ? { ...exports, usePlaybackTween(...args) {
        onRender();
        return exports.usePlaybackTween(...args);
      } } : exports;
    }, module, module.exports,
  );
  return module.exports.LiquidGlass;
}

test("glass reverses from its current blur and keeps the overlay outside the filter", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let renders = 0;
  const LiquidGlass = loadGlass(() => renders++);
  expect(resolveSteps(<Steps>{(step) => <LiquidGlass active={step >= 1} />}</Steps>).steps).toBe(2);
  expect(resolveSteps(<Steps count={4}>{(step) => <LiquidGlass active={step >= 3} />}</Steps>).steps).toBe(4);
  const frames = new Map();
  let frameId = 0;
  let now = 0;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const time = spyOn(performance, "now").mockImplementation(() => now);
  const log = spyOn(console, "error").mockImplementation(() => {});
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const advance = async (ms) => {
    now += ms;
    await act(() => uiFrames.at(-1).tick(now));
  };
  const runtime$ = observable({});
  const content = (stepIndex, isPreview = false) => {
    runtime$.set({ stepIndex, startedAt: 1, stepStartedAt: now, isActive: !isPreview, isPreview });
    return <PresentationProvider value={runtime$}>
    <LiquidGlass active={stepIndex >= 1} duration={700} overlay={<overlay /> }><chart /></LiquidGlass>
  </PresentationProvider>;
  };
  let tree;
  try {
    await act(() => { tree = create(content(0)); });
    flushUI(); uiFrames.at(-1).tick(++now);
    const blur = () => tree.root.findByType("effect").props.blur.value;
    expect(blur()).toBe(0);
    await act(() => tree.update(content(1)));
    flushUI(); uiFrames.at(-1).tick(++now);
    const beforeAnimation = renders;
    await advance(350);
    expect(renders).toBe(beforeAnimation);
    expect(blur()).toBeCloseTo(12);
    expect(tree.root.findByType("effect").findAllByType("overlay")).toHaveLength(0);
    await act(() => tree.update(content(0)));
    flushUI(); uiFrames.at(-1).tick(++now);
    expect(blur()).toBeCloseTo(12);
    await advance(350);
    expect(blur()).toBeCloseTo(6);
    await advance(350);
    expect(blur()).toBe(0);
    await act(() => tree.update(content(1)));
    flushUI(); uiFrames.at(-1).tick(++now);
    await advance(700);
    expect(blur()).toBe(24);
    expect(frames.size).toBe(0);
    await act(() => tree.update(content(0, true)));
    flushUI();
    expect(blur()).toBe(0);
    await act(() => tree.update(content(1, true)));
    flushUI();
    expect(blur()).toBe(24);
    expect(frames.size).toBe(0);
    expect(log.mock.calls.some((args) => args.join(" ").includes("Cannot update a component"))).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    time.mockRestore(); log.mockRestore();
  }
});

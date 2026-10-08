// @ts-nocheck Native views are mocked.
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
import { frames, flushUI } from "./uiClockMock";
import { interpolateStepStyle } from "../useStepStyle";
const { PresentationProvider } = await import("@legend-apps/presentation");
const { Step, Steps, resolveSteps, stepStyle } = await import("../steps");

test("step interpolation uses shared playback, retargets from the displayed style and freezes outgoing", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({});
  const content = (stepIndex, text, phase = "playing") => {
    runtime$.set({ stepIndex, slideIndex: 0, playbackPhase: phase });
    return <PresentationProvider value={runtime$}><Step at={1}>{text}</Step></PresentationProvider>;
  };
  let tree;
  try {
    await act(() => { tree = create(content(0, "first")); }); flushUI();
    const opacity = () => tree.root.findByType("animated-view").props.style.value.opacity;
    const frame = frames.at(-1);
    frame.tick(1000);
    await act(() => tree.update(content(1, "first"))); flushUI();
    expect(opacity()).toBe(0);
    frame.tick(1100); frame.tick(1250);
    expect(opacity()).toBeCloseTo(0.5);
    await act(() => tree.update(content(1, "updated"))); flushUI();
    expect(opacity()).toBeCloseTo(0.5);
    await act(() => tree.update(content(0, "reverse"))); flushUI();
    expect(opacity()).toBeCloseTo(0.5);
    frame.tick(1300); frame.tick(1450);
    expect(opacity()).toBeCloseTo(0.25);
    await act(() => tree.update(content(0, "exit", "outgoing"))); flushUI();
    frame.tick(2000);
    expect(opacity()).toBeCloseTo(0.25);
    await act(() => tree.update(content(1, "preview", "preview"))); flushUI();
    expect(opacity()).toBe(1);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("UI style interpolation retains numeric transforms, hex colors and discrete properties", () => {
  expect(interpolateStepStyle({ opacity: 0, transform: [{ translateY: 20 }], backgroundColor: "#000" },
    { opacity: 1, transform: [{ translateY: 0 }], backgroundColor: "#fff", display: "flex" }, 0.5))
    .toEqual({ opacity: 0.5, transform: [{ translateY: 10 }], backgroundColor: "rgba(128,128,128,1)", display: "flex" });
});

test("later steps leave an unchanged reveal moving toward its original deadline", async () => {
  const runtime$ = observable({ slideIndex: 0, stepIndex: 0, playbackPhase: "playing" });
  let tree;
  try {
    await act(() => { tree = create(<PresentationProvider value={runtime$}><Step at={1}>Content</Step></PresentationProvider>); }); flushUI();
    const frame = frames.at(-1);
    const opacity = () => tree.root.findByType("animated-view").props.style.value.opacity;
    frame.tick(1000);
    await act(() => runtime$.stepIndex.set(1)); flushUI();
    frame.tick(1100); frame.tick(1250);
    expect(opacity()).toBeCloseTo(0.5);
    await act(() => runtime$.stepIndex.set(2)); flushUI();
    frame.tick(1300); frame.tick(1400);
    expect(opacity()).toBe(1);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("reveal ordering includes list items, shared positions, exits and animation triggers", () => {
  const result = resolveSteps(<>
    <Steps><ul><li>One</li><li>Two</li></ul></Steps>
    <Step at={2}>Together</Step>
    <Step until={5}>Third</Step>
    <Steps count={7}>{() => <effect />}</Steps>
  </>);
  expect(result.steps).toBe(7);
  const root = result.content[0].props.children;
  const list = root[0].props.children.flat();
  expect(list.map((child) => child.props.at)).toEqual([1, 2]);
  expect(root[1].props.at).toBe(2);
  expect(root[2].props.at).toBe(3);
});

test("property states persist and resolve deterministically on reverse navigation", () => {
  const props = { initial: { opacity: 1 }, states: { 2: { opacity: 0.3 }, 4: { opacity: 1 } } };
  expect([0, 2, 3, 4, 3, 0].map((step) => stepStyle(step, props).opacity)).toEqual([1, 0.3, 0.3, 1, 0.3, 1]);
  expect(stepStyle(1, { at: 2 }).opacity).toBe(0);
  expect(stepStyle(3, { at: 2, until: 4 }).opacity).toBe(1);
  expect(stepStyle(4, { at: 2, until: 4 }).opacity).toBe(0);
});


test("render functions are retained without invocation and declare total states", () => {
  let calls = 0;
  const render = (step) => { calls++; return <text>{step}</text>; };
  const result = resolveSteps(<Steps count={3}>{render}</Steps>);
  expect(result.steps).toBe(3);
  expect(result.content[0].props.children).toBe(render);
  expect(calls).toBe(0);
  expect(resolveSteps(<Steps>{render}</Steps>).steps).toBe(2);
  expect(resolveSteps(<Steps count={1}>{render}</Steps>).steps).toBe(1);
  for (const count of [0, -1, 1.5, NaN]) {
    expect(() => resolveSteps(<Steps count={count}>{render}</Steps>)).toThrow("positive integer");
  }
});

test("step styles compile with React Compiler and native worklet serialization", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const { transformSync } = await import("@babel/core");
  for (const file of ["../steps.tsx", "../useStepStyle.ts"]) {
    const filename = fileURLToPath(new URL(file, import.meta.url));
    const require = createRequire(filename);
    const result = transformSync(readFileSync(filename, "utf8"), {
      filename, babelrc: false, configFile: false,
      presets: [require.resolve("@react-native/babel-preset")],
      plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }], require.resolve("react-native-worklets/plugin")],
    });
    expect(result.code).toBeTruthy();
    if (file.endsWith("useStepStyle.ts")) expect(result.code).toContain("__workletHash");
  }
});

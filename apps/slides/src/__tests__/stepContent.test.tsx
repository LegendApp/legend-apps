// @ts-nocheck Native views are mocked.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { transitions } from "./nativeMock";
const { PresentationProvider } = await import("@legend-apps/presentation");
const { Step, Steps, resolveSteps, stepStyle } = await import("../steps");

test("step interpolation retains its starting style across unrelated renders and reverse navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const content = (stepIndex, text, isPreview = false) => (
    <PresentationProvider value={{ stepIndex, isPreview, isActive: true }}>
      <Step at={1}>{text}</Step>
    </PresentationProvider>
  );
  let tree;
  const initialTransitionCount = transitions.length;
  try {
    await act(() => { tree = create(content(0, "first")); });
    await act(() => tree.update(content(1, "first")));
    expect(tree.root.findByType("layer").props.style.opacity.__getValue()).toBe(0);
    await act(() => tree.update(content(1, "updated content")));
    expect(tree.root.findByType("layer").props.style.opacity.__getValue()).toBe(0);
    await act(() => tree.update(content(0, "updated content")));
    expect(tree.root.findByType("layer").props.style.opacity.__getValue()).toBe(1);
    await act(() => tree.update(content(0, "preview", true)));
    expect(tree.root.findByType("layer").props.style.opacity).toBe(0);
  } finally {
    if (tree) await act(() => tree.unmount());
    transitions.splice(initialTransitionCount);
  }
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

// @ts-nocheck Native views are mocked.
import { expect, test } from "bun:test";
import React from "react";
import "./nativeMock";
const { Step, Steps, resolveSteps, stepStyle } = await import("../steps");

test("reveal ordering includes list items, shared positions, exits and animation triggers", () => {
  const result = resolveSteps(<>
    <Steps><ul><li>One</li><li>Two</li></ul></Steps>
    <Step at={2}>Together</Step>
    <Step until={5}>Third</Step>
    <effect startOnStep={6} />
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

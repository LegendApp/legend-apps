// @ts-nocheck Controlled UI clock exercises the public hook without native runtimes.
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
import { frames, flushUI } from "./uiClockMock";
const { PresentationProvider, useStep } = await import("../../../../packages/presentation/src/runtime");

test("useStep samples the shared clock across later steps, freezes on exit, and never renders per frame", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let value, renders = 0, tree;
  function Probe() { renders++; value = useStep(1); return null; }
  const render = (stepIndex, phase = "playing") => <PresentationProvider value={observable({
    slideIndex: 0, stepIndex, stepEpochs: { 1: 100 }, playbackPhase: phase,
  })}><Probe /></PresentationProvider>;
  await act(() => { tree = create(render(0)); }); flushUI();
  const frame = frames.at(-1);
  frame.tick(1000); frame.tick(2000);
  expect(value.elapsed.value).toBe(0);
  await act(() => tree.update(render(1))); flushUI();
  frame.tick(3000); frame.tick(4000);
  expect(value.elapsed.value).toBe(1);
  const before = renders;
  frame.tick(4500);
  expect(renders).toBe(before);
  await act(() => tree.update(render(2))); flushUI();
  frame.tick(5000); frame.tick(6000);
  expect(value.elapsed.value).toBe(3);
  await act(() => tree.update(render(2, "outgoing"))); flushUI();
  frame.tick(9000);
  expect(value.elapsed.value).toBe(3);
  await act(() => tree.update(render(0))); flushUI();
  expect(value.elapsed.value).toBe(0);
  await act(() => tree.update(render(1, "preview"))); flushUI();
  expect(value.elapsed.value).toBe(0);
  await act(() => tree.unmount());
});

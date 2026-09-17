// @ts-nocheck Host leaves are replaced by render-count probes.
import { expect, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { PresentationObservableProvider, PresentationProvider, usePresentationValue } from "../runtime";

for (const alias of [false, true]) {
  test(`${alias ? "primary" : "observable"} runtime updates consumers without render-phase notifications`, async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const runtime$ = observable({ isActive: true, isPreview: false, stepIndex: 0 });
    const renders = { active: 0, step: 0 };
    function Active() { renders.active++; return <active value={usePresentationValue("isActive")} />; }
    function Step() { renders.step++; return <step value={usePresentationValue("stepIndex")} />; }
    const children = <><Active /><Step /></>;
    const content = () => alias
      ? <PresentationProvider value={runtime$}>{children}</PresentationProvider>
      : <PresentationObservableProvider value={runtime$}>{children}</PresentationObservableProvider>;
    const log = spyOn(console, "error").mockImplementation(() => {});
    let tree;
    try {
      await act(() => { tree = create(content()); });
      renders.active = renders.step = 0;
      for (const step of [1, 2, 3]) {
        await act(() => { runtime$.stepIndex.set(step); });
        expect(tree.root.findByType("step").props.value).toBe(step);
      }
      expect(renders).toEqual({ active: 0, step: 3 });
      await act(() => { runtime$.isActive.set(false); });
      expect(tree.root.findByType("active").props.value).toBe(false);
      expect(renders).toEqual({ active: 1, step: 3 });
      expect(log.mock.calls.some((args) => args.join(" ").includes("Cannot update a component"))).toBe(false);
    } finally {
      if (tree) await act(() => tree.unmount());
      log.mockRestore();
    }
  });
}

test("lifecycle and step hooks ignore unrelated runtime fields", async () => {
  const { useSlideLifecycle, useStep } = await import("../runtime");
  const runtime$ = observable({ isActive: false, isPreview: false, isPreparing: false,
    currentSlide: 0, slideIndex: 0, stepIndex: 5, stepCount: 8,
    direction: "forward", stepEpochs: { 2: 100, 5: 200 } });
  let lifecycleRenders = 0;
  let stepRenders = 0;
  function Lifecycle() { lifecycleRenders++; return <lifecycle value={useSlideLifecycle()} />; }
  function Step() { stepRenders++; return <step value={useStep(2)} />; }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    await act(() => { tree = create(<PresentationProvider value={runtime$}><Lifecycle /><Step /></PresentationProvider>); });
    lifecycleRenders = stepRenders = 0;
    await act(() => runtime$.currentSlide.set(1));
    await act(() => runtime$.stepEpochs[5].set(300));
    expect([lifecycleRenders, stepRenders]).toEqual([0, 0]);
    await act(() => runtime$.stepIndex.set(6));
    expect([lifecycleRenders, stepRenders]).toEqual([1, 0]);
    await act(() => runtime$.stepIndex.set(2));
    expect(tree.root.findByType("step").props.value.isCurrent).toBe(true);
    expect(stepRenders).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
    log.mockRestore();
  }
});

// @ts-nocheck This suite uses Bun's test globals and host test elements.
import { expect, test } from "bun:test";
import { observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { act, create } from "react-test-renderer";
import { getSlidesState, setSlidesState, slidesState$ } from "../slidesStore";

test("status updates leave slide consumers idle and navigation publishes coherent clocks", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  let slideRenders = 0;
  let statusRenders = 0;
  function Slide() {
    slideRenders += 1;
    return <slide index={useValue(slidesState$.currentSlide)} />;
  }
  function Status() {
    statusRenders += 1;
    return <status message={useValue(slidesState$.displayMessage)} />;
  }
  let renderer;
  let dispose;
  try {
    setSlidesState({ currentSlide: 0, currentStep: 0, displayMessage: "", slides: [
      { metadata: { steps: 2 }, notes: "" }, { metadata: {}, notes: "" },
    ] });
    await act(() => { renderer = create(<><Slide /><Status /></>); });
    const before = { slideRenders, statusRenders };
    await act(() => setSlidesState({ displayMessage: "Compiling" }));
    expect(slideRenders).toBe(before.slideRenders);
    expect(statusRenders).toBe(before.statusRenders + 1);
    const observed = [];
    dispose = observe(() => {
      observed.push([slidesState$.currentStep.get(), slidesState$.stepStartedAt.get(), slidesState$.stepEpochs.get()]);
    });
    await act(() => setSlidesState({ currentStep: 1 }));
    expect(observed).toHaveLength(2);
    expect(observed[1][0]).toBe(1);
    expect(observed[1][2][1]).toBe(observed[1][1]);
  } finally {
    dispose?.();
    if (renderer) await act(() => renderer.unmount());
    setSlidesState(initial);
  }
});

test("compiled components remain callable data and old snapshots stay unchanged", () => {
  const initial = getSlidesState();
  const Component = () => { throw new Error("Only React may render this component"); };
  try {
    setSlidesState({ component: Component, templates: { sample: Component } });
    expect(slidesState$.compiled.get()?.component).toBe(Component);
    expect(slidesState$.templates.get().sample).toBe(Component);
    expect(initial.component).not.toBe(Component);
    const current = getSlidesState();
    setSlidesState({ blackout: !current.blackout });
    expect(current.blackout).not.toBe(getSlidesState().blackout);
  } finally {
    setSlidesState(initial);
  }
});

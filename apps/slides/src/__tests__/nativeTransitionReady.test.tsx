// @ts-nocheck Native progress events are supplied explicitly for lifecycle tests.
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
import { reactUI } from "./uiClockMock";
import { useNativeTransitionReady } from "../useNativeTransitionReady";
import { BackgroundHost } from "@legend-apps/presentation";
const renders = new Map();
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => 1 }));
mock.module("../DeckRenderer", () => ({
  DeckRenderer: props => {
    renders.set(props.targetIndex, (renders.get(props.targetIndex) ?? 0) + 1);
    return <deck {...props} />;
  },
  SlideCanvas: "canvas", SlideBackgroundHost: BackgroundHost,
}));
const { AudienceWindow } = await import("../AudienceWindow");
const { getSlidesState, setCurrentSlide, setSlidesState } = await import("../slidesStore");
function Gate({ progress, transitioning = true }) {
  return <gate visible={useNativeTransitionReady(progress, transitioning)} />;
}
test("incoming content stays hidden until native progress, then stops observing frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const progress = { value: 0 };
  let tree;
  try {
    await act(() => { tree = create(<Gate progress={progress} />); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    await act(() => { progress.value = 0; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    await act(() => { progress.value = 0.02; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(true);

  } finally { if (tree) await act(() => tree.unmount()); }
});
test("reversals require their own native signal and ignore stale callbacks; cuts reveal immediately", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const old = { value: 0 }, next = { value: 0 };
  let tree;
  try {
    await act(() => { tree = create(<Gate progress={old} />); });

    await act(() => tree.update(<Gate progress={next} />));
    await act(() => { old.value = 0.5; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);

    await act(() => { next.value = 0.01; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(true);
    await act(() => tree.update(<Gate progress={{ value: 1 }} transitioning={false} />));
    expect(tree.root.findByType("gate").props.visible).toBe(true);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("first native progress reveals only the incoming layer without rerendering slide content", async () => {
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ currentSlide: 0, config: { transition: "fade" },
      slides: Array.from({ length: 4 }, () => ({ metadata: {}, notes: "" })) });
    await act(() => { tree = create(<AudienceWindow />); });
    await act(() => setCurrentSlide(1));
    const layers = () => tree.root.findAllByType("animated-view")
      .filter(node => node.props.accessibilityElementsHidden !== undefined);
    const incoming = () => layers().find(node => node.findByType("deck").props.targetIndex === 1);
    expect(incoming().props.style[2].zIndex).toBe(-1);
    const before = [...renders];
    const progress = tree.root.findAll(node => node.type?.name === "AudienceSlide")
      .find(node => node.props.index === 1).props.progress;
    await act(() => { progress.value = 0.02; reactUI(); });
    expect(incoming().props.style[2].zIndex).toBe(1);
    expect([...renders]).toEqual(before);
    await act(() => { progress.value = 0.5; reactUI(); });
    expect([...renders]).toEqual(before);
  } finally {
    if (tree) await act(() => tree.unmount());
    renders.clear();
    setSlidesState(initial);
    log.mockRestore();
  }
});

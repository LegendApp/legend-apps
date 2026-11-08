// @ts-nocheck Native windows and the UI clock are controlled; audience lifecycle is real.
import "./nativeMock";
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { reactUI, transactions } from "./uiClockMock";
const skia = { ...await import("@shopify/react-native-skia") };
mock.module("../../../../packages/presentation/node_modules/@shopify/react-native-skia", () => skia);
const { BackgroundHost, usePreparationTask } = await import("@legend-apps/presentation");
const pending$ = observable(false);
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => 1 }));
function Deck(props) {
  usePreparationTask(useValue(() => props.targetIndex === 2 && pending$.get()));
  return <deck {...props} />;
}
mock.module("../DeckRenderer", () => ({ DeckRenderer: Deck, SlideCanvas: "canvas", SlideBackgroundHost: BackgroundHost }));
const { AudienceWindow } = await import("../AudienceWindow");
const { getSlidesState, setCurrentSlide, setSlidesState } = await import("../slidesStore");

async function harness(run) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ currentSlide: 1, currentStep: 0, config: { transition: "fade" },
      slides: Array.from({ length: 4 }, () => ({ metadata: {}, notes: "" })) });
    await act(() => { tree = create(<AudienceWindow />); });
    const layers = () => tree.root.findAllByType("animated-view")
      .filter(node => node.props.accessibilityElementsHidden !== undefined);
    const order = () => layers().map(node => node.findByType("deck").props.targetIndex);
    const layer = index => layers().find(node => node.findByType("deck").props.targetIndex === index);
    const progress = index => tree.root.findAll(node => node.type?.name === "AudienceSlide")
      .find(node => node.props.index === index).props.progress;
    await run({ order, layer, progress });
  } finally {
    if (tree) await act(() => tree.unmount());
    transactions.length = 0;
    pending$.set(false);
    setSlidesState(initial);
    log.mockRestore();
  }
}

test("promoting a prepared slide never moves its native view above the outgoing slide before readiness", () => harness(async h => {
  const order = h.order();
  await act(() => pending$.set(true));
  await act(() => setCurrentSlide(2));
  expect(h.layer(2).props.style[2].zIndex).toBe(-1);
  expect(h.order()).toEqual(order);
  await act(() => pending$.set(false));
  expect(h.order()).toEqual(order);
  expect(h.layer(2).props.style[2].zIndex).toBe(-1);
}));

test("backward navigation uses stacking rather than moving mounted slide views", () => harness(async h => {
  const order = h.order();
  await act(() => setCurrentSlide(0));
  expect(h.order()).toEqual(order);
  await act(() => { h.progress(0).value = 0.1; reactUI(); });
  expect(h.layer(0).props.style[2].zIndex).toBeGreaterThan(h.layer(1).props.style[2].zIndex);
  expect(h.order()).toEqual(order);
}));

test("an interrupted handoff retains native order and hides the new incoming slide until its own progress", () => harness(async h => {
  const order = h.order();
  await act(() => setCurrentSlide(2));
  const stale = h.progress(2);
  await act(() => { stale.value = 0.2; reactUI(); });
  await act(() => setCurrentSlide(0));
  expect(h.order()).toEqual(order);
  await act(() => { stale.value = 1; reactUI(); });
  expect(h.layer(0).props.style[2].zIndex).toBe(-1);
  await act(() => { h.progress(0).value = 0.1; reactUI(); });
  expect(h.layer(0).props.style[2].zIndex).toBeGreaterThan(h.layer(2).props.style[2].zIndex);
}));

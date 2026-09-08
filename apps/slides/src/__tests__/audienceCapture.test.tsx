// @ts-nocheck Native windows and animation frames are mocked.
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";

import { transitions } from "./nativeMock";
mock.module("../DeckRenderer", () => ({ DeckRenderer: "deck", SlideCanvas: "canvas" }));
const { AudienceWindow } = await import("../AudienceWindow");
const { getSlidesState, setCurrentSlide, setSlidesState } = await import("../slidesStore");

test("crossfade keeps identical backgrounds fully opaque throughout forward and reverse navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  const opacityValue = (opacity) => typeof opacity === "number" ? opacity : opacity.__getValue();
  try {
    setSlidesState({
      currentSlide: 0,
      config: { transition: "fade" },
      slides: [0, 1, 2].map(() => ({ metadata: {}, notes: "" })),
    });
    await act(() => { renderer = create(<AudienceWindow />); });
    for (const index of [1, 2, 1, 0]) {
      await act(() => setCurrentSlide(index));
      const visible = renderer.root.findAllByType("layer")
        .filter((layer) => Array.isArray(layer.props.style));
      expect(visible).toHaveLength(2);
      const outgoing = visible[0].props.style[1].opacity;
      const incoming = visible[1].props.style[1].opacity;
      expect(visible[1].findByType("deck").props.targetIndex).toBe(index);
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        incoming.setValue(progress);
        const incomingAlpha = opacityValue(incoming);
        const outgoingAlpha = opacityValue(outgoing);
        // Source-over compositing must leave no contribution from the black window.
        expect(incomingAlpha + outgoingAlpha * (1 - incomingAlpha)).toBe(1);
      }
      await act(() => { transitions.splice(0).forEach((done) => done({ finished: true })); });
    }
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("audience retains two slides on each side at full capture scale", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({
      currentSlide: 0,
      config: { transition: "fade" },
      slides: ["none", "none", "fade", "fade", "fade", "none", "fade"].map((transition) => ({ metadata: { transition }, notes: "" })),
    });
    await act(() => { renderer = create(<AudienceWindow />); });
    for (const index of [1, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, 1]) {
      await act(() => setCurrentSlide(index));
      await act(() => { transitions.splice(0).forEach((done) => done({ finished: true })); });
      const canvases = renderer.root.findAllByType("canvas");
      expect(canvases.map((canvas) => canvas.findByType("deck").props.targetIndex).sort((a, b) => a - b))
        .toEqual(Array.from({ length: Math.min(6, index + 2) - Math.max(0, index - 2) + 1 },
          (_, offset) => Math.max(0, index - 2) + offset));
      const active = canvases.filter((canvas) => !canvas.findByType("deck").props.isPreview);
      expect(active).toHaveLength(1);
      expect(active[0].findByType("deck").props.targetIndex).toBe(index);
      expect(active[0].props.captureEnabled).not.toBe(false);
      for (const canvas of canvases.filter((canvas) => canvas.findByType("deck").props.isPreview)) {
        expect(canvas.props.captureEnabled).not.toBe(false);
      }
    }
    // Reverse an unfinished transition: the old outgoing slide is now current.
    for (const index of [2, 3, 2, 3, 2]) {
      await act(() => setCurrentSlide(index));
    }
    expect(log.mock.calls.some((args) => args.join(" ").includes("same key"))).toBe(false);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});


test("starting another transition never resets the opacity already attached to the visible slide", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  const incomingOpacity = () => renderer.root.findAllByType("layer")
    .find((layer) => layer.findByType("deck").props.targetIndex === getSlidesState().currentSlide)
    .props.style[1].opacity;
  try {
    setSlidesState({ currentSlide: 0, config: { transition: "fade" },
      slides: Array.from({ length: 4 }, () => ({ metadata: {}, notes: "" })) });
    await act(() => { renderer = create(<AudienceWindow />); });
    const firstOpacity = incomingOpacity();
    await act(() => setCurrentSlide(1));
    expect(firstOpacity.__getValue()).toBe(1);
    const secondOpacity = incomingOpacity();
    expect(secondOpacity).not.toBe(firstOpacity);
    secondOpacity.setValue(0.6);
    await act(() => setCurrentSlide(2));
    expect(secondOpacity.__getValue()).toBe(0.6);
    expect(incomingOpacity()).not.toBe(secondOpacity);
    // Completion callbacks from interrupted transitions cannot settle the new one.
    const callbacks = transitions.splice(0);
    await act(() => callbacks[0]({ finished: true }));
    expect(incomingOpacity().__getValue()).toBe(0);
    await act(() => callbacks[callbacks.length - 1]({ finished: true }));
    expect(incomingOpacity().__getValue()).toBe(1);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

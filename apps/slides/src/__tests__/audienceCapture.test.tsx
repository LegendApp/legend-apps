// @ts-nocheck Native windows and animation frames are mocked.
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";

import { transitions } from "./nativeMock";
mock.module("../DeckRenderer", () => ({ DeckRenderer: "deck", SlideCanvas: "canvas" }));
const { AudienceWindow } = await import("../AudienceWindow");
const { getSlidesState, setCurrentSlide, setSlidesState } = await import("../slidesStore");

test("audience captures cut slides on entry and return, but never hidden preloads", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({
      currentSlide: 0,
      config: { transition: "fade" },
      slides: ["none", "none", "fade", "fade"].map((transition) => ({ metadata: { transition }, notes: "" })),
    });
    await act(() => { renderer = create(<AudienceWindow />); });
    for (const index of [1, 0, 1, 2, 3, 2, 1, 0, 1]) {
      await act(() => setCurrentSlide(index));
      await act(() => { transitions.splice(0).forEach((done) => done({ finished: true })); });
      const canvases = renderer.root.findAllByType("canvas");
      const active = canvases.filter((canvas) => !canvas.findByType("deck").props.isPreview);
      expect(active).toHaveLength(1);
      expect(active[0].findByType("deck").props.targetIndex).toBe(index);
      expect(active[0].props.captureEnabled).toBe(true);
      for (const canvas of canvases.filter((canvas) => canvas.findByType("deck").props.isPreview)) {
        expect(canvas.props.captureEnabled).toBe(false);
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

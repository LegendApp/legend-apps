// @ts-nocheck Exercise actual background registration and presentation clocks without a GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import { Background, BackgroundHost, GPUShaderProvider, PresentationObservableProvider, usePlayback } from "@legend-apps/presentation";
import React from "react";
import { act, create } from "react-test-renderer";
import { Camera, Sphere, World } from "../packs/world/World";
import { worldHeaderSize } from "../packs/world/scene";

test("selected background worlds restart slide time while preserving camera continuity and step sampling", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime = slideIndex => observable({ currentSlide: 0, currentStep: 0, slideIndex, stepIndex: 0,
    slideCount: 2, stepCount: 2, startedAt: 0, stepStartedAt: 0, isActive: slideIndex === 0,
    isPreview: false, isPreparing: slideIndex !== 0, playbackPhase: slideIndex === 0 ? "playing" : "preparing",
    playbackScope: "slide", goTo() {}, next() {}, previous() {} });
  const first$ = runtime(0), second$ = runtime(1);
  function Renderer(props) { return <world-gpu {...props} clockState={usePlayback()} />; }
  function BackgroundClock() { return <background-clock value={usePlayback()} />; }
  const declarations = <>
    <PresentationObservableProvider value={first$}><Background><BackgroundClock /><World id="background-clock-test" background quality="high">
      <Camera shots={[{ at: 0, orbit: { center: [0, 0, 0], radius: 20, height: 4, speed: 0.045 } }]} />
    </World></Background></PresentationObservableProvider>
    <PresentationObservableProvider value={second$}><Background><BackgroundClock /><World id="background-clock-test" background quality="high" enter={{ from: "previous", duration: 1.5 }}>
      <Camera shots={[{ at: 0, position: [8, 5, 20] }, { at: 1.5, position: [0, 7, 34], duration: 6, ease: "smoothstep" }]} />
      <Sphere position={[{ step: 0, value: [0, 0, 0] }, { step: 1, value: [4, 0, 0], duration: 2 }]} />
    </World></Background></PresentationObservableProvider>
  </>;
  const content = (slideIndex, isPreview = false) => <GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={slideIndex} color="#05060a" isPreview={isPreview}>{declarations}</BackgroundHost>
  </GPUShaderProvider>;
  let renderer;
  const graph = () => renderer.root.findByType("world-gpu").props;
  const values = () => graph().frameData.value;
  const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));
  try {
    await act(() => { renderer = create(content(0)); });
    flushUI(); tick(0); tick(10000);
    const previous = values().slice(0, 3);
    expect(graph().clockState.value.slideTime).toBe(10);
    expect(previous[0]).toBeCloseTo(Math.sin(0.45) * 20);

    await act(() => {
      first$.assign({ currentSlide: 1, playbackPhase: "outgoing", isActive: false });
      second$.assign({ currentSlide: 1, currentStep: 1, stepIndex: 1, startedAt: 10000, stepStartedAt: 10000,
        isActive: true, isPreparing: false, playbackPhase: "playing" });
      renderer.update(content(1));
    });
    flushUI(); tick(10000);
    expect(graph().clockState.value.slideTime).toBe(0);
    expect(graph().clockState.value.slideKey).toBe("1:10000");
    const backgroundClock = renderer.root.findByType("background-clock").props.value.value;
    expect(backgroundClock.slideTime).toBe(10);
    expect(backgroundClock.slideKey).toBe("background");
    values().slice(0, 3).forEach((value, index) => expect(value).toBeCloseTo(previous[index]));
    expect(values()[worldHeaderSize]).toBe(0);
    tick(11000);
    expect(graph().clockState.value.slideTime).toBe(1);
    expect(values()[worldHeaderSize]).toBeCloseTo(2);
    tick(11500);
    expect(values().slice(0, 3)).toEqual([8, 5, 20]);
    tick(13350);
    expect(values()[2]).toBeGreaterThan(20);
    expect(values()[2]).toBeLessThan(34);
    tick(17800);
    expect(values().slice(0, 3)).toEqual([0, 7, 34]);

    await act(() => second$.assign({ currentStep: 0, stepIndex: 0, stepStartedAt: 17800 }));
    flushUI(); tick(17800);
    expect(values()[worldHeaderSize]).toBe(0);
    expect(graph().clockState.value.slideTime).toBeCloseTo(7.8);
    await act(() => renderer.unmount());
    await act(() => {
      second$.assign({ currentStep: 1, stepIndex: 1, stepStartedAt: 18000 });
      renderer = create(content(1, true));
    });
    flushUI();
    const preview = values();
    expect(graph().clockState.value.phase).toBe("preview");
    expect(preview[worldHeaderSize]).toBe(4);
    expect(preview[2]).toBeGreaterThan(20);
    expect(preview[2]).toBeLessThan(34);
    tick(40000);
    expect(values()).toEqual(preview);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

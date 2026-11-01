// @ts-nocheck Native boundaries are replaced by the shared deterministic UI-clock harness.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { Background, BackgroundHost, GPUShaderProvider, PresentationObservableProvider, usePresentationValue } from "@legend-apps/presentation";
import { deferPresentationAdvance } from "../../presentation/src/advanceGuard";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { Box, Camera, World } from "../packs/world/World";
import { worldHeaderSize } from "../packs/world/scene";

const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("World retains the current GPU scene during catch-up, then starts the next local build", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0,
    slideCount: 1, stepCount: 3, startedAt: 0, stepStartedAt: 0, isActive: true,
    isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide",
    direction: "forward", goTo() {}, next() {}, previous() {} });
  function Renderer(props) { return <world-gpu {...props} />; }
  function Scene({ replay = false }) {
    const step = usePresentationValue("stepIndex");
    return <World clock="step" buildDuration={2.5} replayOnBack={replay} quality="high">
      <Camera shots={[{ at: 0, position: [0, 5, 18] }]} />
      <Box position={[{ at: 0, value: [step * 4, 0, 0] }, { at: 0.5, value: [(step + 1) * 4, 0, 0], duration: 2 }]} />
    </World>;
  }
  const content = (replay = false) => <GPUShaderProvider renderer={Renderer}>
    <PresentationObservableProvider value={runtime$}><Scene replay={replay} /></PresentationObservableProvider>
  </GPUShaderProvider>;
  let renderer, advances = 0;
  const position = () => renderer.root.findByType("world-gpu").props.frameData.value[worldHeaderSize];
  const next = () => deferPresentationAdvance(() => {
    advances++;
    const step = runtime$.stepIndex.peek() + 1;
    runtime$.assign({ currentStep: step, stepIndex: step, stepStartedAt: advances, direction: "forward" });
  }, () => true);
  try {
    await act(() => { renderer = create(content()); });
    flushUI(); tick(0); tick(250);
    expect(position()).toBe(0);
    expect(next()).toBe(true); flushUI();
    tick(400);
    expect(advances).toBe(0);
    expect(position()).toBeGreaterThan(0);
    expect(position()).toBeLessThan(4);
    tick(550);
    expect(position()).toBe(4);
    await act(flush); flushUI(); tick(600);
    expect(advances).toBe(1);
    expect(position()).toBe(4);
    // A completed catch-up from the previous identity cannot finish this request.
    next(); flushUI(); await act(flush);
    expect(advances).toBe(1);
    tick(750); await act(flush);
    expect(advances).toBe(1);
    tick(901); await act(flush); flushUI(); tick(950);
    expect(advances).toBe(2);
    expect(position()).toBe(8);
    await act(() => runtime$.assign({ currentStep: 0, stepIndex: 0, stepStartedAt: 5, direction: "backward" }));
    flushUI(); tick(1000);
    expect(position()).toBe(4);
    await act(() => renderer.update(content(true)));
    expect(position()).toBe(0);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});


test("background Worlds keep global time opt-in and restart local clocks with shared-id camera continuity", async () => {
  for (const mode of ["global", "slide", "step"]) {
    const runtime = slideIndex => observable({ currentSlide: 0, currentStep: 0, slideIndex, stepIndex: 0,
      slideCount: 2, stepCount: 1, startedAt: 0, stepStartedAt: 0, isActive: slideIndex === 0,
      isPreview: false, isPreparing: slideIndex !== 0, playbackPhase: slideIndex === 0 ? "playing" : "preparing",
      playbackScope: "slide", direction: "forward", goTo() {}, next() {}, previous() {} });
    const first$ = runtime(0), second$ = runtime(1);
    function Renderer(props) { return <world-gpu {...props} />; }
    const declarations = [first$, second$].map((runtime$, index) =>
      <PresentationObservableProvider key={index} value={runtime$}><Background>
        <World id={`mode-${mode}`} background clock={mode} quality="high" enter={index ? { from: "previous", duration: 1 } : undefined}>
          <Camera shots={[{ at: 0, position: index ? [10, 5, 20] : [0, 5, 18] }]} />
          <Box id="carry" position={[{ at: 0, value: [0, 0, 0] }, { at: 1, value: [10, 0, 0], duration: 1 }]} />
        </World>
      </Background></PresentationObservableProvider>);
    const content = slideIndex => <GPUShaderProvider renderer={Renderer}>
      <BackgroundHost slideIndex={slideIndex} color="#05060a">{declarations}</BackgroundHost>
    </GPUShaderProvider>;
    let renderer;
    const values = () => renderer.root.findByType("world-gpu").props.frameData.value;
    try {
      await act(() => { renderer = create(content(0)); });
      flushUI(); tick(0); tick(3000);
      expect(values()[worldHeaderSize]).toBe(10);
      const camera = Array.from(values().slice(0, 3));
      await act(() => {
        first$.assign({ currentSlide: 1, isActive: false, playbackPhase: "outgoing" });
        second$.assign({ currentSlide: 1, isActive: true, isPreparing: false, playbackPhase: "playing", startedAt: 3000, stepStartedAt: 3000 });
        renderer.update(content(1));
      });
      flushUI(); tick(3000);
      expect(values()[worldHeaderSize]).toBe(mode === "global" ? 10 : 0);
      if (mode !== "global") expect(Array.from(values().slice(0, 3))).toEqual(camera);
    } finally { await act(() => renderer?.unmount()); flushUI(); }
  }
});

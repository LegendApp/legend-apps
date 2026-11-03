// @ts-nocheck Exercise background retention and actual UI-clock uniforms without a GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { BackgroundHost, GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { Card, WorldSlide } from "../packs/world/World";
import { worldHeaderSize } from "../packs/world/scene";

test("per-slide components retain one World, including reverse travel, independent previews and a world reset", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime = slideIndex => observable({ currentSlide: 0, currentStep: 0, slideIndex, stepIndex: 0,
    slideCount: 2, stepCount: 2, startedAt: 0, stepStartedAt: 0, isActive: slideIndex === 0,
    isPreview: false, isPreparing: slideIndex !== 0, playbackPhase: slideIndex === 0 ? "playing" : "preparing",
    playbackScope: "slide", direction: "forward", goTo() {}, next() {}, previous() {} });
  const first$ = runtime(0), second$ = runtime(1);
  let mounts = 0;
  function Renderer(props) { useEffect(() => { mounts++; }, []); return <world-gpu {...props} />; }
  function Panels({ world }) { return <WorldSlide world={world} track={{ duration: 2 }} quality="high">
    <Card id="sample" title="const a = 24" avatar={0} position={[-3, 1, 0]} scale={[4, 1.5, 0.2]} />
  </WorldSlide>; }
  function Columns({ world }) { return <WorldSlide world={world} track={{ duration: 2 }} quality="high">
    <Card id="sample" title="const a = 24" avatar={0} titleOpacity={0} position={[3, -1, 0]} scale={[1, 5, 1]} />
  </WorldSlide>; }
  const content = (index, preview = false, world = "track-test") => <GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={index} isPreview={preview} color="#05060a">
      <PresentationObservableProvider value={first$}><Panels world={world} /></PresentationObservableProvider>
      <PresentationObservableProvider value={second$}><Columns world={world} /></PresentationObservableProvider>
    </BackgroundHost>
  </GPUShaderProvider>;
  let renderer, preview;
  const values = target => target.root.findByType("world-gpu").props.frameData.value;
  const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));
  try {
    await act(() => { renderer = create(content(0)); });
    flushUI(); tick(0); tick(3000);
    const start = Array.from(values(renderer));
    expect(start[worldHeaderSize]).toBe(-3);
    expect(start[2]).toBeCloseTo(17.64);
    await act(() => {
      first$.assign({ currentSlide: 1, isActive: false, playbackPhase: "outgoing" });
      second$.assign({ currentSlide: 1, isActive: true, isPreparing: false, playbackPhase: "playing", startedAt: 3000, stepStartedAt: 3000 });
      renderer.update(content(1));
    });
    flushUI(); tick(3000);
    expect(mounts).toBe(1);
    expect(Array.from(values(renderer).slice(0, 8))).toEqual(start.slice(0, 8));
    expect(values(renderer)[worldHeaderSize]).toBe(-3);
    tick(4000);
    expect(values(renderer)[worldHeaderSize]).toBeCloseTo(0);
    expect(values(renderer)[worldHeaderSize + 9]).toBeCloseTo(3.25);
    const halfway = Array.from(values(renderer));
    await act(() => { preview = create(content(0, true)); });
    flushUI();
    const still = Array.from(values(preview));
    expect(still[worldHeaderSize]).toBe(-3);
    expect(still[2]).toBe(18);
    expect(Array.from(values(renderer))).toEqual(halfway);
    await act(() => {
      second$.assign({ currentSlide: 0, isActive: false, playbackPhase: "outgoing" });
      first$.assign({ currentSlide: 0, isActive: true, playbackPhase: "playing", startedAt: 4000, stepStartedAt: 4000, direction: "backward" });
      renderer.update(content(0));
    });
    flushUI(); tick(4000);
    expect(Array.from(values(renderer).slice(0, 8))).toEqual(halfway.slice(0, 8));
    tick(5000);
    expect(values(renderer)[2]).toBeLessThan(halfway[2]);
    expect(values(renderer)[worldHeaderSize]).toBeCloseTo(-1.5);
    expect(Array.from(values(preview))).toEqual(still);
    expect(mounts).toBe(2);
    await act(() => renderer.update(content(0, false, "new-journey")));
    flushUI();
    expect(values(renderer)[2]).toBeCloseTo(18 - 0.12);
    expect(values(renderer)[worldHeaderSize]).toBe(-3);
  } finally {
    await act(() => { renderer?.unmount(); preview?.unmount(); });
    flushUI();
  }
});

test("a cold slide's background registration retains the World; a slide without one clears it", async () => {
  const runtime = index => observable({ currentSlide: index, currentStep: 0, slideIndex: index, stepIndex: 0,
    slideCount: 5, stepCount: 1, startedAt: index * 1000, stepStartedAt: index * 1000,
    isActive: true, isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide",
    direction: "backward", goTo() {}, next() {}, previous() {} });
  const first$ = runtime(4), next$ = runtime(0);
  let mounts = 0;
  function Renderer(props) { useEffect(() => { mounts++; }, []); return <world-gpu {...props} />; }
  const content = (index, runtime$, hasWorld = true) => <GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={index} color="#05060a">
      <PresentationObservableProvider key={index} value={runtime$}>{hasWorld &&
        <WorldSlide world="cold-jump" track={{ duration: 2 }} quality="high">
          <Card id="sample" title="A" position={[index, 0, 0]} />
        </WorldSlide>}
      </PresentationObservableProvider>
    </BackgroundHost>
  </GPUShaderProvider>;
  let renderer;
  const values = () => renderer.root.findByType("world-gpu").props.frameData.value;
  const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));
  try {
    await act(() => { renderer = create(content(4, first$)); });
    flushUI(); tick(0); tick(3000);
    const before = Array.from(values());
    await act(() => renderer.update(content(0, next$)));
    flushUI(); tick(3000);
    expect(mounts).toBe(1);
    expect(Array.from(values().slice(0, 8))).toEqual(before.slice(0, 8));
    expect(values()[worldHeaderSize]).toBe(4);
    tick(4000);
    expect(values()[2]).toBeLessThan(before[2]);
    expect(values()[worldHeaderSize]).toBeCloseTo(2);
    await act(() => renderer.update(content(1, runtime(1), false)));
    flushUI();
    expect(renderer.root.findAllByType("world-gpu")).toHaveLength(0);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

// @ts-nocheck Exercise the retained background surface and real playback clocks without a GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import { BackgroundHost, DeckContentContext, GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import React from "react";
import { act, create } from "react-test-renderer";
import { Scene } from "../packs/world/Authoring";
import { Box, Sphere, Tube, WorldSlide } from "../packs/world/World";

test("authored slides retain one GPU graph across different geometry, steps and reverse navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime = index => observable({ currentSlide: 0, currentStep: 0, slideIndex: index, stepIndex: 0,
    slideCount: 2, stepCount: 2, startedAt: 0, stepStartedAt: 0, isActive: index === 0,
    isPreview: false, isPreparing: index !== 0, playbackPhase: index ? "preparing" : "playing", playbackScope: "slide" });
  const first$ = runtime(0), second$ = runtime(1);
  const declarations = [<Scene id="one" world="planned"><Box id="box" position={[0, 2, 0]} /></Scene>,
    <Scene id="two" world="planned"><Sphere id="orb" position={[1, 3, 0]} /></Scene>];
  function Renderer(props) { return <gpu {...props} />; }
  const content = index => <DeckContentContext.Provider value={[...declarations]}><GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={index} color="#05060a">
      <PresentationObservableProvider value={first$}>{declarations[0]}</PresentationObservableProvider>
      <PresentationObservableProvider value={second$}>{declarations[1]}</PresentationObservableProvider>
    </BackgroundHost>
  </GPUShaderProvider></DeckContentContext.Provider>;
  let renderer;
  const graph = () => renderer.root.findByType("gpu").props.renderGraph;
  const tick = time => { flushUI(); frames.forEach(frame => frame.tick(time)); };
  try {
    await act(() => { renderer = create(content(0)); }); tick(0); tick(3000);
    const initial = graph();
    declarations.forEach((node, i) => { declarations[i] = React.cloneElement(node); });
    await act(() => { renderer.update(content(0)); }); tick(3000);
    expect(graph()).toBe(initial);
    await act(() => {
      first$.assign({ currentSlide: 1, playbackPhase: "outgoing", isActive: false });
      second$.assign({ currentSlide: 1, isActive: true, isPreparing: false, playbackPhase: "playing", startedAt: 3000, stepStartedAt: 3000 });
      renderer.update(content(1));
    }); tick(3000); tick(6000);
    expect(graph()).toBe(initial);
    await act(() => { second$.assign({ stepIndex: 1, currentStep: 1, stepStartedAt: 6000 }); }); tick(6000);
    expect(graph()).toBe(initial);
    await act(() => {
      second$.assign({ currentSlide: 0, playbackPhase: "outgoing", isActive: false });
      first$.assign({ currentSlide: 0, playbackPhase: "playing", isActive: true, startedAt: 7000, stepStartedAt: 7000, direction: "backward" });
      renderer.update(content(0));
    }); tick(7000); tick(10000);
    expect(graph()).toBe(initial);
    expect(renderer.root.findByType("gpu").props.frameData.value.some(value => !Number.isFinite(value))).toBe(false);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

test("entering a plan from a raw World retains its outgoing geometry before joining the pool", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0, slideCount: 3, stepCount: 1,
    startedAt: 0, stepStartedAt: 0, isActive: true, isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide" });
  const declarations = [<WorldSlide world="mixed" track={{}}><Tube id="raw" position={[0,2,0]} end={[1,2,0]} /></WorldSlide>,
    <Scene id="one" world="mixed"><Box id="box" /></Scene>, <Scene id="two" world="mixed"><Sphere id="orb" /></Scene>];
  function Renderer(props) { return <gpu {...props} />; }
  const content = index => <DeckContentContext.Provider value={declarations}><GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={index} color="#05060a"><PresentationObservableProvider value={runtime$}>
      {declarations[index]}
    </PresentationObservableProvider></BackgroundHost>
  </GPUShaderProvider></DeckContentContext.Provider>;
  let renderer;
  const tick = time => { flushUI(); frames.forEach(frame => frame.tick(time)); };
  const graph = () => renderer.root.findByType("gpu").props;
  try {
    await act(() => { renderer = create(content(0)); }); tick(0); tick(3000);
    for (const index of [1,2]) {
      await act(() => { runtime$.assign({ currentSlide: index, slideIndex: index, startedAt: index * 3000, stepStartedAt: index * 3000 }); renderer.update(content(index)); });
      tick(index * 3000); tick(index * 3000 + 2000);
      expect(graph().renderGraph.passes.some(pass => pass.id === "scene-tube")).toBe(index === 1);
      if (index === 1) {
        const tube = graph().renderGraph.passes.find(pass => pass.id === "scene-tube");
        expect(tube.instanceCount).toBe(1);
        expect(graph().frameData.value.length).toBeGreaterThan(128);
      }
    }
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

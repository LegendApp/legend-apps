// @ts-nocheck Exercise background retention and actual UI-clock uniforms without a GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { BackgroundHost, GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { Box, Card, Sphere, Tube, World, WorldSlide, prepareWorldSlides } from "../packs/world/World";
import { worldHeaderSize, worldInstanceSize } from "../packs/world/scene";

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
    expect(start[2]).toBeCloseTo(14);
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
    expect(still[2]).toBe(14);
    expect(Array.from(values(renderer))).toEqual(halfway);
    await act(() => {
      second$.assign({ currentSlide: 0, isActive: false, playbackPhase: "outgoing" });
      first$.assign({ currentSlide: 0, isActive: true, playbackPhase: "playing", startedAt: 4000, stepStartedAt: 4000, direction: "backward" });
      renderer.update(content(0));
    });
    flushUI(); tick(4000);
    expect(Array.from(values(renderer).slice(0, 8))).toEqual(halfway.slice(0, 8));
    tick(5000);
    expect(values(renderer)[2]).toBeGreaterThan(halfway[2]);
    expect(values(renderer)[worldHeaderSize]).toBeCloseTo(-1.5);
    expect(Array.from(values(preview))).toEqual(still);
    expect(mounts).toBe(2);
    await act(() => renderer.update(content(0, false, "new-journey")));
    flushUI();
    expect(values(renderer)[2]).toBeCloseTo(14);
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
    // A jump across several stations flies the whole way in 1.5 s.
    tick(3750);
    expect(values()[2]).toBeGreaterThan(before[2]);
    expect(values()[worldHeaderSize]).toBeCloseTo(2);
    tick(4500);
    expect(values()[worldHeaderSize]).toBe(0);
    await act(() => renderer.update(content(1, runtime(1), false)));
    flushUI();
    expect(renderer.root.findAllByType("world-gpu")).toHaveLength(0);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

test("omitted geometry fades through departure, retires at focus, and is restored on reverse", async () => {
  const runtime = index => observable({ currentSlide: index, currentStep: 0, slideIndex: index, stepIndex: 0,
    slideCount: 3, stepCount: 1, startedAt: 0, stepStartedAt: 0, isActive: true,
    isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide",
    direction: "forward", goTo() {}, next() {}, previous() {} });
  const runtime$ = runtime(0);
  let mounts = 0;
  function Renderer(props) { useEffect(() => { mounts++; }, []); return <world-gpu {...props} />; }
  const content = index => <GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={index} color="#05060a">
      <PresentationObservableProvider value={runtime$}>
        <WorldSlide world="retired-test" track={{ duration: 2 }} quality="high">
          {index === 0 && <Box id="marker" position={[-5, 0, 0]} />}
        </WorldSlide>
      </PresentationObservableProvider>
    </BackgroundHost>
  </GPUShaderProvider>;
  let renderer;
  const values = () => Array.from(renderer.root.findByType("world-gpu").props.frameData.value);
  const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));
  const go = async (index, timestamp) => {
    await act(() => {
      runtime$.assign({ currentSlide: index, slideIndex: index, startedAt: timestamp, stepStartedAt: timestamp });
      renderer.update(content(index));
    });
    flushUI(); tick(timestamp);
  };
  try {
    await act(() => { renderer = create(content(0)); });
    flushUI(); tick(0);
    const initial = values().slice(worldHeaderSize);
    await go(1, 1000);
    tick(1500);
    expect(values().slice(worldHeaderSize, worldHeaderSize + 23)).toEqual(initial.slice(0, 23));
    expect(values()[worldHeaderSize + 23]).toBeGreaterThan(0);
    expect(values()[worldHeaderSize + 23]).toBeLessThan(1);
    tick(3000);
    expect(values()[worldHeaderSize + 23]).toBe(0);
    await go(2, 3000); tick(5000);
    expect(values().slice(worldHeaderSize)).toEqual([]);
    await go(0, 5000); tick(9000);
    expect(values().slice(worldHeaderSize)).toEqual(initial);
    expect(mounts).toBe(3);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

test("an incoming declaration rendered twice retains the outgoing slide until the next slide", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0, slideCount: 3, stepCount: 1,
    startedAt: 0, stepStartedAt: 0, isActive: true, isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide" });
  function Renderer(props) { return <gpu {...props} />; }
  const content = index => <GPUShaderProvider renderer={Renderer}><PresentationObservableProvider value={runtime$}>
    <World id="retention" track={{ duration: 2 }}>
      {index === 0 ? <Tube id="old" position={[0, 2, 0]} end={[1, 2, 0]} /> : index === 1 ? <Sphere id="incoming" /> : <Box id="next" />}
    </World>
  </PresentationObservableProvider></GPUShaderProvider>;
  let renderer;
  const tick = time => { flushUI(); frames.forEach(frame => frame.tick(time)); };
  const hasTube = () => renderer.root.findByType("gpu").props.renderGraph.passes.some(pass => pass.id === "scene-tube");
  try {
    await act(() => { renderer = create(content(0)); }); tick(0); tick(3000);
    await act(() => {
      runtime$.assign({ currentSlide: 1, slideIndex: 1, startedAt: 3000, stepStartedAt: 3000 });
      renderer.update(content(1));
    }); tick(3000);
    expect(hasTube()).toBe(true);
    await act(() => renderer.update(content(1))); tick(3100);
    expect(hasTube()).toBe(true);
    tick(5900);
    await act(() => {
      runtime$.assign({ currentSlide: 2, slideIndex: 2, startedAt: 6000, stepStartedAt: 6000 });
      renderer.update(content(2));
    }); tick(6000);
    expect(hasTube()).toBe(false);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

test.each([true, false])("rapid navigation retains long geometry until focus (first slide rendered: %s)", async firstFrame => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0, slideCount: 6, stepCount: 1,
    startedAt: 0, stepStartedAt: 0, isActive: true, isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide" });
  function Renderer(props) { return <gpu {...props} />; }
  const content = index => <GPUShaderProvider renderer={Renderer}><PresentationObservableProvider value={runtime$}>
    <World id="rapid-retention" track={{ duration: 2 }}>
      {index === 0 ? <Tube id="long" position={[0, 2, 0]} end={[0, 2, -96]} /> : index === 1 ? <Sphere id="incoming" /> : <Box id={`next${index}`} />}
    </World>
  </PresentationObservableProvider></GPUShaderProvider>;
  let renderer;
  const tick = time => { flushUI(); frames.forEach(frame => frame.tick(time)); };
  const hasTube = () => renderer.root.findByType("gpu").props.renderGraph.passes.some(pass => pass.id === "scene-tube");
  const go = async (index, time, render = true) => {
    await act(() => { runtime$.assign({ currentSlide: index, slideIndex: index, startedAt: time, stepStartedAt: time }); renderer.update(content(index)); });
    if (render) tick(time);
  };
  try {
    await act(() => { renderer = create(content(0)); }); tick(0); tick(3000);
    await go(1, 3000, firstFrame);
    if (firstFrame) tick(3100);
    await go(2, 3100); tick(3200);
    expect(hasTube()).toBe(true);
    tick(8000);
    await go(3, 8000); tick(11000);
    expect(hasTube()).toBe(false);
    await go(4, 11000); tick(14000);
    await go(5, 14000); tick(17000);
    expect(hasTube()).toBe(false);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

test("pooled rapid navigation rebakes overflow without losing live declarations", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0, slideCount: 3, stepCount: 1,
    startedAt: 0, stepStartedAt: 0, isActive: true, isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide" });
  const slides = prepareWorldSlides([0, 1, 2].map(index => ({ id: "overflow", track: { duration: 2 },
    children: <Box id={`part${index}`} position={[index + 1, 2, -100]} /> })));
  function Renderer(props) { return <gpu {...props} />; }
  const content = index => <GPUShaderProvider renderer={Renderer}><PresentationObservableProvider value={runtime$}>
    <World {...slides[index]} />
  </PresentationObservableProvider></GPUShaderProvider>;
  let renderer;
  const tick = time => { flushUI(); frames.forEach(frame => frame.tick(time)); };
  try {
    await act(() => { renderer = create(content(0)); }); tick(0); tick(3000);
    for (const [index, time] of [[1, 3000], [2, 3100]]) {
      await act(() => { runtime$.assign({ currentSlide: index, slideIndex: index, startedAt: time, stepStartedAt: time }); renderer.update(content(index)); });
      tick(time); tick(time + 50);
    }
    await act(() => renderer.update(content(2))); tick(3200);
    const values = renderer.root.findByType("gpu").props.frameData.value;
    const xs = [];
    for (let at = worldHeaderSize; at < values.length; at += worldInstanceSize) xs.push(values[at]);
    expect(xs.sort()).toEqual([1, 2, 3]);
    expect(values[worldHeaderSize + 2 * worldInstanceSize + 23]).toBeGreaterThan(0);
    expect(values[worldHeaderSize + 2 * worldInstanceSize + 23]).toBeLessThan(1);
    tick(6000);
    const settled = renderer.root.findByType("gpu").props.frameData.value;
    const opacities = [];
    for (let at = worldHeaderSize; at < settled.length; at += worldInstanceSize) if (settled[at] === 3) opacities.push(settled[at + 23]);
    expect(opacities).toEqual([1]);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

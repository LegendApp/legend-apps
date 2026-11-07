// @ts-nocheck Exercise the retained background surface and real playback clocks without a GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, spyOn, test } from "bun:test";
import { observable } from "@legendapp/state";
import { BackgroundHost, DeckContentContext, GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import React from "react";
import { act, create } from "react-test-renderer";
import * as Reanimated from "react-native-reanimated";
import { Scene } from "../packs/world/Authoring";
import { worldHeaderSize } from "../packs/world/scene";
import { Box, Effect, haze, Orbs, PointLight, prepareWorldSlides, Sphere, Tube, WorldSlide } from "../packs/world/World";

test.each([false, true])("authored slides retain one GPU graph across geometry, steps and reverse (effects: %s)", async effects => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const mutables = spyOn(Reanimated, "makeMutable");
  const outputs = () => mutables.mock.calls.filter(([value]) => value instanceof Float32Array).length;
  const runtime = index => observable({ currentSlide: 0, currentStep: 0, slideIndex: index, stepIndex: 0,
    slideCount: 2, stepCount: 2, startedAt: 0, stepStartedAt: 0, isActive: index === 0,
    isPreview: false, isPreparing: index !== 0, playbackPhase: index ? "preparing" : "playing", playbackScope: "slide" });
  const first$ = runtime(0), second$ = runtime(1);
  const declarations = [<Scene id="one" world={`planned-${effects}`}><Box id="box" position={[0, 2, 0]} />{effects && <Effect use={haze({ amount: { 0: .2, 1: .8 } })} />}</Scene>,
    <Scene id="two" world={`planned-${effects}`}><Sphere id="orb" position={[1, 3, 0]} />{effects && <Effect use={haze({ amount: { 0: .4, 1: .9 } })} />}</Scene>];
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
    const plan = renderer.root.findAllByType(WorldSlide)[0].props.scenePlan;
    declarations.forEach((node, i) => { declarations[i] = React.cloneElement(node, {}, node.props.children.map(child => React.isValidElement(child) ? React.cloneElement(child) : child)); });
    await act(() => { renderer.update(content(0)); }); tick(3000);
    expect(renderer.root.findAllByType(WorldSlide)[0].props.scenePlan).toBe(plan);
    expect(graph()).toBe(initial);
    await act(() => {
      first$.assign({ currentSlide: 1, playbackPhase: "outgoing", isActive: false });
      second$.assign({ currentSlide: 1, isActive: true, isPreparing: false, playbackPhase: "playing", startedAt: 3000, stepStartedAt: 3000 });
      renderer.update(content(1));
    }); tick(3000); tick(6000);
    expect(graph()).toBe(initial);
    expect(outputs()).toBe(1);
    if (effects) expect(renderer.root.findByType("gpu").props.frameData.value[plan.pool.topology.effects[0].base]).toBeCloseTo(.4, 5);
    await act(() => { second$.assign({ stepIndex: 1, currentStep: 1, stepStartedAt: 6000 }); }); tick(6000); tick(6017); tick(7000);
    expect(graph()).toBe(initial);
    if (effects) expect(renderer.root.findByType("gpu").props.frameData.value[plan.pool.topology.effects[0].base]).toBeCloseTo(.9, 5);
    await act(() => {
      second$.assign({ currentSlide: 0, playbackPhase: "outgoing", isActive: false });
      first$.assign({ currentSlide: 0, playbackPhase: "playing", isActive: true, startedAt: 7000, stepStartedAt: 7000, direction: "backward" });
      renderer.update(content(0));
    }); tick(7000); tick(10000);
    expect(graph()).toBe(initial);
    expect(renderer.root.findByType("gpu").props.frameData.value.some(value => !Number.isFinite(value))).toBe(false);
    if (effects) expect(renderer.root.findByType("gpu").props.frameData.value[plan.pool.topology.effects[0].base]).toBeCloseTo(.2, 5);
  } finally { await act(() => renderer?.unmount()); flushUI(); mutables.mockRestore(); }
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

test("equivalent scene plans still invalidate for changed geometry, appearance and camera", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ stepIndex: 0, isPreview: true });
  let declaration = <Scene id="one" world="edits"><Box id="part" /></Scene>;
  const content = () => <DeckContentContext.Provider value={[declaration]}>
    <PresentationObservableProvider value={runtime$}>{declaration}</PresentationObservableProvider>
  </DeckContentContext.Provider>;
  let renderer;
  const plan = () => renderer.root.findByType(WorldSlide).props.scenePlan;
  try {
    await act(() => { renderer = create(content()); });
    for (const update of [
      node => React.cloneElement(node, {}, <Sphere id="part" />),
      node => React.cloneElement(node, { exposure: 2 }),
      node => React.cloneElement(node, { camera: { position: [2, 3, 14] } }),
    ]) {
      const previous = plan();
      declaration = update(declaration);
      await act(() => renderer.update(content()));
      expect(plan()).not.toBe(previous);
    }
    expect(plan().content.prepared.instances[0].kind).toBe("sphere");
    expect(renderer.root.findByType(WorldSlide).props.track.position).toEqual([2, 3, 14]);
  } finally { await act(() => renderer?.unmount()); }
});

test("planned surfaces reuse one immutable UI scene while keeping sampled outputs separate", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const mutables = spyOn(Reanimated, "makeMutable");
  const declarations = [<Scene id="one" world="copies"><Box id="part" position={[
    { at: 0, value: [0, 0, 0], duration: 0 }, { at: 0, value: [2, 0, 0], duration: 2, ease: "linear" },
  ]} /></Scene>];
  function Renderer(props) { return <gpu {...props} />; }
  const content = preview => <DeckContentContext.Provider value={declarations}><GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={0} color="#05060a" isPreview={preview}>
      <PresentationObservableProvider value={observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0,
        slideCount: 1, stepCount: 1, startedAt: 0, stepStartedAt: 0, isActive: !preview,
        isPreview: preview, isPreparing: false, playbackPhase: preview ? "preview" : "playing", playbackScope: "slide" })}>
        {declarations[0]}
      </PresentationObservableProvider>
    </BackgroundHost>
  </GPUShaderProvider></DeckContentContext.Provider>;
  let live, preview;
  try {
    await act(() => { live = create(content(false)); preview = create(content(true)); });
    flushUI(); frames.forEach(frame => frame.tick(0)); frames.forEach(frame => frame.tick(1000));
    expect(mutables.mock.calls.filter(([value]) => value?.instances).length).toBe(1);
    const values = live.root.findByType("gpu").props.frameData.value, before = Array.from(values);
    const still = preview.root.findByType("gpu").props.frameData.value;
    expect(still).not.toBe(values);
    expect(still[worldHeaderSize]).not.toBe(values[worldHeaderSize]);
    expect(Array.from(values)).toEqual(before);
  } finally { await act(() => { live?.unmount(); preview?.unmount(); }); flushUI(); mutables.mockRestore(); }
});


test("dev prop tracing does not expand the prepared uniform buffers during navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime = index => observable({ currentSlide: 0, currentStep: 0, slideIndex: index, stepIndex: 0,
    startedAt: 0, stepStartedAt: 0, isActive: index === 0, isPreview: false,
    isPreparing: index !== 0, playbackPhase: index ? "preparing" : "playing", playbackScope: "slide" });
  const first$ = runtime(0), second$ = runtime(1);
  const declarations = [<Scene id="one" world="dev-trace"><Orbs count={512} /></Scene>,
    <Scene id="two" world="dev-trace"><Orbs count={600} /></Scene>];
  function Renderer(props) { return <gpu {...props} />; }
  const content = index => <DeckContentContext.Provider value={declarations}><GPUShaderProvider renderer={Renderer}>
    <BackgroundHost slideIndex={index} color="#000">
      <PresentationObservableProvider value={first$}>{declarations[0]}</PresentationObservableProvider>
      <PresentationObservableProvider value={second$}>{declarations[1]}</PresentationObservableProvider>
    </BackgroundHost>
  </GPUShaderProvider></DeckContentContext.Provider>;
  const measure = performance.measure.bind(performance), rows = [];
  const trace = spyOn(performance, "measure").mockImplementation((name, options) => {
    if (name.endsWith("WorldSceneRuntime")) rows.push(options.detail.devtools.properties.length);
    return measure(name, options);
  });
  let renderer;
  try {
    await act(() => { renderer = create(content(0)); }); flushUI();
    await act(() => {
      first$.assign({ currentSlide: 1, isActive: false, playbackPhase: "outgoing" });
      second$.assign({ currentSlide: 1, isActive: true, isPreparing: false, playbackPhase: "playing", startedAt: 1, stepStartedAt: 1 });
      renderer.update(content(1));
    }); flushUI();
    expect(rows.length).toBeGreaterThan(0);
    expect(Math.max(...rows)).toBeLessThan(10000);
    expect(renderer.root.findByType("gpu").props.frameData.value.every(Number.isFinite)).toBe(true);
  } finally { await act(() => renderer?.unmount()); flushUI(); trace.mockRestore(); }
});

test("scene plans share GPU capacity when point lights appear or disappear", () => {
  const plans = prepareWorldSlides([0, 1, 4].map(count => ({ quality: "high", track: { duration: 1 },
    children: <><Sphere />{Array.from({ length: count }, (_, index) => <PointLight key={index} />)}</>,
  })));
  expect(plans[0].scenePlan.pool).toBeDefined();
  for (const plan of plans) expect(plan.scenePlan.pool).toBe(plans[0].scenePlan.pool);
});

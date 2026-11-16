// @ts-nocheck Native input delivery and UI scheduling are deterministic; navigation and Journey are real.
import "./nativeMock";
import { frames, flushUI } from "./uiClockMock";
import { expect, test } from "bun:test";
import React from "react";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { act, create } from "react-test-renderer";
import { BackgroundHost, DeckContentContext, GPUShaderProvider, PresentationObservableProvider, useRuntimeProjection } from "@legend-apps/presentation";
import { Box, Camera, Journey, JourneyStop } from "../../../../packages/slides-effects/packs/journey/Journey";
import { useValue } from "@legendapp/state/react";
import { journeyHeaderSize } from "../../../../packages/slides-effects/packs/journey/scene";
import { getSlidesState, nextSlide, previousSlide, setSlidesState, slidesState$ } from "../slidesStore";

const { buildSync } = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url))("esbuild");
let keyDown;
const keyboard = {
  addKeyboardListener: async (type, listener) => {
    if (type === "down") keyDown = listener;
    return { remove: async () => {} };
  },
  createKeyboardConsumption: async () => ({ update: async () => {}, remove: async () => {} }),
};
const { outputFiles } = buildSync({
  entryPoints: [fileURLToPath(import.meta.resolve("../../../../node_modules/@legendapp/spark/vendor/node_modules/@legendapp/spark-commands/src/router.ts"))],
  bundle: true, write: false, format: "cjs", platform: "node",
  external: ["react-native", "@legendapp/spark-desktop-shortcuts/src/keyboard-manager"],
});
const module = { exports: {} };
Function("require", "module", "exports", outputFiles[0].text)(
  id => {
    if (id === "react-native") return { Platform: { OS: "macos" } };
    if (id === "@legendapp/spark-desktop-shortcuts/src/keyboard-manager") return keyboard;
    throw new Error(`Unexpected router dependency: ${id}`);
  }, module, module.exports);
const { createHotkeyRouter } = module.exports;
const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));

test("Right publishes navigation synchronously and Journey moves on the next UI frame", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const router = createHotkeyRouter();
  const registration = await router.register({
    definitions: [{ id: "next", title: "Next Slide", defaultBindings: ["Right"], repeat: true }],
    handlers: { next: nextSlide }, scope: { kind: "window", windowId: "slides-presenter" },
  });
  function Renderer(props) { return <gpu {...props} />; }
  function Surface() {
    const runtime$ = useRuntimeProjection(() => ({
      currentSlide: slidesState$.currentSlide.get(), currentStep: slidesState$.currentStep.get(),
      slideIndex: slidesState$.currentSlide.get(), stepIndex: slidesState$.currentStep.get(),
      startedAt: slidesState$.slideStartedAt.get(), stepStartedAt: slidesState$.stepStartedAt.get(),
      direction: slidesState$.direction.get(), isActive: true, isPreview: false, playbackPhase: "playing",
    }), []);
    return <PresentationObservableProvider value={runtime$}>
      <Journey buildDuration={10} clock="step" quality="high" track={{ duration: 1 }}>
        <Camera shots={[{ at: 0, position: [0, 4, 18] }]} />
        <Box id="part" position={{ 0: [0, 0, 0], 1: [4, 0, 0] }} />
      </Journey>
    </PresentationObservableProvider>;
  }
  let tree;
  const press = () => keyDown({ key: "\uf703", keyCode: 124, modifiers: 0, repeated: false,
    windowId: "slides-presenter", consumed: true, captured: false });
  const values = () => Array.from(tree.root.findByType("gpu").props.frameData.value);
  try {
    setSlidesState({ currentSlide: 0, currentStep: 0, slides: [
      { metadata: { steps: 2 }, notes: "" }, { metadata: { steps: 2 }, notes: "" },
    ] });
    await act(() => { tree = create(<GPUShaderProvider renderer={Renderer}><Surface /></GPUShaderProvider>); });
    flushUI(); tick(0); tick(100);
    let latency;
    await act(() => {
      const start = performance.now();
      expect(press()).toBe(true);
      latency = performance.now() - start;
      expect(getSlidesState().currentStep).toBe(1);
    });
    expect(latency).toBeLessThan(16.7);
    flushUI(); tick(101); // The navigation frame establishes time zero.
    const start = values();
    tick(101 + 1000 / 60);
    expect(values()[journeyHeaderSize]).toBeGreaterThan(start[journeyHeaderSize]);
    await act(() => { press(); expect(getSlidesState().currentSlide).toBe(1); });
    flushUI(); tick(200);
    const camera = values().slice(0, 3);
    tick(200 + 1000 / 60);
    expect(values().slice(0, 3)).not.toEqual(camera);
    await act(() => { previousSlide(); press(); expect(getSlidesState().currentSlide).toBe(1); });
    console.info(JSON.stringify({ keyToStateMs: latency, firstMotionFrames: 1 }));
  } finally {
    await act(() => tree?.unmount()); flushUI();
    await registration.remove(); setSlidesState(initial);
  }
});

test.each([false, true])("retained scene changes establish time zero then move the camera on the next frame (cold: %s)", async cold => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState(), router = createHotkeyRouter();
  const registration = await router.register({
    definitions: [{ id: "next", title: "Next Slide", defaultBindings: ["Right"], repeat: true }],
    handlers: { next: nextSlide }, scope: { kind: "window", windowId: "slides-presenter" },
  });
  const declarations = [0, 1].map(index => <JourneyStop journey="latency-scenes" quality="high"
    track={{ duration: 1.2, ease: "inOut", steps: { 1: { shift: [2, 0, 0], duration: 1 } } }}>
    <Box id="part" position={[index, 0, 0]} />
  </JourneyStop>);
  function Renderer(props) { return <gpu {...props} />; }
  function Slide({ index }) {
    const runtime$ = useRuntimeProjection(() => {
      const active = slidesState$.currentSlide.get() === index;
      return {
        currentSlide: slidesState$.currentSlide.get(), currentStep: slidesState$.currentStep.get(),
        slideIndex: index, stepIndex: active ? slidesState$.currentStep.get() : 0,
        startedAt: slidesState$.slideStartedAt.get(), stepStartedAt: slidesState$.stepStartedAt.get(),
        direction: slidesState$.direction.get(), isActive: active, isPreview: false,
        playbackPhase: active ? "playing" : "preparing",
      };
    }, [index]);
    return <PresentationObservableProvider value={runtime$}>{declarations[index]}</PresentationObservableProvider>;
  }
  function Surface() {
    const index = useValue(slidesState$.currentSlide);
    return <DeckContentContext.Provider value={declarations}><BackgroundHost slideIndex={index} color="#000">
      {declarations.map((_, i) => (!cold || index === i) && <Slide key={i} index={i} />)}
    </BackgroundHost></DeckContentContext.Provider>;
  }
  let tree;
  const camera = () => Array.from(tree.root.findByType("gpu").props.frameData.value.slice(0, 3));
  const press = () => keyDown({ key: "\uf703", keyCode: 124, modifiers: 0, repeated: false,
    windowId: "slides-presenter", consumed: true, captured: false });
  const rows = [];
  try {
    setSlidesState({ currentSlide: 0, currentStep: 0, slides: [0, 1].map(() => ({ metadata: { steps: 2 }, notes: "" })) });
    await act(() => { tree = create(<GPUShaderProvider renderer={Renderer}><Surface /></GPUShaderProvider>); });
    flushUI(); tick(0); tick(1000);
    for (const [kind, timestamp] of [["step", 1000], ["slide", 5000]]) {
      const before = camera(), started = performance.now();
      await act(() => { expect(press()).toBe(true); });
      const dispatchMs = performance.now() - started;
      flushUI();
      camera().forEach((value, axis) => expect(value).toBeCloseTo(before[axis], 5));
      let firstMotionFrame = 0, thresholdMotionFrame = 0;
      for (let frame = 1; frame <= 30; frame++) {
        tick(timestamp + frame * 1000 / 60);
        const distance = Math.hypot(...camera().map((value, axis) => value - before[axis]));
        if (!firstMotionFrame && distance > 1e-6) firstMotionFrame = frame;
        if (!thresholdMotionFrame && distance > .01) thresholdMotionFrame = frame;
      }
      rows.push({ kind, dispatchMs, firstMotionFrame, thresholdMotionFrame });
      tick(5000);
    }
    console.info(JSON.stringify({ cold, navigationMotion: rows }));
    expect(rows.find(row => row.kind === "slide").firstMotionFrame).toBe(2);
    expect(rows.find(row => row.kind === "step").firstMotionFrame).toBe(2);
  } finally {
    await act(() => tree?.unmount()); flushUI();
    await registration.remove(); setSlidesState(initial);
  }
});

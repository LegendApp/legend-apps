// @ts-nocheck The mock queues UI transactions so JS cannot read a reset synchronously.
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";

import { frames, flushUI } from "./uiClockMock";
const { PresentationProvider } = await import("../../../../packages/presentation/src/runtime");
const { useAnimatedShaderUniforms } = await import("../../../../packages/presentation/src/useAnimatedShaderUniforms");

test("shared shader clock resets atomically, advances through slow frames, and freezes outgoing content", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let uniforms;
  function Probe({ brightness }) {
    uniforms = useAnimatedShaderUniforms({ brightness }, 8);
    return null;
  }
  const render = (phase, stepIndex = 0, brightness = 1) =>
    <PresentationProvider value={observable({
      slideIndex: 0, stepIndex, startedAt: 100, stepStartedAt: stepIndex + 100,
      playbackPhase: phase, isActive: phase === "playing", isPreview: phase === "preview",
    })}><Probe brightness={brightness} /></PresentationProvider>;
  let tree;
  try {
    await act(() => { tree = create(render("preparing")); });
    flushUI();
    expect(uniforms.value.time).toBe(0);
    await act(() => tree.update(render("preview")));
    flushUI();
    expect(uniforms.value.time).toBe(8);
    await act(() => tree.update(render("playing")));
    // The public clock projects the new navigation before the queued UI reset.
    expect(uniforms.value.time).toBe(0);
    flushUI();
    expect(uniforms.value.time).toBe(0);
    const frame = frames.at(-1);
    frame.tick(1000);
    frame.tick(6000);
    expect(uniforms.value.time).toBe(5);
    expect(uniforms.value.stepTime).toBe(5);
    await act(() => tree.update(render("playing", 1)));
    flushUI();
    expect(uniforms.value.stepIndex).toBe(1);
    expect(uniforms.value.stepTime).toBe(0);
    expect(uniforms.value.time).toBe(5);
    frame.tick(6100);
    frame.tick(7100);
    expect(uniforms.value.stepTime).toBe(1);
    const lastTime = uniforms.value.time;
    await act(() => tree.update(render("outgoing", 0)));
    flushUI();
    expect(frame.active).toBe(false);
    frame.tick(20000);
    expect(uniforms.value.time).toBe(lastTime);
    expect(uniforms.value.stepIndex).toBe(1);
    await act(() => tree.update(render("preview", 0, 3)));
    flushUI();
    expect(uniforms.value.time).toBe(8);
    expect(uniforms.value.brightness).toBe(3);
    await act(() => tree.update(render("playing", 0, 3)));
    flushUI();
    expect(uniforms.value.time).toBe(0);
    frame.tick(30000);
    frame.tick(31000);
    await act(() => tree.update(render("playing", 0, 4)));
    flushUI();
    expect(uniforms.value.time).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});


test("native motion and delayed particles sample the same preview, step, and outgoing timeline", async () => {
  const { PlaybackKeyframeView } = await import("../../../../packages/presentation/src/PlaybackKeyframeView");
  const { SceneMotionView } = await import("../../../../packages/presentation/src/SceneMotionView");
  const keyframes = [{ time: 0, x: 0, y: 0, opacity: 0 },
    { time: 1000, x: 10, y: 100, opacity: 1 }, { time: 2000, x: 20, y: 200, opacity: 0 }];
  const render = (phase, stepIndex = 0) => <PresentationProvider value={observable({
    playbackPhase: phase, slideIndex: 0, stepIndex,
  })}>
    <PlaybackKeyframeView keyframes={keyframes} delay={3000} repeatDuration={6000} previewTime={4} />
    <SceneMotionView initialPose={{ x: 0 }} pose={{ x: 100 }} duration={1000} />
  </PresentationProvider>;
  let tree;
  try {
    await act(() => { tree = create(render("preview")); });
    flushUI();
    const styles = () => tree.root.findAllByType("animated-view").map(view => view.props.style[1].value);
    expect(styles()[0].opacity).toBe(1);
    expect(styles()[1].transform[0].translateX).toBe(100);
    await act(() => tree.update(render("playing")));
    flushUI();
    expect(styles()[0].opacity).toBe(0);
    expect(styles()[1].transform[0].translateX).toBe(0);
    const frame = frames.at(-1);
    frame.tick(1000);
    frame.tick(1500);
    expect(styles()[1].transform[0].translateX).toBe(50);
    frame.tick(5000);
    expect(styles()[0].opacity).toBe(1);
    await act(() => tree.update(render("outgoing")));
    flushUI();
    frame.tick(9000);
    expect(styles()[0].opacity).toBe(1);
    await act(() => tree.update(render("playing", 1)));
    flushUI();
    expect(styles()[0].opacity).toBe(0);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

test("carousel retargets from its displayed position and freezes for navigation-owned exit", async () => {
  const { FilmstripMotionView } = await import("../../decks/react-native-desktop/FilmstripMotionView");
  const { usePlaybackTween } = await import("../../../../packages/presentation/src/usePlaybackTween");
  function Carousel({ position }) {
    const progress = usePlaybackTween({ position }, 500);
    return <FilmstripMotionView index={0} enabled progress={progress}>card</FilmstripMotionView>;
  }
  const render = (phase, position) => <PresentationProvider value={observable({
    playbackPhase: phase, slideIndex: 0, stepIndex: position,
  })}><Carousel position={position} /></PresentationProvider>;
  let tree;
  try {
    await act(() => { tree = create(render("playing", 0)); });
    flushUI();
    const frame = frames.at(-1);
    const x = () => tree.root.findByType("animated-view").props.style[1].value.transform[0].translateX;
    frame.tick(1000);
    await act(() => tree.update(render("playing", 1)));
    flushUI();
    frame.tick(1100);
    frame.tick(1350);
    expect(x()).toBeCloseTo(-450);
    await act(() => tree.update(render("playing", 2)));
    flushUI();
    expect(x()).toBeCloseTo(-450);
    frame.tick(1400);
    frame.tick(1650);
    expect(x()).toBeCloseTo(-1125);
    await act(() => tree.update(render("outgoing", 0)));
    flushUI();
    frame.tick(9000);
    expect(x()).toBeCloseTo(-1125);
    await act(() => tree.update(render("preview", 0)));
    flushUI();
    expect(x()).toBeCloseTo(0);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});


test("carousel exit reads the host transition directly without a second animation", async () => {
  const { NavigationExitView, NavigationTransitionContext } = await import("../../../../packages/presentation/src/navigation");
  const progress = { value: 0 };
  let tree;
  try {
    await act(() => { tree = create(<NavigationTransitionContext.Provider value={{ progress, outgoing: true }}>
      <NavigationExitView>card</NavigationExitView>
    </NavigationTransitionContext.Provider>); });
    const style = tree.root.findByType("animated-view").props.style[1];
    expect(style.value.opacity).toBe(1);
    progress.value = 0.5;
    expect(style.value.opacity).toBe(0.5);
    expect(style.value.transform[0].scale).toBeCloseTo(0.94);
    progress.value = 1;
    expect(style.value.opacity).toBe(0);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

test("step-anchored shader time starts on the trigger and continues through the next step", async () => {
  let uniforms;
  function Probe() { uniforms = useAnimatedShaderUniforms({}, 6, { clock: 1 }); return null; }
  const render = stepIndex => <PresentationProvider value={observable({
    playbackPhase: "playing", slideIndex: 0, stepIndex,
  })}><Probe /></PresentationProvider>;
  let tree;
  try {
    await act(() => { tree = create(render(0)); });
    flushUI();
    const frame = frames.at(-1);
    frame.tick(1000);
    frame.tick(9000);
    expect(uniforms.value.time).toBe(0);
    expect(uniforms.value.slideTime).toBe(8);
    await act(() => tree.update(render(1)));
    flushUI();
    frame.tick(9500);
    expect(uniforms.value.time).toBe(0);
    frame.tick(11500);
    expect(uniforms.value.time).toBe(2);
    await act(() => tree.update(render(2)));
    flushUI();
    frame.tick(12000);
    expect(uniforms.value.time).toBe(2.5);
    expect(uniforms.value.stepTime).toBe(0);
    await act(() => tree.update(render(1)));
    flushUI();
    expect(uniforms.value.time).toBe(0);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

test("glass blur and refraction form and clear on one playback tween", async () => {
  const { useLiquidGlassPlayback } = await import("../../../../packages/presentation/src/useLiquidGlassPlayback");
  let glass;
  function Probe({ active }) { glass = useLiquidGlassPlayback({ active, width: 1696, height: 680 }); return null; }
  const render = (step, phase = "playing") => <PresentationProvider value={observable({
    playbackPhase: phase, slideIndex: 0, stepIndex: step,
  })}><Probe active={step >= 4} /></PresentationProvider>;
  let tree;
  try {
    await act(() => { tree = create(render(3)); });
    flushUI();
    const frame = frames.at(-1);
    frame.tick(1000);
    await act(() => tree.update(render(4)));
    flushUI();
    frame.tick(1100);
    frame.tick(1275);
    expect(glass.uniforms.value.progress).toBeCloseTo(0.15625);
    expect(glass.uniforms.value.resolution).toEqual([3392, 1360]);
    expect(glass.uniforms.value.strength).toBe(16);
    frame.tick(1450);
    expect(glass.uniforms.value.progress).toBeCloseTo(0.5);
    expect(glass.blur.value).toBeCloseTo(24);
    frame.tick(1800);
    expect(glass.blur.value).toBe(48);
    await act(() => tree.update(render(3)));
    flushUI();
    frame.tick(1900);
    frame.tick(2250);
    expect(glass.blur.value).toBeCloseTo(24);
    await act(() => tree.update(render(4, "preview")));
    flushUI();
    expect(glass.blur.value).toBe(48);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

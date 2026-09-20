// @ts-nocheck The mock queues UI transactions so JS cannot read a reset synchronously.
import { expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
import React, { useMemo, useRef } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";

const frames = [];
const transactions = [];
const reactions = [];
const reactUI = () => reactions.forEach(reaction => reaction.current());
mock.module("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "animated-view" },
  useAnimatedStyle: (read) => ({ get value() { return read(); } }),
  runOnUI: (callback) => (...args) => transactions.push(() => callback(...args)),
  useSharedValue: (value) => useRef({ value }).current,
  useDerivedValue: (read) => ({ get value() { return read(); } }),
  useAnimatedReaction: (prepare, react) => {
    const reaction = useRef(() => {});
    reaction.current = () => react(prepare());
    useMemo(() => { reactions.push(reaction); }, []);
  },
  useFrameCallback: (callback) => {
    const latest = useRef(callback);
    latest.current = callback;
    return useMemo(() => {
      const frame = { active: false, setActive(value) { this.active = value; },
        tick(timestamp) { if (this.active) { latest.current({ timestamp }); reactUI(); } } };
      frames.push(frame);
      return frame;
    }, []);
  },
}));
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
  const flushUI = () => { while (transactions.length) transactions.shift()(); reactUI(); };
  let tree;
  try {
    await act(() => { tree = create(render("preparing")); });
    flushUI();
    expect(uniforms.value.time).toBe(0);
    await act(() => tree.update(render("preview")));
    flushUI();
    expect(uniforms.value.time).toBe(8);
    await act(() => tree.update(render("playing")));
    // UI still owns the old snapshot until it applies the whole transaction.
    expect(uniforms.value.time).toBe(8);
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
  const flushUI = () => { while (transactions.length) transactions.shift()(); reactUI(); };
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
  const { FilmstripMotionView } = await import("../../../../packages/presentation/src/FilmstripMotionView");
  const render = (phase, position) => <PresentationProvider value={observable({
    playbackPhase: phase, slideIndex: 0, stepIndex: position,
  })}><FilmstripMotionView index={0} count={9} enabled position={position}>card</FilmstripMotionView></PresentationProvider>;
  const flushUI = () => { while (transactions.length) transactions.shift()(); reactUI(); };
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
    expect(x()).toBe(-450);
    await act(() => tree.update(render("playing", 2)));
    flushUI();
    expect(x()).toBe(-450);
    frame.tick(1400);
    frame.tick(1650);
    expect(x()).toBe(-1125);
    await act(() => tree.update(render("outgoing", 0)));
    flushUI();
    frame.tick(9000);
    expect(x()).toBe(-1125);
    await act(() => tree.update(render("preview", 0)));
    flushUI();
    expect(x()).toBeCloseTo(0);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});


test("carousel exit reads the host transition directly without a second animation", async () => {
  const { NavigationExitView, NavigationTransitionContext } = await import("../../../../packages/presentation/src/navigation");
  const { Animated } = await import("react-native");
  const progress = new Animated.Value(0);
  let tree;
  try {
    await act(() => { tree = create(<NavigationTransitionContext.Provider value={{ progress, outgoing: true }}>
      <NavigationExitView>card</NavigationExitView>
    </NavigationTransitionContext.Provider>); });
    const style = tree.root.findByType("layer").props.style[1];
    expect(style.opacity.__getValue()).toBe(1);
    progress.setValue(0.5);
    expect(style.opacity.__getValue()).toBe(0.5);
    expect(style.transform[0].scale.__getValue()).toBeCloseTo(0.94);
    progress.setValue(1);
    expect(style.opacity.__getValue()).toBe(0);
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
  const flushUI = () => { while (transactions.length) transactions.shift()(); reactUI(); };
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

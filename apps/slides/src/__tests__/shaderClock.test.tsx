// @ts-nocheck The mock queues UI transactions so JS cannot read a reset synchronously.
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";

import { frames, flushUI } from "./uiClockMock";
const { PresentationProvider } = await import("../../../../packages/presentation/src/runtime");
const { useAnimatedShaderUniforms } = await import("../../../../packages/presentation/src/useAnimatedShaderUniforms");
const { useGPUShaderData } = await import("../../../../packages/presentation/src/useGPUShaderData");
const fields = ["time", "stepIndex", "anchored", ["geometry", 4]] as const;

test("departing step effects keep their identity for one second, then freeze without React frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ playbackPhase: "playing", slideIndex: 0, stepIndex: 0 });
  let uniforms, data, renders = 0, tree;
  function Probe({ active }) {
    renders++;
    uniforms = useAnimatedShaderUniforms({ geometry: [1,2,3,4] }, 8, { active, clock: "step", clocks: { anchored: 0 } });
    data = useGPUShaderData(uniforms, fields);
    return null;
  }
  const render = active => <PresentationProvider value={runtime$}><Probe active={active} /></PresentationProvider>;
  try {
    await act(() => { tree = create(render(false)); }); flushUI();
    const frame = frames.at(-1);
    frame.tick(1000); frame.tick(2000);
    expect(uniforms.value.time).toBe(8, "never-active cards start as static previews");
    await act(() => tree.update(render(true))); flushUI();
    frame.tick(2500);
    expect(uniforms.value.time).toBe(1.5);
    await act(() => { runtime$.stepIndex.set(1); tree.update(render(false)); });
    expect(uniforms.value.time).toBe(1.5, "the first exit sample must retain live time before UI retirement runs");
    expect(uniforms.value.stepIndex).toBe(0);
    flushUI();
    expect(uniforms.value.time).toBe(1.5, "exit does not sample the new step's zero time");
    expect(uniforms.value.stepIndex).toBe(0);
    expect(data.value).toEqual([1.5,0,1.5,1,2,3,4]);
    const before = renders;
    frame.tick(2600); frame.tick(3000);
    expect(uniforms.value.time).toBe(2);
    frame.tick(3500);
    expect(uniforms.value.time).toBe(2.5);
    expect(uniforms.value.anchored).toBe(2.5);
    frame.tick(9000);
    expect(uniforms.value.time).toBe(2.5, "idle content retains the final exit frame");
    expect(data.value).toEqual([2.5,0,2.5,1,2,3,4]);
    expect(renders).toBe(before);
    await act(() => tree.update(render(true))); flushUI();
    expect(uniforms.value.stepIndex).toBe(1);
    expect(uniforms.value.time).toBe(6.4);
    await act(() => tree.update(render(false))); flushUI();
    frame.tick(9100);
    await act(() => tree.update(render(true))); flushUI();
    frame.tick(11000);
    expect(uniforms.value.time).toBe(8.4, "reactivation cancels the previous retirement");
    await act(() => { runtime$.assign({ playbackPhase: "preparing" }); tree.update(render(false)); }); flushUI();
    expect(uniforms.value.time).toBe(8, "inactive preparation restores the static pose");
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("retired shaders discard live poses for previews and new slide activations", async () => {
  const runtime$ = observable({ playbackPhase: "playing", slideIndex: 0, stepIndex: 0, startedAt: 1 });
  let uniforms, tree;
  function Probe({ active, delay = 1000 }) { uniforms = useAnimatedShaderUniforms({}, 8, { active, inactivityDelay: delay }); return null; }
  const render = (active, delay = 1000) => <PresentationProvider value={runtime$}><Probe active={active} delay={delay} /></PresentationProvider>;
  try {
    await act(() => { tree = create(render(true)); }); flushUI();
    const frame = frames.at(-1);
    frame.tick(1000); frame.tick(2000);
    await act(() => tree.update(render(false, 0))); flushUI();
    frame.tick(5000);
    expect(uniforms.value.time).toBe(1, "zero delay freezes immediately at the live pose");
    await act(() => runtime$.playbackPhase.set("preview"));
    expect(uniforms.value.time).toBe(8, "preview sampling must reset before the queued retirement reaction");
    flushUI();
    expect(uniforms.value.time).toBe(8);
    await act(() => { runtime$.assign({ playbackPhase: "playing", startedAt: 2 }); tree.update(render(true)); }); flushUI();
    frame.tick(6000); frame.tick(7000);
    await act(() => tree.update(render(false))); flushUI();
    frame.tick(8000); frame.tick(9000);
    expect(uniforms.value.time).toBe(2);
    await act(() => runtime$.startedAt.set(3));
    expect(uniforms.value.time).toBe(8, "a new activation must discard an idle pose immediately");
    flushUI();
    expect(uniforms.value.time).toBe(8, "a pooled inactive card cannot keep the previous visit's live pose");
  } finally { if (tree) await act(() => tree.unmount()); }
});

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


test("finite shaders stop at their final pose and replay on reversed steps without changing other clocks", async () => {
  const runtime$ = observable({ playbackPhase: "playing", slideIndex: 0, stepIndex: 0, startedAt: 1 });
  let finite, ambient, tree;
  function Probe({ active }) {
    finite = useAnimatedShaderUniforms({}, 6, { active, clock: 1, maxTime: 4.5 });
    ambient = useAnimatedShaderUniforms({}, 8);
    return null;
  }
  const render = active => <PresentationProvider value={runtime$}><Probe active={active} /></PresentationProvider>;
  try {
    await act(() => { tree = create(render(true)); }); flushUI();
    const frame = frames.at(-1);
    frame.tick(1000);
    const unstarted = { ...finite.value };
    frame.tick(9000);
    expect(finite.value).toEqual(unstarted, "an untriggered effect does not update invisible shader uniforms");
    expect(finite.value.time).toBe(0);
    expect(ambient.value.time).toBe(8);
    await act(() => runtime$.stepIndex.set(1)); flushUI();
    frame.tick(9500); frame.tick(11500);
    expect(finite.value.time).toBe(2);
    frame.tick(16000);
    expect(finite.value.time).toBe(4.5, "a slow frame still lands at the exact final pose");
    const settled = { ...finite.value };
    frame.tick(22000);
    expect(finite.value).toEqual(settled);
    expect(ambient.value.time).toBe(21, "one completed effect does not freeze the slide");
    await act(() => { tree.update(render(false)); }); flushUI();
    frame.tick(25000);
    expect(finite.value).toEqual(settled, "retirement cannot restart a completed effect");
    await act(() => { tree.update(render(true)); runtime$.stepIndex.set(2); }); flushUI();
    frame.tick(26000); frame.tick(30000);
    expect(finite.value.time).toBe(4.5, "an anchored effect stays complete in later steps");
    await act(() => runtime$.stepIndex.set(1));
    expect(finite.value.time).toBe(0, "navigation projects the reset before the queued UI transaction");
    flushUI(); frame.tick(31000); frame.tick(32000);
    expect(finite.value.time).toBe(1);
    await act(() => runtime$.playbackPhase.set("outgoing")); flushUI();
    frame.tick(40000);
    expect(finite.value.time).toBe(1, "an unfinished outgoing effect keeps its displayed pose");
    await act(() => runtime$.playbackPhase.set("preview")); flushUI();
    expect(finite.value.time).toBe(6);
    await act(() => runtime$.playbackPhase.set("preparing")); flushUI();
    expect(finite.value.time).toBe(0);
    await act(() => runtime$.assign({ playbackPhase: "playing", startedAt: 2 })); flushUI();
    frame.tick(41000); frame.tick(42000);
    expect(finite.value.time).toBe(1, "a new visit replays the effect");
  } finally { if (tree) await act(() => tree.unmount()); }
});

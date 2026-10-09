// @ts-nocheck The mock queues UI transactions so JS cannot read a reset synchronously.
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import "../../../apps/slides/src/__tests__/nativeMock";

import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
const { PresentationProvider } = await import("../../presentation/src/runtime");
const { useAnimatedShaderUniforms } = await import("../../presentation/src/useAnimatedShaderUniforms");

test("a step-anchored carousel shader keeps running before and during its move out of the center", async () => {
  const { FilmstripMotionView } = await import("../packs/media/FilmstripMotionView");
  const { usePlaybackTween } = await import("../../presentation/src/usePlaybackTween");
  const runtime$ = observable({ playbackPhase: "playing", slideIndex: 0, stepIndex: 1 });
  let uniforms, renders = 0, tree;
  function Card({ position }) {
    renders++;
    uniforms = useAnimatedShaderUniforms({ stage: 1 }, 2, { clock: 1, active: position === 1 });
    const progress = usePlaybackTween({ position }, 500);
    return <FilmstripMotionView index={1} enabled animateExit={false} progress={progress}>OS Integration</FilmstripMotionView>;
  }
  const render = position => <PresentationProvider value={runtime$}><Card position={position} /></PresentationProvider>;
  try {
    await act(() => { tree = create(render(1)); }); flushUI();
    const frame = frames.at(-1);
    const x = () => tree.root.findAllByType("animated-view")[0].props.style[1].value.transform[0].translateX;
    frame.tick(1000); frame.tick(4000);
    expect(uniforms.value.time).toBe(3);
    expect(x()).toBe(0);
    await act(() => { runtime$.stepIndex.set(2); tree.update(render(2)); });
    expect(uniforms.value.time).toBe(3);
    expect(uniforms.value.stepIndex).toBe(1);
    expect(x()).toBe(0);
    flushUI();
    const before = renders;
    frame.tick(4100); frame.tick(4350);
    expect(uniforms.value.time).toBeCloseTo(3.35);
    expect(x()).toBeCloseTo(-450);
    frame.tick(4600);
    expect(uniforms.value.time).toBeCloseTo(3.6);
    expect(x()).toBe(-900);
    frame.tick(5000); frame.tick(8000);
    expect(uniforms.value.time).toBe(4);
    expect(renders).toBe(before);

    await act(() => { runtime$.stepIndex.set(1); tree.update(render(1)); });
    expect(uniforms.value.time).toBe(0);
    flushUI();
    frame.tick(8100); frame.tick(8300);
    expect(uniforms.value.time).toBeCloseTo(0.2);
    await act(() => { runtime$.stepIndex.set(0); tree.update(render(0)); });
    expect(uniforms.value.time).toBeCloseTo(0.2);
    flushUI();
    frame.tick(8400);
    expect(uniforms.value.time).toBeCloseTo(0.3);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("carousel retargets from its displayed position and freezes for navigation-owned exit", async () => {
  const { FilmstripMotionView } = await import("../packs/media/FilmstripMotionView");
  const { usePlaybackTween } = await import("../../presentation/src/usePlaybackTween");
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

// @ts-nocheck Exercise native playback through the deterministic UI-clock harness.
import "../../../apps/slides/src/__tests__/nativeMock";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import { Form, Grid, Tree, expandScene } from "../packs/world/Authoring";
import { World } from "../packs/world/World";
import { compileTrack, colorVector, sampleTrack, worldHeaderSize, type Animated } from "../packs/world/scene";
import { tubePulseProgress } from "../packs/world/stageMotion";
import { routedTubeInstances, type TubePulse } from "../packs/world/stage";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const clock = (slideTime: number, stepIndex = 1) => ({ slideTime, stepTime: slideTime, stepIndex, stepOrigins: { [stepIndex]: 0 } });
const nodes = [{ id: "root" }, { id: "child", p: 0 }];
const tree = (wave = true, repeat: number | "infinite" = "infinite") => expandScene(<Tree id="tree" nodes={nodes} flash={[
  { step: 1, color: "#ff0000", repeat, every: 2, wave, from: "root", delay: .5 },
]} />);
const property = (parts: React.ReactNode, id: string, key: string) => flat(parts).find(n => n.props.id === id)!.props[key];
const sample = (value: unknown, seconds: number, step = 1) => sampleTrack(compileTrack(value as Animated<number>), clock(seconds, step));

test("tree boxes pulse back to their resting color and glow at each light arrival", () => {
  for (const wave of [true, false]) for (const repeat of [1, 2, "infinite"] as const) {
    const parts = expandScene(<Tree id="pulse" color="#123456" nodes={[
      ...nodes, { id: "leaf", p: 1, color: "#654321" }, { id: "quiet", p: 0 },
    ]} flash={[{ step: 1, ids: ["root", "child", "leaf"], color: "#ff0000", delay: .5, repeat, every: 2, wave, from: "root", pulseDuration: .4 }]} />);
    for (const [id, depth, rest] of [["root", 0, "#123456"], ["child", 1, "#123456"], ["leaf", 2, "#654321"]] as const) {
      const arrival = .5 + (wave ? depth * .25 : .22);
      for (const suffix of ["", "/plate", "/rim"]) {
        const glow = property(parts, `pulse/${id}${suffix}`, "emissive");
        const color = compileTrack(property(parts, `pulse/${id}${suffix}`, "color"), colorVector);
        const idle = sample(glow, .1);
        expect(sampleTrack(color, clock(arrival - .01))).toEqual(colorVector(rest));
        expect(sample(glow, arrival - .01)).toBeCloseTo(idle);
        expect(sampleTrack(color, clock(arrival + .06))).toEqual(colorVector("#ff0000"));
        expect(sample(glow, arrival + .06)).toBeGreaterThan(idle);
        expect(sample(glow, arrival + .25)).toBeGreaterThan(idle);
        expect(sampleTrack(color, clock(arrival + .41))).toEqual(colorVector(rest));
        expect(sample(glow, arrival + .41)).toBeCloseTo(idle);
        expect(sampleTrack(color, clock(2000 + arrival + .41))).toEqual(colorVector(rest));
        expect(sample(glow, 2000 + arrival + .41)).toBeCloseTo(idle);
        expect(sampleTrack(color, clock(10, 0))).toEqual(colorVector(rest));
        expect(sample(glow, 10, 0)).toBeCloseTo(idle);
        expect(sample(glow, 10, 2)).toBeCloseTo(idle);
        expect(sample(glow, arrival + 2.06)).toBeCloseTo(repeat === 1 ? idle : sample(glow, arrival + .06));
        if (repeat === "infinite") expect(sampleTrack(color, clock(2000 + arrival + .06))).toEqual(colorVector("#ff0000"));
      }
    }
    expect(property(parts, "pulse/quiet", "emissive")).toBe(.006);
  }
});

test("tree flashes default to a brief pulse and retain explicit recoloring", () => {
  const parts = expandScene(<Tree id="pulse" color="#123456" nodes={nodes} flash={[
    { step: 1, color: "#ff0000", ids: ["root"] },
    { step: 1, color: "#00ff00", ids: ["child"], flash: false, glow: .3 },
  ]} />);
  expect(sample(property(parts, "pulse/root", "emissive"), .5)).toBeCloseTo(.006);
  expect(sampleTrack(compileTrack(property(parts, "pulse/root", "color"), colorVector), clock(.5))).toEqual(colorVector("#123456"));
  expect(sample(property(parts, "pulse/child", "emissive"), 100)).toBeCloseTo(.03);
  expect(sampleTrack(compileTrack(property(parts, "pulse/child", "color"), colorVector), clock(100))).toEqual(colorVector("#00ff00"));
  const slow = expandScene(<Tree id="slow" nodes={nodes} flash={[{ step: 1, color: "#ff0000", pulseDuration: .8 }]} />);
  expect(sample(property(slow, "slow/root", "emissive"), .5)).toBeGreaterThan(.006);
  expect(sample(property(slow, "slow/root", "emissive"), .81)).toBeCloseTo(.006);
});

test("tree waves and direct beams repeat with a bounded pool and keep their delays", () => {
  for (const wave of [true, false]) {
    const parts = tree(wave), glow = property(parts, "tree/child", "emissive");
    const pulses = property(parts, `tree/child/${wave ? "edge" : "beam"}`, "pulses") as TubePulse[];
    expect(pulses).toHaveLength(1);
    expect(pulses[0].every).toBe(2);
    const arrival = wave ? .75 : .72;
    expect(sample(glow, arrival + .06)).toBeCloseTo(.45);
    expect(sample(glow, 2000 + arrival + .06)).toBeCloseTo(.45);
    expect(sample(glow, 2000 + arrival + .9)).toBeCloseTo(.006);
    expect(sample(glow, arrival + 2 - .000001)).toBeCloseTo(sample(glow, arrival + 2 + .000001), 4);
    expect(sample(glow, 10, 0)).toBe(.006);
    expect(sample(glow, 10, 2)).toBe(.006);
    expect(tubePulseProgress(pulses[0], clock(.1))).toBeLessThan(0);
    const during = .6;
    expect(tubePulseProgress(pulses[0], clock(during + 2000))).toBeCloseTo(tubePulseProgress(pulses[0], clock(during)));
    expect(tubePulseProgress(pulses[0], clock(10, 2))).toBe(2);
  }
  const finite = tree(true, 2);
  expect((property(finite, "tree/child/edge", "pulses") as TubePulse[])).toHaveLength(2);
  expect(sample(property(finite, "tree/child", "emissive"), 2000.81)).toBeCloseTo(.006);
});

test("resize and bound typing keep looping, with continuous frame geometry and exclusive text", () => {
  const grid = expandScene(<Grid id="grid" count={2} flash={{ step: 1, rate: 8, repeat: "infinite" }} />);
  const glow = property(grid, "grid/0", "emissive");
  expect(sample(glow, .02)).toBeCloseTo(5);
  expect(sample(glow, 1000.02)).toBeCloseTo(5);
  const delayed = expandScene(<Grid id="delayed" count={1} flash={{ step: 1, delay: .6, rate: 8, repeat: "infinite" }} />);
  expect(sample(property(delayed, "delayed/0", "emissive"), .5)).toBe(1);
  expect(sample(property(delayed, "delayed/0", "emissive"), 1000.62)).toBeCloseTo(5);
  const scale = compileTrack(property(grid, "grid/frame", "scale") as Animated<[number, number, number]>);
  expect(sampleTrack(scale, clock(1.4 - .000001))[0]).toBeCloseTo(sampleTrack(scale, clock(1.4 + .000001))[0], 4);
  sampleTrack(scale, clock(.35)).forEach((value, i) => expect(value).toBeCloseTo(sampleTrack(scale, clock(1400.35))[i]));
  const form = expandScene(<Form id="form" typing={{ step: 1, bind: "name", text: "Ab", repeat: "infinite" }} panels={[
    { title: "Form", fields: [{ value: "A", bind: "name" }, { value: "email" }] },
    { title: "Preview", fields: [{ value: "A", bind: "name" }] },
  ]} />);
  for (const t of [0, .59, .6, 1, 2.01, 2.1, 2100.61]) {
    const left = [0, 1].map(k => sample(property(form, `form/0/0/v${k}`, "opacity"), t));
    const right = [0, 1].map(k => sample(property(form, `form/1/0/v${k}`, "opacity"), t));
    expect(left).toEqual(right); expect(left[0] + left[1]).toBe(1);
  }
  expect(sample(property(form, "form/0/0", "emissive"), 2100.65)).toBeCloseTo(7);
  expect(property(form, "form/0/1", "emissive")).toBe(.8);
});

test("loop compilation transforms values and rejects invalid periods", () => {
  const track = compileTrack([{ step: 1, value: 1, loop: { every: 2, frames: [{ at: 0, value: 2, duration: 1 }, { at: 1, value: 1, duration: 1 }] } }], n => n * 3);
  expect(sampleTrack(track, clock(2000.5))).toBeCloseTo(4.5);
  for (const every of [0, -1, Infinity, NaN]) {
    expect(() => compileTrack([{ value: 0, loop: { every, frames: [{ at: 0, value: 1 }] } }])).toThrow("period must be positive");
    expect(() => routedTubeInstances({ id: "tube", path: [[0, 0, 0], [1, 0, 0]], pulses: [{ every }] })).toThrow("period must be positive");
  }
});

test("shared playback freezes looping worlds on pause and slide departure without React frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 1, slideIndex: 0, stepIndex: 1,
    slideCount: 2, stepCount: 2, startedAt: 0, stepStartedAt: 0, isActive: true,
    isPreview: false, isPreparing: false, playbackPhase: "playing", playbackScope: "slide",
    direction: "forward", goTo() {}, next() {}, previous() {} });
  const tick = (timestamp: number) => frames.forEach(frame => frame.tick(timestamp));
  function Renderer(props) { return <world-gpu {...props} />; }
  let renderer, commits = 0;
  const activeFrames = () => frames.filter(frame => frame.active).length;
  const before = activeFrames();
  const content = <GPUShaderProvider renderer={Renderer}><PresentationObservableProvider value={runtime$}>
    <Profiler id="loop" onRender={() => commits++}><World quality="high">{tree()}</World></Profiler>
  </PresentationObservableProvider></GPUShaderProvider>;
  const values = () => Array.from(renderer.root.findByType("world-gpu").props.frameData.value);
  try {
    await act(() => { renderer = create(content); });
    flushUI(); tick(0); tick(2810);
    const lit = values(), mountedCommits = commits;
    tick(4810); expect(values().slice(worldHeaderSize)).toEqual(lit.slice(worldHeaderSize)); expect(commits).toBe(mountedCommits);
    await act(() => runtime$.assign({ playbackPhase: "paused" })); flushUI();
    const paused = values(), pausedCommits = commits;
    expect(activeFrames()).toBe(before);
    tick(50000); expect(values()).toEqual(paused); expect(commits).toBe(pausedCommits);
    await act(() => runtime$.assign({ playbackPhase: "playing" })); flushUI(); tick(50000);
    expect(values().slice(worldHeaderSize)).toEqual(paused.slice(worldHeaderSize));
    tick(50100); expect(values()).not.toEqual(paused);
    await act(() => runtime$.assign({ currentSlide: 1, isActive: false, playbackPhase: "outgoing" })); flushUI();
    const outgoing = values(); expect(activeFrames()).toBe(before);
    tick(70000); expect(values()).toEqual(outgoing);
    await act(() => runtime$.assign({ isPreparing: true, playbackPhase: "preparing" })); flushUI();
    const preparing = values(); expect(activeFrames()).toBe(before);
    tick(90000); expect(values()).toEqual(preparing);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
  expect(activeFrames()).toBe(before);
});

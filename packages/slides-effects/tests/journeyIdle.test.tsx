// @ts-nocheck Native leaves are mocked; playback, track sampling and React subscriptions are real.
import "../../../apps/slides/src/__tests__/nativeMock";
import { frames, flushUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, mock, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import * as animated from "react-native-reanimated";
import { GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import { instanceField, journeyHeaderSize } from "../packs/journey/scene";

let jsCalls = 0;
const originalAnimated = { ...animated };
mock.module("react-native-reanimated", () => ({ ...originalAnimated, runOnJS: callback => (...args) => {
  jsCalls++;
  return callback(...args);
} }));
const { Sphere, Journey } = await import("../packs/journey/Journey");

test("held looping journeys make zero React commits and JS callbacks across 600 frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ currentSlide: 0, currentStep: 0, slideIndex: 0, stepIndex: 0,
    slideCount: 2, stepCount: 1, startedAt: 0, stepStartedAt: 0, isActive: true,
    isPreview: false, isPreparing: false, playbackPhase: "playing", direction: "forward" });
  let renderer, commits = 0;
  const content = <Profiler id="held-journey" onRender={() => commits++}>
    <GPUShaderProvider renderer={props => <journey-gpu {...props} />}>
      <PresentationObservableProvider value={runtime$}>
        <Journey track={{ duration: .5 }} quality="high">
          <Sphere id="pulse" emissive={[{ step: 0, value: 1, loop: { every: 1,
            frames: [{ at: 0, value: 4, duration: .25 }, { at: .5, value: 1, duration: .25 }] } }]} />
        </Journey>
      </PresentationObservableProvider>
    </GPUShaderProvider>
  </Profiler>;
  const tick = timestamp => frames.forEach(frame => frame.tick(timestamp));
  const values = () => Array.from(renderer.root.findByType("journey-gpu").props.frameData.value);
  const held = (start: number) => {
    const before = { commits, jsCalls };
    const snapshots = [];
    for (let frame = 1; frame <= 600; frame++) {
      tick(start + frame * 1000 / 60);
      if (frame === 15 || frame === 45) snapshots.push(values());
    }
    expect(commits - before.commits).toBe(0);
    expect(jsCalls - before.jsCalls).toBe(0);
    expect(snapshots[0][journeyHeaderSize + instanceField.emissive]).not.toBe(snapshots[1][journeyHeaderSize + instanceField.emissive]);
  };
  try {
    await act(() => { renderer = create(content); });
    flushUI(); tick(0); values();
    held(0);
    const before = values();
    await act(() => runtime$.assign({ slideIndex: 1, currentSlide: 1, startedAt: 10000, stepStartedAt: 10000 }));
    flushUI(); tick(10000);
    expect(values().slice(0, 8)).toEqual(before.slice(0, 8));
    tick(10000 + 1000 / 60);
    expect(values().slice(0, 8)).not.toEqual(before.slice(0, 8));
    tick(11000); values();
    held(11000);
  } finally { await act(() => renderer?.unmount()); flushUI(); }
});

// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { advancePlayback, createPlaybackState, transitionPlayback } from "../../presentation/src/playbackState";
import { compileTrack, sampleTrack } from "../packs/world/scene";
import { sampleWorldClock } from "../packs/world/timing";

const loop = compileTrack([
  { step: 0, value: 0 },
  { step: 1, value: 10, delay: .2, loop: { every: 2, frames: [
    { at: 0, value: 20, duration: 1, ease: "linear" },
    { at: 1, value: 10, duration: 1, ease: "linear" },
  ] } },
]);
function playback(step = 0) {
  let state = createPlaybackState({ phase: "playing", slideKey: "a", stepKey: String(step), stepIndex: step }), timestamp = 0;
  const tick = (seconds: number) => { timestamp += seconds * 1000; state = advancePlayback(state, timestamp); };
  tick(0);
  return {
    tick,
    nav(step: number) { state = transitionPlayback(state, { phase: "playing", slideKey: "a", stepKey: String(step), stepIndex: step }); tick(.016); },
    phase(phase: "paused" | "playing") { state = transitionPlayback(state, { ...state, phase }); },
    clock: () => sampleWorldClock(state, 0, "slide", undefined, false),
    value: () => sampleTrack(loop, sampleWorldClock(state, 0, "slide", undefined, false)),
  };
}

for (const step of [2, 3]) for (const directEntry of [false, true]) {
  test(`loop stays live after ${directEntry ? "entering" : "jumping to"} step ${step} without its start epoch`, () => {
    const p = playback(directEntry ? step : 0);
    if (!directEntry) { p.tick(3); p.nav(step); }
    expect(p.clock().stepOrigins[1]).toBeUndefined();
    p.tick(.7);
    expect(p.value()).toBeCloseTo(15);
    p.tick(.4);
    expect(p.value()).toBeCloseTo(19);
    p.phase("paused"); p.tick(8);
    expect(p.value()).toBeCloseTo(19);
    p.phase("playing"); p.tick(.016);
    expect(p.value()).toBeCloseTo(19);
    p.tick(.2);
    expect(p.value()).toBeCloseTo(19);
    p.tick(.2);
    expect(p.value()).toBeCloseTo(17);
  });
}

test("known loop epochs preserve their phase through later steps and reset on reverse reentry", () => {
  const p = playback();
  p.tick(3); p.nav(1); p.tick(.7);
  const epoch = p.clock().stepOrigins[1];
  expect(p.value()).toBeCloseTo(15);
  p.nav(2);
  expect(p.clock().stepOrigins[1]).toBe(epoch);
  const expected = sampleTrack(loop, { ...p.clock(), stepIndex: 1 });
  expect(p.value()).toBeCloseTo(expected);
  p.tick(.4);
  expect(p.value()).not.toBeCloseTo(expected);
  p.nav(0);
  expect(p.value()).toBe(0);
  p.nav(3); p.tick(.7);
  expect(p.value()).toBeCloseTo(15);
});

test("skipped finite animations still hold their completed value", () => {
  const finite = compileTrack([{ step: 0, value: 0 }, { step: 1, value: 10, delay: 4, duration: 8 }]);
  const p = playback(3);
  expect(sampleTrack(finite, p.clock())).toBe(10);
  p.tick(.3);
  expect(sampleTrack(finite, p.clock())).toBe(10);
});

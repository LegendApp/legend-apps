import { expect, test } from "bun:test";
import { advanceResolution, createResolutionState, type ResolutionState } from "../packs/world/resolution";
import { advancePlayback, createPlaybackState, transitionPlayback } from "../../presentation/src/playbackState";

function frames(state: ResolutionState, interval: number, count: number, key = "scene") {
  let timestamp = state.lastTimestamp ?? 0;
  const scales: number[] = [];
  for (let index = 0; index < count; index++) {
    timestamp += interval;
    state = advanceResolution(state, { timestamp, playing: true, key });
    scales.push(state.scale);
  }
  return { state, scales };
}

test("ordinary 60 Hz and 120 Hz cadence keeps full resolution", () => {
  for (const interval of [1000 / 60, 1000 / 120]) {
    const { state, scales } = frames(createResolutionState(), interval, 2400);
    expect(state.scale).toBe(1);
    expect(scales.every(scale => scale === 1)).toBe(true);
  }
});

test("sustained 50 fps steps down within bounds and healthy cadence recovers with hysteresis", () => {
  const slow = frames(createResolutionState(), 20, 1000);
  expect(slow.scales.slice(0, 60).every(scale => scale === 1)).toBe(true);
  expect([...new Set(slow.scales)]).toEqual([1, 0.875, 0.75, 0.625, 0.5]);
  expect(slow.state.scale).toBe(0.5);
  expect(frames(createResolutionState(), 120, 200).state.scale).toBe(0.5);
  const neutral = frames(slow.state, 18, 400);
  expect(neutral.state.scale).toBe(0.5);
  const shortRecovery = frames(neutral.state, 1000 / 60, 240);
  expect(shortRecovery.state.scale).toBe(0.5);
  const recovered = frames(shortRecovery.state, 1000 / 60, 1600);
  expect(recovered.state.scale).toBe(1);
  expect(recovered.scales.every(scale => scale >= 0.5 && scale <= 1)).toBe(true);
});

test("startup, isolated stalls, paused gaps and timestamp resets do not lower resolution", () => {
  let state = frames(createResolutionState(), 1000 / 60, 120).state;
  state = advanceResolution(state, { timestamp: state.lastTimestamp! + 50, playing: true, key: "scene" });
  state = frames(state, 1000 / 60, 120).state;
  expect(state.scale).toBe(1);
  const same = advanceResolution(state, { timestamp: state.lastTimestamp, playing: true, key: "scene" });
  expect(same).toBe(state);
  const warmup = state.warmupUntil;
  state = advanceResolution(state, { timestamp: state.lastTimestamp! + 5000, playing: true, key: "scene" });
  expect(state.scale).toBe(1); expect(state.warmupUntil).toBe(warmup);
  state = advanceResolution(state, { timestamp: null, playing: false, key: "scene" });
  expect(state.lastTimestamp).toBeNull();
  state = advanceResolution(state, { timestamp: 20000, playing: true, key: "scene" });
  expect(state.warmupUntil).toBe(20500); expect(state.frames).toBe(0);
  state = advanceResolution(state, { timestamp: 100, playing: true, key: "scene" });
  expect(state.warmupUntil).toBe(600); expect(state.scale).toBe(1);
  state = advanceResolution({ ...state, scale: 0.5 }, { timestamp: 200, playing: true, key: "next" });
  expect(state.scale).toBe(1); expect(state.key).toBe("next");
});

test("an isolated hitch preserves the current cooldown and recovery history", () => {
  const state = frames(createResolutionState(), 20, 100).state;
  expect(state.scale).toBe(0.875);
  expect(state.cooldownUntil).toBeGreaterThan(state.lastTimestamp!);
  const hitch = advanceResolution(state, { timestamp: state.lastTimestamp! + 500, playing: true, key: "scene" });
  expect(hitch.scale).toBe(state.scale);
  expect(hitch.cooldownUntil).toBe(state.cooldownUntil);
  expect(hitch.warmupUntil).toBe(state.warmupUntil);
  const paused = advanceResolution(state, { timestamp: null, playing: false, key: "scene" });
  const resumed = advanceResolution(paused, { timestamp: state.lastTimestamp! + 20, playing: true, key: "scene" });
  expect(resumed.cooldownUntil).toBe(state.cooldownUntil); expect(resumed.scale).toBe(state.scale);
  expect(advanceResolution(resumed, { timestamp: state.lastTimestamp! + 40, playing: true, key: "next" }).cooldownUntil).toBe(0);
  const healthy = frames(createResolutionState(), 1000 / 60, 240).state;
  expect(healthy.healthyWindows).toBeGreaterThan(0);
  const interrupted = advanceResolution(healthy, { timestamp: healthy.lastTimestamp! + 500, playing: true, key: "scene" });
  expect(interrupted.healthyWindows).toBe(healthy.healthyWindows);
});

test("adaptation never changes playback clocks across a real pause and resume", () => {
  let playback = createPlaybackState({ phase: "playing", slideKey: "clock", stepKey: "0", stepIndex: 0 });
  let resolution = createResolutionState();
  for (let timestamp = 0; timestamp <= 10000; timestamp += 20) {
    playback = advancePlayback(playback, timestamp);
    resolution = advanceResolution(resolution, { timestamp: playback.lastTimestamp, playing: playback.phase === "playing", key: playback.slideKey });
  }
  expect(resolution.scale).toBeLessThan(1);
  expect(playback.slideTime).toBeCloseTo(10);
  playback = transitionPlayback(playback, { ...playback, phase: "paused" });
  resolution = advanceResolution(resolution, { timestamp: playback.lastTimestamp, playing: false, key: playback.slideKey });
  const paused = resolution.scale;
  playback = advancePlayback(playback, 50000);
  expect(playback.slideTime).toBeCloseTo(10);
  playback = transitionPlayback(playback, { ...playback, phase: "playing" });
  playback = advancePlayback(playback, 50000);
  resolution = advanceResolution(resolution, { timestamp: playback.lastTimestamp, playing: true, key: playback.slideKey });
  expect(resolution.scale).toBe(paused);
  expect(resolution.frames).toBe(0);
  expect(playback.slideTime).toBeCloseTo(10);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { advancePlayback, createPlaybackState, transitionPlayback, playbackMatchesRender, type PlaybackInput } from "../playbackState.ts";

const playing: PlaybackInput = { phase: "playing", slideKey: "slide-a", stepKey: "step-0", stepIndex: 0 };
const elapsedState = () => advancePlayback(advancePlayback(createPlaybackState(playing), 1000), 3000);

test("direct opening establishes a zero origin on the first frame", () => {
  const initial = createPlaybackState(playing);
  const first = advancePlayback(initial, 400000);
  assert.equal(first.slideTime, 0);
  assert.equal(first.stepTime, 0);
  const next = advancePlayback(first, 400250);
  assert.equal(next.slideTime, 0.25);
  assert.equal(next.stepTime, 0.25);
});

test("preparing and static preview never advance or leak their sample time into playback", () => {
  for (const phase of ["preparing", "preview"] as const) {
    const inactive = createPlaybackState({ ...playing, phase });
    assert.equal(advancePlayback(inactive, 10000), inactive);
    const active = transitionPlayback(inactive, playing);
    assert.equal(advancePlayback(active, 50000).slideTime, 0);
    assert.equal(advancePlayback(active, 50000).stepTime, 0);
  }
  const prepared = transitionPlayback(elapsedState(), { ...playing, phase: "preparing" });
  assert.equal(prepared.slideTime, 0);
  assert.equal(prepared.stepTime, 0);
});

test("next, back, and replay step keys reset only the step clock on the first tick", () => {
  let state = elapsedState();
  let timestamp = 3000;
  for (const [stepKey, stepIndex] of [["step-1", 1], ["step-0-back", 0], ["step-0-replay", 0]] as const) {
    const priorSlideTime = state.slideTime;
    state = transitionPlayback(state, { ...playing, stepKey, stepIndex });
    assert.equal(state.slideTime, priorSlideTime);
    assert.equal(state.stepTime, 0);
    assert.equal(state.stepPending, true);
    state = advancePlayback(state, timestamp += 500);
    assert.equal(state.slideTime, priorSlideTime + 0.5);
    assert.equal(state.stepTime, 0);
    state = advancePlayback(state, timestamp += 250);
    assert.equal(state.stepTime, 0.25);
  }
});

test("outgoing freezes the exact frame; returning starts a fresh playback", () => {
  const projection: PlaybackInput = { phase: "outgoing", slideKey: "", stepKey: "", stepIndex: 0 };
  const outgoing = transitionPlayback(elapsedState(), projection);
  assert.equal(outgoing.slideTime, 2);
  assert.equal(outgoing.stepTime, 2);
  assert.equal(outgoing.lastTimestamp, null);
  assert.equal(outgoing.slideKey, playing.slideKey);
  assert.equal(outgoing.stepKey, playing.stepKey);
  assert.equal(transitionPlayback(outgoing, projection), outgoing);
  assert.equal(advancePlayback(outgoing, 50000), outgoing);
  const returning = transitionPlayback(outgoing, playing);
  assert.equal(returning.slideTime, 0);
  assert.equal(returning.stepTime, 0);
});

test("pausing and resuming excludes paused wall time while preserving the frame", () => {
  const paused = transitionPlayback(elapsedState(), { ...playing, phase: "paused" });
  assert.equal(advancePlayback(paused, 100000), paused);
  const resumed = advancePlayback(transitionPlayback(paused, playing), 200000);
  assert.equal(resumed.slideTime, 2);
  assert.equal(resumed.stepTime, 2);
  assert.equal(advancePlayback(resumed, 200500).stepTime, 2.5);
  const otherSlide = transitionPlayback(paused, { ...playing, slideKey: "slide-b" });
  assert.equal(otherSlide.slideTime, 0);
  assert.equal(otherSlide.stepTime, 0);
});

test("a preview handoff always restarts rather than resuming its former live time", () => {
  const preview = transitionPlayback(elapsedState(), { ...playing, phase: "preview" });
  assert.equal(advancePlayback(preview, 100000), preview);
  const live = transitionPlayback(preview, playing);
  assert.equal(live.slideTime, 0);
  assert.equal(live.stepTime, 0);
});

test("real elapsed time is not capped on long frames", () => {
  const delayed = advancePlayback(elapsedState(), 13000);
  assert.equal(delayed.slideTime, 12);
  assert.equal(delayed.stepTime, 12);
  assert.equal(advancePlayback(delayed, 12000), delayed);
  assert.equal(advancePlayback(delayed, Number.NaN), delayed);
});

test("unrelated rerenders preserve identity and timing, but changing slides resets both clocks", () => {
  const state = elapsedState();
  assert.equal(transitionPlayback(state, { ...playing }), state);
  const otherSlide = transitionPlayback(state, { ...playing, slideKey: "slide-b" });
  assert.equal(otherSlide.slideTime, 0);
  assert.equal(otherSlide.stepTime, 0);
  assert.equal(otherSlide.lastTimestamp, null);
});

test("a triggered effect keeps its origin through later steps and resets on back/replay", () => {
  let state = elapsedState();
  state = transitionPlayback(state, { ...playing, stepKey: "strike", stepIndex: 1 });
  state = advancePlayback(state, 3500);
  const strike = state.stepOrigins[1];
  state = advancePlayback(state, 5000);
  state = transitionPlayback(state, { ...playing, stepKey: "zoom", stepIndex: 2 });
  state = advancePlayback(state, 5500);
  assert.equal(state.stepOrigins[1], strike);
  assert.equal(state.slideTime - state.stepOrigins[1], 2);
  state = transitionPlayback(state, { ...playing, stepKey: "strike-again", stepIndex: 1 });
  state = advancePlayback(state, 6000);
  assert.equal(state.slideTime - state.stepOrigins[1], 0);
  assert.equal(state.stepOrigins[2], undefined);
});

test("new reveals reject stale time until the matching step reset arrives", () => {
  const old = advancePlayback(advancePlayback(createPlaybackState(playing), 1000), 21000);
  const next = { ...playing, stepKey: "step-1", stepIndex: 1 };
  assert.equal(playbackMatchesRender(old, next.slideKey, next.stepKey, next.phase), false);
  assert.equal(playbackMatchesRender(old, next.slideKey, next.stepKey, next.phase, false), true, "ongoing slide-clock content must not blink on a step change");
  const ready = transitionPlayback(old, next);
  assert.equal(playbackMatchesRender(ready, next.slideKey, next.stepKey, next.phase), true);
  assert.equal(ready.stepTime, 0, "emoji and foundation reveal delays must start at zero");
  assert.equal(playbackMatchesRender(ready, "other-slide", next.stepKey, next.phase), false);
  assert.equal(playbackMatchesRender(ready, next.slideKey, "replay-step-1", next.phase), false);
  assert.equal(playbackMatchesRender(ready, "cleared", "cleared", "outgoing"), true);
  assert.equal(playbackMatchesRender(ready, "cleared", "cleared", "paused"), true);
  const preview = transitionPlayback(ready, { ...next, phase: "preview" });
  assert.equal(playbackMatchesRender(preview, next.slideKey, next.stepKey, "playing"), false);
});

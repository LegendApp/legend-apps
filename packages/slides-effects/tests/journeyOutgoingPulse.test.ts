// @ts-ignore Bun supplies this API at runtime.
import { expect, test } from "bun:test";
import { advancePlayback, createPlaybackState, transitionPlayback, type PlaybackState } from "../../presentation/src/playbackState";
import { prepareJourneySample, prepareJourneyScene, primitive, sampleJourneyUniforms, journeyHeaderSize, journeyInstanceSize } from "../packs/journey/scene";
import { routedTubeInstances } from "../packs/journey/stage";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, type TrackFrame } from "../packs/journey/track";
import { sampleJourneyClock } from "../packs/journey/timing";

const outgoing = prepareJourneyScene({ instances: [primitive("box", { id: "anchor", position: [0, 0, -50] }),
  ...routedTubeInstances({ id: "beam", path: [[0, 0, -50], [5, 0, -50]],
    pulses: [{ step: 3, delay: .8, every: 1.8, duration: .22, beads: 7 }] })] });
const incoming = prepareJourneyScene({ instances: [primitive("box", { id: "next", position: [0, 0, -82] })] });
const retained = retainTrackScene(incoming, outgoing);
const options = { frame: "world" as const, duration: 1.7, turn: 0, rise: 0 };
function sample(frame: TrackFrame, state: PlaybackState, scene = outgoing, declared = trackIds(scene)) {
  const prepared = prepareJourneySample(scene), clock = sampleJourneyClock(state, 4, "step", undefined, false);
  return sampleTrackFrame(frame, sampleJourneyUniforms(prepared, clock) as number[], trackIds(scene), state, options, declared,
    { scene: prepared, clock, ids: trackIds(scene) });
}
function field(frame: TrackFrame, id: string, offset: number) {
  return frame.values[journeyHeaderSize + frame.ids.indexOf(id) * journeyInstanceSize + offset];
}
const bead = "sphere:beam:pulse:0:0";
function departure(active = false) {
  let state = createPlaybackState({ phase: "playing", slideKey: "0:first", stepKey: "0:first", stepIndex: 0 });
  state = advancePlayback(advancePlayback(state, 1000), 2000);
  state = transitionPlayback(state, { ...state, stepKey: "3:old", stepIndex: 3 });
  state = advancePlayback(state, 2100);
  state = advancePlayback(state, active ? 4740 : 5780);
  const held = sample(createTrackFrame(), state);
  state = transitionPlayback(state, { phase: "playing", slideKey: "1:new", stepKey: "0:new", stepIndex: 0 });
  return { state, held, frame: sample(held, state, retained, trackIds(incoming)) };
}

test("retained repeating beads keep the departure step phase and move relative to their anchor until focus", () => {
  let { state, frame } = departure();
  expect(field(frame, bead, 23)).toBe(0);
  const navigation = state.lastTimestamp!;
  state = advancePlayback(state, navigation + 750);
  frame = sample(frame, state, retained, trackIds(incoming));
  expect(frame.cursor).toBeGreaterThan(0);
  expect(frame.cursor).toBeLessThan(1);
  expect(field(frame, bead, 23)).toBeGreaterThan(0);
  expect(frame.visible).toContain(bead);
  const relative = field(frame, bead, 0) - field(frame, "box:anchor", 0);
  state = advancePlayback(state, navigation + 850);
  frame = sample(frame, state, retained, trackIds(incoming));
  expect(field(frame, bead, 23)).toBeGreaterThan(0);
  expect(field(frame, bead, 0) - field(frame, "box:anchor", 0)).toBeGreaterThan(relative + 1);
  state = advancePlayback(state, navigation + 1700);
  frame = sample(frame, state, retained, trackIds(incoming));
  expect(frame.cursor).toBe(1);
  expect(field(frame, bead, 23)).toBe(0);
  expect(frame.visible).not.toContain(bead);
  expect(frame.retired).toEqual({});
  expect(frame.departures).toEqual([]);
});

test("an active departure survives pause, while back navigation and interrupted returns discard stale pulse contexts", () => {
  let { state, held, frame } = departure(true);
  expect(field(held, bead, 23)).toBe(1);
  expect(field(frame, bead, 23)).toBeGreaterThan(0);
  state = advancePlayback(state, state.lastTimestamp! + 40);
  frame = sample(frame, state, retained, trackIds(incoming));
  const before = Array.from(frame.values);
  state = transitionPlayback(state, { ...state, phase: "paused" });
  state = advancePlayback(state, 20000);
  expect(sample(frame, state, retained, trackIds(incoming))).toBe(frame);
  expect(Array.from(frame.values)).toEqual(before);
  state = transitionPlayback(state, { ...state, phase: "playing" });
  state = advancePlayback(advancePlayback(state, 21000), 21040);
  frame = sample(frame, state, retained, trackIds(incoming));
  expect(field(frame, bead, 0)).toBeGreaterThan(before[journeyHeaderSize + frame.ids.indexOf(bead) * journeyInstanceSize]);
  state = transitionPlayback(state, { phase: "playing", slideKey: "0:back", stepKey: "3:back", stepIndex: 3 });
  const returning = retainTrackScene(outgoing, retained, incoming, false, frame.visible);
  frame = sample(frame, state, returning, trackIds(outgoing));
  expect(frame.departures).toEqual([]);
  state = transitionPlayback(state, { phase: "playing", slideKey: "1:again", stepKey: "0:again", stepIndex: 0 });
  frame = sample(frame, state, retained, trackIds(incoming));
  state = advancePlayback(state, state.lastTimestamp! + 1700);
  frame = sample(frame, state, retained, trackIds(incoming));
  expect(frame.retired).toEqual({});
  expect(frame.departures).toEqual([]);
});

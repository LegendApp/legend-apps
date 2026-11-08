import { expect, test } from "bun:test";
import { advancePlayback, createPlaybackState, transitionPlayback } from "../../presentation/src/playbackState";
import { prepareWorldScene, primitive, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { createTrackFrame, sampleTrackFrame, trackIds, type TrackFrame } from "../packs/world/track";
const part = (frame: TrackFrame, id: string) => frame.values.slice(worldHeaderSize + frame.ids.indexOf(id) * worldInstanceSize);


test("station step reversal and repeated interruptions retain the live pose", () => {
  const scene = prepareWorldScene({ instances: [primitive("box", { id: "morph", position: [
    { step: 0, value: [0, 0, 0] }, { step: 1, value: [4, 2, 0], duration: 1 },
  ], scale: [{ step: 0, value: [3, 1, 1] }, { step: 1, value: [1, 4, 1], duration: 1 }] })] });
  const ids = trackIds(scene), options = { duration: 1 };
  let clock = 0, state = createPlaybackState({ phase: "playing", slideKey: "0", stepKey: "0", stepIndex: 0 });
  state = advancePlayback(state, clock);
  const at = (previous: TrackFrame, step: number, time: number) => {
    if (step !== state.stepIndex) {
      state = transitionPlayback(state, { ...state, stepIndex: step, stepKey: String(step) });
      state = advancePlayback(state, ++clock);
    }
    clock += (time - state.stepTime) * 1000;
    state = advancePlayback(state, clock);
    return sampleTrackFrame(previous, sampleWorldUniforms(scene, state) as number[], ids, state, options);
  };
  const pose = (frame: TrackFrame) => part(frame, "box:morph").slice(0, 11);
  let frame = at(createTrackFrame(), 0, 3);
  frame = at(frame, 1, 0); frame = at(frame, 1, 1);
  const column = pose(frame);
  frame = at(frame, 0, 0);
  expect(pose(frame)).toEqual(column);
  frame = at(frame, 0, .35);
  expect(pose(frame)[0]).toBeGreaterThan(0);
  expect(pose(frame)[0]).toBeLessThan(4);
  const interrupted = pose(frame);
  frame = at(frame, 1, 0);
  expect(pose(frame)).toEqual(interrupted);
  frame = at(frame, 1, .3);
  const forward = pose(frame);
  frame = at(frame, 0, 0);
  expect(pose(frame)).toEqual(forward);
  frame = at(frame, 0, 1);
  expect(pose(frame).slice(0, 3)).toEqual([0, 0, 0]);
  expect(pose(frame).slice(8, 11)).toEqual([3, 1, 1]);
});

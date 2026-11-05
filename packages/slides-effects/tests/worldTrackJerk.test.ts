// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { prepareWorldScene, sampleWorldUniforms } from "../packs/world/scene";
import { buildCourse, createTrackFrame, sampleTrackFrame, trackX, type TrackFrame, type WorldTrack } from "../packs/world/track";

const scene = prepareWorldScene({ instances: [] });
function at(previous: TrackFrame, slide: number, time: number, track: WorldTrack, step = 0): TrackFrame {
  const playback = { ...createPlaybackState({ phase: "playing", slideKey: String(slide), stepKey: String(step), stepIndex: step }), slideTime: time, stepTime: time };
  return sampleTrackFrame(previous, sampleWorldUniforms(scene, playback) as number[], [], playback, { ...track, ...track.course?.[slide] });
}
function angles(frame: TrackFrame) {
  const v = frame.values, dx = v[4] - v[0], dy = v[5] - v[1], dz = v[6] - v[2];
  return [Math.atan2(dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)), v[7]].map(value => value * 180 / Math.PI);
}
function differences(rows: number[][]) {
  return rows.slice(1).map((row, i) => row.map((value, axis) => (value - rows[i][axis] + 540) % 360 - 180));
}
const peak = (rows: number[][]) => Math.max(...rows.map(row => Math.hypot(...row)));

test("default camera angular velocity, acceleration and jerk stay bounded at 60 Hz, including holds and Previous", () => {
  const course = buildCourse({}, 25), samples: number[][] = [];
  let previous = at(createTrackFrame(), 0, 0, {});
  const route = [...Array.from({ length: 24 }, (_, i) => i + 1), ...Array.from({ length: 24 }, (_, i) => 23 - i)];
  for (const slide of route) {
    const duration = course.duration[Math.max(slide, Math.ceil(previous.cursor))], start = at(previous, slide, 0, {});
    let z = start.values[2];
    const reverse = slide < previous.cursor;
    for (let frame = 0; frame <= Math.ceil((duration + .3) * 60); frame++) {
      previous = at(start, slide, frame / 60, {});
      expect((previous.values[2] - z) * (reverse ? -1 : 1)).toBeLessThanOrEqual(1e-8);
      z = previous.values[2];
      samples.push(angles(previous));
    }
  }
  const velocity = differences(samples), acceleration = differences(velocity), jerk = differences(acceleration);
  expect(peak(velocity)).toBeLessThan(.6);
  expect(peak(acceleration)).toBeLessThan(.1);
  expect(peak(jerk)).toBeLessThan(.03);
});

test("fast cold jumps keep their gaze steady, finish in 1.5 s and retrace in reverse", () => {
  const rest = at(createTrackFrame(), 0, 0, {}), start = at(rest, 18, 0, {});
  const forward = Array.from({ length: 109 }, (_, frame) => at(start, 18, frame / 60, {}));
  expect(forward[90].cursor).toBe(18);
  const back = at(forward[108], 0, 0, {});
  for (let frame = 0; frame <= 90; frame++) {
    at(back, 0, frame / 60, {}).values.slice(0, 8).forEach((value, axis) => expect(value).toBeCloseTo(forward[90 - frame].values[axis], 7));
  }
  const velocity = differences(forward.map(angles)), acceleration = differences(velocity);
  expect(peak(velocity)).toBeLessThan(.05);
  expect(peak(acceleration)).toBeLessThan(.08);
  expect(peak(differences(acceleration))).toBeLessThan(.15);
});

test("the centreline joins station straights with continuous slope and curvature", () => {
  const course = buildCourse({}, 10), h = .001;
  for (let k = 1; k < 10; k++) for (const z of [course.from[k], course.to[k]]) {
    const x = (depth: number) => trackX(course, depth);
    const leftSlope = (x(z) - x(z - h)) / h, rightSlope = (x(z + h) - x(z)) / h;
    const leftCurvature = (x(z) - 2 * x(z - h) + x(z - 2 * h)) / (h * h);
    const rightCurvature = (x(z + 2 * h) - 2 * x(z + h) + x(z)) / (h * h);
    expect(Math.abs(leftSlope - rightSlope)).toBeLessThan(1e-6);
    expect(Math.abs(leftCurvature - rightCurvature)).toBeLessThan(1e-4);
  }
});

test("camera position, heading and bank have continuous rates through unequal skipped stations", () => {
  const track: WorldTrack = { ease: "linear", course: [undefined, { spacing: 48, rise: .3, ease: "linear" }, { spacing: 60, rise: -.2, ease: "linear" }, { spacing: 44, ease: "linear" }, { spacing: 54, ease: "linear" }] };
  const start = at(at(createTrackFrame(), 0, 0, track), 4, 0, track), h = .0001;
  const pose = (cursor: number) => {
    const f = at(start, 4, cursor * 1.5 / 4, track);
    return [...f.values.slice(0, 3), ...angles(f)];
  };
  for (const cursor of [1, 2, 3]) {
    const rows = [-2, -1, 0, 1, 2].map(offset => pose(cursor + offset * h));
    for (let axis = 0; axis < rows[0].length; axis++) {
      const left = (rows[2][axis] - rows[1][axis]) / h, right = (rows[3][axis] - rows[2][axis]) / h;
      const a = (rows[2][axis] - 2 * rows[1][axis] + rows[0][axis]) / (h * h);
      const b = (rows[4][axis] - 2 * rows[3][axis] + rows[2][axis]) / (h * h);
      expect(Math.abs(left - right)).toBeLessThan(.001);
      expect(Math.abs(a - b)).toBeLessThan(.1);
    }
  }
});


test("an interrupted bend preserves the live camera when a far jump changes its heading lead", () => {
  const rest = at(createTrackFrame(), 0, 0, {}), entered = at(rest, 1, 0, {});
  const moving = at(entered, 1, 1, {}), jump = at(moving, 18, 0, {});
  moving.values.slice(0, 8).forEach((value, axis) => expect(jump.values[axis]).toBeCloseTo(value, 9));
  const landing = at(jump, 18, 1.5, {}), back = at(landing, 0, 0, {});
  landing.values.slice(0, 8).forEach((value, axis) => expect(back.values[axis]).toBeCloseTo(value, 9));
});


test("a fast jump blends endpoint framing without looking at every skipped layout", () => {
  const track: WorldTrack = { course: Array.from({ length: 19 }, (_, i) => ({ spacing: 50,
    position: [i % 2 ? -1.2 : -.8, i % 2 ? 4.6 : 2.5, i % 3 ? 11.6 : 26] })) };
  const start = at(at(createTrackFrame(), 0, 0, track), 18, 0, track);
  const frames = Array.from({ length: 109 }, (_, i) => at(start, 18, i / 60, track));
  const velocity = differences(frames.map(angles)), acceleration = differences(velocity);
  expect(peak(velocity)).toBeLessThan(.15);
  expect(peak(acceleration)).toBeLessThan(.1);
  expect(peak(differences(acceleration))).toBeLessThan(.2);
  expect(frames[90].cursor).toBe(18);
});


test("leaving a held orbit spreads its angular motion over the full flight", () => {
  const track: WorldTrack = { spacing: 50, duration: 2.3, turn: 8, rise: .15, bank: 1, steps: { 1: { orbit: 30, duration: 1.6 } } };
  const rest = at(createTrackFrame(), 0, 0, track), held = at(rest, 0, 2, track, 1), start = at(held, 1, 0, track);
  const frames = Array.from({ length: 157 }, (_, i) => at(start, 1, i / 60, track));
  const velocity = differences(frames.map(angles)), acceleration = differences(velocity);
  expect(peak(velocity)).toBeLessThan(1.2);
  expect(peak(acceleration)).toBeLessThan(.1);
  expect(peak(differences(acceleration))).toBeLessThan(.03);
});

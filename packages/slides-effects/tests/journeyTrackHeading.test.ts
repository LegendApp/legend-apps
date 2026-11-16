// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { journeyBindings } from "../packs/journey/render";
import { instanceField, primitive, prepareJourneyScene, sampleJourneyUniforms, journeyHeaderSize, journeyLightCountSlot, journeyLightOffsetSlot } from "../packs/journey/scene";
import { buildCourse, createTrackFrame, sampleTrackFrame, trackBendSlot, trackHeadingSlot, trackSlope, trackX, type TrackFrame, type JourneyTrack } from "../packs/journey/track";

const scene = prepareJourneyScene({ instances: [] });
const track: JourneyTrack = { turnMode: "heading", duration: 1.2, ease: "inOut", course: [
  {}, { spacing: 72, turn: 8, duration: 1.2 }, { spacing: 72, turn: 0, duration: 1.2 },
  { spacing: 72, turn: 8, duration: 1.2 }, { spacing: 72, turn: -16, duration: 1.2 },
] };
function at(previous: TrackFrame, slide: number, time: number, options = track, step = 0) {
  const state = { ...createPlaybackState({ phase: "playing", slideKey: String(slide), stepKey: String(step), stepIndex: step }), slideTime: time, stepTime: time };
  return sampleTrackFrame(previous, sampleJourneyUniforms(scene, state) as number[], [], state, options);
}
const heading = (course: ReturnType<typeof buildCourse>, z: number) => Math.atan(-trackSlope(course, z)) * 180 / Math.PI;
const yaw = (frame: TrackFrame) => Math.atan2(frame.values[4] - frame.values[0], frame.values[2] - frame.values[6]);

// Execute the scalar WGSL bodies, including their actual finite-window reads.
function shader(uniforms: ArrayLike<number>) {
  const code = journeyBindings.slice(journeyBindings.indexOf("fn trackCurve"), journeyBindings.indexOf("// Parts are sampled"))
    .replace(/fn (\w+)\(([^)]*)\)->f32/g, (_, name, args) => `function ${name}(${args.replace(/:\w+/g, "")})`)
    .replace(/\bvar\b/g, "let").replace(/(\d)u\b/g, "$1");
  return Function("uniforms", "clamp", "abs", "max", "u32", `${code};return {trackX,trackSlope};`)(uniforms,
    (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)), Math.abs, Math.max, Math.trunc);
}

test("heading bends retain their direction through straights and turn monotonically into the next heading", () => {
  const course = buildCourse(track, 5);
  expect(heading(course, -72)).toBeCloseTo(8, 9);
  expect(heading(course, -110)).toBeCloseTo(8, 9);
  expect(heading(course, -216)).toBeCloseTo(16, 9);
  expect(heading(course, -288)).toBeCloseTo(0, 9);
  for (let k = 1; k < 5; k++) {
    let prior = heading(course, course.from[k]);
    for (let i = 1; i <= 100; i++) {
      const z = course.from[k] + (course.to[k] - course.from[k]) * i / 100, next = heading(course, z);
      expect((next - prior) * Math.sign(track.course![k]!.turn!)).toBeGreaterThanOrEqual(-1e-10);
      expect(trackSlope(course, z)).toBeCloseTo((trackX(course, z + .0001) - trackX(course, z - .0001)) / .0002, 6);
      prior = next;
    }
    expect(trackX(course, -course.offset[k])).toBeCloseTo(course.x[k], 9);
  }
});

test("heading joins preserve slope and curvature, while swing remains the default", () => {
  const course = buildCourse(track, 5), h = .001;
  for (let k = 1; k < 5; k++) for (const z of [course.from[k], course.to[k]]) {
    expect(trackSlope(course, z - h)).toBeCloseTo(trackSlope(course, z + h), 8);
    expect((trackSlope(course, z + h) - trackSlope(course, z)) / h).toBeCloseTo((trackSlope(course, z) - trackSlope(course, z - h)) / h, 6);
  }
  const legacy = buildCourse({ ...track, turnMode: undefined }, 5);
  expect(heading(legacy, -72)).toBeCloseTo(0, 9);
  expect(legacy).toEqual(buildCourse({ ...track, turnMode: "swing" }, 5));
  expect(() => buildCourse({ turnMode: "heading", turn: 40 }, 4)).toThrow("60 degrees");
});

test("framing changes follow one bend or straight without camera heading corrections, including reverse and interruption", () => {
  const options: JourneyTrack = { ...track, course: track.course!.map((leg, i) => ({ ...leg, position: [i % 2 ? -1.3 : -.6, 4, i % 2 ? 15 : 12] })) };
  let rest = at(createTrackFrame(), 0, 0, options);
  for (let slide = 1; slide < 5; slide++) {
    const start = at(rest, slide, 0, options), frames = Array.from({ length: 121 }, (_, i) => at(start, slide, i / 100, options));
    const direction = Math.sign(yaw(frames[120]) - yaw(frames[0]));
    const back = at(frames[120], slide - 1, 0, options);
    for (let i = 1; i <= 120; i++) {
      expect((yaw(frames[i]) - yaw(frames[i - 1])) * direction).toBeGreaterThanOrEqual(-1e-10);
      expect(frames[i].values[2]).toBeLessThanOrEqual(frames[i - 1].values[2]);
      at(back, slide - 1, (120 - i) / 100, options).values.slice(0, 8).forEach((value, axis) => expect(value).toBeCloseTo(frames[i].values[axis], 7));
      if (slide === 2) {
        const u = (frames[i].values[2] - frames[0].values[2]) / (frames[120].values[2] - frames[0].values[2]);
        expect(frames[i].values[0]).toBeCloseTo(frames[0].values[0] + (frames[120].values[0] - frames[0].values[0]) * u, 8);
        expect(frames[i].values[7]).toBe(0);
      }
    }
    const middle = frames[43], interrupted = at(middle, slide - 1, 0, options);
    expect(interrupted.values.slice(0, 8)).toEqual(middle.values.slice(0, 8));
    rest = frames[120];
  }
});

test.each(["swing", "heading"] as const)("WGSL %s positions and normals preserve pooled lights and appended storage", (turnMode: "swing" | "heading") => {
  const options: JourneyTrack = { ...track, turnMode, course: Array.from({ length: 36 }, (_, i) => ({ spacing: 72, turn: i % 4 === 1 ? 8 : i % 4 === 3 ? -8 : 0 })) };
  const lit = prepareJourneyScene({ instances: [], lights: [{ position: [10, 5, -6], target: [3, 0, -8], intensity: 20 }] });
  for (const slide of [0, 3, 10, 25, 34]) {
    const state = { ...createPlaybackState({ phase: "playing", slideKey: String(slide), stepKey: "0", stepIndex: 0 }), slideTime: 0, stepTime: 0 };
    const raw = sampleJourneyUniforms(lit, state), input = Float32Array.from([...raw, 941, 942, 943]);
    const frame = sampleTrackFrame(createTrackFrame(), input as unknown as number[], [], state, options), values = frame.values, gpu = shader(values), course = frame.course!;
    expect(values.length).toBe(input.length);
    expect(Array.from(input.slice(-3))).toEqual([941, 942, 943]);
    expect(Array.from(values.slice(-3))).toEqual([941, 942, 943]);
    expect(values[trackHeadingSlot + 2]).toBe(turnMode === "heading" ? 1 : 0);
    expect(Math.abs(values[trackBendSlot + 1])).toBeLessThanOrEqual(8);
    expect(trackHeadingSlot + 2).toBeLessThan(journeyHeaderSize);
    const count = Math.abs(values[trackBendSlot + 1]), from = values[trackBendSlot + 2], to = values[trackBendSlot + 3 + (count - 1) * 3];
    for (let i = 0; i <= 200; i++) {
      const z = from + (to - from) * i / 200;
      expect(Math.abs(gpu.trackX(z) - trackX(course, z))).toBeLessThan(.0003);
      expect(Math.abs(gpu.trackSlope(z) - trackSlope(course, z))).toBeLessThan(.00001);
      // The transformed normal remains perpendicular to the sheared depth tangent.
      expect(Math.abs((gpu.trackX(z + .001) - gpu.trackX(z - .001)) / .002 - gpu.trackSlope(z))).toBeLessThan(.00001);
    }
    expect(values[0]).toBeCloseTo(trackX(course, values[2]), 4);
    const base = values[journeyLightOffsetSlot], z = raw[base + 2] - course.offset[slide];
    expect(values[journeyLightCountSlot]).toBe(1);
    expect(base).toBeGreaterThanOrEqual(journeyHeaderSize);
    expect(values[base]).toBeCloseTo(raw[base] + trackX(course, z), 4);
    expect(values[base + 2]).toBeCloseTo(z, 4);
  }
});

test("heading courses stay finite through a stepped long reverse arrival", () => {
  const options: JourneyTrack = { ...track, course: Array.from({ length: 36 }, (_, i) => ({ spacing: 72, turn: i % 2 ? 6 : -6 })) };
  let frame = at(at(createTrackFrame(), 34, 0, options), 10, 0, options);
  for (const [step, time] of [[0, 1.3], [1, 1.31], [0, 1.35], [1, 1.4], [1, 1.5]]) {
    const prior = frame;
    frame = at(frame, 10, time, options, step);
    expect(frame.course!.duration.length).toBeGreaterThan(34);
    expect(frame.cursor).toBeLessThanOrEqual(prior.cursor);
    expect([...frame.values.slice(0, 8), frame.values[32]].every(Number.isFinite)).toBe(true);
  }
  expect(frame.cursor).toBe(10);
});


test("leaving an explicit focus uses the bent destination plane for focus and automatic sharp routing", () => {
  const prepared = prepareJourneyScene({ instances: [primitive("box", { id: "content", position: [0, 0, 0] })] });
  const options: JourneyTrack = { ...track, course: [{}, { spacing: 72, turn: 20 }, { spacing: 72, turn: 0 }] };
  const sample = (previous: TrackFrame, slide: number, time: number, focus?: number) => {
    const state = { ...createPlaybackState({ phase: "playing", slideKey: String(slide), stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleJourneyUniforms(prepared, state) as number[], ["box:content"], state, { ...options, focus });
  };
  const held = sample(createTrackFrame(), 1, 0, 10), start = sample(held, 2, 0), end = sample(start, 2, 5), v = end.values;
  expect(v[32]).toBeCloseTo(Math.hypot(v[4] - v[0], v[5] - v[1], v[6] - v[2]), 8);
  expect(v[journeyHeaderSize + instanceField.sharp]).toBe(1);
});


test.each([[0, 10], [0, 34], [34, 10], [34, 0]])("heading jumps from %s to %s settle at the ordinary destination pose", (origin, destination) => {
  const options: JourneyTrack = { ...track, course: Array.from({ length: 36 }, (_, i) => ({ spacing: 72, turn: [0, 6, 6, 0, -6, -6, 0][i % 7] })) };
  const held = at(createTrackFrame(), origin, 0, options), direct = at(createTrackFrame(), destination, 0, options);
  let frame = at(held, destination, 0, options);
  held.values.slice(0, 8).forEach((value, axis) => expect(frame.values[axis]).toBeCloseTo(value, 8));
  for (const time of [.3, .6, 1.2, 1.5, 8]) {
    frame = at(frame, destination, time, options);
    expect(frame.values.slice(0, 8).every(Number.isFinite)).toBe(true);
    if (time >= 1.5) {
      expect(frame.cursor).toBe(destination);
      for (const axis of [0, 1, 2, 3, 4, 5, 6, 7, 32]) expect(frame.values[axis]).toBeCloseTo(direct.values[axis], 7);
    }
  }
  const moving = at(at(held, destination, 0, options), destination, .6, options);
  const interrupted = at(moving, origin, 0, options);
  moving.values.slice(0, 8).forEach((value, axis) => expect(interrupted.values[axis]).toBeCloseTo(value, 8));
});

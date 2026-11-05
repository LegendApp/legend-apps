// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { compileDeck } from "../../presentation/src/compiler";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { cardInstances, customInstances, instanceField, keyframeSpans, labelInstance, prepareWorldScene, primitive, sampleWorldUniforms, settledKey, travelSpeedSlot, worldClockOffset, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { buildCourse, createTrackFrame, heldBlurSlot, depthFadeSlot, retainTrackScene, sampleTrackFrame, trackBendSlot, trackIds, trackX, type TrackFrame, type WorldTrack } from "../packs/world/track";
import { sampleWorldClock } from "../packs/world/timing";

const options = { spacing: 32, duration: 2 };
const scene = (column = false, extra = false) => prepareWorldScene({ instances: [
  ...cardInstances({ id: "sample", title: "const a = 24", avatar: 0, titleOpacity: column ? 0 : 1,
    position: column ? [3, -1, 0] : [-3, 1, 0], scale: column ? [1, 5, 1] : [4, 1.5, 0.2] }),
  ...extra ? cardInstances({ id: "new", title: "B", position: [6, 0, 0] }) : [],
] });
function sample(previous: TrackFrame, time: number, slide = "0", column = false, phase: "playing" | "preview" | "preparing" | "paused" | "outgoing" = "playing", step = "0", extra = false) {
  const playback = { ...createPlaybackState({ phase, slideKey: slide, stepKey: step, stepIndex: Number(step) }), slideTime: time, stepTime: time };
  const prepared = scene(column, extra);
  return sampleTrackFrame(previous, sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, options);
}
const part = (frame: TrackFrame, id: string) => frame.values.slice(worldHeaderSize + frame.ids.indexOf(id) * worldInstanceSize);

test("a panel and its label become a column continuously by id, while the camera travels between stations", () => {
  let frame = sample(createTrackFrame(), 0);
  frame = sample(frame, 3);
  expect(frame.cursor).toBe(0);
  expect(part(frame, "card:sample")[23]).toBe(1);
  const start = frame;
  frame = sample(frame, 0, "1", true);
  expect(frame.cursor).toBe(start.cursor);
  expect(part(frame, "card:sample").slice(0, 11)).toEqual(part(start, "card:sample").slice(0, 11));
  expect(part(frame, "label:sample:title").slice(0, 8)).toEqual(part(start, "label:sample:title").slice(0, 8));
  frame = sample(frame, 1, "1", true);
  expect(frame.cursor).toBeCloseTo(0.5);
  expect(part(frame, "card:sample")[0]).toBeCloseTo(0);
  [2.5, 3.25, 0.6].forEach((value, axis) => expect(part(frame, "card:sample")[8 + axis]).toBeCloseTo(value));
  expect(part(frame, "label:sample:title")[23]).toBeCloseTo(0.5);
  expect(part(frame, "label:sample:title")[3]).toBeCloseTo(part(start, "label:sample:title")[3] / 2);
  frame = sample(frame, 2, "1", true);
  expect(part(frame, "card:sample").slice(8, 11)).toEqual([1, 5, 1]);
  expect(part(frame, "label:sample:title")[23]).toBe(0);
  expect(part(frame, "label:sample:title")[3]).toBe(0);
  expect(frame.values[1]).toBe(3.6);
});

test("the camera holds exactly at stations and steps do not move it", () => {
  const first = sample(createTrackFrame(), 0);
  expect(sample(first, 0.2).values.slice(0, 8)).toEqual(first.values.slice(0, 8));
  expect(sample(first, 300).values.slice(0, 8)).toEqual(first.values.slice(0, 8));
  const entered = sample(first, 0, "1", true);
  const settled = sample(entered, 2, "1", true);
  expect(sample(settled, 300, "1", true).values.slice(0, 8)).toEqual(settled.values.slice(0, 8));
  expect(sample(settled, 2, "1", true, "playing", "1").values.slice(0, 8)).toEqual(settled.values.slice(0, 8));
});

test("Previous retraces the authored rail, including after an interrupted move", () => {
  const first = sample(createTrackFrame(), 0);
  const entered = sample(first, 0, "1", true);
  const forward = Array.from({ length: 61 }, (_, i) => sample(entered, i / 30, "1", true));
  const reverse = sample(forward[60], 0, "0:again");
  expect(reverse.values.slice(0, 8)).toEqual(forward[60].values.slice(0, 8));
  for (let i = 0; i <= 60; i++) {
    const back = sample(reverse, i / 30, "0:again");
    forward[60 - i].values.slice(0, 8).forEach((value, field) => expect(back.values[field]).toBeCloseTo(value, 9));
  }
  const middle = forward[30];
  const reversed = sample(middle, 0, "0:again");
  expect(reversed.values.slice(0, 8)).toEqual(middle.values.slice(0, 8));
  const halfwayBack = sample(reversed, 1, "0:again");
  expect(halfwayBack.cursor).toBeCloseTo(0.25);
  const quarterProgress = 0.359436164789647;
  const outbound = sample(entered, 2 * quarterProgress, "1", true);
  expect(outbound.cursor).toBeCloseTo(0.25, 9);
  halfwayBack.values.slice(0, 8).forEach((value, field) => expect(value).toBeCloseTo(outbound.values[field], 9));
  expect(sample(reversed, 2, "0:again").values.slice(0, 8)).toEqual(first.values.slice(0, 8));
});

test("a cold jump uses all intervening rail segments and returns to the original station", () => {
  const first = sample(createTrackFrame(), 0);
  const jump = sample(first, 0, "4", true);
  expect(jump.values.slice(0, 8)).toEqual(first.values.slice(0, 8));
  // However far the jump, it takes at most 1.5 s.
  expect(sample(jump, 0.75, "4", true).cursor).toBe(2);
  const settled = sample(jump, 1.5, "4", true);
  expect(settled.values[2]).toBe(-114);
  const back = sample(settled, 0, "0:again");
  expect(sample(back, 1.5, "0:again").values.slice(0, 8)).toEqual(first.values.slice(0, 8));
});

test("default motion has a quintic flight, a mid-travel rise, 40 degree FOV and level stations", () => {
  const prepared = scene();
  const at = (previous: TrackFrame, slideKey: string, time: number, track: WorldTrack = { turn: 0, rise: 1, duration: 1.7, spacing: 32 }) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, playback) as number[], trackIds(prepared), playback, track);
  };
  const first = at(createTrackFrame(), "0", 0), start = at(first, "1", 0);
  const middle = at(start, "1", 0.85);
  expect(middle.values.slice(0, 3)).toEqual([0, 4.6, -2]);
  expect(middle.values.slice(4, 8)).toEqual([0, 0, -16, 0]);
  expect(middle.values[3]).toBe(Math.tan(40 * Math.PI / 360));
  expect(at(start, "1", 0.425).cursor).toBe(0.103515625);
  expect(at(start, "1", 1.7).values.slice(0, 3)).toEqual([0, 3.6, -18]);
});

test("unannotated slides each take a different leg of one continuous track", () => {
  const course = buildCourse({}, 12);
  const sides = buildCourse({}, 61).dx.slice(1).map(Math.sign);
  for (const side of [-1, 0, 1]) expect(sides.filter(value => value === side)).toHaveLength(20);
  for (let k = 1; k < sides.length; k++) expect(sides[k] * sides[k - 1]).toBeGreaterThanOrEqual(0);
  const legs = course.dx.slice(1).map((dx, i) => [Math.round(dx * 10), Math.round(course.rise[i + 1] * 10), Math.round(course.duration[i + 1] * 100)].join());
  expect(new Set(legs).size).toBe(legs.length);
  expect(buildCourse({}, 12)).toEqual(course);
  for (let k = 1; k < 12; k++) if (course.dx[k] === 0) expect([course.bank[k], course.rise[k]]).toEqual([0, 0]);
  for (let k = 1; k < 12; k++) {
    // Curves stay clear of the stations: each station's content and resting camera sit on a straight.
    expect(trackX(course, -course.offset[k])).toBeCloseTo(course.x[k], 9);
    expect(trackX(course, -course.offset[k] + 14)).toBeCloseTo(course.x[k], 9);
    expect(trackX(course, -course.offset[k] - 4)).toBeCloseTo(course.x[k], 9);
  }
});

test("authored legs set turn, rise, length and pace; the camera and bend window follow the curve and hold level", () => {
  const course: WorldTrack["course"] = [undefined, { turn: 30, rise: 2, spacing: 40, duration: 1, bank: 6 }, { turn: -20, rise: -1 }];
  const track: WorldTrack = { course };
  const prepared = scene();
  const at = (previous: TrackFrame, slideKey: string, time: number) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, playback) as number[], trackIds(prepared), playback, track);
  };
  const built = buildCourse(track, 4);
  expect(built.offset[1]).toBe(40);
  expect(built.dx[1]).toBeCloseTo(Math.tan(Math.PI / 6) * (-4 - (-40 + 15)) / 1.875);
  expect(Math.sign(built.dx[2])).toBe(-1);
  const first = at(createTrackFrame(), "0", 0), start = at(first, "1", 0);
  const frames = Array.from({ length: 31 }, (_, i) => at(start, "1", i / 30));
  const settled = frames[30];
  expect(settled.values.slice(0, 3).map(v => +v.toFixed(9))).toEqual([+built.x[1].toFixed(9), 3.6, -26]);
  expect(settled.values[4]).toBeCloseTo(built.x[1], 9);
  expect(settled.values[7]).toBe(0);
  expect(settled.straight!.slice(0, 3)).toEqual([0, 3.6, -26]);
  // Always forward; leaning right through the right-hand curve, then level again.
  frames.slice(1).forEach((frame, i) => expect(frame.values[2]).toBeLessThanOrEqual(frames[i].values[2]));
  expect(Math.max(...frames.map(frame => Math.abs(frame.values[7])))).toBeGreaterThan(0.05);
  expect(Math.max(...frames.map(frame => frame.values[1]))).toBeGreaterThan(5);
  expect(settled.values[trackBendSlot]).toBe(0);
  expect(settled.values[trackBendSlot + 1]).toBeGreaterThan(1);
  expect(settled.values.slice(trackBendSlot + 2, trackBendSlot + 5)).toEqual([built.from[1], built.to[1], built.dx[1]]);
  // Previous retraces the same bent path.
  const back = at(settled, "0:again", 0);
  for (let i = 0; i <= 30; i++) at(back, "0:again", i / 30).values.slice(0, 8).forEach((value, field) => expect(value).toBeCloseTo(frames[30 - i].values[field], 9));
});

test("per-slide camera and look controls, durations and object morphs are retained on reverse", () => {
  const at = (previous: TrackFrame, slideKey: string, time: number, track: WorldTrack) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    const prepared = scene(slideKey === "1");
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, playback) as number[], trackIds(prepared), playback, track);
  };
  const first = at(createTrackFrame(), "0", 0, {});
  const start = at(first, "1", 0, { duration: 2, spacing: 32, turn: 0,
    position: [-2, 4, 14], target: [1, 1, 0], via: [6, 8, 20], viaTarget: [2, 4, 12] });
  const forward = at(start, "1", 1, {});
  expect(forward.values.slice(0, 3)).toEqual([2.5, 5.9, -7]);
  expect(forward.values.slice(4, 7)).toEqual([1.25, 2.25, -18]);
  const settled = at(start, "1", 2, {});
  const back = at(settled, "0:again", 0, {});
  const middle = at(back, "0:again", 1, {});
  expect(middle.values.slice(0, 8)).toEqual(forward.values.slice(0, 8));
  part(forward, "card:sample").slice(0, 11).forEach((value, field) => expect(part(middle, "card:sample")[field]).toBeCloseTo(value, 12));
  expect(at(back, "0:again", 2, {}).values.slice(0, 8)).toEqual(first.values.slice(0, 8));
});

test("static previews and preparation do not mutate live continuity; paused and outgoing freeze", () => {
  let live = sample(sample(createTrackFrame(), 0), 3);
  live = sample(sample(live, 0, "1", true), 1, "1", true);
  const original = structuredClone(live);
  expect(sample(live, 0, "9", false, "preview").values).toEqual(sample(live, 300, "9", false, "preview").values);
  expect(sample(live, 0, "9", false, "preparing").cursor).toBe(0);
  expect(sample(live, 300, "9", false, "paused")).toBe(live);
  expect(sample(live, 300, "9", false, "outgoing")).toBe(live);
  expect(live).toEqual(original);
});

test("new ids fade in and duplicate declarations are rejected", () => {
  const live = sample(sample(createTrackFrame(), 0), 3);
  const start = sample(live, 0, "1", true, "playing", "0", true);
  expect(part(start, "card:new")[23]).toBe(0);
  const middle = sample(start, 1, "1", true, "playing", "0", true);
  expect(part(middle, "card:new")[23]).toBeCloseTo(0.5);
  expect(() => prepareWorldScene({ instances: [...cardInstances({ id: "same" }), ...cardInstances({ id: "same" })] })).toThrow("duplicated");
});

test("matching follows ids across reordered draw slots; tube endpoints share station coordinates", () => {
  const clock = (slideKey: string, time: number) => ({ ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time });
  const first = prepareWorldScene({ instances: [primitive("box", { id: "a", position: [-4, 0, 0] }), primitive("box", { id: "b", position: [4, 0, 0] })] });
  const next = prepareWorldScene({ keyLight: {}, lights: [{ position: [0, 6, 4] }], instances: [primitive("box", { id: "b", position: [8, 0, 0] }), primitive("box", { id: "a", position: [-8, 0, 0] }),
    primitive("tube", { position: [-8, 0, 0], end: [8, 0, 0] })] });
  const sampleScene = (previous: TrackFrame, prepared: typeof first, slide: string, time: number) =>
    sampleTrackFrame(previous, sampleWorldUniforms(prepared, clock(slide, time)) as number[], trackIds(prepared), clock(slide, time), options);
  const start = sampleScene(createTrackFrame(), first, "0", 0);
  const entered = sampleScene(start, next, "1", 0);
  expect(part(entered, "box:a")[0]).toBe(-4);
  expect(part(entered, "box:b")[0]).toBe(4);
  const settled = sampleScene(entered, next, "1", 2);
  expect(part(settled, "box:a")[0]).toBe(-8);
  expect(part(settled, "tube:")[2]).toBe(-32);
  expect(part(settled, "tube:")[14]).toBe(-32);
  expect(settled.values[122]).toBe(-32);
  expect(settled.values[114]).toBe(-20);
  expect(settled.values[66]).toBe(-28);
});

test("omitted objects fade at their last pose, then return only when declared", () => {
  const initial = prepareWorldScene({ instances: [primitive("box", { id: "marker", position: [-5, 0, 0] }),
    primitive("tube", { id: "rail", position: [0, 0, 0], end: [0, 0, -64] })] });
  const empty = prepareWorldScene({ instances: [] });
  const retained = retainTrackScene(empty, initial);
  const at = (previous: TrackFrame, scene: typeof initial, slideKey: string, time: number, declared: string[]) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(scene, playback) as number[], trackIds(scene), playback, options, declared);
  };
  const first = at(createTrackFrame(), initial, "0", 0, trackIds(initial));
  const start = at(first, retained, "1", 0, []);
  const stillVisible = at(start, retained, "1", 0.5, []);
  expect(part(stillVisible, "box:marker").slice(0, 11)).toEqual(part(first, "box:marker").slice(0, 11));
  expect(part(stillVisible, "box:marker")[23]).toBeCloseTo(0.9375);
  // Still ahead of the camera, but too close to the lens to stay.
  expect(part(at(start, retained, "1", .86, []), "box:marker")[23]).toBe(0);
  const passed = at(start, retained, "1", 2, []);
  expect(part(passed, "box:marker")[23]).toBe(0);
  expect(part(passed, "tube:rail")[23]).toBe(0);
  const farther = at(passed, retained, "2", 0, []);
  const end = at(farther, retained, "2", 2, []);
  const reverse = at(end, retained, "0:again", 0, []);
  const restored = at(reverse, retained, "0:again", 4, []);
  expect(part(restored, "box:marker")[23]).toBe(0);
  expect(first.retired).toEqual({});
  const reenter = at(restored, initial, "0:new", 0, trackIds(initial));
  const declaredAgain = at(reenter, initial, "0:new", 2, trackIds(initial));
  expect(part(declaredAgain, "box:marker")[23]).toBe(1);
  expect(retainTrackScene(initial, retained).instances).toHaveLength(2);
});

test("the generic MDX deck compiles three local slide components against the installed World API", async () => {
  const file = fileURLToPath(new URL("../../../apps/slides/examples/3d/world-continuity.mdx", import.meta.url));
  const result = await compileDeck(file);
  if (!result.success) throw new Error(result.errors.join("\n"));
  expect(result.noteTargets).toHaveLength(3);
  expect(result.effectPackIds).toEqual(["world"]);
  expect(result.warnings ?? []).toEqual([]);
}, 30000);

const worldTrack: WorldTrack = { spacing: 32, duration: 2, frame: "world", carry: { lift: 4, stagger: 0.25 } };
const cut = (a: [number, number, number], b: [number, number, number]) => [{ step: 0, value: a, duration: 0 }, { step: 1, value: b, duration: 0 }];
const carried = prepareWorldScene({ instances: [
  primitive("box", { id: "a/body", position: cut([0, 0, 0], [0, 0, -32]), scale: cut([1, 1, 1], [0, 0, 0]) }),
  primitive("box", { id: "a/rim", position: cut([0, 1, 0], [0, 1, -32]), scale: cut([1, 1, 1], [0, 0, 0]) }),
  primitive("box", { id: "still", position: [5, 0, 0] }),
] });
function sampleCarried(previous: TrackFrame, slide: string, stepIndex: number, time: number) {
  const playback = { ...createPlaybackState({ phase: "playing", slideKey: slide, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
  const clock = { ...sampleWorldClock(playback, 4, "step", undefined, false, null, 0.3, stepIndex) };
  return sampleTrackFrame(previous, sampleWorldUniforms(carried, clock, null, 1, 1, true) as number[], trackIds(carried), playback, worldTrack);
}
test("a settled part is not rewritten on a step without keyframes, only on one with them", () => {
  const settle = keyframeSpans([{ initial: 0, frames: [{ step: 1, value: 1, duration: 0.5 }, { step: 3, value: 2, duration: 0.5 }] }]);
  const key = (stepIndex: number) => settledKey(settle, { slideTime: 100, stepTime: 50, stepIndex, stepOrigins: {} } as never);
  expect(key(2)).toBe(key(1));
  expect(key(3)).not.toBe(key(2));
});

test("a grouped glyph tilts with its part while a loose one tumbles", () => {
  const ids = ["glyph:a/label:0", "glyph:loose:0", "box:still"], flight = { ...worldTrack, carry: { spin: 40 } };
  const at = (previous: TrackFrame, slide: string, stepIndex: number, time: number) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: slide, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(carried, sampleWorldClock(playback, 4, "step", undefined, false, null, 0.3, stepIndex), null, 1, 1, true) as number[], ids, playback, flight);
  };
  const rest = at(createTrackFrame(), "0", 0, 3), still = (id: string) => [12, 13, 14].map(field => part(rest, id)[field]);
  const resting = { [ids[0]]: still(ids[0]), [ids[1]]: still(ids[1]) };
  const middle = at(at(rest, "1", 1, 0), "1", 1, 1);
  const spun = (id: string) => [12, 13, 14].map((field, axis) => part(middle, id)[field] - resting[id][axis]);
  const grouped = spun(ids[0]), loose = spun(ids[1]);
  expect(grouped.slice(0, 2)).toEqual([0, 0]);
  expect(Math.abs(grouped[2])).toBeCloseTo(10);
  expect(loose[0]).toBeCloseTo(24);
  expect(Math.abs(loose[1])).toBeCloseTo(40);
  expect(loose[2]).toBe(0);
});

const body = (frame: TrackFrame, id = "box:a/body") => Array.from(part(frame, id).slice(0, 24));

test("a world-frame scene carries parts on a bowed path from a cached uniform source, and Previous retraces it", () => {
  const start = sampleCarried(createTrackFrame(), "0", 0, 3);
  expect(body(start)[2]).toBe(0);
  const entered = sampleCarried(start, "1", 1, 0);
  expect(body(entered).slice(0, 3)).toEqual([0, 0, 0]);
  expect(entered.moving.map(slot => entered.ids[slot]).sort()).toEqual(["box:a/body", "box:a/rim"]);
  const middle = sampleCarried(entered, "1", 1, 1);
  expect(body(middle)[1]).toBeGreaterThan(1);
  expect(body(middle)[2]).toBeLessThan(0);
  // Grouped parts share one flight; a part ending hidden keeps its size until it lands.
  expect(body(middle, "box:a/rim")[2]).toBeCloseTo(body(middle)[2]);
  expect(body(middle)[8]).toBeCloseTo(1);
  const landed = sampleCarried(middle, "1", 1, 2);
  expect(body(landed).slice(0, 3)).toEqual([0, 0, -32]);
  expect(body(landed)[8]).toBe(0);
  expect(body(landed, "box:still")[0]).toBe(5);
  const back = sampleCarried(landed, "0", 0, 0);
  expect(body(back).slice(0, 3)).toEqual([0, 0, -32]);
  expect(back.reversed).toBe(true);
  // The flight mirrors in time: same bow at the mirrored moment, in the opposite direction.
  const forward = sampleCarried(entered, "1", 1, 0.6), reverse = sampleCarried(back, "0", 0, 1.4);
  body(forward).slice(0, 3).forEach((value, axis) => expect(body(reverse)[axis]).toBeCloseTo(value));
  expect(sampleCarried(reverse, "0", 0, 2).values[worldHeaderSize + 1 + worldInstanceSize * reverse.ids.indexOf("box:a/body")]).toBe(0);
});

test("a world-frame preview frames its own station, as the audience does when it lands there", () => {
  const prepared = scene();
  const frame = (phase: "playing" | "preview") => {
    const playback = { ...createPlaybackState({ phase, slideKey: "2:0", stepKey: "0:0", stepIndex: 0 }), slideTime: 4, stepTime: 4 };
    return sampleTrackFrame(createTrackFrame(), sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, worldTrack);
  };
  const preview = frame("preview"), landed = frame("playing");
  expect(preview.cursor).toBe(2);
  expect(preview.values.slice(0, worldHeaderSize)).toEqual(landed.values.slice(0, worldHeaderSize));
});

test("a station's ease shapes its flight, and a step camera's ease its move", () => {
  const prepared = scene();
  const at = (previous: TrackFrame, slideKey: string, step: number, time: number, track: WorldTrack) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: String(step), stepIndex: step }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, playback) as number[], trackIds(prepared), playback, track);
  };
  const linear: WorldTrack = { ease: "linear", duration: 1.7 };
  expect(at(at(at(createTrackFrame(), "0", 0, 0, {}), "1", 0, 0, linear), "1", 0, .425, linear).cursor).toBe(.25);
  // An ease-out flight starts fast, and parts carried into the station keep pace with the camera.
  const out: WorldTrack = { ease: "out", duration: 1 };
  const carried = (time: number) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: "1", stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    const column = scene(true), entry = sample(sample(createTrackFrame(), 0), 3);
    const begin = sampleTrackFrame(entry, sampleWorldUniforms(column, { ...playback, slideTime: 0, stepTime: 0 }) as number[], trackIds(column), { ...playback, slideTime: 0, stepTime: 0 }, out);
    return sampleTrackFrame(begin, sampleWorldUniforms(column, playback) as number[], trackIds(column), playback, out);
  };
  const quarter = carried(.25);
  expect(quarter.cursor).toBeCloseTo(1 - .75 ** 3);
  expect(part(quarter, "card:sample")[0]).toBeCloseTo(-3 + 6 * quarter.cursor);
  expect(quarter.values[travelSpeedSlot]).toBeCloseTo(.5625);
  expect(carried(.75).values[travelSpeedSlot]).toBeCloseTo(.0625);
  const step = (ease?: "linear") => { const track: WorldTrack = { position: [0, 4, 10], target: [0, 4, 0], steps: { 1: { orbit: 90, duration: 1, ease } } };
    const start = at(createTrackFrame(), "0", 0, 0, track);
    return at(at(start, "0", 1, 0, track), "0", 1, .25, track).values[0]; };
  expect(step("linear")).toBeGreaterThan(step() + 1);
});

test("step cameras orbit and dolly about the station target, easing from the live camera and back", () => {
  const track: WorldTrack = { spacing: 32, duration: 2, position: [0, 4, 10], target: [0, 4, 0], steps: { 1: { orbit: 90, dolly: .5, fov: 50, duration: 1 } } };
  const prepared = scene();
  const at = (previous: TrackFrame, step: number, time: number) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: "0", stepKey: String(step), stepIndex: step }), slideTime: 10 + time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, track);
  };
  const start = at(createTrackFrame(), 0, 0);
  expect(start.values.slice(0, 3)).toEqual([0, 4, 10]);
  const begun = at(start, 1, 0);
  expect(begun.values.slice(0, 7)).toEqual(start.values.slice(0, 7));
  const orbited = at(begun, 1, 1);
  [5, 4, 0].forEach((value, axis) => expect(orbited.values[axis]).toBeCloseTo(value));
  expect(orbited.values[3]).toBeCloseTo(Math.tan(25 * Math.PI / 180));
  expect(orbited.values[32]).toBeCloseTo(5);
  const halfway = at(begun, 1, .5).values;
  expect(halfway[0]).toBeGreaterThan(0);
  expect(halfway[0]).toBeLessThan(5);
  const back = at(at(orbited, 0, 0), 0, 2);
  [0, 4, 10].forEach((value, axis) => expect(back.values[axis]).toBeCloseTo(value));
});

test("retained parts do not pile up across slides: only the previous slide's omitted parts stay", () => {
  const slide = (id: string) => prepareWorldScene({ instances: [primitive("box", { id })] });
  const a = slide("a"), b = slide("b"), c = slide("c");
  const second = retainTrackScene(b, a);
  expect(second.instances.map(part => part.id)).toEqual(["b", "a"]);
  expect(retainTrackScene(c, second, b).instances.map(part => part.id)).toEqual(["c", "b"]);
});

test("station-frame caching matches fresh sampling across steps, navigation and reverse without transforming the input", () => {
  const a = scene(), b = retainTrackScene(scene(true, true), a);
  let cached = createTrackFrame(), fresh = createTrackFrame();
  for (const [prepared, slideKey, stepKey, time] of [
    [a, "0", "0", 0], [a, "0", "0", 2], [b, "1", "0", 0], [b, "1", "0", 1], [b, "1", "0", 3],
    [b, "1", "1", 0], [b, "1", "1", 3], [a, "0:again", "0", 0], [a, "0:again", "0", 1], [a, "0:again", "0", 3],
  ] as const) {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey, stepIndex: Number(stepKey) }), slideTime: time, stepTime: time };
    const input = sampleWorldUniforms(prepared, playback, null, 1, 1, true), original = Array.from(input);
    const ids = trackIds(prepared);
    cached = sampleTrackFrame(cached, input as number[], ids, playback, options, ids);
    fresh = sampleTrackFrame(fresh, sampleWorldUniforms(prepared, playback) as number[], ids, playback, options);
    expect(Array.from(input)).toEqual(original);
    fresh.values.forEach((value, i) => expect(cached.values[i]).toBeCloseTo(value, 4));
  }
});

test("travel speed peaks mid-move, and fixed track parts stay put while the camera passes them", () => {
  const prepared = prepareWorldScene({ instances: [primitive("box", { id: "tunnel:post", position: [0, 0, -4] }), primitive("box", { id: "panel", position: [0, 1, 0] })] });
  const at = (previous: TrackFrame, time: number, slide: string, track: WorldTrack = options) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: slide, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, track);
  };
  const z = (frame: TrackFrame, id: string) => part(frame, id)[2];
  const rest = at(createTrackFrame(), 3, "0");
  expect(rest.values[travelSpeedSlot]).toBe(0);
  const middle = at(at(rest, 0, "1"), 1, "1");
  expect(middle.values[travelSpeedSlot]).toBeCloseTo(1);
  expect(at(at(rest, 0, "1"), .5, "1").values[travelSpeedSlot]).toBeCloseTo(.5625);
  expect(middle.values[travelSpeedSlot + 1]).toBeCloseTo(1);
  expect(at(at(rest, 0, "1", { ...options, blur: 0 }), 1, "1", { ...options, blur: 0 }).values[travelSpeedSlot + 1]).toBe(0);
  expect(z(middle, "box:tunnel:post")).toBe(-4);
  expect(z(middle, "box:panel")).toBeCloseTo(-16);
  const arrived = at(middle, 2, "1");
  expect(arrived.values[travelSpeedSlot]).toBe(0);
  expect(z(arrived, "box:tunnel:post")).toBe(-4);
  expect(z(arrived, "box:panel")).toBe(-32);
  expect(z(at(at(rest, 0, "1", { ...options, fixed: [] }), 2, "1", { ...options, fixed: [] }), "box:tunnel:post")).toBe(-36);
});

test("held stations slow the scenery clock and widen focus blur, easing back to full motion in flight", () => {
  const prepared = scene(), track = { ...options, heldMotion: .1, heldBlur: .5, depthFade: 30, heldFade: .5 };
  const at = (previous: TrackFrame, time: number, slide: string) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: slide, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time, lastTimestamp: 50000 + time * 1000 };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, track);
  };
  const scenery = (frame: TrackFrame) => frame.values[worldClockOffset + 3];
  const start = at(createTrackFrame(), 3, "0");
  expect(scenery(start)).toBeCloseTo(53);
  expect(start.values[heldBlurSlot]).toBe(.5);
  expect(start.values[depthFadeSlot + 1]).toBe(.5);
  const held = at(start, 3.05, "0");
  expect(scenery(held) - scenery(start)).toBeCloseTo(.005);
  const middle = at(at(held, 0.95, "1"), 1, "1");
  expect(middle.values[heldBlurSlot]).toBeCloseTo(0);
  expect(middle.values[depthFadeSlot]).toBe(30);
  expect(middle.values[depthFadeSlot + 1]).toBeCloseTo(0);
  expect(scenery(at(middle, 1.05, "1")) - scenery(middle)).toBeCloseTo(.05);
});

test("fixed scenery nearer than the camera target clears out of the content's way; custom draws are left alone", () => {
  const prepared = prepareWorldScene({ instances: [primitive("box", { id: "tunnel:near", position: [-6, 4, 6] }), primitive("box", { id: "tunnel:plane", position: [-6, 4, 0] }),
    primitive("box", { id: "tunnel:far", position: [-6, 4, -12] }), ...customInstances({ id: "tunnel:lights", vertexCount: 36, wgsl: "" }), primitive("box", { id: "panel", position: [0, 4, 6] })] });
  const playback = { ...createPlaybackState({ phase: "playing", slideKey: "0", stepKey: "0", stepIndex: 0 }), slideTime: 3, stepTime: 3 };
  const frame = sampleTrackFrame(createTrackFrame(), sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, options);
  const opacity = (id: string) => part(frame, id)[23];
  expect(opacity("box:tunnel:near")).toBe(0);
  expect(opacity("box:tunnel:plane")).toBe(0);
  expect(opacity("box:tunnel:far")).toBe(1);
  expect(opacity("custom:tunnel:lights:0")).toBe(1);
  expect(opacity("box:panel")).toBe(1);
});

const boxPose = (id: string, position: [number, number, number]) => primitive("box", { id, position });
const continuityPart = (frame: TrackFrame, id: string) => frame.values.slice(worldHeaderSize + frame.ids.indexOf(`box:${id}`) * worldInstanceSize);
const continuitySample = (previous: TrackFrame, scene: ReturnType<typeof prepareWorldScene>, slideKey: string, time: number, options: WorldTrack = {}, declared = trackIds(scene), stepIndex = 0) => {
  const state = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: String(stepIndex), stepIndex }), slideTime: time, stepTime: time };
  return sampleTrackFrame(previous, sampleWorldUniforms(scene, state) as number[], trackIds(scene), state, { duration: 2, ...options }, declared);
};
test("world-frame omitted parts fade at their final pose", () => {
  const scene = prepareWorldScene({ instances: [boxPose("old", [0, 1, 0])] });
  const next = prepareWorldScene({ instances: [boxPose("next", [0, 1, -32])] });
  const retained = retainTrackScene(next, scene);
  const first = continuitySample(createTrackFrame(), scene, "0", 3, { frame: "world" });
  const start = continuitySample(first, retained, "1", 0, { frame: "world" }, trackIds(next));
  const early = continuitySample(start, retained, "1", .4, { frame: "world" }, trackIds(next));
  expect(continuityPart(early, "old").slice(0, 3)).toEqual(continuityPart(first, "old").slice(0, 3));
  expect(continuityPart(early, "old")[23]).toBeCloseTo(0.968);
  const passed = continuitySample(start, retained, "1", 2, { frame: "world" }, trackIds(next));
  expect(continuityPart(passed, "old")[23]).toBe(0);
});
test("station carry bows shared objects and Previous retraces the flight", () => {
  const scene = prepareWorldScene({ instances: [boxPose("shared", [0, 1, 0])] });
  const options = { carry: { lift: 4, spread: 2, stagger: .2 } };
  const first = continuitySample(createTrackFrame(), scene, "0", 3, options);
  const entered = continuitySample(first, scene, "1", 0, options);
  const middle = continuitySample(entered, scene, "1", 1, options);
  expect(continuityPart(middle, "shared")[1]).toBeGreaterThan(2);
  const landed = continuitySample(entered, scene, "1", 2, options);
  const reverse = continuitySample(landed, scene, "0:again", 0, options);
  const forward = continuitySample(entered, scene, "1", .7, options);
  const back = continuitySample(reverse, scene, "0:again", 1.3, options);
  continuityPart(forward, "shared").slice(0, 3).forEach((value, i) => expect(continuityPart(back, "shared")[i]).toBeCloseTo(value,6));
});
test("banking holds level at stations and retraces the same roll on Previous", () => {
  const scene = prepareWorldScene({ instances: [] }), options = { bank: 4, duration: 2 };
  const first = continuitySample(createTrackFrame(), scene, "0", 3, options);
  const entered = continuitySample(first, scene, "1", 0, options);
  // The camera banks while it runs through the curve.
  const forward = continuitySample(entered, scene, "1", 1.2, options);
  expect(Math.abs(forward.values[7])).toBeGreaterThan(.01);
  const end = continuitySample(entered, scene, "1", 2, options);
  expect(end.values[7]).toBeCloseTo(0);
  const reverse = continuitySample(end, scene, "0:again", 0, options);
  expect(continuitySample(reverse, scene, "0:again", .8, options).values[7]).toBeCloseTo(forward.values[7]);
  expect(continuitySample(entered, scene, "1", 20, options).values.slice(0, 8)).toEqual(continuitySample(entered, scene, "1", 30, options).values.slice(0, 8));
});

test("leaving an orbit unwinds over the flight without ever backing up", () => {
  const scene = prepareWorldScene({ instances: [] });
  const options = { steps: { 1: { orbit: 30 } } };
  const first = continuitySample(createTrackFrame(), scene, "0", 0, options);
  const orbit = continuitySample(first, scene, "0", 2, options, [], 1);
  const entered = continuitySample(orbit, scene, "1", 0, options);
  let z = entered.values[2];
  for (let i = 1; i <= 100; i++) {
    const frame = continuitySample(entered, scene, "1", i / 50, options);
    expect(frame.values[2]).toBeLessThanOrEqual(z + 1e-6);
    z = frame.values[2];
  }
  const plain = continuitySample(continuitySample(first, scene, "1", 0, {}), scene, "1", 2, {});
  const unwind = continuitySample(entered, scene, "1", 2, options);
  expect(unwind.straight![0]).toBeCloseTo(plain.straight![0], 6);
});

test("Previous retraces the departure from a held step orbit", () => {
  const scene = prepareWorldScene({ instances: [] }), options = { steps: { 1: { orbit: 30 } } };
  const first = continuitySample(createTrackFrame(), scene, "0", 0, options);
  const held = continuitySample(first, scene, "0", 2, options, [], 1);
  const entered = continuitySample(held, scene, "1", 0, options);
  const landed = continuitySample(entered, scene, "1", 2, options);
  const back = continuitySample(landed, scene, "0:again", 0, options, [], 1);
  for (let i = 0; i <= 40; i++) {
    const forward = continuitySample(entered, scene, "1", i / 20, options);
    const reverse = continuitySample(back, scene, "0:again", 2 - i / 20, options, [], 1);
    forward.values.slice(0, 8).forEach((value, field) => expect(reverse.values[field]).toBeCloseTo(value, 6));
  }
});

test.each([false, true])("Previous retraces an unfinished step orbit (returning: %s)", (returning: boolean) => {
  const scene = prepareWorldScene({ instances: [] }), options = { steps: { 1: { orbit: 30 } } };
  const first = continuitySample(createTrackFrame(), scene, "0", 0, options);
  const step = returning ? 0 : 1;
  const origin = returning ? continuitySample(first, scene, "0", 2, options, [], 1) : first;
  const partial = continuitySample(origin, scene, "0", .4, options, [], step);
  const entered = continuitySample(partial, scene, "1", 0, options);
  const landed = continuitySample(entered, scene, "1", 2, options);
  const back = continuitySample(landed, scene, "0:again", 0, options, [], step);
  for (let i = 0; i <= 40; i++) {
    const forward = continuitySample(entered, scene, "1", i / 20, options);
    const reverse = continuitySample(back, scene, "0:again", 2 - i / 20, options, [], step);
    forward.values.slice(0, 8).forEach((value, field) => expect(reverse.values[field]).toBeCloseTo(value, 6));
  }
});

test("fixed environment ids stay in world space while shared station parts carry forward", () => {
  const scene = prepareWorldScene({ instances: [boxPose("environment/post", [0, 2, 0]), boxPose("content", [2, 1, 0])] });
  const options = { fixed: ["environment/"], carry: { lift: 4 }, spacing: 32 };
  const first = continuitySample(createTrackFrame(), scene, "0", 3, options);
  const entered = continuitySample(first, scene, "1", 0, options);
  const middle = continuitySample(entered, scene, "1", 1, options);
  expect(continuityPart(middle, "environment/post").slice(0, 3)).toEqual([0, 2, 0]);
  expect(continuityPart(middle, "content")[2]).toBeCloseTo(-16);
  expect(continuityPart(middle, "content")[1]).toBeGreaterThan(2);
  const end = continuitySample(entered, scene, "1", 2, options);
  expect(continuityPart(end, "environment/post").slice(0, 3)).toEqual([0, 2, 0]);
  const back = continuitySample(end, scene, "0:again", 0, options);
  expect(continuityPart(continuitySample(back, scene, "0:again", 1, options), "environment/post").slice(0, 3)).toEqual([0, 2, 0]);
});

test("station-local step flashes keep their authored timing instead of taking a carry flight", () => {
  const scene = prepareWorldScene({ instances: [primitive("box", { id: "flash", emissive: [
    { step: 0, value: .06 }, { step: 1, value: 1.4, duration: .06 },
  ] })] });
  const options = { carry: { lift: 3 } };
  const first = continuitySample(createTrackFrame(), scene, "0", 3, options);
  const flashed = continuitySample(first, scene, "0", .06, options, trackIds(scene), 1);
  expect(continuityPart(flashed, "flash")[7]).toBeCloseTo(1.4);
});

test("world-frame retirement follows declarations even when retained draw slots keep the same order", () => {
  const both = prepareWorldScene({ instances: [boxPose("a", [0, 1, 0]), boxPose("b", [3, 1, 0])] });
  const next = prepareWorldScene({ instances: [boxPose("a", [0, 1, 0])] });
  const retained = retainTrackScene(next, both), options: WorldTrack = { frame: "world" };
  expect(trackIds(retained)).toEqual(trackIds(both));
  const first = continuitySample(createTrackFrame(), both, "0", 3, options);
  const entered = continuitySample(first, retained, "1", 0, options, trackIds(next));
  expect(continuityPart(entered, "b")[23]).toBe(1);
  expect(continuityPart(continuitySample(entered, retained, "1", 2, options, trackIds(next)), "b")[23]).toBe(0);
});

test("forward then back fades departed content and only the selected station remains visible", () => {
  for (const frame of ["station", "world"] as const) {
    const options = { frame, duration: 2 };
    const a = prepareWorldScene({ instances: [boxPose("a", [0, 1, 0])] });
    const b = prepareWorldScene({ instances: [boxPose("b", [3, 1, frame === "world" ? -32 : 0])] });
    const second = retainTrackScene(b, a);
    const first = continuitySample(createTrackFrame(), a, "0", 3, options);
    const forward = continuitySample(first, second, "1", 0, options, trackIds(b));
    const moving = continuitySample(forward, second, "1", 1, options, trackIds(b));
    const interruptedScene = retainTrackScene(a, second, b, false, moving.visible);
    const returning = continuitySample(moving, interruptedScene, "0:interrupt", 0, options, trackIds(a));
    expect(continuityPart(returning, "a")[23]).toBeCloseTo(continuityPart(moving, "a")[23]);
    const landed = continuitySample(forward, second, "1", 2, options, trackIds(b));
    const backScene = retainTrackScene(a, second, b, false, landed.visible);
    const back = continuitySample(landed, backScene, "0:return", 0, options, trackIds(a));
    expect(continuityPart(back, "b")[23]).toBe(1);
    const halfway = continuitySample(back, backScene, "0:return", 1, options, trackIds(a));
    expect(continuityPart(halfway, "b")[23]).toBeGreaterThan(0);
    expect(continuityPart(halfway, "b")[23]).toBeLessThan(1);
    const interrupted = continuitySample(halfway, backScene, "0:revisit", 0, options, trackIds(a));
    expect(continuityPart(interrupted, "b")[23]).toBeCloseTo(continuityPart(halfway, "b")[23]);
    const settled = continuitySample(halfway, backScene, "0:return", 2, options, trackIds(a));
    expect(continuityPart(settled, "b")[23]).toBe(0);
    expect(settled.visible).toEqual(trackIds(a));
    const step = continuitySample(settled, backScene, "0:return", 0, options, trackIds(a), 1);
    expect(continuityPart(step, "b")[23]).toBe(0);
  }
});

test("focus routes incoming parts sharply and background parts through blur across steps and reverse", () => {
  const scene = prepareWorldScene({ instances: [labelInstance({ id: "near", text: "Near" }),
    labelInstance({ id: "far", text: "Far", position: [0, 0, -12] }),
    ...cardInstances({ id: "panel", title: "Panel" }),
    primitive("box", { id: "force-blur", sharp: false }),
    primitive("sphere", { id: "force-sharp", position: [0, 0, -12], sharp: true })] });
  const options = { position: [0, 0, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number],
    steps: { 1: { shift: [0, 0, -12] as [number, number, number] } } };
  let frame = createTrackFrame();
  for (const step of [0, 1, 0]) {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: "0", stepKey: String(step), stepIndex: step }), slideTime: 3, stepTime: 0 };
    frame = sampleTrackFrame(frame, sampleWorldUniforms(scene, playback, null, 1, 1, true) as number[], trackIds(scene), playback, options);
    expect(part(frame, "label:near")[instanceField.sharp]).toBe(step === 0 ? 1 : 0);
    expect(part(frame, "label:far")[instanceField.sharp]).toBe(step === 1 ? 1 : 0);
    expect(part(frame, "card:panel")[instanceField.sharp]).toBe(step === 0 ? 1 : 0);
    expect(part(frame, "label:panel:title")[instanceField.sharp]).toBe(step === 0 ? 1 : 0);
    expect(part(frame, "box:force-blur")[instanceField.sharp]).toBe(0);
    expect(part(frame, "sphere:force-sharp")[instanceField.sharp]).toBe(1);
  }
});

test("departing parts lose sharpness while incoming focus stays sharp during travel", () => {
  const a = prepareWorldScene({ instances: [labelInstance({ id: "old", text: "Old" })] });
  const b = prepareWorldScene({ instances: [labelInstance({ id: "new", text: "New" })] });
  const playback = (slideKey: string, time: number) => ({ ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0" }), slideTime: time, stepTime: time });
  const first = playback("0", 3);
  let frame = sampleTrackFrame(createTrackFrame(), sampleWorldUniforms(a, first) as number[], trackIds(a), first, {});
  expect(part(frame, "label:old")[instanceField.sharp]).toBe(1);
  const retained = retainTrackScene(b, a), next = playback("1", .2);
  frame = sampleTrackFrame(frame, sampleWorldUniforms(retained, next) as number[], trackIds(retained), next, {}, trackIds(b));
  expect(part(frame, "label:old")[instanceField.sharp]).toBe(0);
  expect(part(frame, "label:new")[instanceField.sharp]).toBe(1);
});

test.each([false, true])("forward re-entry ignores retired slots behind the camera (rapid: %s)", (rapid: boolean) => {
  const options: WorldTrack = { spacing: 32, duration: 2, turn: 0, rise: 0, ease: "out" };
  const a = prepareWorldScene({ instances: [boxPose("returning", [0, 1, 0])] });
  const b = prepareWorldScene({ instances: [boxPose("other", [3, 1, 0])] });
  let scene = a, declared = a;
  let frame = continuitySample(createTrackFrame(), scene, "0", 3, options);
  const go = (target: typeof a, key: string, time: number) => {
    const next = retainTrackScene(target, scene, declared, false, frame.visible);
    frame = continuitySample(frame, next, key, 0, options, trackIds(target));
    frame = continuitySample(frame, next, key, time, options, trackIds(target));
    scene = next; declared = target;
  };
  go(b, "1", 2);
  go(a, "2", 2);
  go(b, "1:back", rapid ? .1 : 2);
  go(a, "0:back", rapid ? .1 : 2);
  go(b, "1:forward", rapid ? .1 : 2);
  go(a, "2:forward", 0);
  const entry = frame;
  for (let i = 1; i <= 120; i++) {
    frame = continuitySample(entry, scene, "2:forward", i / 60, options, trackIds(a));
    const part = continuityPart(frame, "returning");
    if (part[23] > .002) expect(part[2]).toBeLessThan(frame.values[2]);
  }
  expect(continuityPart(frame, "returning")[23]).toBe(1);
  expect(continuityPart(frame, "returning")[2]).toBe(-64);
});

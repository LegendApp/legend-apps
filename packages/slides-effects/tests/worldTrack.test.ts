// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { compileDeck } from "../../presentation/src/compiler";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { cardInstances, keyframeSpans, prepareWorldScene, primitive, sampleWorldUniforms, settledKey, travelSpeedSlot, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, type TrackFrame, type WorldTrack } from "../packs/world/track";
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
  expect(halfwayBack.values.slice(0, 3)).toEqual([0.9375, 4.3125, 3]);
  expect(halfwayBack.values.slice(4, 8)).toEqual([0, 0, -10.25, 0]);
  expect(sample(reversed, 2, "0:again").values.slice(0, 8)).toEqual(first.values.slice(0, 8));
});

test("a cold jump uses all intervening rail segments and returns to the original station", () => {
  const first = sample(createTrackFrame(), 0);
  const jump = sample(first, 0, "4", true);
  expect(jump.values.slice(0, 8)).toEqual(first.values.slice(0, 8));
  expect(sample(jump, 4, "4", true).cursor).toBe(2);
  const settled = sample(jump, 8, "4", true);
  expect(settled.values[2]).toBe(-114);
  const back = sample(settled, 0, "0:again");
  expect(sample(back, 8, "0:again").values.slice(0, 8)).toEqual(first.values.slice(0, 8));
});

test("default motion has a 1.7 second cubic flight, a quadratic rise, 40 degree FOV and zero roll", () => {
  const prepared = scene();
  const at = (previous: TrackFrame, slideKey: string, time: number) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, playback) as number[], trackIds(prepared), playback, {});
  };
  const first = at(createTrackFrame(), "0", 0), start = at(first, "1", 0);
  const middle = at(start, "1", 0.85);
  expect(middle.values.slice(0, 3)).toEqual([1.25, 4.55, -6]);
  expect(middle.values.slice(4, 8)).toEqual([0, 0, -19, 0]);
  expect(middle.values[3]).toBe(Math.tan(40 * Math.PI / 360));
  expect(at(start, "1", 0.425).cursor).toBe(0.0625);
  expect(at(start, "1", 1.7).values.slice(0, 3)).toEqual([0, 3.6, -18]);
});

test("per-slide camera and look controls, durations and object morphs are retained on reverse", () => {
  const at = (previous: TrackFrame, slideKey: string, time: number, track: WorldTrack) => {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    const prepared = scene(slideKey === "1");
    return sampleTrackFrame(previous, sampleWorldUniforms(prepared, playback) as number[], trackIds(prepared), playback, track);
  };
  const first = at(createTrackFrame(), "0", 0, {});
  const start = at(first, "1", 0, { duration: 2,
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

test("omitted objects stay at their last pose until fully behind the camera, then return in place", () => {
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
  expect(part(stillVisible, "box:marker")[23]).toBe(1);
  const passed = at(start, retained, "1", 2, []);
  expect(part(passed, "box:marker")[23]).toBe(0);
  expect(part(passed, "tube:rail")[23]).toBe(1);
  const farther = at(passed, retained, "2", 0, []);
  const end = at(farther, retained, "2", 2, []);
  const reverse = at(end, retained, "0:again", 0, []);
  const restored = at(reverse, retained, "0:again", 4, []);
  expect(part(restored, "box:marker").slice(0, worldInstanceSize)).toEqual(part(first, "box:marker").slice(0, worldInstanceSize));
  expect(first.retired).toEqual({});
  const declaredAgain = at(restored, initial, "0:new", 0, trackIds(initial));
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

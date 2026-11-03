// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { compileDeck } from "../../presentation/src/compiler";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { cardInstances, prepareWorldScene, primitive, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { createTrackFrame, sampleTrackFrame, trackIds, type TrackFrame } from "../packs/world/track";
import { sampleWorldClock } from "../packs/world/timing";

const options = { spacing: 18, duration: 2, cruise: 0.12 };
const scene = (column = false, extra = false) => prepareWorldScene({ instances: [
  ...cardInstances({ id: "sample", title: "const a = 24", avatar: 0, titleOpacity: column ? 0 : 1,
    position: column ? [3, -1, 0] : [-3, 1, 0], scale: column ? [1, 5, 1] : [4, 1.5, 0.2] }),
  ...extra ? cardInstances({ id: "new", title: "B", position: [6, 0, 0] }) : [],
] });
function sample(previous: TrackFrame, time: number, slide = "0", column = false, phase: "playing" | "preview" | "preparing" | "paused" | "outgoing" = "playing", step = "0", extra = false) {
  const playback = { ...createPlaybackState({ phase, slideKey: slide, stepKey: step, stepIndex: Number(step) }), slideTime: time, stepTime: time };
  const prepared = scene(column, extra);
  return sampleTrackFrame(previous, sampleWorldUniforms(prepared, sampleWorldClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, options, 4);
}
const part = (frame: TrackFrame, id: string) => frame.values.slice(worldHeaderSize + frame.ids.indexOf(id) * worldInstanceSize);

test("a panel and its label become a column continuously by id, with a forward-only camera", () => {
  let frame = sample(createTrackFrame(), 0);
  frame = sample(frame, 3);
  expect(frame.distance).toBeCloseTo(0.36);
  expect(part(frame, "card:sample")[23]).toBe(1);
  const start = frame;
  frame = sample(frame, 0, "1", true);
  expect(frame.distance).toBe(start.distance);
  expect(part(frame, "card:sample").slice(0, 11)).toEqual(part(start, "card:sample").slice(0, 11));
  expect(part(frame, "label:sample:title").slice(0, 8)).toEqual(part(start, "label:sample:title").slice(0, 8));
  frame = sample(frame, 1, "1", true);
  expect(frame.distance).toBeCloseTo(9.48);
  expect(part(frame, "card:sample")[0]).toBeCloseTo(0);
  [2.5, 3.25, 0.6].forEach((value, axis) => expect(part(frame, "card:sample")[8 + axis]).toBeCloseTo(value));
  expect(part(frame, "label:sample:title")[23]).toBeCloseTo(0.5);
  expect(part(frame, "label:sample:title")[3]).toBeCloseTo(part(start, "label:sample:title")[3] / 2);
  frame = sample(frame, 2, "1", true);
  expect(part(frame, "card:sample").slice(8, 11)).toEqual([1, 5, 1]);
  expect(part(frame, "label:sample:title")[23]).toBe(0);
  expect(part(frame, "label:sample:title")[3]).toBe(0);
  expect(frame.values[1]).toBe(4);
});

test("Previous, direct jumps, reverse steps and interrupted travel all begin at the last live pose", () => {
  let frame = sample(sample(createTrackFrame(), 0), 3);
  frame = sample(sample(frame, 0, "7", true), 0.7, "7", true);
  for (const [slide, step, column] of [["0", "0", false], ["0", "1", false], ["0", "0:back", true]] as const) {
    const before = frame;
    frame = sample(frame, 0, slide, column, "playing", step);
    expect(frame.values.slice(0, 8)).toEqual(before.values.slice(0, 8));
    expect(part(frame, "card:sample").slice(0, 11)).toEqual(part(before, "card:sample").slice(0, 11));
    for (let tick = 1; tick <= 60; tick++) {
      const distance = frame.distance;
      frame = sample(frame, tick / 60, slide, column, "playing", step);
      expect(frame.distance).toBeGreaterThan(distance);
    }
  }
});

test("static previews and preparation do not mutate live continuity; paused and outgoing freeze", () => {
  let live = sample(sample(createTrackFrame(), 0), 3);
  live = sample(sample(live, 0, "1", true), 1, "1", true);
  const original = structuredClone(live);
  expect(sample(live, 0, "9", false, "preview").values).toEqual(sample(live, 300, "9", false, "preview").values);
  expect(sample(live, 0, "9", false, "preparing").distance).toBe(0);
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
    sampleTrackFrame(previous, sampleWorldUniforms(prepared, clock(slide, time)) as number[], trackIds(prepared), clock(slide, time), options, 4);
  const start = sampleScene(createTrackFrame(), first, "0", 0);
  const entered = sampleScene(start, next, "1", 0);
  expect(part(entered, "box:a")[0]).toBe(-4);
  expect(part(entered, "box:b")[0]).toBe(4);
  const settled = sampleScene(entered, next, "1", 2);
  expect(part(settled, "box:a")[0]).toBe(-8);
  expect(part(settled, "tube:")[2]).toBe(-18);
  expect(part(settled, "tube:")[14]).toBe(-18);
  expect(settled.values[122]).toBe(-18);
  expect(settled.values[114]).toBe(-6);
  expect(settled.values[66]).toBe(-14);
});

test("the generic MDX deck compiles three local slide components against the installed World API", async () => {
  const file = fileURLToPath(new URL("../../../apps/slides/examples/3d/world-continuity.mdx", import.meta.url));
  const result = await compileDeck(file);
  if (!result.success) throw new Error(result.errors.join("\n"));
  expect(result.noteTargets).toHaveLength(3);
  expect(result.effectPackIds).toEqual(["world"]);
  expect(result.warnings ?? []).toEqual([]);
}, 30000);

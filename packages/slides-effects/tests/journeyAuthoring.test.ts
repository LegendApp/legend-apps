// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { compileTrack, instanceField, keyframeSpans, prepareJourneyScene, primitive, sampleJourneyUniforms, sampleTrack, settledKey, journeyHeaderSize, journeyInstanceSize, type Instance } from "../packs/journey/scene";
import { createTrackFrame, sampleTrackFrame, trackAdvance, trackIds, type JourneyTrack, type TrackFrame } from "../packs/journey/track";
import { sampleJourneyClock } from "../packs/journey/timing";
import { pillarInstances } from "../packs/journey/stage";
import { spriteInstance } from "../packs/journey/sprite";
import { buildJourneyGraph, journeyGraphTopology } from "../packs/journey/render";
import { journeyStepOffset } from "../packs/journey/Journey";
import type { Vec3 } from "../packs/journey/camera";

const clock = (stepIndex: number, time: number, origins: Record<number, number> = { [stepIndex]: 0 }) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: origins });
const slot = (scene: ReturnType<typeof prepareJourneyScene>, id: string) => journeyHeaderSize + scene.instances.findIndex(part => part.id === id) * journeyInstanceSize;

test("shapes with a material are matte and rimless unless they opt in; bare shapes keep their glow and rim", () => {
  const scene = prepareJourneyScene({ materials: { stone: { albedo: "#808080" }, lit: { albedo: "#808080", emissive: 2, rim: 1 } }, instances: [
    primitive("box", { id: "bare" }), primitive("box", { id: "matte", material: "stone" }), primitive("box", { id: "glow", material: "stone", emissive: 1.5 }),
    primitive("box", { id: "opted", material: "lit" }), ...pillarInstances({ id: "pillar", value: 1 }).slice(0, 1),
  ] });
  const values = sampleJourneyUniforms(scene, clock(0, 0));
  const field = (id: string, key: keyof typeof instanceField) => values[slot(scene, id) + instanceField[key]];
  expect([field("bare", "emissive"), field("bare", "rim")]).toEqual([1.5, 1]);
  expect([field("matte", "emissive"), field("matte", "rim")]).toEqual([0, 0]);
  expect(field("glow", "emissive")).toBe(1.5);
  expect([field("opted", "emissive"), field("opted", "rim")]).toEqual([2, 1]);
  // Built-in presets keep their cinematic rim.
  expect(field("pillar", "rim")).toBe(1);
});

test("extent sets a shape's full width, height and depth", () => {
  const box = primitive("box", { extent: [2, 0.4, 4] });
  expect(box.size.initial * 2).toBe(1);
  expect(box.scale.initial).toEqual([2, 0.4, 4]);
});

test("Vec3 keyframes bow through arc and via at their midpoint and land exactly", () => {
  const track = compileTrack<Vec3>([{ step: 0, value: [0, 0, 0] }, { step: 1, value: [4, 0, 0], duration: 1, ease: "linear", arc: 2 }]);
  expect(sampleTrack(track, clock(1, 0.5))).toEqual([2, 2, 0]);
  expect(sampleTrack(track, clock(1, 1))).toEqual([4, 0, 0]);
  const via = compileTrack<Vec3>([{ step: 0, value: [0, 0, 0] }, { step: 1, value: [4, 0, 0], duration: 1, ease: "linear", via: [2, 1, 3] }]);
  expect(sampleTrack(via, clock(1, 0.5))).toEqual([2, 1, 3]);
});

test("a looping track never settles, even under the step clock after its step has passed", () => {
  const track = compileTrack<Vec3>([{ step: 0, value: [0, 0, 0], loop: { every: 2, frames: [{ at: 0, value: [0, 360, 0], duration: 2, ease: "linear" }] } }]);
  const spans = keyframeSpans([track]);
  // Step clock on a later slide: only the current step has an origin.
  expect(settledKey(spans, clock(3, 0.5))).toBeNaN();
  const scene = prepareJourneyScene({ instances: [primitive("box", { id: "gem", rotation: [{ step: 0, value: [0, 0, 0], loop: { every: 2, frames: [{ at: 0, value: [0, 360, 0], duration: 2, ease: "linear" }] } }] })] });
  const at = slot(scene, "gem") + instanceField.rotation + 1;
  const first = sampleJourneyUniforms(scene, clock(3, 0.5), null, 1, 1, true)[at];
  const later = sampleJourneyUniforms(scene, clock(3, 1), null, 1, 1, true)[at];
  expect(first).toBeCloseTo(Math.PI / 2);
  expect(later).toBeCloseTo(Math.PI);
});

test("keyframeDuration times keyframes that set no duration", () => {
  const scene = prepareJourneyScene({ keyframeDuration: 1.4, instances: [primitive("box", { id: "hero", position: { 0: [0, 0, 0], 1: [7, 0, 0] } })] });
  const position = scene.instances[0].position;
  expect(position.frames.map(frame => frame.duration)).toEqual([1.4, 1.4]);
  expect(sampleTrack(position, clock(1, 0.7))[0]).toBeCloseTo(3.5);
});

test("auto step offsets add the step counts of a journey's earlier slides", () => {
  expect(journeyStepOffset([0], 0, [1, 2, 1])).toBe(0);
  expect(journeyStepOffset([0, 2], 2, [1, 2, 1, 1])).toBe(3);
  // A journey starting later skips the slides before its first stop.
  expect(journeyStepOffset([2, 4], 4, [5, 5, 2, 1, 1])).toBe(3);
});

test("the rail advances in any direction: a sideways track pans along x without moving in depth", () => {
  expect(trackAdvance({ advance: [2, 0, 0] })).toEqual([1, 0, 0]);
  expect(() => trackAdvance({ advance: [0, 0, 0] })).toThrow();
  const options: JourneyTrack = { frame: "world", advance: [1, 0, 0], spacing: 24, duration: 1, position: [0, 5, 20], target: [0, 3, 0] };
  const prepared = prepareJourneyScene({ instances: [primitive("box", { id: "a" })] });
  function sample(previous: TrackFrame, time: number, slide: string) {
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: slide, stepKey: "0", stepIndex: 0 }), slideTime: time, stepTime: time };
    return sampleTrackFrame(previous, sampleJourneyUniforms(prepared, sampleJourneyClock(playback, 4, "slide", undefined, false)) as number[], trackIds(prepared), playback, options);
  }
  const first = sample(createTrackFrame(), 0, "0");
  expect(Array.from(first.values.slice(0, 3))).toEqual([0, 5, 20]);
  const middle = sample(sample(first, 0, "1"), 0.5, "1");
  expect(middle.values[0]).toBeGreaterThan(1);
  expect(middle.values[0]).toBeLessThan(23);
  expect(middle.values[2]).toBeCloseTo(20);
  const arrived = sample(middle, 2, "1");
  [24, 5, 20].forEach((value, axis) => expect(arrived.values[axis]).toBeCloseTo(value));
  [24, 3, 0].forEach((value, axis) => expect(arrived.values[4 + axis]).toBeCloseTo(value));
});

test("a camera-following key light keeps its offsets from the camera target", () => {
  const scene = prepareJourneyScene({ camera: { shots: [{ step: 0, position: [10, 5, 20], target: [10, 3, 0] }] },
    keyLight: { follow: "camera", position: [-4, 20, 10], target: [0, -3, 0] }, instances: [primitive("box", { id: "a" })] });
  const values = sampleJourneyUniforms(scene, clock(0, 0));
  expect(Array.from(values.slice(112, 115))).toEqual([6, 23, 10]);
  expect(Array.from(values.slice(120, 123))).toEqual([10, 0, 0]);
});

test("flat and toon shading reach the shader through each instance; the cartoon look toon-shades by default", () => {
  const scene = prepareJourneyScene({ materials: { flat: { albedo: "#ff0000", shading: "flat" }, toon: { albedo: "#00ff00", shading: "toon" } },
    instances: [primitive("box", { id: "flat", material: "flat" }), primitive("sphere", { id: "toon", material: "toon" }), primitive("box", { id: "lit" })] });
  const values = sampleJourneyUniforms(scene, clock(0, 0));
  expect(values[slot(scene, "flat") + instanceField.detail]).toBe(1);
  expect(values[slot(scene, "toon") + instanceField.detail]).toBe(2);
  expect(values[slot(scene, "lit") + instanceField.detail]).toBe(0);
  const cartoon = prepareJourneyScene({ look: "cartoon", instances: [primitive("box", { id: "a" })] });
  const toon = sampleJourneyUniforms(cartoon, clock(0, 0));
  expect([toon[slot(cartoon, "a") + instanceField.detail], toon[slot(cartoon, "a") + instanceField.rim], toon[15], toon[16]]).toEqual([2, 0, 0, 0]);
  const graph = buildJourneyGraph(journeyGraphTopology({ ...scene, toneMapping: "neutral" }));
  const code = graph.passes.map(pass => pass.code).join("\n");
  expect(code).toContain("fn surface(");
  expect(code).toContain("fn displayScene(");
});

test("sprites draw pixel-art frames as one custom draw and reject malformed art", () => {
  const sprite: Instance = spriteInstance({ id: "hero", pixels: [["ab", "b."], ["ba", ".b"]], palette: { a: "#ff0000", b: "#0000ff" }, fps: 4 });
  expect(sprite.custom!.vertexCount).toBe(2 * 2 * 6);
  expect(sprite.custom!.wgsl).toContain("array<u32,8>");
  expect(spriteInstance({ id: "again", pixels: [["ab", "b."], ["ba", ".b"]], palette: { a: "#ff0000", b: "#0000ff" }, fps: 4 }).custom).toBe(sprite.custom);
  const scene = prepareJourneyScene({ instances: [sprite] });
  expect(sampleJourneyUniforms(scene, clock(0, 0))[slot(scene, "hero") + instanceField.detail]).toBe(1);
  expect(() => spriteInstance({ id: "bad", pixels: [["ab", "b"]], palette: { a: "#ff0000", b: "#0000ff" } })).toThrow();
  expect(() => spriteInstance({ id: "bad", pixels: [["ax"]], palette: { a: "#ff0000" } })).toThrow();
});

test("image maps and image sprites share one list of graph images bound after the shadow map", () => {
  const crate = "data:image/png;base64,crate", strip = "data:image/png;base64,strip";
  const scene = prepareJourneyScene({ keyLight: {}, materials: { crate: { albedo: "#ffffff", map: crate, shading: "toon" } }, instances: [
    primitive("box", { id: "a", material: "crate" }), primitive("box", { id: "b", material: "crate" }),
    spriteInstance({ id: "fly", source: strip, frames: 2, aspect: 1 }),
  ] });
  expect(scene.maps).toEqual([crate, strip]);
  const values = sampleJourneyUniforms(scene, clock(0, 0));
  expect(values[slot(scene, "a") + instanceField.detail]).toBe(2 + 4);
  expect(values[slot(scene, "fly") + instanceField.detail]).toBe(1 + 8);
  const graph = buildJourneyGraph(scene);
  expect(graph.images).toEqual([{ id: "map0", source: crate }, { id: "map1", source: strip }]);
  const box = graph.passes.find(pass => pass.id === "scene-box")!;
  expect(box.kind === "render" && box.reads).toEqual(["shadow", "map0", "map1"]);
  expect(box.code).toContain("@group(0) @binding(5) var map1:texture_2d<f32>;");
  const shadow = graph.passes.find(pass => pass.id === "shadow-custom-0")!;
  expect(shadow.kind === "render" && shadow.reads).toEqual(["map0", "map1"]);
  expect(shadow.code).toContain("_=shade(");
  expect(() => spriteInstance({ id: "both", source: strip, pixels: [["a"]], palette: { a: "#ffffff" } })).toThrow();
});

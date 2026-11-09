// @ts-ignore Bun supplies this API at runtime.
import { expect, test } from "bun:test";
import { prepareWorldPlans, sampleWorldPlan, worldPlanCopies, worldPlanFits, worldPlanIds } from "../packs/world/plan";
import { customGeometryKeys, customInstances, compileTrack, primitive, prepareWorldScene, sampleWorldUniforms, sdfInstance, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds } from "../packs/world/track";
import { text3dInstances } from "../packs/world/text3d";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { d } from "typegpu";
import { defineWorldEffect } from "../packs/world/effects";
import { buildWorldGraph } from "../packs/world/render";

const clock = { slideTime: 3, stepTime: 3, stepIndex: 0, stepOrigins: [0] };
test("custom geometry keys reuse shader-sized strings and follow descriptor changes", () => {
  const geometry = { wgsl: "geometry:a", vertexCount: 36 };
  const first = customGeometryKeys(geometry);
  expect(customGeometryKeys(geometry)).toBe(first);
  expect(customGeometryKeys({ ...geometry })).toEqual(first);
  geometry.vertexCount = 72;
  expect(customGeometryKeys(geometry)).toEqual({ wgsl: "geometry:a", vertexCount: 72, family: "custom:geometry:a:72", order: "1:geometry:a:72" });
  geometry.wgsl = "geometry:b";
  expect(customGeometryKeys(geometry).family).toBe("custom:geometry:b:72");
});
test("equal custom programs share draw slots without changing instance order or indices", () => {
  const a = customInstances({ id: "a", count: 2, vertexCount: 36, wgsl: "program" });
  const b = customInstances({ id: "b", count: 2, vertexCount: 36, wgsl: "program" });
  const scene = prepareWorldScene({ instances: [b[1], a[0], b[0], a[1]] });
  const plan = prepareWorldPlans([scene]).get(scene)!;
  expect(scene.instances.map(part => [part.id, part.customIndex])).toEqual([[b[1].id, 1], [a[0].id, 0], [b[0].id, 0], [a[1].id, 1]]);
  expect(plan.topology.customs).toHaveLength(1);
  expect(worldPlanFits(scene, plan)).toBe(true);
  expect(worldPlanIds(scene, plan).filter(Boolean)).toEqual(trackIds(scene));
});
test("compatible declarations and retained outgoing parts use one graph without changing their uniforms", () => {
  const a = prepareWorldScene({ instances: [primitive("box", { id: "a" }), ...text3dInstances({ id: "word", text: "Hello" })] });
  const b = prepareWorldScene({ instances: [primitive("tube", { id: "b" }), ...text3dInstances({ id: "other", text: "World", mono: true })] });
  const plans = prepareWorldPlans([a, b]), plan = plans.get(a)!;
  expect(plans.get(b)).toBe(plan);
  const retained = retainTrackScene(b, a);
  const values = sampleWorldUniforms(retained, clock);
  const copies = worldPlanCopies(retained, plan), output = sampleWorldPlan(values, copies, new Float32Array(plan.size), plan.lightOffset);
  for (const [source, count, target] of copies) {
    Array.from(values.slice(source, source + count)).forEach((v, i) => expect(output[target + i]).toBeCloseTo(v, 5));
  }
  expect(plan.topology.counts).toEqual({ box: 1, tube: 1, ring: 0, sphere: 0 });
  const graph = buildWorldGraph(plan.topology);
  expect(graph.uniformsSize).toBe(plan.size);
  for (let slot = worldHeaderSize; slot < plan.size; slot += worldInstanceSize) {
    if (!copies.some(([, count, target]) => slot >= target && slot + worldInstanceSize <= target + count)) expect(output[slot + 23]).toBe(0);
  }
});
test("different floor layouts keep distinct graphs", () => {
  const a = prepareWorldScene({ instances: [], floor: {} }), b = prepareWorldScene({ instances: [] });
  const plans = prepareWorldPlans([a, b]);
  expect(plans.get(a)).not.toBe(plans.get(b));
  expect(plans.get(a)!.topology.floor).toBe(true);
  expect(plans.get(b)!.topology.floor).toBe(false);
});

test("pooled station uniforms match baked scenes by part id through omission, steps and reverse", () => {
  const a = prepareWorldScene({ instances: [primitive("box", { id: "panel", position: [-3, 2, 0] }), ...text3dInstances({ id: "old", text: "Old" })] });
  const b = prepareWorldScene({ instances: [primitive("box", { id: "panel", position: [3, 4, 0] }), ...text3dInstances({ id: "new", text: "New", mono: true })] });
  const plan = prepareWorldPlans([a, b]).get(a)!;
  let baked = createTrackFrame(), pooled = createTrackFrame(), previous = a, layout = a, base = a;
  for (const [scene, slideKey, stepKey, time] of [[a,"0","0",0], [a,"0","0",3], [b,"1","0",0], [b,"1","0",.8], [b,"1","0",3],
    [b,"1","1",0], [b,"1","1",3], [a,"0:again","0",0], [a,"0:again","0",.8], [a,"0:again","0",3]] as const) {
    if (scene !== base) { previous = retainTrackScene(scene, previous, base); layout = retainTrackScene(scene, layout, base, true); base = scene; }
    const playback = { ...createPlaybackState({ phase: "playing", slideKey, stepKey, stepIndex: Number(stepKey) }), slideTime: time, stepTime: time };
    const raw = sampleWorldUniforms(scene, playback, null, 1, 1, true);
    const values = sampleWorldPlan(raw, worldPlanCopies(scene, plan), new Float32Array(plan.size), plan.lightOffset);
    pooled = sampleTrackFrame(pooled, values as unknown as number[], worldPlanIds(layout, plan), playback, {}, trackIds(scene));
    baked = sampleTrackFrame(baked, sampleWorldUniforms(previous, playback) as number[], trackIds(previous), playback, {}, trackIds(scene));
    for (let i = 0; i < worldHeaderSize; i++) expect(pooled.values[i]).toBeCloseTo(baked.values[i], 4);
    baked.ids.forEach((id, slot) => {
      const target = pooled.ids.indexOf(id);
      expect(target).toBeGreaterThanOrEqual(0);
      for (let field = 0; field < worldInstanceSize; field++) expect(pooled.values[worldHeaderSize + target * worldInstanceSize + field])
        .toBeCloseTo(baked.values[worldHeaderSize + slot * worldInstanceSize + field], 4);
    });
  }
});

test("SDF draw families preserve bounds and ray-march steps", () => {
  const a = prepareWorldScene({ instances: [sdfInstance({ id: "a", wgsl: "fn distance(p:vec3f)->f32{return length(p)-1.;}", bounds: [[-1,-1,-1],[1,1,1]], steps: 16 })] });
  const b = prepareWorldScene({ instances: [sdfInstance({ id: "b", wgsl: "fn distance(p:vec3f)->f32{return length(p)-1.;}", bounds: [[-2,-2,-2],[2,2,2]], steps: 32 })] });
  const plan = prepareWorldPlans([a,b]).get(a)!;
  expect(plan.topology.sdfs?.map(draw => draw.steps).sort()).toEqual([16,32]);
  expect(new Set(plan.topology.sdfs?.map(draw => JSON.stringify(draw.bounds))).size).toBe(2);
});

test("rapid navigation retains live departures beyond a pool capacity", () => {
  const scenes = ["a", "b", "c"].map(id => prepareWorldScene({ instances: [primitive("box", { id, position: [0, 1, -100] })] }));
  const plan = prepareWorldPlans(scenes).get(scenes[0])!;
  const second = retainTrackScene(scenes[1], scenes[0], scenes[0], true);
  const third = retainTrackScene(scenes[2], second, scenes[1], true, trackIds(scenes[0]));
  expect(worldPlanFits(second, plan)).toBe(true);
  expect(worldPlanFits(third, plan)).toBe(false);
  expect(trackIds(retainTrackScene(scenes[2], second, scenes[1], false, trackIds(scenes[0]))).sort()).toEqual(["box:a", "box:b", "box:c"]);
});

test("effects share a graph across geometry sizes and copy animated parameters after the draw slots", () => {
  const effect = defineWorldEffect({ name: "pool-test", params: { gain: d.f32, tint: d.vec3f },
    defaults: { gain: 1, tint: [1, 1, 1] }, build: ({ input, id }) => ({ passes: [{ id: id(), wgsl: "@fragment fn main()->@location(0) vec4f{return vec4f(1.);}", fragment: "main", reads: { source: input }, output: id("out") }] }) });
  const scenes = [1, 3].map((count, index) => prepareWorldScene({
    instances: Array.from({ length: count }, (_, slot) => primitive("box", { id: `part-${slot}` })),
    effects: [{ use: effect({ gain: { 0: index + 1, 1: index + 4 }, tint: [index, .5, 1] }) }, { use: effect({ gain: 3 }) }],
  }));
  const plans = prepareWorldPlans(scenes), plan = plans.get(scenes[0])!;
  expect(plan).toBeDefined();
  expect(plans.get(scenes[1])).toBe(plan);
  expect(buildWorldGraph(plan.topology).uniformsSize).toBe(plan.size);
  for (const scene of scenes) {
    expect(worldPlanFits(scene, plan)).toBe(true);
    expect(worldPlanIds(scene, plan)).toHaveLength(plan.instances);
    const retained = retainTrackScene(scene, scenes[1], scenes[1], true);
    expect(worldPlanFits(retained, plan)).toBe(true);
    for (const stepIndex of [0, 1, 0]) {
      const sample = sampleWorldUniforms(scene, { ...clock, stepIndex }, null, 1, 1, true);
      const pooled = sampleWorldPlan(sample, worldPlanCopies(scene, plan), new Float32Array(plan.size), plan.lightOffset);
      const source = scene.effectUses[0].base, target = plan.topology.effects![0].base;
      expect(Array.from(pooled.slice(target))).toEqual(Array.from(sample.slice(source)));
      expect(target).toBe(worldHeaderSize + plan.instances * worldInstanceSize);
    }
  }
});

test("effect options and placement keep distinct pools while parameter values share them", () => {
  const effect = defineWorldEffect({ name: "pool-options", params: { gain: d.f32 }, defaults: { gain: 1 }, build: ({ input, id }) => ({ passes: [{ id: id(), wgsl: "@fragment fn main()->@location(0) vec4f{return vec4f(1.);}", fragment: "main", reads: { source: input }, output: id("out") }] }) });
  const scenes = [
    { use: effect({ gain: 1 }, { mode: "a" }) }, { use: effect({ gain: 2 }, { mode: "a" }) },
    { use: effect({ gain: 1 }, { mode: "b" }) }, { use: effect(), before: "tonemap" as const },
  ].map(use => prepareWorldScene({ instances: [], effects: [use] }));
  const plans = prepareWorldPlans(scenes);
  expect(plans.get(scenes[0])).toBeDefined();
  expect(plans.get(scenes[0])).toBe(plans.get(scenes[1]));
  expect(plans.get(scenes[0])).not.toBe(plans.get(scenes[2]));
  expect(plans.get(scenes[0])).not.toBe(plans.get(scenes[3]));
});

test("numeric family cursors preserve empty capacities, equivalent descriptors and geometry edits", () => {
  const original = prepareWorldScene({ instances: customInstances({ id: "source", count: 2, vertexCount: 36, wgsl: "program" }) });
  const plan = prepareWorldPlans([original]).get(original)!;
  const equivalent = prepareWorldScene({ instances: customInstances({ id: "copy", count: 2, vertexCount: 36, wgsl: "program" }) });
  expect(worldPlanFits(equivalent, plan)).toBe(true);
  expect(worldPlanCopies(equivalent, plan)).toEqual([[0, worldHeaderSize + 2 * worldInstanceSize, 0]]);
  expect(worldPlanIds(equivalent, plan).filter(Boolean)).toEqual(trackIds(equivalent));
  expect(worldPlanFits(prepareWorldScene({ instances: [primitive("box")] }), plan)).toBe(false);
  const geometry = equivalent.instances[0].custom!;
  geometry.wgsl = "different";
  expect(worldPlanFits(equivalent, plan)).toBe(false);
  geometry.wgsl = "program";
  geometry.vertexCount = 72;
  expect(worldPlanFits(equivalent, plan)).toBe(false);
  geometry.vertexCount = 36;
  expect(worldPlanFits(equivalent, plan)).toBe(true);
});

test("scenery present in every declaration needs one slot while departures keep their own capacity", () => {
  const scenes = [0, 1, 2].map(index => prepareWorldScene({ instances: [
    ...Array.from({ length: 100 }, (_, slot) => primitive("sphere", { id: `shared-${slot}`, position: [slot, index, 0] })),
    primitive("box", { id: `part-${index}`, position: [index, 0, 0] }),
  ] }));
  const plan = prepareWorldPlans(scenes).get(scenes[0])!;
  expect(plan.instances).toBe(102);
  for (const [from, to] of [[0, 1], [1, 0], [0, 2], [2, 1]]) {
    const retained = retainTrackScene(scenes[to], scenes[from]);
    expect(worldPlanFits(retained, plan)).toBe(true);
    for (const time of [0, .3, 1.5]) {
      const sample = sampleWorldUniforms(retained, { ...clock, slideTime: time, stepTime: time });
      const copies = worldPlanCopies(retained, plan);
      const values = sampleWorldPlan(sample, copies, new Float32Array(plan.size), plan.lightOffset);
      for (const [source, size, target] of copies) expect(Array.from(values.slice(target, target + size)))
        .toEqual(Array.from(Float32Array.from(sample.slice(source, source + size))));
      expect(worldPlanIds(retained, plan).filter(Boolean)).toEqual(trackIds(retained));
    }
  }
  const second = retainTrackScene(scenes[1], scenes[0], scenes[0], true);
  const third = retainTrackScene(scenes[2], second, scenes[1], true, trackIds(scenes[0]));
  expect(worldPlanFits(third, plan)).toBe(false);
});

for (const frame of ["station", "world"] as const) test(`smaller pools preserve every named field through ${frame} carry, steps and reverse`, () => {
  const scenes = [0, 1, 2].map(index => prepareWorldScene({ instances: [
    ...Array.from({ length: 8 }, (_, slot) => primitive("box", { id: `shared-${slot}`, position: [slot, index, 0] })),
    primitive("sphere", { id: `part-${index}`, position: [index, 2, 0] }),
  ] }));
  // Anonymous incoming parts can require the original larger layout beside named departures.
  const plans = [prepareWorldPlans(scenes).get(scenes[0])!,
    prepareWorldPlans([...scenes, prepareWorldScene({ instances: Array.from({ length: 8 }, () => primitive("box")) })]).get(scenes[0])!];
  expect(plans.map(plan => plan.instances)).toEqual([10, 18]);
  const frames = plans.map(() => createTrackFrame());
  let layout = scenes[0], declaration = scenes[0];
  for (const [index, step, time] of [[0,0,0], [0,0,5], [1,0,0], [1,0,.2], [1,0,5],
    [1,1,0], [1,1,5], [2,0,0], [2,0,5], [0,0,0], [0,0,.6], [0,0,5]]) {
    const scene = scenes[index];
    if (scene !== declaration) { layout = retainTrackScene(scene, layout, declaration, true, frames[0].visible); declaration = scene; }
    const playback = { ...createPlaybackState({ phase: "playing", slideKey: String(index), stepKey: String(step), stepIndex: step }),
      slideTime: time + (step ? 5 : 0), stepTime: time };
    const declared = trackIds(scene), sample = sampleWorldUniforms(scene, playback, null, 1, 1, true);
    const normalized = plans.map((plan, i) => {
      expect(worldPlanFits(layout, plan)).toBe(true);
      const values = sampleWorldPlan(sample, worldPlanCopies(scene, plan), new Float32Array(plan.size), plan.lightOffset);
      frames[i] = sampleTrackFrame(frames[i], values as unknown as number[], worldPlanIds(layout, plan), playback,
        { frame, duration: 1, carry: { lift: 1, spread: 1, spin: .2, stagger: .3 }, steps: { 1: { orbit: 15 } } }, declared);
      return { header: Array.from(frames[i].values.slice(0, worldHeaderSize)),
        parts: Object.fromEntries(frames[i].ids.flatMap((id, slot) => id ? [[id, Array.from(frames[i].values.slice(
          worldHeaderSize + slot * worldInstanceSize, worldHeaderSize + (slot + 1) * worldInstanceSize))]] : [])),
        visible: frames[i].visible };
    });
    expect(normalized[0]).toEqual(normalized[1]);
  }
});

test("reachable capacity preserves rapid departures from every declared scene", () => {
  const scenes = [0, 1, 2].map(index => prepareWorldScene({ instances: [
    ...Array.from({ length: 8 }, (_, slot) => primitive("box", { id: `shared-${slot}` })), primitive("box", { id: `unique-${index}` }),
  ] }));
  const plan = prepareWorldPlans(scenes).get(scenes[0])!;
  expect(plan.instances).toBe(11);
  const second = retainTrackScene(scenes[1], scenes[0], scenes[0], true);
  const third = retainTrackScene(scenes[2], second, scenes[1], true, trackIds(scenes[0]));
  expect(third.instances).toHaveLength(11);
  expect(worldPlanFits(third, plan)).toBe(true);
});

test("anonymous incoming parts keep capacity beside named departures", () => {
  const a = prepareWorldScene({ instances: [primitive("box", { id: "shared" }), primitive("box", { id: "leaving" })] });
  const b = prepareWorldScene({ instances: [primitive("box", { id: "shared" }), primitive("box"), primitive("box")] });
  const plan = prepareWorldPlans([a, b]).get(a)!;
  expect(plan.instances).toBe(4);
  const retained = retainTrackScene(b, a);
  expect(retained.instances).toHaveLength(4);
  expect(worldPlanFits(retained, plan)).toBe(true);
});

test("shared custom families count distinct tracked identities", () => {
  const part = customInstances({ id: "part", count: 1, vertexCount: 36, wgsl: "program" })[0];
  const custom = prepareWorldScene({ instances: [part] });
  const route = prepareWorldScene({ instances: [{ ...part, kind: "tube", route: {
    points: [[0, 0, 0], [1, 0, 0]], lengths: [0, 1], draw: compileTrack(1), segment: 0,
  } }] });
  const plan = prepareWorldPlans([custom, route]).get(custom)!;
  expect(plan.instances).toBe(2);
  const retained = retainTrackScene(route, custom, custom, true);
  expect(trackIds(retained)).toEqual([trackIds(route)[0], trackIds(custom)[0]]);
  expect(worldPlanFits(retained, plan)).toBe(true);
});

// @ts-ignore Bun supplies this API at runtime.
import { expect, test } from "bun:test";
import { compileTrack, customInstances, instanceField, journeyHeaderSize, journeyInstanceSize, graphInstances, prepareJourneySample, prepareJourneyScene, primitive, pulseInstances, resolveAnchor, rowInstances,
  sampleJourneyCamera, sampleJourneyUniforms, sprayInstances, voxelInstances } from "../packs/journey/scene";
import { tree, wave } from "../packs/journey/graph";
import { routedTubeInstances } from "../packs/journey/stage";
import { text3dInstances } from "../packs/journey/text3d";

function fixture() {
  const stage = { id: "zone", position: compileTrack<[number, number, number]>({ 0: [0, 0, 0], 1: [3, 1, 0] }), glow: compileTrack(1) };
  return prepareJourneyScene({
    stages: [{ stage, parents: [] }],
    instances: [
      ...Array.from({ length: 30 }, (_, i) => primitive("box", { id: `static:${i}`, position: [i, 0, 0], sharp: i % 2 === 0 })),
      ...customInstances({ id: "custom", count: 4, vertexCount: 36, wgsl: "geometry" }),
      primitive("sphere", { id: "moving", position: { 0: [0, 1, 0], 1: [4, 3, 0] }, sharp: { 0: false, 1: true } }),
      ...text3dInstances({ id: "glyphs", text: "AB", position: [0, 2, 0] }).map(part => ({ ...part, stages: [stage] })),
      ...rowInstances({ id: "rows", count: 3, changes: [{ row: 2, step: 1 }], speed: 1 }),
      ...graphInstances({ data: tree("root", [["a", ["leaf"]]]), activate: [wave({ from: "root", step: 1 })] }),
      ...pulseInstances({ id: "pulse", path: ["root", "a", "leaf"], step: 1, duration: 2 }),
      ...sprayInstances({ id: "spray", under: "leaves:lit", rate: 2, lifetime: 2 }),
      ...voxelInstances({ id: "voxels", grid: [2, 2, 2], collapse: { step: 1, to: .25, duration: 2 } }),
    ],
    camera: { shots: [{ step: 0, follow: "static:4" }, { step: 1, follow: "moving", focus: "pulse" },
      { step: 2, follow: "rows:row:2" }, { step: 3, follow: "root" }, { step: 4, stage: "zone" }, { step: 5, follow: "voxels" }] },
    dof: { focus: { 0: "static:4", 1: "pulse", 2: "rows:row:2", 3: "root", 4: 12 } }, counter: { source: "voxels" },
  });
}

test("UI samples retain only live instance data, baked sharp tracks and declared anchors", () => {
  const scene = fixture(), sample = prepareJourneySample(scene);
  expect(prepareJourneySample(scene)).toBe(sample);
  expect(sample.instances).toHaveLength(scene.instances.length);
  expect(sample.instances.filter(part => "position" in part).length).toBeLessThan(scene.instances.length);
  for (const index of scene.uniformInputs.live) expect(sample.instances[index]).toBe(scene.instances[index]);
  expect(sample.lookupInstances.some(part => part.id === "static:4")).toBe(true);
  const custom = scene.instances.findIndex(part => !!part.custom);
  expect("custom" in sample.instances[custom]).toBe(false);
  expect(scene.instances[custom].custom?.wgsl).toBe("geometry");
});

test("compact sampling matches original cached scenes through direct steps, time, reverse and camera continuity", () => {
  const scene = fixture(), sample = prepareJourneySample(scene);
  const previous = { position: [4, 6, 30] as [number, number, number], target: [1, 0, 0] as [number, number, number], fov: 48, roll: .2 };
  for (const stepIndex of [0, 1, 2, 3, 4, 5, 2, 0]) for (const time of [0, .3, 1.8, 5]) {
    const clock = { slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } };
    const full = sampleJourneyUniforms(scene, clock, previous, 1.5, .8, true);
    const compact = sampleJourneyUniforms(sample, clock, previous, 1.5, .8);
    expect(compact.length).toBe(full.length);
    let difference = 0;
    for (let i = 0; i < full.length; i++) difference = Math.max(difference, Math.abs(full[i] - compact[i]));
    expect(difference).toBeLessThan(.0001);
    expect(sampleJourneyCamera(sample, clock, previous)).toEqual(sampleJourneyCamera(scene, clock, previous));
    for (const id of ["static:4", "moving", "rows:row:2", "root", "pulse", "voxels", "stage:zone"]) {
      expect(resolveAnchor(sample, id, clock)).toEqual(resolveAnchor(scene, id, clock));
    }
  }
});


test("prepared scenes share immutable constants without sharing animations or changing signed zero", () => {
  const input=Array.from({length:100},(_,i)=>({...primitive("sphere",{id:`part:${i}`,position:[i,0,0]}),anchor:true}));
  const scene=prepareJourneyScene({instances:input});
  const tracks=new Set(scene.instances.flatMap(p=>[p.size,p.color,p.emissive,p.scale,p.materialTracks!.albedo,p.materialTracks!.roughness,p.materialTracks!.metal,p.materialTracks!.rim]));
  expect(tracks.size).toBeLessThanOrEqual(8);
  expect(input[0].color).not.toBe(input[1].color);
  expect(input[0].position.initial).toEqual([0,0,0]);
  const animated=prepareJourneyScene({instances:[primitive("sphere",{position:{0:[0,0,0],1:[1,0,0]}}),primitive("sphere",{position:{0:[0,0,0],1:[1,0,0]}})]});
  expect(animated.instances[0].position).not.toBe(animated.instances[1].position);
  const zero=prepareJourneyScene({instances:[primitive("sphere",{id:"negative",size:-0,position:[-0,0,0]}),primitive("sphere",{id:"positive",size:0,position:[0,0,0]})]});
  expect(Object.is(zero.instances.find(p=>p.id==="negative")!.size.initial,-0)).toBe(true);
  expect(Object.is(zero.instances.find(p=>p.id==="negative")!.position.initial[0],-0)).toBe(true);
  expect(Object.is(zero.instances.find(p=>p.id==="positive")!.size.initial,0)).toBe(true);
});

test("constant route segments use baked uniforms while pulses and moving routes remain live", () => {
  const path: [number, number, number][] = [[0, 0, 0], [0, 1, 0], [3, 1, 0]];
  const scene = prepareJourneyScene({ instances: [
    ...routedTubeInstances({ id: "full", path }),
    ...routedTubeInstances({ id: "partial", path, draw: .4 }),
    ...routedTubeInstances({ id: "hidden", path, draw: 0 }),
    ...routedTubeInstances({ id: "frame", join: "miter", path: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]] }),
    ...routedTubeInstances({ id: "animated", path, draw: { 0: 0, 1: 1 }, pulses: [{ step: 1, every: 2 }] }),
    ...routedTubeInstances({ id: "drift", path }).map(part => ({ ...part, drift: .2 })),
  ] });
  const sample = prepareJourneySample(scene);
  scene.instances.forEach((part, index) => {
    const baked = !part.id!.startsWith("animated:") && !part.id!.startsWith("drift:");
    expect(part.motion === "static").toBe(baked);
    expect(scene.uniformInputs.live.includes(index)).toBe(!baked);
    expect("route" in sample.instances[index]).toBe(!baked);
  });
});

test("baked routes match uncached endpoints and opacity through stages, steps and reverse", () => {
  const path: [number, number, number][] = [[0, 0, 0], [0, 1, 0], [3, 1, 0]];
  const stage = { id: "moving", position: compileTrack<[number, number, number]>({ 0: [0, 0, 0], 1: [2, 3, 0] }), glow: compileTrack(1) };
  const fade = { id: "fade", position: compileTrack<[number, number, number]>([1, 2, 0]), glow: compileTrack(2), opacity: compileTrack({ 0: 0, 1: 1 }) };
  const scene = prepareJourneyScene({ instances: [
    ...[0, .4, 1].flatMap((draw, i) => routedTubeInstances({ id: `fixed-${i}`, path, draw })),
    ...routedTubeInstances({ id: "framed", join: "miter", path: [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0], [0, 0, 0]] }),
    ...routedTubeInstances({ id: "moving", path }).map(part => ({ ...part, stages: [stage] })),
    ...routedTubeInstances({ id: "fading", path }).map(part => ({ ...part, stages: [fade], sharp: compileTrack({ 0: false, 1: true }, Number) })),
    ...routedTubeInstances({ id: "drawing", path, draw: [{ step: 0, value: 0 }, { step: 1, value: 1, duration: 2 }], pulses: [{ step: 1, every: 2, duration: .5 }] }),
  ], camera: { shots: [{ step: 0, follow: "fixed-1:0" }, { step: 1, follow: "moving:1" }] } });
  const compact = prepareJourneySample(scene);
  for (const stepIndex of [0, 1, 2, 1, 0]) for (const time of [0, .2, .7, 2, 5]) {
    const clock = { slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } };
    const expected = sampleJourneyUniforms(scene, clock);
    for (const actual of [sampleJourneyUniforms(scene, clock, undefined, 1, 1, true), sampleJourneyUniforms(compact, clock)]) {
      let difference = 0;
      for (let i = 0; i < expected.length; i++) {
        const slot = Math.floor((i - journeyHeaderSize) / journeyInstanceSize), field = (i - journeyHeaderSize) % journeyInstanceSize;
        // Hidden live instances retain their last pose; static routes still compare every baked field.
        if (slot >= 0 && scene.instances[slot].motion !== "static" && field !== instanceField.opacity && field !== instanceField.sharp &&
          expected[journeyHeaderSize + slot * journeyInstanceSize + instanceField.opacity] === 0) continue;
        difference = Math.max(difference, Math.abs(expected[i] - actual[i]));
      }
      expect(difference).toBeLessThan(.0001);
    }
  }
});

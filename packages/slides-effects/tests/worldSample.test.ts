import { expect, test } from "bun:test";
import { compileTrack, customInstances, graphInstances, prepareWorldSample, prepareWorldScene, primitive, pulseInstances, resolveAnchor, rowInstances,
  sampleWorldCamera, sampleWorldUniforms, sprayInstances, voxelInstances } from "../packs/world/scene";
import { tree, wave } from "../packs/world/graph";
import { text3dInstances } from "../packs/world/text3d";

function fixture() {
  const stage = { id: "zone", position: compileTrack<[number, number, number]>({ 0: [0, 0, 0], 1: [3, 1, 0] }), glow: compileTrack(1) };
  return prepareWorldScene({
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
  const scene = fixture(), sample = prepareWorldSample(scene);
  expect(prepareWorldSample(scene)).toBe(sample);
  expect(sample.instances).toHaveLength(scene.instances.length);
  expect(sample.instances.filter(part => "position" in part).length).toBeLessThan(scene.instances.length);
  for (const index of scene.uniformInputs.live) expect(sample.instances[index]).toBe(scene.instances[index]);
  expect(sample.lookupInstances.some(part => part.id === "static:4")).toBe(true);
  const custom = scene.instances.findIndex(part => !!part.custom);
  expect("custom" in sample.instances[custom]).toBe(false);
  expect(scene.instances[custom].custom?.wgsl).toBe("geometry");
});

test("compact sampling matches original cached scenes through direct steps, time, reverse and camera continuity", () => {
  const scene = fixture(), sample = prepareWorldSample(scene);
  const previous = { position: [4, 6, 30] as [number, number, number], target: [1, 0, 0] as [number, number, number], fov: 48, roll: .2 };
  for (const stepIndex of [0, 1, 2, 3, 4, 5, 2, 0]) for (const time of [0, .3, 1.8, 5]) {
    const clock = { slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } };
    const full = sampleWorldUniforms(scene, clock, previous, 1.5, .8, true);
    const compact = sampleWorldUniforms(sample, clock, previous, 1.5, .8);
    expect(compact.length).toBe(full.length);
    let difference = 0;
    for (let i = 0; i < full.length; i++) difference = Math.max(difference, Math.abs(full[i] - compact[i]));
    expect(difference).toBeLessThan(.0001);
    expect(sampleWorldCamera(sample, clock, previous)).toEqual(sampleWorldCamera(scene, clock, previous));
    for (const id of ["static:4", "moving", "rows:row:2", "root", "pulse", "voxels", "stage:zone"]) {
      expect(resolveAnchor(sample, id, clock)).toEqual(resolveAnchor(scene, id, clock));
    }
  }
});

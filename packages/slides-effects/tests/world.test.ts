import { describe, expect, test } from "bun:test";
import { evaluateCamera, flyTo, type CameraOptions, type ClockSample, type Vec3 } from "../packs/world/camera";
import { activationAt, layoutTree, subset, tree, wave } from "../packs/world/graph";
import { buildWorldGraph } from "../packs/world/render";
import { compileTrack, customInstances, graphInstances, instanceOpacity, instancePosition, orbInstances, prepareWorldScene, primitive, pulseInstances,
  resolveAnchor, rowInstances, rowLogicalIndex, sampleTrack, sampleWorldCamera, sampleWorldUniforms, sdfInstance, sprayInstances, voxelInstances, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { advancePlayback, createPlaybackState, transitionPlayback } from "../../presentation/src/playbackState";

function clock(time: number, step = 0, origins: Record<number, number> = { 0: 0 }): ClockSample {
  return { slideTime: time, stepTime: time - (origins[step] ?? 0), stepIndex: step, stepOrigins: origins };
}
describe("world camera", () => {
  test("samples step changes and scrubs without integration history", () => {
    const options: CameraOptions = { duration: 2, ease: "linear", shots: [
      { step: 0, position: [0, 0, 20], target: [0, 0, 0], fov: 40 },
      { step: 1, position: [8, 4, 12], fov: 60 },
    ] };
    expect(evaluateCamera(options, clock(4, 1, { 0: 0, 1: 4 })).position).toEqual([0, 0, 20]);
    expect(evaluateCamera(options, clock(5, 1, { 0: 0, 1: 4 })).position).toEqual([4, 2, 16]);
    expect(evaluateCamera(options, clock(6, 1, { 0: 0, 1: 4 })).fov).toBe(60);
    expect(evaluateCamera(options, clock(5, 1, { 0: 0, 1: 4 })).position).toEqual([4, 2, 16]);
    expect(evaluateCamera(options, clock(1))).toEqual(evaluateCamera(options, clock(0)));
    // A directly entered step still has an explicit initial pose.
    expect(evaluateCamera(options, clock(0, 1, { 1: 0 })).position).toEqual([0, 0, 20]);
  });
  test("freezes the previous moving shot at the next keyframe's origin", () => {
    const first: CameraOptions = { ease: "linear", shots: [{ at: 0, orbit: { center: [0, 0, 0], radius: 10, speed: 0.2, height: 3 } }] };
    const options: CameraOptions = { ...first, duration: 2, shots: [...first.shots!, { at: 4, position: [0, 3, 20] }] };
    const boundary = evaluateCamera(first, clock(4));
    expect(evaluateCamera(options, clock(4)).position).toEqual(boundary.position);
    const halfway = evaluateCamera(options, clock(5));
    expect(halfway.position[0]).toBeCloseTo(boundary.position[0] * 0.5);
    expect(halfway.position[2]).toBeCloseTo((boundary.position[2] + 20) * 0.5);
  });
  test("evaluates follow, dolly, orbit and continuity from the same clock", () => {
    const follow: CameraOptions = { shots: [{ position: [0, 0, 20], follow: "node:a", dolly: 5 }] };
    const pose = evaluateCamera(follow, clock(4), { "node:a": [0, 0, 10] });
    expect(pose.target).toEqual([0, 0, 10]);
    expect(pose.position).toEqual([0, 0, 15]);
    const previous = { position: [10, 0, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 40, roll: 0 };
    expect(evaluateCamera(follow, clock(0), { "node:a": [0, 0, 10] }, previous, 1)).toEqual(previous);
    expect(evaluateCamera(follow, clock(1), { "node:a": [0, 0, 10] }, previous, 1)).toEqual(pose);
    const orbit: CameraOptions = { shots: [{ orbit: { center: [1, 2, 3], radius: 10, height: 4, speed: Math.PI / 2 } }] };
    expect(evaluateCamera(orbit, clock(1)).position[0]).toBeCloseTo(11);
    expect(evaluateCamera(orbit, clock(1)).position[1]).toBe(6);
  });
  test("a direct later-step entry completes missing earlier shots before starting its own", () => {
    const options: CameraOptions = { ease: "linear", duration: 1, shots: [
      { step: 0, position: [0, 0, 20] }, { step: 1, position: [5, 0, 15] },
      { step: 2, position: [10, 0, 10] }, { step: 3, position: [15, 0, 5] },
    ] };
    expect(evaluateCamera(options, clock(0, 3, { 3: 0 })).position).toEqual([10, 0, 10]);
    expect(evaluateCamera(options, clock(0.5, 3, { 3: 0 })).position).toEqual([12.5, 0, 7.5]);
    expect(evaluateCamera(options, clock(4, 3, { 3: 0 })).position).toEqual([15, 0, 5]);
    expect(evaluateCamera(options, clock(0, 1, { 1: 0 })).position).toEqual([0, 0, 20]);
    const orbit: CameraOptions = { ease: "linear", duration: 1, shots: [
      { step: 0, position: [0, 0, 20] }, { step: 1, orbit: { center: [0, 0, 0], radius: 10, height: 3, speed: 0.5 } },
      { step: 2, target: [0, 0, 0], dolly: 5 },
    ] };
    expect(evaluateCamera(orbit, clock(0, 2, { 2: 0 })).position).toEqual([0, 3, 10]);
    const settled = evaluateCamera(orbit, clock(1, 2, { 2: 0 })).position;
    expect(settled[0]).toBe(0);
    expect(Math.hypot(...settled)).toBeCloseTo(5);
    expect(evaluateCamera(orbit, clock(4, 2, { 2: 0 })).position).toEqual(settled);
  });
  test("leaving a moving follow target samples its exact keyframe-boundary position", () => {
    const options: CameraOptions = { ease: "linear", duration: 2, shots: [
      { at: 0, position: [0, 0, 20], follow: "moving" }, { at: 4, position: [10, 0, 10], target: [0, 0, 0] },
    ] };
    const objects = (_id: string, sample: ClockSample): [number, number, number] => [sample.slideTime * 2, 0, 0];
    expect(evaluateCamera(options, clock(4), objects).target).toEqual([8, 0, 0]);
    expect(evaluateCamera(options, clock(5), objects).target).toEqual([4, 0, 0]);
    const moving = orbInstances({ id: "moving", count: 1, drift: 1 })[0];
    const scene = prepareWorldScene({ instances: [moving], camera: { ...options, shots: [
      { at: 0, follow: "moving:0" }, options.shots![1],
    ] } });
    const boundary = instancePosition(moving, clock(4));
    expect(sampleWorldCamera(scene, clock(4)).target).toEqual(boundary);
    const halfway = sampleWorldCamera(scene, clock(5)).target;
    halfway.forEach((value, index) => expect(value).toBeCloseTo(boundary[index] / 2));
  });
});

describe("world graph", () => {
  const data = tree("root", [["a", ["a1", "a2"]], ["b", ["b1", "b2"]]]);
  test("lays out unique finite nodes on widening cone levels", () => {
    const layout = layoutTree(data);
    expect(layout.nodes).toHaveLength(7);
    expect(layout.edges).toHaveLength(6);
    expect(layout.nodes.find(node => node.id === "a1")?.ancestors).toEqual(["root", "a"]);
    expect(layout.nodes.every(node => node.position.every(Number.isFinite))).toBe(true);
    const a = layout.nodes.find(node => node.id === "a")!, a1 = layout.nodes.find(node => node.id === "a1")!;
    expect(a1.position[1]).toBeLessThan(a.position[1]);
    expect(Math.hypot(a1.position[0], a1.position[2])).toBeGreaterThan(Math.hypot(a.position[0], a.position[2]));
    expect(() => layoutTree(tree("root", ["root"]))).toThrow("duplicate node id");
  });
  test("wave cascades through descendants; a later subset dims untouched branches", () => {
    const { nodes } = layoutTree(data);
    const root = nodes[0], leaf = nodes.find(node => node.id === "a1")!, b = nodes.find(node => node.id === "b")!;
    const activate = [wave({ from: "root", step: 1, speed: 0.5, duration: 0.25 }), subset({ branches: ["b"], step: 2, duration: 0.5 })];
    expect(activationAt(root, nodes, activate, clock(1, 0))).toBe(0);
    expect(activationAt(root, nodes, activate, clock(2.25, 1, { 0: 0, 1: 2 }))).toBe(1);
    expect(activationAt(leaf, nodes, activate, clock(2.25, 1, { 0: 0, 1: 2 }))).toBe(0);
    expect(activationAt(leaf, nodes, activate, clock(3.25, 1, { 0: 0, 1: 2 }))).toBe(1);
    expect(activationAt(leaf, nodes, activate, clock(5, 2, { 0: 0, 1: 2, 2: 4 }))).toBe(0);
    expect(activationAt(b, nodes, activate, clock(5, 2, { 0: 0, 1: 2, 2: 4 }))).toBe(1);
    // Backwards samples produce the same activation, independent of previous samples.
    expect(activationAt(leaf, nodes, activate, clock(3.25, 1, { 0: 0, 1: 2 }))).toBe(1);
  });
  test("animated node positions keep attached curved tube endpoints in sync", () => {
    const scene = prepareWorldScene({ instances: graphInstances({ data, nodes: { a: { position: { 0: [1, 2, 3], 1: [5, 6, 7] } } } }) });
    const values = sampleWorldUniforms(scene, clock(3, 1, { 0: 0, 1: 2 }));
    const nodeIndex = worldHeaderSize + scene.instances.findIndex(instance => instance.id === "node:a") * worldInstanceSize;
    const edgeIndex = worldHeaderSize + scene.instances.findIndex(instance => instance.id === "edge:root:a") * worldInstanceSize;
    expect(values.slice(nodeIndex, nodeIndex + 3)).toEqual([5, 6, 7]);
    expect(values.slice(edgeIndex + 12, edgeIndex + 15)).toEqual([5, 6, 7]);
  });
  test("missing historical steps are settled during direct-entry preparation and previews", () => {
    const { nodes } = layoutTree(data);
    const leaf = nodes.find(node => node.id === "a1")!;
    const activate = [wave({ from: "root", step: 1 }), subset({ branches: ["b"], step: 3 })];
    expect(activationAt(leaf, nodes, activate, clock(0, 3, { 3: 0 }))).toBe(1);
    expect(activationAt(leaf, nodes, activate, clock(4, 3, { 3: 0 }))).toBe(0);
    expect(activationAt(leaf, nodes, activate, clock(0, 1, { 1: 0 }))).toBe(0);
    const track = compileTrack({ 0: 0, 1: 10, 2: 20, 3: 30 });
    expect(sampleTrack(track, clock(0, 3, { 3: 0 }))).toBe(20);
    expect(sampleTrack(track, clock(4, 3, { 3: 0 }))).toBe(30);
  });
});

test("scalar/vector keyframes and post settings are clock-driven", () => {
  const track = compileTrack({ 0: 1, 1: 3 });
  expect(sampleTrack(track, clock(1.325, 1, { 0: 0, 1: 1 }))).toBeCloseTo(2);
  const scene = prepareWorldScene({ instances: [], exposure: { 0: 1, 1: 2 }, fog: { density: { 0: 0.01, 1: 0.1 }, color: { 0: "#000000", 1: "#ffffff" } }, bloom: { intensity: { 0: 1, 1: 2 } } });
  const values = sampleWorldUniforms(scene, clock(2, 1, { 0: 0, 1: 1 }));
  expect(values[8]).toBe(2); expect(values[9]).toBe(2); expect(values[12]).toBe(0.1);
  expect(values.slice(20, 23)).toEqual([1, 1, 1]);
  const overlapping = compileTrack([{ at: 0, value: 0 }, { at: 1, value: 10, duration: 2, ease: "linear" }, { at: 2, value: 20, duration: 2, ease: "linear" }]);
  expect(sampleTrack(overlapping, clock(2))).toBe(5);
  expect(sampleTrack(overlapping, clock(3))).toBe(12.5);
});

test("HDR scene and five-level half-resolution bloom describe independent attachments", () => {
  const scene = prepareWorldScene({ instances: [...orbInstances({ count: 3 }), primitive("box"), primitive("ring"), primitive("tube")], bloom: { intensity: 1.5 } });
  const graph = buildWorldGraph(scene);
  expect(graph.targets.find(target => target.id === "hdr")?.format).toBe("rgba16float");
  expect(graph.targets.find(target => target.id === "depth")?.format).toBe("depth32float");
  expect(graph.targets.find(target => target.id === "bloom")).toMatchObject({ scale: 0.5, mips: 5 });
  const render = graph.passes.filter(pass => pass.kind === "render");
  expect(render.map(pass => pass.instanceCount)).toEqual([1, 1, 3, 1]);
  expect(render[0].clear).toBeArray();
  expect(render.slice(1).every(pass => pass.clear === false)).toBe(true);
  expect(graph.passes.at(-1)).toMatchObject({ id: "screen", fragment: "fxaa", output: "screen" });
  expect(graph.targets.filter(target => target.samples === 4).map(target => target.id)).toEqual(["hdr", "depth"]);
  expect(render.every(pass => pass.vertexCount > 0)).toBe(true);
  expect(graph.uniformsSize).toBe(sampleWorldUniforms(scene, clock(0)).length);
  expect(orbInstances({ count: 3, seed: 7 })).toEqual(orbInstances({ count: 3, seed: 7 }));
  expect(orbInstances({ count: 3, seed: 7 })).not.toEqual(orbInstances({ count: 3, seed: 8 }));
  expect(() => prepareWorldScene({ instances: [...orbInstances({ count: 1 }), ...orbInstances({ count: 1 })] })).toThrow("id is duplicated");
  expect(() => prepareWorldScene({ instances: [...orbInstances({ id: "near", count: 1 }), ...orbInstances({ id: "far", count: 1 })] })).not.toThrow();
});

test("pulse geometry, camera follow and focus share the exact curved path across clock transitions", () => {
  const scene = prepareWorldScene({ instances: [...graphInstances({ data: tree("root", [["a", ["leaf"]]]) }),
    ...pulseInstances({ id: "pulse", path: ["root", "a", "leaf"], step: 1, duration: 4 })],
    camera: { shots: [{ step: 0, position: [0, 4, 20] }, { step: 1, follow: "pulse", dolly: 6, duration: 0 }] }, dof: { focus: "pulse" } });
  const pulse = scene.instances.find(instance => instance.id === "pulse")!;
  let state = createPlaybackState({ phase: "playing", slideKey: "pulse", stepKey: "1", stepIndex: 1 });
  state = advancePlayback(advancePlayback(state, 0), 1000);
  const position = instancePosition(pulse, state), camera = sampleWorldCamera(scene, state), uniforms = sampleWorldUniforms(scene, state);
  expect(camera.target).toEqual(position);
  expect(uniforms[32]).toBeCloseTo(6);
  const source = resolveAnchor(scene, "root", state)!, target = resolveAnchor(scene, "a", state)!;
  expect(position[0]).toBeCloseTo((source[0] + target[0]) / 2);
  expect(position[1]).toBeGreaterThan((source[1] + target[1]) / 2);
  const trail = scene.instances.find(instance => instance.id === "pulse:trail")!;
  const index = worldHeaderSize + scene.instances.indexOf(trail) * worldInstanceSize;
  expect(uniforms.slice(index + 12, index + 15)).toEqual(position);
  state = transitionPlayback(state, { ...state, phase: "paused" });
  state = advancePlayback(state, 10000);
  expect(instancePosition(pulse, state)).toEqual(position);
  const jump = createPlaybackState({ phase: "playing", slideKey: "jump", stepKey: "3", stepIndex: 3 });
  expect(instanceOpacity(pulse, jump)).toBe(0);
  expect(instancePosition(pulse, jump)).toEqual(resolveAnchor(scene, "leaf", jump)!);
  expect(() => prepareWorldScene({ instances: pulseInstances({ id: "bad", path: ["bad", [0, 0, 0]] }) })).toThrow("cycle");
});

test("pulse keeps a spherical head distinct from its thin, fainter curved trail", () => {
  const scene = prepareWorldScene({ instances: pulseInstances({ id: "pulse", path: [[0, 3, 0], [4, 0, 0]], size: 0.2, emissive: 12 }) });
  const head = scene.instances.find(instance => instance.id === "pulse")!;
  const trail = scene.instances.find(instance => instance.id === "pulse:trail")!;
  const values = sampleWorldUniforms(scene, clock(1));
  const at = (instance: typeof head) => worldHeaderSize + scene.instances.indexOf(instance) * worldInstanceSize;
  expect(head.kind).toBe("sphere"); expect(trail.kind).toBe("tube");
  expect(values.slice(at(head) + 8, at(head) + 11)).toEqual([1, 1, 1]);
  expect(values[at(head) + 3]).toBe(0.2);
  expect(values[at(trail) + 19]).toBeCloseTo(0.036);
  expect(values[at(trail) + 7]).toBeCloseTo(3.6);
  expect(values[at(head) + 7]).toBe(12);
  const sphere = buildWorldGraph(scene).passes.find(pass => pass.id === "scene-sphere");
  expect(sphere).toMatchObject({ kind: "render", vertexCount: 6, instanceCount: 1 });
});

test("pulse trails reconstruct exact curved subsegments and restart at a turn without extra instances", () => {
  const scene = prepareWorldScene({ instances: [...graphInstances({ data: tree("root", [["a", ["leaf"]]]), edge: { curve: 0.65 } }),
    ...pulseInstances({ id: "pulse", path: ["root", "a", "leaf"], step: 1, duration: 4, trail: 0.18 })] });
  const trail = scene.instances.find(instance => instance.id === "pulse:trail")!;
  const index = worldHeaderSize + scene.instances.indexOf(trail) * worldInstanceSize;
  const point = (from: Vec3, to: Vec3, curve: number, t: number): Vec3 => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t + 2 * (1 - t) * t * length * curve, from[2] + (to[2] - from[2]) * t];
  };
  const check = (time: number, sourceId: string, targetId: string, tailT: number, headT: number) => {
    const sample = clock(time, 1, { 1: 0 }), values = sampleWorldUniforms(scene, sample);
    const source = resolveAnchor(scene, sourceId, sample)!, target = resolveAnchor(scene, targetId, sample)!;
    const start = values.slice(index, index + 3) as Vec3, end = values.slice(index + 12, index + 15) as Vec3;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const actual = point(start, end, values[index + 15], t), expected = point(source, target, 0.65, tailT + (headT - tailT) * t);
      actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 10));
    }
    return values;
  };
  check(1, "root", "a", 0.14, 0.5);
  const before = check(1.99, "root", "a", 0.635, 0.995);
  const turn = sampleWorldUniforms(scene, clock(2, 1, { 1: 0 }));
  expect(turn[index + 23]).toBe(0); expect(turn[index + 15]).toBe(0);
  const after = check(2.01, "a", "leaf", 0, 0.005);
  expect(after.slice(index, index + 3)).toEqual(resolveAnchor(scene, "a", clock(2.01, 1, { 1: 0 }))!);
  expect(before[index + 23]).toBe(1); expect(after[index + 23]).toBe(1);
  expect(scene.instances.filter(instance => instance.pulse)).toHaveLength(2);
  expect(sampleWorldUniforms(scene, clock(1), undefined, 1, 0.75)[35]).toBe(0.75);
  expect(sampleWorldUniforms(scene, clock(1))[35]).toBe(1);
});

test("changed rows stay highlighted for the whole step while the others dim", () => {
  const scene = prepareWorldScene({ instances: rowInstances({ id: "rows", count: 4, speed: 0, color: "#808080", flashColor: "#ff0000", changes: [{ row: 1, step: 1 }, { row: 2, step: 2 }], flashDuration: 0.5 }),
    camera: { shots: [{ position: [0, 0, 10], target: [0, 0, 0] }] } });
  const row = (slot: number, sample: ClockSample) => {
    const values = sampleWorldUniforms(scene, sample), index = worldHeaderSize + slot * worldInstanceSize;
    return { color: [...values.slice(index + 4, index + 7)], emissive: values[index + 7] };
  };
  const grey = row(0, clock(5)).color;
  expect(row(1, clock(5)).emissive).toBe(0.1);
  const entry = row(1, clock(1.1, 1, { 1: 1 })), settled = row(1, clock(9, 1, { 1: 1 }));
  expect(entry.emissive).toBeGreaterThan(settled.emissive);
  expect(entry.emissive).toBeLessThan(4);
  expect(settled.color).toEqual([1, 0, 0]);
  expect(settled.emissive).toBeCloseTo(0.6);
  expect(row(0, clock(9, 1, { 1: 1 })).color[0]).toBeCloseTo(grey[0] * 0.2);
  expect(row(2, clock(9, 1, { 1: 1 })).emissive).toBe(0.1);
  const later = clock(20, 2, { 1: 1, 2: 10 });
  expect(row(1, later).color).toEqual([1, 0, 0]);
  expect(row(2, later).color).toEqual([1, 0, 0]);
  expect(row(3, later).color[0]).toBeCloseTo(grey[0] * 0.2);
});

test("recycling transfers a flash with logical row identity and never to a reused slot", () => {
  const scene = prepareWorldScene({ instances: rowInstances({ id: "rows", count: 4, speed: 1, spacing: 1, changes: [{ row: 1, step: 1 }], flashDuration: 2 }),
    dof: { focus: "rows:row:1" }, camera: { shots: [{ position: [0, 0, 10], target: [0, 0, 0] }] } });
  const before = clock(0.9, 1, { 1: 0.8 }), after = clock(1.1, 1, { 1: 0.8 });
  const first = scene.instances[0], second = scene.instances[1];
  expect(rowLogicalIndex(first, before)).toBe(0); expect(rowLogicalIndex(second, before)).toBe(1);
  expect(rowLogicalIndex(first, after)).toBe(1); expect(rowLogicalIndex(second, after)).toBe(2);
  const brightness = (slot: number, sample: ClockSample) => sampleWorldUniforms(scene, sample)[worldHeaderSize + slot * worldInstanceSize + 7];
  expect(brightness(1, before)).toBeGreaterThan(1);
  expect(brightness(0, before)).toBe(0.1);
  expect(brightness(0, after)).toBeGreaterThan(1);
  expect(brightness(1, after)).toBe(0.1);
  expect(resolveAnchor(scene, "rows:row:1", after)).toEqual(instancePosition(first, after));
  expect(sampleWorldUniforms(scene, after)[32]).toBe(10);
  expect(brightness(0, clock(0, 3, { 3: 0 }))).toBe(0.1);
  let state = createPlaybackState({ phase: "playing", slideKey: "rows", stepKey: "1", stepIndex: 1 });
  state = advancePlayback(advancePlayback(state, 0), 990);
  const departing = instanceOpacity(first, state), retained = instanceOpacity(second, state);
  const retainedPosition = instancePosition(second, state);
  state = advancePlayback(state, 1010);
  expect(departing).toBeCloseTo(0.01);
  expect(retained).toBe(1);
  expect(instanceOpacity(first, state)).toBeCloseTo(0.99);
  expect(instanceOpacity(scene.instances.at(-1)!, state)).toBeCloseTo(0.01);
  expect(instancePosition(first, state)[1] - retainedPosition[1]).toBeCloseTo(0.02);
  expect(brightness(0, state)).toBeGreaterThan(1);
});

test("voxel compaction keeps topology fixed and its counter matches the surviving cells", () => {
  const scene = prepareWorldScene({ instances: voxelInstances({ id: "cells", grid: [8, 8, 8], collapse: { step: 1, to: 0.2, duration: 2 } }), counter: { source: "cells" } });
  const graph = buildWorldGraph(scene);
  const initial = sampleWorldUniforms(scene, clock(0)), middle = sampleWorldUniforms(scene, clock(1, 1, { 1: 0 })), final = sampleWorldUniforms(scene, clock(2, 1, { 1: 0 }));
  expect(initial[56]).toBe(512); expect(middle[56]).toBe(307); expect(final[56]).toBe(102);
  expect(scene.instances.reduce((sum, instance) => sum + instanceOpacity(instance, clock(2, 1, { 1: 0 })), 0)).toBe(102);
  expect(graph.passes.filter(pass => pass.kind === "render")[0].instanceCount).toBe(512);
  expect(final.length).toBe(graph.uniformsSize);
  expect(sampleWorldUniforms(scene, clock(0, 3, { 3: 0 }))[56]).toBe(102);
  expect(sampleWorldUniforms(scene, clock(0))[56]).toBe(512);
});

test("reused uniforms keep one buffer and match fresh sampling while static and collapsing slots are skipped", () => {
  const scene = prepareWorldScene({ instances: [
    ...voxelInstances({ id: "cells", grid: [4, 4, 4], collapse: { step: 1, to: 0.2, duration: 2 } }), primitive("box", { id: "still", position: [2, 0, 0] }),
    ...orbInstances({ count: 3, drift: 0.4 }), ...graphInstances({ data: tree("root", ["a"]), activate: [wave({ from: "root", step: 1 })] }),
    ...pulseInstances({ id: "pulse", path: ["root", "a"], step: 1 }),
  ], counter: { source: "cells" } });
  expect(scene.instances.filter(instance => instance.motion === "voxel")).toHaveLength(64);
  expect(scene.instances.filter(instance => instance.anchor).map(instance => instance.id).sort()).toEqual(["node:a", "node:root", "pulse"]);
  const reused = sampleWorldUniforms(scene, clock(0), undefined, 1, 1, true);
  for (const sample of [clock(0.5), clock(0.5, 1, { 0: 0, 1: 0.5 }), clock(1.5, 1, { 0: 0, 1: 0.5 }), clock(4, 1, { 0: 0, 1: 0.5 }), clock(5, 1, { 0: 0, 1: 0.5 }), clock(0.2)]) {
    expect(sampleWorldUniforms(scene, sample, undefined, 1, 1, true)).toBe(reused);
    expect(reused).toEqual(Float32Array.from(sampleWorldUniforms(scene, sample)));
  }
});

test("removed voxels shrink in place, including collapse to zero and backwards sampling", () => {
  const scene = prepareWorldScene({ instances: voxelInstances({ id: "cells", grid: [5, 1, 1], collapse: { step: 1, to: 0.2, duration: 2, ease: "linear" } }), counter: { source: "cells" } });
  let state = createPlaybackState({ phase: "playing", slideKey: "shrink", stepKey: "1", stepIndex: 1 });
  const removed = scene.instances[3], position = instancePosition(removed, state);
  state = advancePlayback(advancePlayback(state, 0), 750);
  expect(instancePosition(removed, state)).toEqual(position);
  expect(instanceOpacity(removed, state)).toBeCloseTo(0.5);
  expect(sampleWorldUniforms(scene, state)[worldHeaderSize + 3 * worldInstanceSize + 3]).toBeCloseTo(0.065);
  state = advancePlayback(state, 2000);
  expect(instancePosition(removed, state)).toEqual(position);
  expect(instanceOpacity(removed, state)).toBe(0);
  expect(instanceOpacity(removed, clock(0))).toBe(1);
  const empty = prepareWorldScene({ instances: voxelInstances({ id: "empty", grid: [2, 2, 2], collapse: { step: 1, to: 0, duration: 1 } }), counter: { source: "empty" } });
  const initial = empty.instances.map(instance => instancePosition(instance, clock(0)));
  const finished = clock(1, 1, { 1: 0 });
  expect(sampleWorldUniforms(empty, finished)[56]).toBe(0);
  expect(empty.instances.every(instance => instanceOpacity(instance, finished) === 0)).toBe(true);
  expect(empty.instances.map(instance => instancePosition(instance, finished))).toEqual(initial);
});

test("stages, material references, light direction and HDR post settings share animated uniforms", () => {
  const stage = { id: "b", position: compileTrack<[number, number, number]>({ 0: [10, 0, 0], 1: [12, 0, 0] }), glow: compileTrack({ 0: 1, 1: 0.5 }) };
  const scene = prepareWorldScene({ instances: [{ ...primitive("tube", { id: "tube", position: [0, 0, 0], end: [2, 0, 0], material: "stone", emissive: 4 }), stages: [stage] }],
    stages: [{ stage, parents: [] }], materials: { stone: { albedo: "#ffffff", roughness: 0.7, metal: 0.2, rim: 0.9 } },
    camera: { shots: [flyTo("b", { step: 0, offset: [0, 0, 10] })] },
    dof: { focus: "stage:b", aperture: 0.8 }, floor: { mirror: true, y: -3 }, shafts: { intensity: 0.7 }, chromatic: 0.003,
    lights: [{ kind: "spot", position: [0, 5, 0], target: [0, 0, 0], angle: 0.4 }], rim: { color: "#22d3ee", intensity: 2 } });
  const sample = clock(2, 1, { 0: 0, 1: 1 }), values = sampleWorldUniforms(scene, sample);
  expect(resolveAnchor(scene, "stage:b", sample)).toEqual([12, 0, 0]);
  expect(sampleWorldCamera(scene, sample).position).toEqual([12, 0, 10]);
  expect(values.slice(worldHeaderSize + 12, worldHeaderSize + 15)).toEqual([14, 0, 0]);
  expect(values[worldHeaderSize + 7]).toBe(2);
  expect(values.slice(worldHeaderSize + 24, worldHeaderSize + 27)).toEqual([1, 1, 1]);
  expect(values[worldHeaderSize + 27]).toBe(0.7); expect(values[worldHeaderSize + 28]).toBe(0.2);
  expect(values[32]).toBe(10); expect(values[33]).toBe(0.8); expect(values[36]).toBe(-3); expect(values[44]).toBe(0.003);
  expect(values[51]).toBe(2);
  expect(sampleWorldUniforms(prepareWorldScene({ instances: [] }), sample)[51]).toBe(0);
  expect(values.slice(72, 75)).toEqual([0, -1, 0]); expect(values[75]).toBeCloseTo(Math.cos(0.4));
  const named = prepareWorldScene({ instances: [primitive("sphere", { id: "b", position: [1, 2, 3] })], stages: scene.stages });
  expect(resolveAnchor(named, "b", sample)).toEqual([1, 2, 3]);
  expect(resolveAnchor(named, "stage:b", sample)).toEqual([12, 0, 0]);
});

test("spray sampling is stateless and gates against lit leaves", () => {
  const scene = prepareWorldScene({ instances: [...graphInstances({ data: tree("root", ["leaf"]), activate: [wave({ from: "root", step: 1 })] }),
    ...sprayInstances({ id: "spray", under: "leaves:lit", rate: 4, lifetime: 2 })] });
  const particles = scene.instances.filter(instance => instance.spray);
  expect(particles).toHaveLength(8);
  expect(particles.every(instance => instanceOpacity(instance, clock(0)) === 0)).toBe(true);
  expect(particles.some(instance => instanceOpacity(instance, clock(2, 1, { 1: 0 })) > 0)).toBe(true);
  const positions = particles.map(instance => instancePosition(instance, clock(2, 1, { 1: 0 })));
  particles.forEach(instance => instancePosition(instance, clock(10, 3, { 3: 0 })));
  expect(particles.map(instance => instancePosition(instance, clock(2, 1, { 1: 0 })))).toEqual(positions);
});

test("each spray particle carries only the leaf it samples", () => {
  const scene = prepareWorldScene({ instances: [...graphInstances({ data: tree("root", [["a", ["a1", "a2", "a3"]], ["b", ["b1", "b2", "b3"]]]) }),
    ...sprayInstances({ id: "spray", under: "leaves:lit", rate: 10, lifetime: 2 })] });
  const leaves = scene.instances.filter(instance => instance.kind === "sphere" && /^node:[ab]\d$/.test(instance.id ?? ""));
  const carried = scene.instances.filter(instance => instance.spray).map(particle => {
    const found = new Set<unknown>();
    const walk = (value: unknown) => { if (!value || typeof value !== "object") return; if (leaves.includes(value as never)) { found.add(value); return; } Object.values(value).forEach(walk); };
    walk(particle.spray);
    expect(found.size).toBe(1);
    return [...found][0];
  });
  expect(new Set(carried).size).toBe(leaves.length);
});

test("explicit materials and rim lights preserve dim graph nodes until activation", () => {
  const scene = prepareWorldScene({ instances: graphInstances({ data: tree("root"), nodes: { root: { material: "bright" } }, activate: [wave({ from: "root", step: 1 })] }),
    materials: { bright: { albedo: "#ffffff", rim: 2 } }, rim: { intensity: 3 } });
  const dim = scene.instances[0].graph!.dim;
  let state = createPlaybackState({ phase: "playing", slideKey: "material", stepKey: "0", stepIndex: 0 });
  const dark = sampleWorldUniforms(scene, state);
  expect(dark.slice(worldHeaderSize + 24, worldHeaderSize + 27)).toEqual(dim);
  expect(dark[worldHeaderSize + 7]).toBe(0);
  expect(dark[worldHeaderSize + 29]).toBe(0); expect(dark[worldHeaderSize + 30]).toBe(0);
  state = transitionPlayback(state, { ...state, stepKey: "1", stepIndex: 1 });
  state = advancePlayback(advancePlayback(state, 0), 1000);
  const lit = sampleWorldUniforms(scene, state);
  expect(lit.slice(worldHeaderSize + 24, worldHeaderSize + 27)).toEqual([1, 1, 1]);
  expect(lit[worldHeaderSize + 29]).toBe(2); expect(lit[worldHeaderSize + 30]).toBe(1);
  expect(sampleWorldUniforms(scene, clock(0)).slice(worldHeaderSize + 24, worldHeaderSize + 27)).toEqual(dim);
});

test("custom and bounded geometry keep their own draw groups and validate resources before setup", () => {
  const a = customInstances({ wgsl: "shape-a", count: 2, vertexCount: 6 }), b = customInstances({ wgsl: "shape-a", count: 3, vertexCount: 6 });
  expect(a[0].custom).toBe(a[1].custom); expect(a[0].custom).not.toBe(b[0].custom);
  const scene = prepareWorldScene({ instances: [...a, primitive("sphere"), ...b, sdfInstance({ wgsl: "distance", bounds: [[-1, -1, -1], [1, 1, 1]] })] });
  expect(scene.instances[0].kind).toBe("sphere");
  expect(scene.instances.at(-1)?.sdf).toBeDefined();
  expect(() => prepareWorldScene({ instances: [primitive("box", { material: "missing" })] })).toThrow("material");
  expect(() => prepareWorldScene({ instances: [], dof: { scale: 0 } })).toThrow("scale");
  expect(() => prepareWorldScene({ instances: [], lights: Array.from({ length: 5 }, () => ({})) })).toThrow("four");
});

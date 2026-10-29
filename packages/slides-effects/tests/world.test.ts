import { describe, expect, test } from "bun:test";
import { evaluateCamera, type CameraOptions, type ClockSample } from "../packs/world/camera";
import { activationAt, layoutTree, subset, tree, wave } from "../packs/world/graph";
import { buildWorldGraph } from "../packs/world/render";
import { compileTrack, graphInstances, instancePosition, orbInstances, prepareWorldScene, primitive, sampleTrack, sampleWorldCamera, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";

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
  expect(graph.passes.at(-1)).toMatchObject({ id: "tonemap", output: "screen" });
  expect(graph.uniformsSize).toBe(sampleWorldUniforms(scene, clock(0)).length);
  expect(orbInstances({ count: 3, seed: 7 })).toEqual(orbInstances({ count: 3, seed: 7 }));
  expect(orbInstances({ count: 3, seed: 7 })).not.toEqual(orbInstances({ count: 3, seed: 8 }));
  expect(() => prepareWorldScene({ instances: [...orbInstances({ count: 1 }), ...orbInstances({ count: 1 })] })).toThrow("id is duplicated");
  expect(() => prepareWorldScene({ instances: [...orbInstances({ id: "near", count: 1 }), ...orbInstances({ id: "far", count: 1 })] })).not.toThrow();
});

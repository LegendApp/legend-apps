import { expect, test } from "bun:test";
import { cameraPathPoint, easeProgress, evaluateCamera, type ClockSample } from "../packs/journey/camera";
import { tree } from "../packs/journey/graph";
import { renderTreeInstances } from "../packs/journey/renderTree";
import { compileTrack, prepareJourneyScene, sampleJourneyUniforms, instancePosition, instanceOpacity, sampleTrack, journeyHeaderSize, journeyInstanceSize } from "../packs/journey/scene";
import { roundedBoxInstances, routedTubeInstances, pillarInstances } from "../packs/journey/stage";
import { routePoint } from "../packs/journey/stageMotion";
import { journeyGraphTopology } from "../packs/journey/render";
import { trackIds } from "../packs/journey/track";

const clock = (time: number, step = 1): ClockSample => ({ slideTime: time, stepTime: time - 2, stepIndex: step, stepOrigins: { 0: 0, 1: 2 } });

test("camera spline visits via points, cranes, and drifts only after settling", () => {
  const points: [number, number, number][] = [[0, 0, 0], [2, 5, 3], [4, 4, 6], [7, 0, 8]];
  expect(cameraPathPoint(points, 1 / 3)).toEqual(points[1]);
  expect(cameraPathPoint(points, 2 / 3)).toEqual(points[2]);
  const shots = [{ step: 0, position: points[0] }, { step: 1, position: points[3], via: points.slice(1, 3), duration: 3, ease: "linear" as const, idle: { position: [0.2, 0.1, 0.1] as [number, number, number] } }];
  expect(evaluateCamera({ shots }, clock(3)).position).toEqual(points[1]);
  expect(evaluateCamera({ shots }, clock(5)).position).toEqual(points[3]);
  expect(evaluateCamera({ shots }, clock(6)).position[0]).toBeGreaterThan(points[3][0]);
  const crane = evaluateCamera({ shots: [{ step: 0, position: [0, 0, 10] }, { step: 1, position: [0, 0, 10], duration: 2, crane: { height: 4, pullback: 3 } }] }, clock(3));
  expect(crane.position).toEqual([0, 4, 13]);
  expect(evaluateCamera({ shots }, clock(2)).position).toEqual(points[0]);
});

test("route draw-in and pulses share arc length through orthogonal bends", () => {
  const path: [number, number, number][] = [[0, 0, 0], [0, 1, 0], [3, 1, 0]];
  expect(routePoint(path, [0, 1, 4], 2)).toEqual([1, 1, 0]);
  const instances = routedTubeInstances({ id: "route", path, material: { albedo: "#000000", roughness: .3, metal: .8 }, draw: [{ step: 0, value: 0 }, { step: 1, value: 1, duration: 2, ease: "linear" }], pulses: [{ step: 1, duration: 2 }] });
  const scene = prepareJourneyScene({ instances }), sample = clock(3), values = sampleJourneyUniforms(scene, sample);
  const segment = scene.instances.findIndex(i => i.id === "route:1"), base = journeyHeaderSize + segment * journeyInstanceSize;
  expect(Array.from(values.slice(base + 12, base + 15))).toEqual([1, 1, 0]);
  expect(Array.from(values.slice(base + 24, base + 27))).toEqual([0, 0, 0]);
  expect(values[base + 27]).toBeCloseTo(.3);
  expect(values[base + 28]).toBeCloseTo(.8);
  const bead = instances.find(i => i.id === "route:pulse:0:0")!;
  expect(bead.material).toBeUndefined();
  expect(instancePosition(bead, sample)).toEqual([1, 1, 0]);
  expect(instanceOpacity(bead, clock(1, 0))).toBe(0);
  expect(instanceOpacity(bead, clock(5))).toBe(0);
  expect(instanceOpacity(instances[1], clock(2))).toBe(0);
  const hidden = sampleJourneyUniforms(scene, clock(2));
  expect(Array.from(hidden.slice(base + 12, base + 15))).not.toEqual(Array.from(hidden.slice(base, base + 3)));
  const long = routedTubeInstances({ id: "long", path, pulses: [{ at: 0, duration: 1, size: 0.11, trailSize: 0.06, beads: 14, spacing: 0.05 }] }).filter(i => i.id!.includes(":pulse:"));
  expect(long).toHaveLength(14);
  expect([long[0].size.initial, long[1].size.initial]).toEqual([0.11, 0.06 * (1 - 0.63 / 14)]);
  expect(instanceOpacity(long[13], clock(1.6))).toBe(1);
  expect(instanceOpacity(long[6], clock(1.6))).toBe(0);
});

test("rounded nodes have mesh thickness, and typed flashes retain selection and pulse colors", () => {
  const box = roundedBoxInstances({ scale: [2, 1, 0.4] })[0];
  expect(box.custom!.vertexCount).toBeGreaterThan(36);
  expect(box.card).toBeUndefined();
  const instances = renderTreeInstances({ data: tree("root", ["a", "b"]), flashes: [undefined, { nodes: ["a"], type: "update" }], flashColors: { update: "#a78bfa" } });
  expect(() => prepareJourneyScene({ instances })).not.toThrow();
  const node = instances.find(i => i.id === "tree:a")!;
  expect(sampleTrack(node.emissive, clock(2.39))).toBeCloseTo(0.42);
  const pulse = instances.find(i => i.id === "tree:a:edge:pulse:0:0")!;
  expect(pulse.route!.pulse!.color).toBe("#a78bfa");
  expect(instanceOpacity(pulse, clock(2.3))).toBe(1);
  expect(instances.some(i => i.id?.startsWith("tree:b:edge:pulse"))).toBe(false);
});

test("pillar body height, top position, and extruded counter read the same eased value", () => {
  const instances = pillarInstances({ id: "metric", value: 100, maximum: 100, height: 6, position: [2, -4, 0], step: 1, duration: 2 });
  const scene = prepareJourneyScene({ instances });
  const before = JSON.stringify(scene);
  const sample = clock(3), values = sampleJourneyUniforms(scene, sample);
  // The prepared scene is shared with worklets (frozen in development), so sampling must not write into it.
  expect(JSON.stringify(scene)).toBe(before);
  const bodyIndex = scene.instances.findIndex(i => i.id === "metric"), base = journeyHeaderSize + bodyIndex * journeyInstanceSize;
  expect(values[base + 9]).toBeCloseTo(3);
  expect(values[base + 1]).toBeCloseTo(-2.5);
  expect(instancePosition(instances.find(i => i.id === "metric:cap")!, sample)).toEqual([2, -1, 0]);
  const digits = instances.filter(i => i.pillar?.role === "digit");
  expect(sampleTrack(digits[0].pillar!.value, sample)).toBe(50);
  expect(instanceOpacity(digits.find(i => i.pillar!.digit === 2)!, sample)).toBe(0);
  expect(instanceOpacity(digits.find(i => i.pillar!.digit === 1 && i.pillar!.segment === 0)!, sample)).toBe(1);
  expect(instanceOpacity(digits.find(i => i.pillar!.digit === 1 && i.pillar!.segment === 1)!, sample)).toBe(0);
  // Rewinding is stateless: floor origin and count both return to zero.
  expect(instancePosition(instances.find(i => i.id === "metric:cap")!, clock(1, 0))).toEqual([2, -4, 0]);
});

test("reused uniform buffers keep route and pillar motion live across samples and direct jumps", () => {
  const scene = prepareJourneyScene({ instances: [
    ...routedTubeInstances({ id: "edge", path: [[0, 0, 0], [4, 0, 0]], draw: [{ step: 0, value: 0 }, { step: 1, value: 1, duration: 2, ease: "linear" }], pulses: [{ step: 1 }] }),
    ...pillarInstances({ id: "value", value: 100, maximum: 100, height: 4, step: 1, duration: 2 }),
  ] });
  const early = sampleJourneyUniforms(scene, clock(2.5), undefined, 1, 1, true);
  const body = journeyHeaderSize + scene.instances.findIndex(i => i.id === "value") * journeyInstanceSize;
  const earlyHeight = early[body + 9];
  const later = sampleJourneyUniforms(scene, clock(4), undefined, 1, 1, true);
  expect(later).toBe(early);
  expect(later[body + 9]).toBe(4);
  expect(earlyHeight).toBeLessThan(later[body + 9]);
  const jumped: ClockSample = { slideTime: 0, stepTime: 0, stepIndex: 3, stepOrigins: {} };
  const pulse = scene.instances.find(i => i.id === "edge:pulse:0:0")!;
  expect(instanceOpacity(pulse, jumped)).toBe(0);
  expect(instancePosition(scene.instances.find(i => i.id === "value:cap")!, jumped)[1]).toBe(0);
});

test("rotation keyframes and stage opacity reach instance uniforms, live and cached", () => {
  const turn = [{ step: 0, value: [0, 0, 0] as [number, number, number] }, { step: 1, value: [-90, 0, 0] as [number, number, number], duration: 1, ease: "linear" as const }];
  const [slab] = roundedBoxInstances({ id: "slab", rotation: turn }), [lone] = roundedBoxInstances({ id: "lone", rotation: turn, position: [3, 0, 0] });
  slab.stages = [{ id: "fade", position: compileTrack<[number, number, number]>([0, 0, 0]), glow: compileTrack(1), opacity: compileTrack([{ step: 0, value: 1 }, { step: 1, value: 0, duration: 1, ease: "linear" }]) }];
  const scene = prepareJourneyScene({ instances: [slab, lone] }), field = (values: ArrayLike<number>, id: string, offset: number) =>
    values[journeyHeaderSize + scene.instances.findIndex(i => i.id === id) * journeyInstanceSize + offset];
  const mid = sampleJourneyUniforms(scene, clock(2.5));
  expect(field(mid, "slab", 20)).toBeCloseTo(-Math.PI / 4);
  expect(field(mid, "slab", 23)).toBeCloseTo(.5);
  expect(field(mid, "lone", 23)).toBe(1);
  sampleJourneyUniforms(scene, clock(2.5), undefined, 1, 1, true);
  const done = sampleJourneyUniforms(scene, clock(4), undefined, 1, 1, true);
  expect(field(done, "slab", 20)).toBeCloseTo(-Math.PI / 2);
  expect(field(done, "slab", 23)).toBe(0);
});

test("rounded pillars use a gradient geometry and may overshoot their height while springing", () => {
  const instances = pillarInstances({ id: "v", value: 100, maximum: 100, height: 4, step: 1, duration: 1, ease: "spring", radius: .1, gradient: .4, counter: false });
  expect(instances.map(i => i.id)).toEqual(["v"]);
  expect(instances[0].custom!.wgsl).toContain("1.-0.400000*(1.-rise)");
  const scene = prepareJourneyScene({ instances }), body = journeyHeaderSize + scene.instances.findIndex(i => i.id === "v") * journeyInstanceSize;
  expect(sampleJourneyUniforms(scene, clock(2.32))[body + 9]).toBeGreaterThan(4.2);
  expect(sampleJourneyUniforms(scene, clock(4))[body + 9]).toBeCloseTo(4);
});

test("rounded boxes with the same geometry share one custom draw", () => {
  const instances = [...roundedBoxInstances({ id: "a", radius: .08 }), ...roundedBoxInstances({ id: "b", radius: .08, position: [2, 0, 0] })];
  expect(journeyGraphTopology(prepareJourneyScene({ instances })).customs?.map(draw => draw.count)).toEqual([2]);
});

test("inOut ease starts gently, stays bounded and mirrors its finish", () => {
  expect(easeProgress(-1, "inOut")).toBe(0);
  expect(easeProgress(2, "inOut")).toBe(1);
  expect(easeProgress(.25, "inOut")).toBe(.0625);
  expect(easeProgress(.5, "inOut")).toBe(.5);
  expect(easeProgress(.75, "inOut")).toBe(.9375);
  expect(easeProgress(.01, "inOut")).toBeLessThan(.00001);
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    expect(easeProgress(p, "inOut")).toBe(easeProgress(p, "cubic"));
    expect(easeProgress(p, "inOut") + easeProgress(1 - p, "inOut")).toBeCloseTo(1);
  }
});

test("out ease decelerates into the target", () => {
  expect(easeProgress(.5, "out")).toBeCloseTo(.875);
});


test("mitered closed routed tubes join every corner, including the closing endpoint, without changing default routes", () => {
  const path: [number, number, number][] = [[-2, 1, 0], [2, 1, 0], [2, -1, 0], [-2, -1, 0], [-2, 1, 0]];
  const closed = routedTubeInstances({ id: "frame", path, join: "miter" });
  expect(closed).toHaveLength(4);
  expect(trackIds(prepareJourneyScene({ instances: closed })).sort()).toEqual(["tube:frame:0", "tube:frame:1", "tube:frame:2", "tube:frame:3"]);
  for (const segment of closed) {
    expect(segment.custom).toBeDefined();
    expect(segment.custom!.vertexCount).toBe(12 * 6 * 6);
    // Both ends intersect the adjacent segment's bisector plane; the growing endpoint stays square until it arrives.
    expect(segment.custom!.wgsl).toContain("dot(normal, startMiter)");
    expect(segment.custom!.wgsl).toContain("dot(normal, endMiter)");
    expect(segment.custom!.wgsl).toContain("length(endpoint)");
  }
  expect(routedTubeInstances({ id: "default", path }).every(i => !i.custom)).toBe(true);
  expect(() => routedTubeInstances({ id: "open", path: path.slice(0, -1), join: "miter" })).toThrow("closed path");
});

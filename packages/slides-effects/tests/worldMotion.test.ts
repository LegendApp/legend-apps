import { expect, test } from "bun:test";
import { burstInstances, choreographyInstances, composePartRotation, eventElapsed, partsFromInstances, railPoint, rotatePart, settleProgress, type ChoreographyLayout, type ChoreographyOptions } from "../packs/world/motion";
import { instanceOpacity, instancePosition, prepareWorldScene, primitive, cardInstances, customInstances, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import type { ClockSample, Vec3 } from "../packs/world/camera";

const clock = (time: number, step = 0, stepOrigins: Record<number, number> = { 0: 0 }): ClockSample => ({ slideTime: time, stepTime: time - (stepOrigins[step] ?? 0), stepIndex: step, stepOrigins });
const part = (id: string, x: number, kind: "box" | "sphere" = "box") => ({ id, home: { position: [x, 0, 0] as Vec3 }, instances: [primitive(kind, { size: 0.5, color: "#22d3ee" })] });
const layouts: ChoreographyLayout[] = [
  { id: "many", parts: Array.from({ length: 18 }, (_, i) => part(`a${i}`, i - 8.5)) },
  { id: "few", parts: Array.from({ length: 7 }, (_, i) => part(`b${i}`, i - 3, "sphere")) },
  { id: "bases", parts: Array.from({ length: 3 }, (_, i) => part(`c${i}`, i * 3 - 3)) },
];
const options: ChoreographyOptions = { id: "motion", layouts, transitions: [
  { from: "many", to: "few", step: 1, duration: 1, stagger: 0.02, onLand: { count: 3, seed: 42 } },
  { from: "few", to: "bases", step: 2, duration: 1, stagger: 0.02 },
] };
const visible = (instances: ReturnType<typeof choreographyInstances>, state: ClockSample) => instances.filter(instance => !instance.burst && instanceOpacity(instance, state) > 0.99);

test("18 parts merge into seven, then three; direct jumps and reverse seek have no stale state", () => {
  const instances = choreographyInstances(options);
  expect(visible(instances, clock(0))).toHaveLength(18);
  expect(visible(instances, clock(4, 1, { 0: 0, 1: 1 }))).toHaveLength(7);
  expect(visible(instances, clock(6, 2, { 0: 0, 1: 1, 2: 4 }))).toHaveLength(3);
  expect(visible(instances, clock(4, 2, { 2: 4 }))).toHaveLength(7);
  expect(visible(instances, clock(6, 2, { 2: 4 }))).toHaveLength(3);
  expect(visible(instances, clock(0))).toHaveLength(18);
});
test("stagger keeps homes visible until departure, swaps geometry once, and exactly seats on arrival", () => {
  const instances = choreographyInstances({ ...options, transitions: [{ from: "many", to: "few", at: 1, duration: 2, stagger: 0.1, swapAt: 0.4 }] });
  const source = instances.find(instance => instance.id === "motion:flight:0:0:from:0")!;
  const target = instances.find(instance => instance.id === "motion:flight:0:0:to:0")!;
  expect(instanceOpacity(source, clock(0.9))).toBe(0);
  expect(instanceOpacity(source, clock(1))).toBe(1);
  expect(instanceOpacity(source, clock(1.79))).toBe(1);
  expect(instanceOpacity(source, clock(1.8))).toBe(0);
  expect(instanceOpacity(target, clock(1.8))).toBe(1);
  expect(instancePosition(source, clock(1.8))).toEqual(instancePosition(target, clock(1.8)));
  expect(source.kind).toBe("box"); expect(target.kind).toBe("sphere");
  const lateHome = instances.find(instance => instance.id === "motion:home:many:a17:0")!;
  expect(instanceOpacity(lateHome, clock(1.8))).toBe(1);
  const home = instances.find(instance => instance.id === "motion:home:few:b0:0")!;
  expect(instanceOpacity(home, clock(3))).toBe(1);
  expect(instancePosition(home, clock(3))).toEqual([-3, 0, 0]);
  expect(instanceOpacity(target, clock(3))).toBe(0);
});
test("a single source splits into all destinations with explicit routes", () => {
  const instances = choreographyInstances({ id: "split", layouts: [layouts[2], layouts[0]], transitions: [{ from: "bases", to: "many", at: 1, stagger: 0, duration: 1 }] });
  expect(visible(instances, clock(0))).toHaveLength(3);
  expect(visible(instances, clock(1.8))).toHaveLength(18);
  expect(visible(instances, clock(2))).toHaveLength(18);
});
test("rails honor control points, rotation composes XYZ, and settle overshoots before resting", () => {
  expect(railPoint([0, 0, 0], [4, 0, 0], [[0, 4, 0], [4, 4, 0]], 0.5)).toEqual([2, 3, 0]);
  expect(settleProgress(0.89)).toBeCloseTo(1.08);
  expect(settleProgress(1)).toBe(1);
  const rotated = rotatePart([1, 0, 0], [0, 0, Math.PI / 2]);
  expect(rotated[0]).toBeCloseTo(0); expect(rotated[1]).toBeCloseTo(1);
});
test("home position, scale, rotation and color reach real packed mesh uniforms", () => {
  const instances = choreographyInstances({ id: "pose", layouts: [{ id: "home", parts: [{ id: "mesh", instances: [primitive("box", { position: [1, 0, 0], scale: [2, 1, 1] })],
    home: { position: [3, 4, 5], rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2], color: "#ffffff" } }] }], transitions: [] });
  const scene = prepareWorldScene({ instances }), values = sampleWorldUniforms(scene, clock(0));
  expect(Array.from(values.slice(worldHeaderSize, worldHeaderSize + 3))).toEqual([3, 6, 5]);
  expect(Array.from(values.slice(worldHeaderSize + 8, worldHeaderSize + 11))).toEqual([4, 2, 2]);
  expect(Array.from(values.slice(worldHeaderSize + 4, worldHeaderSize + 7))).toEqual([1, 1, 1]);
  expect(values[worldHeaderSize + 22]).toBeCloseTo(Math.PI / 2);
});
test("one-shot sparks are seeded, ballistic, dormant before firing, and never wrap", () => {
  const options = { id: "spark", position: [2, 1, -3] as Vec3, step: 1, delay: 0.5, count: 10, seed: 72, lifetime: 0.6 };
  const a = burstInstances(options), b = burstInstances(options);
  expect(a).toEqual(b); expect(a[0].burst!.velocity).not.toEqual(a[1].burst!.velocity);
  expect(instanceOpacity(a[0], clock(5, 0))).toBe(0);
  const before = clock(5.49, 1, { 0: 0, 1: 5 }), birth = clock(5.5, 1, { 0: 0, 1: 5 });
  expect(instanceOpacity(a[0], before)).toBe(0);
  expect(instancePosition(a[0], birth)).toEqual([2, 1, -3]);
  expect(instanceOpacity(a[0], birth)).toBe(1);
  const mid = clock(5.8, 1, { 0: 0, 1: 5 });
  expect(instanceOpacity(a[0], mid)).toBeGreaterThan(0);
  expect(instancePosition(a[0], mid)[1]).toBeCloseTo(1 + a[0].burst!.velocity[1] * 0.3 - 4.9 * 0.09);
  expect(instanceOpacity(a[0], clock(100, 1, { 0: 0, 1: 5 }))).toBe(0);
  expect(instancePosition(a[0], mid)).toEqual(instancePosition(b[0], mid));
});
test("landing sparks include route delay and stay on the destination seat", () => {
  const instances = choreographyInstances(options), spark = instances.find(instance => instance.id === "motion:land:0:1:0")!;
  expect(spark.burst!.options.delay).toBe(1.02);
  expect(instanceOpacity(spark, clock(2.01, 1, { 0: 0, 1: 1 }))).toBe(0);
  expect(instancePosition(spark, clock(2.02, 1, { 0: 0, 1: 1 }))).toEqual([-2, 0, 0]);
  expect(instanceOpacity(spark, clock(3, 1, { 0: 0, 1: 1 }))).toBe(0);
});
test("prepared motion does not enter the static uniform cache; rewinding restores the same frame", () => {
  const scene = prepareWorldScene({ instances: choreographyInstances(options) });
  expect(scene.instances.filter(instance => instance.choreography || instance.burst).every(instance => instance.motion !== "static")).toBe(true);
  const a = Array.from(sampleWorldUniforms(scene, clock(1.4, 1, { 0: 0, 1: 1 }), undefined, 1, 1, true));
  sampleWorldUniforms(scene, clock(6, 2, { 0: 0, 1: 1, 2: 4 }), undefined, 1, 1, true);
  expect(Array.from(sampleWorldUniforms(scene, clock(1.4, 1, { 0: 0, 1: 1 }), undefined, 1, 1, true))).toEqual(a);
  expect(a.length).toBe(worldHeaderSize + scene.instances.length * worldInstanceSize);
});
test("invalid mappings and timings fail at scene construction", () => {
  expect(() => choreographyInstances({ ...options, transitions: [{ ...options.transitions[0], mapping: [{ from: "a0", to: "b0" }] }] })).toThrow("cover every");
  expect(() => choreographyInstances({ ...options, transitions: [{ ...options.transitions[0], duration: 0 }] })).toThrow("duration");
  expect(() => choreographyInstances({ ...options, transitions: [{ ...options.transitions[0], swapAt: 1.5 }] })).toThrow("swap");
  expect(() => burstInstances({ position: [0, 0, 0], at: 1, step: 1 })).toThrow("either at or step");
  expect(eventElapsed({ step: 1 }, clock(5, 2, { 2: 5 }))).toBe(Infinity);
});


test("rigid pose rotation composes with the published glyph degree convention", () => {
  const local: Vec3 = [25, -17, 33], pose: Vec3 = [0.3, 0.5, -0.2];
  const combined = composePartRotation(local, pose).map(value => value * Math.PI / 180) as Vec3;
  const expected = rotatePart(rotatePart([0.3, -0.7, 1.2], local.map(value => value * Math.PI / 180) as Vec3), pose);
  rotatePart([0.3, -0.7, 1.2], combined).forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 7));
});


test("local card text offsets and template opacity survive rigid placement", () => {
  const templates = cardInstances({ id: "card", position: [2, 0, 0], title: "Tile", titleOpacity: 0.7 });
  const instances = choreographyInstances({ id: "card-pose", layouts: [{ id: "one", parts: [{ id: "card", instances: templates, home: { position: [3, 0, 0] } }] }], transitions: [] });
  const label = instances.find(instance => instance.label?.text === "Tile")!;
  const origin = templates.find(instance => instance.label?.text === "Tile")!;
  expect(instancePosition(label, clock(0))[0]).toBeCloseTo(5 + origin.label!.offset.initial[0]);
  expect(instanceOpacity(label, clock(0))).toBe(0.7);
});
test("an interrupted route cannot fire a future landing burst", () => {
  const instances = choreographyInstances({ ...options, transitions: [
    { from: "many", to: "few", at: 0, duration: 2, stagger: 0, onLand: { count: 1 } },
    { from: "few", to: "bases", at: 1, duration: 1, stagger: 0 },
  ] });
  const spark = instances.find(instance => instance.id === "motion:land:0:0:0")!;
  expect(instanceOpacity(spark, clock(2.1))).toBe(0);
});


test("custom geometry retains its template instance index across clone draw groups", () => {
  const templates = customInstances({ count: 3, vertexCount: 3, wgsl: "mesh" });
  const scene = prepareWorldScene({ instances: choreographyInstances({ id: "custom", layouts: [{ id: "one", parts: [{ id: "third", instances: [templates[2]], home: { position: [0, 0, 0] } }] }], transitions: [] }) });
  const values = sampleWorldUniforms(scene, clock(0));
  expect(values[worldHeaderSize + 31]).toBe(3);
  const still = prepareWorldScene({ instances: templates });
  expect(sampleWorldUniforms(still, clock(0))[worldHeaderSize + 31]).toBe(0);
});


test("existing instance centers become independent homes and burst landing points", () => {
  const parts = partsFromInstances([primitive("box", { id: "placed", position: [4, 2, -1] })]);
  expect(parts[0].home.position).toEqual([4, 2, -1]);
  const instances = choreographyInstances({ id: "centers", layouts: [{ id: "start", parts }, { id: "end", parts: [{ ...parts[0], home: { position: [8, 1, 3] } }] }],
    transitions: [{ from: "start", to: "end", at: 1, duration: 1, onLand: { count: 1 } }] });
  expect(instancePosition(instances[0], clock(0))).toEqual([4, 2, -1]);
  const landed = instances.find(instance => instance.id === "centers:home:end:placed:placed")!;
  expect(instancePosition(landed, clock(2))).toEqual([8, 1, 3]);
  expect(instances.find(instance => instance.burst)!.burst!.options.position).toEqual([8, 1, 3]);
});

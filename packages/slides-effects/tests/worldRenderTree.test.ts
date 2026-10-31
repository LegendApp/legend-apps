import { expect, test } from "bun:test";
import type { ClockSample } from "../packs/world/camera";
import { tree } from "../packs/world/graph";
import { renderTreeInstances } from "../packs/world/renderTree";
import { prepareWorldScene, sampleTrack } from "../packs/world/scene";

const clock = (time: number, step: number, origins: Record<number, number>): ClockSample => ({ slideTime: time, stepTime: time - origins[step], stepIndex: step, stepOrigins: origins });

test("world render tree glows flashed cards and shows each step's accumulated count", () => {
  const instances = renderTreeInstances({ data: tree("root", [["a", ["a1", "a2"]], "b"]), flashes: [undefined, "all", { subtree: "a" }, ["a2"]], total: { position: [5, 0, 0] } });
  const byId = new Map(instances.map(instance => [instance.id, instance]));
  expect(() => prepareWorldScene({ instances })).not.toThrow();
  const a = byId.get("tree:a")!, b = byId.get("tree:b")!;
  const origins = { 0: 0, 1: 1, 2: 4 };
  expect(sampleTrack(a.emissive, clock(0.5, 0, { 0: 0 }))).toBeCloseTo(0.025);
  expect(sampleTrack(a.emissive, clock(4 + 0.14 + 0.25, 2, origins))).toBeCloseTo(0.42);
  expect(sampleTrack(b.emissive, clock(9, 2, origins))).toBeCloseTo(0.025);
  // a2 renders on steps 1, 2 and 3: one count label per distinct count, each visible on its own step.
  const counts = instances.filter(instance => instance.id?.startsWith("tree:a2:count:")).map(instance => instance.id);
  expect(counts).toEqual(["tree:a2:count:1", "tree:a2:count:2", "tree:a2:count:3"]);
  expect(sampleTrack(byId.get("tree:a2:count:2")!.label!.opacity, clock(9, 2, origins))).toBeCloseTo(1);
  expect(sampleTrack(byId.get("tree:a2:count:1")!.label!.opacity, clock(9, 2, origins))).toBeCloseTo(0);
  expect(instances.filter(instance => instance.id?.startsWith("tree:total:")).map(instance => instance.id)).toEqual(["tree:total:0", "tree:total:5", "tree:total:8", "tree:total:9"]);
});

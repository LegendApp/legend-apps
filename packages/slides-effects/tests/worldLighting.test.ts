import { expect, test } from "bun:test";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { orbInstances, prepareWorldScene, primitive, sampleWorldUniforms, type WorldScene } from "../packs/world/scene";

const scene = (extra: Partial<WorldScene>) => prepareWorldScene({ instances: [primitive("box"), ...orbInstances({ count: 4 })], ...extra });
const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };

test("a key light shadow map draws casters first and every lit scene pass reads it", () => {
  const graph = buildWorldGraph(scene({ keyLight: { position: [6, 16, 12] }, floor: {} }));
  const shadow = graph.targets.find(target => target.id === "shadow")!;
  expect(shadow).toMatchObject({ format: "depth32float", scale: 0.5 });
  const casters = graph.passes.filter(pass => pass.id.startsWith("shadow-"));
  expect(casters.map(pass => pass.id)).toEqual(["shadow-box", "shadow-sphere"]);
  expect(graph.passes.indexOf(casters[0])).toBe(0);
  for (const pass of casters) if (pass.kind === "render") expect(pass).toMatchObject({ color: [], depth: "shadow" });
  for (const id of ["scene-box", "scene-sphere", "floor"]) {
    const pass = graph.passes.find(pass => pass.id === id)!;
    expect(pass.reads).toContain("shadow");
    expect(pass.code).toContain("fn keyShadow");
    expect(pass.code).toContain(`@binding(${pass.reads!.indexOf("shadow") + 3}) var shadowMap`);
  }
});

test("shadow off and contact fallback skip the shadow map", () => {
  const off = buildWorldGraph(scene({ keyLight: { shadow: false } }));
  expect(off.targets.some(target => target.id === "shadow")).toBe(false);
  expect(off.passes.find(pass => pass.id === "scene-box")!.code).toContain("keyLight(world");
  const contact = buildWorldGraph(scene({ keyLight: { shadow: "contact" } }));
  expect(contact.targets.some(target => target.id === "shadow")).toBe(false);
  expect(contact.passes.some(pass => pass.id === "contact-shadow")).toBe(true);
});

test("key light and environment animate through uniforms without changing topology", () => {
  const a = scene({ keyLight: { intensity: 2, position: [1, 2, 3] }, environment: { intensity: 1 } });
  const b = scene({ keyLight: { intensity: { 0: 1, 1: 3 }, position: { 0: [1, 2, 3], 1: [3, 2, 1] } }, environment: { intensity: { 0: 0.5, 1: 1 } } });
  expect(worldGraphTopology(a)).toEqual(worldGraphTopology(b));
  const values = sampleWorldUniforms(a, clock);
  expect([values[112], values[113], values[114], values[115], values[124]]).toEqual([1, 2, 3, 2, 1]);
  expect(buildWorldGraph(a).passes.find(pass => pass.id === "scene-box")!.code).toContain("environmentLight(normal");
});



test("Text3D glyphs cast key-light shadows and receive the key light and environment", async () => {
  const { text3dInstances } = await import("../packs/world/text3d");
  const graph = buildWorldGraph(prepareWorldScene({ keyLight: {}, environment: {}, instances: text3dInstances({ id: "t", text: "AB" }) }));
  const shadow = graph.passes.find(pass => pass.id === "shadow-glyphs-0")!;
  expect(shadow).toMatchObject({ color: [], depth: "shadow", fragment: "shadowFragment", reads: ["text3d-0"] });
  const scene = graph.passes.find(pass => pass.id === "scene-glyphs-0")!;
  expect(scene.reads).toEqual(["text3d-0", "shadow"]);
  expect(scene.code).toContain("@binding(4) var shadowMap");
  expect(scene.code).toContain("environmentLight(normal");
});



test("looping focus resolves anchor names to depths in every nested frame", () => {
  const instances = [primitive("box", { id: "near", position: [0, 0, 8] }), primitive("box", { id: "far", position: [0, 0, -4] })];
  const focus = (near: string | number, far: string | number) => [{ step: 0, value: near,
    loop: { every: 4, frames: [{ at: 0, value: near, duration: 0 }, { at: 2, value: far, duration: 1, ease: "linear" as const }] } }];
  const camera = { shots: [{ position: [0, 0, 20] as [number, number, number], target: [0, 0, 0] as [number, number, number] }] };
  const anchored = prepareWorldScene({ instances, camera, dof: { focus: focus("near", "far") } });
  const numeric = prepareWorldScene({ instances, camera, dof: { focus: focus(12, 24) } });
  for (const time of [0, 1, 2, 2.5, 3, 4, 6.5, 2.5, 0]) {
    const sample = { ...clock, slideTime: time, stepTime: time };
    expect(sampleWorldUniforms(anchored, sample)[32]).toBeCloseTo(sampleWorldUniforms(numeric, sample)[32]);
  }
});

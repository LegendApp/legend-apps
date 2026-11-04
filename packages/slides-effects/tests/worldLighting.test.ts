import { expect, test } from "bun:test";
import { floorMarkingsCode, tunnelInstances } from "../packs/world/lighting";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { orbInstances, prepareWorldScene, primitive, sampleWorldUniforms, type WorldScene } from "../packs/world/scene";

const scene = (extra: Partial<WorldScene>) => prepareWorldScene({ instances: [primitive("box"), ...orbInstances({ count: 4 })], ...extra });
const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };

test("a key light shadow map draws casters first and every lit scene pass reads it", () => {
  const graph = buildWorldGraph(scene({ keyLight: { position: [6, 16, 12] }, floor: { mirror: true } }));
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
  const reflection = graph.passes.find(pass => pass.id === "reflection-box")!;
  expect(reflection.reads).toBeUndefined();
  expect(reflection.code).not.toContain("var shadowMap");
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

test("floor markings and veil compile into the floor pass", () => {
  const graph = buildWorldGraph(scene({ floor: { mirror: true, veil: 0.6, grid: { spacing: 2 }, lines: [{ x: 9, width: 0.1 }, { x: 3, dash: 1.5 }], kerbs: [{ x: 9.2 }] } }));
  const floor = graph.passes.find(pass => pass.id === "floor")!.code;
  expect(floor).toContain("abs(abs(world.x)-9.)");
  expect(floor).toContain("fract(world.z/period)");
  expect(floor).toContain("*0.4000*(1.-mask)");
  expect(floor).toContain("var color=illuminate(world");
  const unlit = buildWorldGraph(scene({ floor: { mirror: true, lit: false } })).passes.find(pass => pass.id === "floor")!.code;
  expect(unlit).toContain("var color=material.emissive;");
  expect(unlit).not.toContain("1.-2.*(1.-reflected)");
  const overlay = buildWorldGraph(scene({ floor: { mirror: true, reflectionBlend: "overlay" } })).passes.find(pass => pass.id === "floor")!.code;
  expect(overlay).toContain("reflected=select(2.*reflected*material.albedo,1.-2.*(1.-reflected)*(1.-material.albedo),reflected>vec3f(.5));");
});

test("tunnels place portal frames with strips between them along axis-aligned paths", () => {
  const straight = tunnelInstances({ from: [0, 0, 0], to: [0, 0, -12], spacing: 6, edges: false });
  const frames = straight.filter(instance => instance.id!.includes(":beam:"));
  expect(frames.map(instance => instance.position.initial[2])).toEqual([0, -6, -12]);
  expect(straight.filter(instance => instance.id!.includes(":strip:"))).toHaveLength(4);
  const turn = tunnelInstances({ path: [[0, 0, 0], [0, 0, -8], [10, 0, -8]], spacing: 5, strips: false, edges: false });
  expect(turn.filter(instance => instance.id!.includes(":beam:")).map(instance => instance.position.initial)).toEqual([[0, 10, 0], [0, 10, -5], [2, 10, -8], [7, 10, -8]]);
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

test("tunnels add one streaking light-rig draw and track floors a start grid, both optional", () => {
  const rigs = tunnelInstances({ from: [0, 0, 0], to: [0, 0, -40], spacing: 8 }).filter(part => part.id === "tunnel:lights");
  expect(rigs.length).toBe(1);
  expect(rigs[0].custom!.vertexCount).toBe(3 * 8 * 36);
  expect(rigs[0].custom!.wgsl).toContain("travelSpeed()");
  expect(tunnelInstances({ lights: false }).some(part => part.id === "tunnel:lights")).toBe(false);
  expect(floorMarkingsCode({ kerbs: [{ x: 9 }] })).toContain("checker");
  expect(floorMarkingsCode({ kerbs: [{ x: 9 }], start: false })).not.toContain("checker");
  expect(floorMarkingsCode({})).not.toContain("checker");
  expect(worldGraphTopology(prepareWorldScene({ instances: tunnelInstances({ to: [0, 0, -40] }) })).customs!.length).toBe(1);
});

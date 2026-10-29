import { expect, test } from "bun:test";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { customInstances, prepareWorldScene, primitive, rowInstances, sdfInstance, worldHeaderSize, worldInstanceSize, type WorldScene } from "../packs/world/scene";

const quad = `
fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let p=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 return ShapeVertex(vec3f(p[vid],f32(id)),vec3f(0.,0.,1.));
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material { return Material(vec3f(.2,.5,.8),vec3f(.1),.4,0.); }
`;
const scanlines = "fn customPass(uv:vec2f,color:vec4f,ctx:PassContext)->vec4f { return color*vec4f(vec3f(.9+.1*sin(uv.y*200.)),1.); }";
const scene = (options: Partial<WorldScene> = {}) => prepareWorldScene({ instances: [primitive("sphere")], ...options });

for (const quality of ["low", "medium", "high"] as const) test(`all enabled post effects remain present at ${quality} quality`, () => {
  const graph = buildWorldGraph(scene({ quality, floor: { mirror: true }, dof: { aperture: .7 }, shafts: { intensity: 1 }, lights: [{ position: [0, 8, 0] }] }));
  const ids = graph.passes.map(pass => pass.id);
  for (const id of ["reflection-sphere", "floor", "shafts", "dof-gather", "dof-composite", "bloom-composite", "tonemap"]) expect(ids).toContain(id);
  const scale = quality === "low" ? .65 : quality === "medium" ? .85 : 1;
  const target = (id: string) => graph.targets.find(target => target.id === id)!;
  expect(target("reflect").scale).toBe(scale * .5);
  expect(target("reflectDepth").scale).toBe(target("reflect").scale);
  expect(target("dof").scale).toBe(scale * .5);
  expect(target("shafts").scale).toBe(scale * .25);
  expect(graph.uniformsSize).toBe(worldHeaderSize + worldInstanceSize);
});

test("animated floor, light and focus changes preserve topology while static quality controls change it", () => {
  const a = scene({ dof: { focus: 12, aperture: .5 }, floor: { mirror: true, roughness: .1 }, shafts: { intensity: .5 }, lights: [{ intensity: 1 }] });
  const b = scene({ dof: { focus: { 0: 12, 2: 5 }, aperture: 1 }, floor: { mirror: true, roughness: .8 }, shafts: { intensity: 2 }, lights: [{ intensity: { 0: 1, 2: 4 } }] });
  expect(worldGraphTopology(a)).toEqual(worldGraphTopology(b));
  const graph = buildWorldGraph(scene({ dof: { scale: .25, samples: 7 }, floor: { mirror: true, scale: .3 }, shafts: { scale: .125, samples: 5 } }));
  expect(graph.targets.find(target => target.id === "dof")?.scale).toBe(.25);
  expect(graph.targets.find(target => target.id === "reflect")?.scale).toBe(.3);
  expect(graph.targets.find(target => target.id === "shafts")?.scale).toBe(.125);
});

test("opaque floor clears the scene before translucent geometry loads its color and depth", () => {
  const graph = buildWorldGraph(scene({ floor: { mirror: true }, instances: rowInstances({ id: "rows", count: 3 }) }));
  const draws = graph.passes.filter(pass => pass.kind === "render");
  expect(draws.map(pass => pass.id)).toEqual(["reflection-box", "floor", "scene-box"]);
  expect(draws[0].clear).not.toBe(false);
  expect(draws[1].clear).toEqual(draws[0].clear);
  expect(draws[2].clear).toBe(false);
  const empty = buildWorldGraph(scene({ floor: {}, instances: [] }));
  expect(empty.passes.filter(pass => pass.kind === "render").map(pass => pass.id)).toEqual(["floor"]);
  const noFloor = buildWorldGraph(scene());
  expect(noFloor.passes.find(pass => pass.kind === "render")?.clear).not.toBe(false);
});

test("custom draw groups keep marker-local instance ids and SDF ranges outside primitive draws", () => {
  const prepared = scene({ instances: [primitive("sphere"), ...customInstances({ wgsl: quad, vertexCount: 6, count: 3 }),
    ...customInstances({ wgsl: quad, vertexCount: 6, count: 2 }), sdfInstance({ wgsl: "fn sdf(p:vec3f)->f32 { return length(p)-1.; }", bounds: [[-2, -2, -2], [2, 2, 2]] })] });
  const topology = worldGraphTopology(prepared);
  expect(topology.counts).toEqual({ box: 0, ring: 0, sphere: 1, tube: 0 });
  expect(topology.customs?.map(draw => [draw.offset, draw.count])).toEqual([[1, 3], [4, 2]]);
  expect(topology.sdfs?.map(draw => [draw.offset, draw.count])).toEqual([[6, 1]]);
  const graph = buildWorldGraph(topology);
  expect(graph.passes.filter(pass => pass.kind === "render").map(pass => pass.instanceCount)).toEqual([1, 3, 2, 1]);
  expect(graph.uniformsSize).toBe(worldHeaderSize + 7 * worldInstanceSize);
});

test("postOrder rewires HDR stages and custom hooks retain the declared color-space boundary", () => {
  const graph = buildWorldGraph(scene({ dof: {}, postOrder: ["bloom", "dof", "fog"], passes: [
    { id: "before-focus", wgsl: scanlines, before: "dof" }, { id: "ldr", wgsl: scanlines, after: "tonemap" },
  ] }));
  const pass = (id: string) => graph.passes.find(pass => pass.id === id)!;
  const output = (id: string) => { const item = pass(id); return item.kind === "fullscreen" ? item.output : undefined; };
  expect(pass("bloom-threshold").reads).toEqual(["hdr"]);
  expect(pass("before-focus").reads?.[0]).toBe(output("bloom-composite"));
  expect(pass("dof-gather").reads?.[0]).toBe(output("before-focus"));
  expect(pass("fog").reads?.[0]).toBe(output("dof-composite"));
  expect(pass("tonemap").kind).toBe("fullscreen");
  expect(pass("ldr").reads?.[0]).toBe(output("tonemap"));
  expect(pass("screen").reads).toEqual([output("ldr")]);
  expect(graph.passes.filter(pass => pass.id === "tonemap")).toHaveLength(1);
});

test("HDR transients reuse two targets without aliasing DOF inputs, while explicit custom reads retain intermediates", () => {
  for (const postOrder of [["fog", "dof", "bloom"], ["dof", "bloom", "fog"], ["bloom", "fog", "dof"]] as const) {
    const graph = buildWorldGraph(scene({ dof: {}, postOrder: [...postOrder], passes: [{ wgsl: scanlines, after: "tonemap" }] }));
    expect(graph.targets.filter(target => target.id.startsWith("post-"))).toHaveLength(2);
    expect(graph.targets.some(target => target.id === "hdr")).toBe(true);
    const gather = graph.passes.find(pass => pass.id === "dof-gather")!;
    const composite = graph.passes.find(pass => pass.id === "dof-composite")!;
    expect(composite.reads?.[0]).toBe(gather.reads?.[0]);
    for (const pass of graph.passes) if (pass.kind === "fullscreen") expect(pass.reads).not.toContain(pass.output);
  }
  const retained = buildWorldGraph(scene({ dof: {}, passes: [{ wgsl: scanlines, after: "bloom", reads: ["fog"] }] }));
  expect(retained.targets.some(target => target.id === "fog")).toBe(true);
  expect(retained.targets.some(target => target.id.startsWith("post-"))).toBe(false);
  expect(retained.passes.find(pass => pass.id === "custom-post-0")?.reads).toContain("fog");
});

test("invalid post stage permutations and placements fail rather than silently skipping hooks", () => {
  for (const postOrder of [["fog", "fog", "bloom"], ["fog", "bloom"], ["fog", "dof", "unknown"]]) {
    expect(() => buildWorldGraph({ quality: "high", counts: { box: 0, ring: 0, sphere: 0, tube: 0 }, backgroundVector: [0, 0, 0], postOrder })).toThrow("postOrder");
  }
  for (const placement of [{ before: "scene" }, { after: "unknown" }, { before: "fog", after: "dof" }]) {
    expect(() => buildWorldGraph(scene({ passes: [{ wgsl: scanlines, ...placement }] }))).toThrow("placement");
  }
});

test("custom ids cannot shadow built-in passes or another custom pass", () => {
  for (const id of ["fog", "scene-sphere", "tonemap", "screen"]) {
    expect(() => buildWorldGraph(scene({ passes: [{ id, wgsl: scanlines, after: "tonemap" }] }))).toThrow("pass id is duplicated");
  }
  expect(() => buildWorldGraph(scene({ passes: [
    { id: "scanlines", wgsl: scanlines, after: "fog" }, { id: "scanlines", wgsl: scanlines, after: "bloom" },
  ] }))).toThrow("pass id is duplicated");
});

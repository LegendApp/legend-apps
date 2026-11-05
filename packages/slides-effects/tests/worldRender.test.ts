import { expect, test } from "bun:test";
import { text3dInstances } from "../packs/world/text3d";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { cardInstances, customInstances, labelInstance, prepareWorldScene, primitive, rowInstances, sdfInstance, worldHeaderSize, worldInstanceSize, type WorldScene } from "../packs/world/scene";

const quad = `
fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
 let p=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
 return ShapeVertex(vec3f(p[vid],f32(id)),vec3f(0.,0.,1.));
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material { return Material(vec3f(.2,.5,.8),vec3f(.1),.4,0.); }
`;
const scanlines = "fn customPass(uv:vec2f,color:vec4f,ctx:PassContext)->vec4f { return color*vec4f(vec3f(.9+.1*sin(uv.y*200.)),1.); }";
const scene = (options: Partial<WorldScene> = {}) => prepareWorldScene({ instances: [primitive("sphere")], ...options });

for (const msaaSamples of [1, 4] as const) test(`focused parts bypass focus and travel blur with ${msaaSamples} samples`, () => {
  const graph = buildWorldGraph(scene({ msaaSamples, floor: {}, dof: {}, keyLight: {}, instances: [primitive("box"),
    ...text3dInstances({ text: "Sharp" }), labelInstance({ text: "const x = 1;", mono: true }), ...cardInstances({ id: "panel", title: "Code" })] }));
  const pass = (id: string) => graph.passes.find(pass => pass.id === id)!;
  const index = (id: string) => graph.passes.indexOf(pass(id));
  const sharp = [pass("sharp-glyphs-0"), pass("sharp-cards"), pass("sharp-labels"), pass("sharp-box")];
  expect(graph.targets.find(target => target.id === "sharp")).toMatchObject({ format: "rgba16float", scale: 1, samples: msaaSamples });
  expect(pass("sharp-clear")).toMatchObject({ kind: "render", color: ["sharp"], instanceCount: 0, clear: [0, 0, 0, 0] });
  expect(pass("sharp-clear")).not.toHaveProperty("depth");
  for (const draw of sharp) {
    expect(draw).toMatchObject({ kind: "render", color: ["sharp"], depth: "depth", blend: "over", clear: false });
    expect(draw.code).toContain("if(partSharp(slot(in.instance))!=true) { discard; }");
    const background = pass(draw.id.replace("sharp-", "scene-"));
    expect(background).toMatchObject({ color: ["hdr"], depth: "depth" });
    expect(background.code).toContain("if(partSharp(slot(in.instance))!=false) { discard; }");
    expect(graph.passes.indexOf(background)).toBeLessThan(index("dof-gather"));
    expect(graph.passes.indexOf(draw)).toBeGreaterThan(index("dof-composite"));
    expect(graph.passes.indexOf(draw)).toBeGreaterThan(index("sharp-clear"));
    expect(graph.passes.indexOf(draw)).toBeLessThan(index("tonemap"));
  }
  expect(pass("scene-box")).toMatchObject({ color: ["hdr"] });
  expect(pass("floor")).toMatchObject({ color: ["hdr"] });
  expect(pass("scene-cards").code).toContain("vec4f(color*depthFade(world),alpha)");
  for (const stage of ["dof-gather", "dof-composite", "bloom-threshold"]) expect(pass(stage).reads).not.toContain("sharp");
  const final = pass("tonemap");
  expect(final.reads).toEqual([expect.any(String), "bloom-up@0", "sharp", "depth"]);
  expect(final.code).toContain("color+=sceneAt(uv-stride*f32(i))");
  const composite = final.code.indexOf("color=color*(1.-layer.a)+layer.rgb");
  expect(composite).toBeGreaterThan(final.code.indexOf("color*=.1;"));
  expect(composite).toBeLessThan(final.code.indexOf("color=toneMap("));
  expect(final.code.indexOf("color=mix(color,")).toBeGreaterThan(composite);
  expect(final.code).toContain(msaaSamples === 4 ? "texture_depth_multisampled_2d" : "texture_depth_2d");
});

test("text-only scenes clear background depth and bind sharp color without fused bloom", () => {
  const graph = buildWorldGraph(scene({ backgroundColor: "#000000", instances: [labelInstance({ text: "Only text" })], postOrder: ["bloom", "dof", "fog"] }));
  expect(graph.passes.find(pass => pass.id === "scene-empty")).toMatchObject({ color: ["hdr"], depth: "depth", instanceCount: 0, clear: [0, 0, 0, 1] });
  const final = graph.passes.find(pass => pass.id === "tonemap")!;
  expect(final.reads).toEqual([expect.any(String), "sharp", "depth"]);
  expect(final.code).toContain("@binding(4) var sharp:texture_2d<f32>");
  expect(final.code).toContain("@binding(5) var depth:texture_depth_multisampled_2d");
});

for (const quality of ["low", "medium", "high"] as const) test(`all enabled post effects remain present at ${quality} quality`, () => {
  const graph = buildWorldGraph(scene({ quality, floor: {}, dof: { aperture: .7 }, shafts: { intensity: 1 }, lights: [{ position: [0, 8, 0] }] }));
  const ids = graph.passes.map(pass => pass.id);
  for (const id of ["scene-sphere", "floor", "shafts", "dof-gather", "dof-composite", "bloom-threshold", "tonemap"]) expect(ids).toContain(id);
  // Bloom is the last HDR stage with nothing placed after it, so the tonemap adds it instead of a separate composite pass.
  expect(ids).not.toContain("bloom-composite");
  expect(graph.passes.find(pass => pass.id === "tonemap")!.reads).toEqual([expect.any(String), "bloom-up@0", "sharp", "depth"]);
  const scale = quality === "low" ? .65 : quality === "medium" ? .85 : 1;
  const target = (id: string) => graph.targets.find(target => target.id === id)!;
  expect(target("dof").scale).toBe(scale * .5);
  expect(target("shafts").scale).toBe(scale * .5);
  expect(graph.uniformsSize).toBe(worldHeaderSize + worldInstanceSize);
});

test("animated floor, light and focus changes preserve topology while static quality controls change it", () => {
  const a = scene({ dof: { focus: 12, aperture: .5 }, floor: { roughness: .1 }, shafts: { intensity: .5 }, lights: [{ intensity: 1 }] });
  const b = scene({ dof: { focus: { 0: 12, 2: 5 }, focusRange: { 0: 0, 2: 2 }, aperture: 1 }, floor: { roughness: .8 }, shafts: { intensity: 2 }, lights: [{ intensity: { 0: 1, 2: 4 } }] });
  expect(worldGraphTopology(a)).toEqual(worldGraphTopology(b));
  const graph = buildWorldGraph(scene({ bloom: { scale: .25 }, dof: { scale: .25, samples: 7 }, shafts: { scale: .125, samples: 5 } }));
  expect(graph.targets.find(target => target.id === "dof")?.scale).toBe(.25);
  for (const id of ["bloom", "bloom-up"]) expect(graph.targets.find(target => target.id === id)?.scale).toBe(.25);
  expect(graph.targets.find(target => target.id === "shafts")?.scale).toBe(.125);
});

test("opaque boxes drop back faces so a base resting on the floor cannot z-fight with it", () => {
  const graph = buildWorldGraph(scene({ floor: {}, instances: [primitive("box"), ...customInstances({ wgsl: quad, vertexCount: 6, count: 1 })] }));
  const code = (id: string) => graph.passes.find(pass => pass.id === id)!.code;
  expect(code("scene-box")).toContain("dot(normal,eye()-in.world)<0.");
  expect(code("scene-custom-0")).not.toContain("dot(normal,eye()-in.world)<0.");
});

test("opaque floor clears the scene before translucent geometry loads its color and depth", () => {
  const graph = buildWorldGraph(scene({ floor: {}, instances: rowInstances({ id: "rows", count: 3 }) }));
  const draws = graph.passes.filter(pass => pass.kind === "render");
  expect(draws.map(pass => pass.id)).toEqual(["floor", "scene-box", "sharp-clear", "sharp-box"]);
  expect(draws[0].clear).not.toBe(false);
  expect(draws[1].clear).toBe(false);
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
  expect(graph.passes.filter(pass => pass.kind === "render" && pass.id.startsWith("scene-")).map(pass => pass.instanceCount)).toEqual([1, 3, 2, 1]);
  expect(graph.uniformsSize).toBe(worldHeaderSize + 7 * worldInstanceSize);
});

test("custom draw order compares WGSL by code unit rather than locale", () => {
  const lower = quad.replace("vec3f(.2,.5,.8)", "vec3f(.2,.5,.8)*alpha"), upper = quad.replace("vec3f(.2,.5,.8)", "vec3f(.2,.5,.8)*Beta");
  const topology = worldGraphTopology(scene({ instances: [primitive("sphere"), ...customInstances({ wgsl: lower, vertexCount: 6, count: 2 }),
    ...customInstances({ wgsl: upper, vertexCount: 3, count: 3 })] }));
  expect(topology.customs?.map(draw => [draw.wgsl, draw.offset, draw.count])).toEqual([[upper, 1, 3], [lower, 4, 2]]);
  const graph = buildWorldGraph(topology);
  expect(graph.passes.filter(pass => pass.kind === "render" && pass.id.startsWith("scene-")).map(pass => [pass.vertexCount, pass.instanceCount])).toEqual([[expect.any(Number), 1], [3, 3], [6, 2]]);
  expect(graph.uniformsSize).toBe(worldHeaderSize + 6 * worldInstanceSize);
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

test("auto quality drops MSAA only where the drawable already supersamples the slide", () => {
  const scene = prepareWorldScene({ quality: "auto", instances: [primitive("box")], floor: {} });
  const samples = (topology: object) => buildWorldGraph({ ...worldGraphTopology(scene), ...topology }).targets.filter(target => target.samples === 4).map(target => target.id);
  expect(samples({})).toEqual(["hdr", "depth", "sharp"]);
  expect(samples({ supersampled: true })).toEqual([]);
  expect(samples({ supersampled: true, quality: "high" })).toHaveLength(3);
});

test("fog directly before focus folds into the focus passes unless shafts or hooks sit between them", () => {
  const ids = (options: Partial<WorldScene>) => buildWorldGraph(scene(options)).passes.map(pass => pass.id);
  const fused = buildWorldGraph(scene({ dof: {} }));
  expect(fused.passes.map(pass => pass.id)).not.toContain("fog");
  expect(fused.passes.find(pass => pass.id === "dof-gather")!.reads?.[0]).toBe("hdr");
  for (const id of ["dof-gather", "dof-composite"]) expect((fused.passes.find(pass => pass.id === id) as { code: string }).code).toContain("heightDensity");
  expect(ids({})).toContain("fog");
  expect(ids({ dof: {}, shafts: { intensity: 1 } })).toContain("fog");
  expect(ids({ dof: {}, passes: [{ wgsl: scanlines, before: "dof" }] })).toContain("fog");
  expect(ids({ dof: {}, postOrder: ["dof", "fog", "bloom"] })).toContain("fog");
});

test("explicit MSAA samples preserve high-quality scales and FXAA while changing depth reads", () => {
  const build = (msaaSamples?: 1 | 4) => buildWorldGraph(JSON.parse(JSON.stringify(worldGraphTopology(scene({ quality: "high", msaaSamples, dof: {} })))));
  const standard = build(), single = build(1), multisampled = build(4);
  expect(multisampled).toEqual(standard);
  for (const id of ["hdr", "depth"]) {
    expect(standard.targets.find(target => target.id === id)).toMatchObject({ scale: 1, samples: 4 });
    expect(single.targets.find(target => target.id === id)).toMatchObject({ scale: 1, samples: 1 });
  }
  const gather = (graph: typeof single) => graph.passes.find(pass => pass.id === "dof-gather")!.code;
  expect(gather(standard)).toContain("texture_depth_multisampled_2d");
  expect(gather(single)).toContain("texture_depth_2d");
  expect(gather(single)).not.toContain("texture_depth_multisampled_2d");
  expect(single.passes.at(-1)).toMatchObject({ id: "screen", fragment: "fxaa" });
});

test("text draws cull by their own opacity slots in scene and shadow", () => {
  const graph = buildWorldGraph(scene({ keyLight: {}, floor: {},
    instances: [primitive("sphere"), ...text3dInstances({ text: "Ab" })] }));
  const glyphs = graph.passes.filter(pass => pass.kind === "render" && pass.id.includes("glyphs"));
  expect(glyphs.map(pass => pass.id)).toEqual(["shadow-glyphs-0", "scene-glyphs-0", "sharp-glyphs-0"]);
  for (const pass of glyphs) expect(pass).toMatchObject({ instanceCount: 2,
    instanceCull: { offset: worldHeaderSize + worldInstanceSize + 23, stride: worldInstanceSize, threshold: .001 } });
});

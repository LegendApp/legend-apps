// @ts-nocheck GPU descriptors are captured at the real setup/encode boundary.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { prepareRenderGraph, encodeRenderGraph } from "../gpuRenderGraph";

function gpu() {
  const textures = [], pipelines = [], groups = [], commands = [], writes = [];
  const device = {
    queue: { writeBuffer: (...args) => writes.push(args) },
    createBuffer: descriptor => ({ descriptor }), createSampler: () => ({}),
    createShaderModule: descriptor => ({ descriptor, getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: descriptor => descriptor, createPipelineLayout: descriptor => descriptor,
    createComputePipeline: descriptor => { pipelines.push(descriptor); return descriptor; },
    createRenderPipeline: descriptor => { pipelines.push(descriptor); return descriptor; },
    createTexture: descriptor => {
      const texture = { descriptor, width: descriptor.size[0], height: descriptor.size[1], destroyed: false, createView: view => ({ texture, view }), destroy() { this.destroyed = true; } };
      textures.push(texture); return texture;
    },
    createBindGroup: descriptor => { groups.push(descriptor); return descriptor; },
  };
  const encoder = {
    beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups: (...args) => commands.push(["compute", ...args]), end() {} }),
    beginRenderPass: descriptor => {
      commands.push(["render", descriptor]);
      return { setPipeline() {}, setBindGroup() {}, draw: (...args) => commands.push(["draw", ...args]), end() {} };
    },
  };
  return { device, encoder, textures, pipelines, groups, commands, writes };
}
const definition = {
  targets: [{ id: "hdr", format: "rgba16float" }, { id: "depth", format: "depth32float" }, { id: "bloom", format: "rgba16float", scale: .5, mips: 3 }],
  buffers: [{ id: "instances", size: 16, init: new Float32Array([99, 1, 2, 3, 4, 99]).subarray(1, 5) }],
  passes: [
    { kind: "compute", id: "positions", code: "", entry: "main", reads: ["instances"], writes: ["hdr"], workgroups: "perPixel" },
    { kind: "render", id: "scene", code: "", vertex: "vertex", fragment: "fragment", color: ["hdr"], depth: "depth", vertexCount: 24, instanceCount: 40 },
    { kind: "fullscreen", id: "bloom", code: "", fragment: "bloom", reads: ["hdr"], output: "bloom", mip: 1 },
    { kind: "fullscreen", id: "screen", code: "", fragment: "final", reads: ["bloom@1", "depth"], output: "screen" },
  ],
};

test("multipass setup binds declared resources, initializes buffers, and submits ordered compute/render/mip passes", async () => {
  const g = gpu(), clock = {}, uniforms = {};
  const r = await prepareRenderGraph(g.device, definition, "bgra8unorm", clock, uniforms);
  expect(g.pipelines).toHaveLength(4);
  expect(g.writes[0][2]).toBe(definition.buffers[0].init.buffer);
  expect(g.writes[0].slice(3)).toEqual([4, 16]);
  expect(new Float32Array(g.writes[0][2], g.writes[0][3], g.writes[0][4] / 4)).toEqual(new Float32Array([1, 2, 3, 4]));
  const screen = { width: 1920, height: 1080, createView: () => "screen" };
  encodeRenderGraph(r, g.device, g.encoder, screen);
  expect(g.textures.map(t => t.descriptor.size)).toEqual([[1920, 1080], [1920, 1080], [960, 540]]);
  expect(g.textures[2].descriptor.mipLevelCount).toBe(3);
  expect(g.groups[0].entries.map(e => e.binding)).toEqual([0, 1, 2, 3, 4]);
  expect(g.groups[0].entries[0].resource.buffer).toBe(clock);
  expect(g.groups[0].entries[1].resource.buffer).toBe(uniforms);
  expect(g.groups[3].entries[3].resource.view).toEqual({ baseMipLevel: 1, mipLevelCount: 1 });
  expect(g.commands.map(c => c[0])).toEqual(["compute", "render", "draw", "render", "draw", "render", "draw"]);
  expect(g.commands[0]).toEqual(["compute", 240, 135]);
  expect(g.commands[2]).toEqual(["draw", 24, 40]);
  expect(g.commands[1][1].depthStencilAttachment.depthClearValue).toBe(1);
  expect(g.commands.at(-2)[1].colorAttachments[0].view).toBe("screen");
  encodeRenderGraph(r, g.device, g.encoder, screen);
  expect(g.groups).toHaveLength(4); expect(g.textures).toHaveLength(3);
  encodeRenderGraph(r, g.device, g.encoder, { ...screen, width: 3840, height: 2160 });
  expect(g.pipelines).toHaveLength(4); expect(g.groups).toHaveLength(8);
  expect(g.textures.slice(0, 3).every(t => t.destroyed)).toBe(true);
  expect(g.textures.slice(3).map(t => t.descriptor.size)).toEqual([[3840, 2160], [3840, 2160], [1920, 1080]]);
});

test("empty draws and dispatches still run their passes without a zero-count GPU call", async () => {
  const g = gpu();
  const r = await prepareRenderGraph(g.device, { targets: definition.targets, passes: [
    { kind: "compute", id: "instances", code: "", entry: "main", writes: ["hdr"], workgroups: { perInstance: 0 } },
    { kind: "render", id: "empty", code: "", vertex: "vertex", fragment: "fragment", color: ["hdr"], depth: "depth", vertexCount: 36, instanceCount: 0, clear: [0, 0, 0, 1] },
  ] }, "bgra8unorm", {}, {});
  encodeRenderGraph(r, g.device, g.encoder, { width: 64, height: 64, createView: () => "screen" });
  expect(g.commands.map(c => c[0])).toEqual(["render"]);
  expect(g.commands[0][1].colorAttachments[0].loadOp).toBe("clear");
});

test("consecutive draws into the same multisampled attachments share one pass; the last pass writing them resolves", async () => {
  const g = gpu();
  const draw = (id, extra = {}) => ({ kind: "render", id, code: "", vertex: "vertex", fragment: "fragment", color: ["hdr"], depth: "depth", vertexCount: 6, clear: false, ...extra });
  const r = await prepareRenderGraph(g.device, { targets: [{ id: "hdr", format: "rgba16float", samples: 4 }, { id: "depth", format: "depth32float", samples: 4 }, { id: "glyphs", format: "rgba8unorm" }],
    passes: [draw("boxes", { clear: [0, 0, 0, 1] }), draw("cards"), draw("labels", { reads: ["glyphs"] }), draw("overlay", { depth: undefined }),
      { kind: "fullscreen", id: "screen", code: "", fragment: "final", reads: ["hdr"], output: "screen" }] }, "bgra8unorm", {}, {});
  encodeRenderGraph(r, g.device, g.encoder, { width: 64, height: 64, createView: () => "screen" });
  expect(g.commands.map(c => c[0])).toEqual(["render", "draw", "draw", "draw", "render", "draw", "render", "draw"]);
  const [first, second] = g.commands.filter(c => c[0] === "render").map(c => c[1].colorAttachments[0]);
  expect(first).toMatchObject({ loadOp: "clear", storeOp: "store", resolveTarget: undefined });
  expect(second).toMatchObject({ loadOp: "load", storeOp: "discard" });
  expect(second.resolveTarget).toBeDefined();
});

test("graph rejects invalid references and shader diagnostics before a frame can receive pipelines", async () => {
  const g = gpu();
  await expect(prepareRenderGraph(g.device, { ...definition, passes: [{ ...definition.passes[3], reads: ["bloom@3"] }] }, "bgra8unorm", {}, {})).rejects.toThrow("Invalid GPU mip");
  await expect(prepareRenderGraph(g.device, { ...definition, passes: [{ ...definition.passes[0], writes: ["depth"] }] }, "bgra8unorm", {}, {})).rejects.toThrow("Depth textures");
  await expect(prepareRenderGraph(g.device, { ...definition, passes: [{ ...definition.passes[0], reads: ["hdr@0"] }] }, "bgra8unorm", {}, {})).rejects.toThrow("cannot read and write");
  g.device.createShaderModule = () => ({ getCompilationInfo: async () => ({ messages: [{ type: "error", message: "invalid fragment" }] }) });
  await expect(prepareRenderGraph(g.device, definition, "bgra8unorm", {}, {})).rejects.toThrow("positions: invalid fragment");
  expect(g.pipelines).toHaveLength(0);
});

test("global render scale resizes offscreen targets and dispatches without recompiling or scaling the screen", async () => {
  const g = gpu(), r = await prepareRenderGraph(g.device, definition, "bgra8unorm", {}, {});
  const screen = { width: 1920, height: 1080, createView: () => "screen" };
  encodeRenderGraph(r, g.device, g.encoder, screen);
  encodeRenderGraph(r, g.device, g.encoder, screen, .5);
  expect(r.scale).toBe(.5);
  expect(g.textures.slice(3).map(t => t.descriptor.size)).toEqual([[960, 540], [960, 540], [480, 270]]);
  expect(g.textures.slice(0, 3).every(t => t.destroyed)).toBe(true);
  expect(g.commands.filter(c => c[0] === "compute").at(-1)).toEqual(["compute", 120, 68]);
  expect(g.commands.at(-2)[1].colorAttachments[0].view).toBe("screen");
  encodeRenderGraph(r, g.device, g.encoder, screen, .5);
  expect(g.textures).toHaveLength(6); expect(g.groups).toHaveLength(8); expect(g.pipelines).toHaveLength(4);
  encodeRenderGraph(r, g.device, g.encoder, { ...screen, width: 2, height: 2 }, .5);
  expect(g.textures.at(-1).descriptor.size).toEqual([4, 4]);
  for (const invalid of [0, -1, NaN, Infinity]) expect(() => encodeRenderGraph(r, g.device, g.encoder, screen, invalid)).toThrow("renderScale");
});


test("multipass encoding compiles for the host UI runtime", () => {
  const filename = fileURLToPath(new URL("../gpuRenderGraph.ts", import.meta.url));
  const require = createRequire(filename);
  const result = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [require.resolve("react-native-worklets/plugin")],
  });
  expect(result.code).toContain("__workletHash");
});

test("native callback copies retain one mutable graph across draws and resizing", async () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false, presets: [require.resolve("@react-native/babel-preset")],
  });
  const g = gpu();
  Object.assign(g.device, { __gpuHandle: true, addEventListener() {}, pushErrorScope() {}, popErrorScope: async () => null,
    lost: new Promise(() => {}), destroy() {}, createCommandEncoder: () => g.encoder });
  g.device.queue.submit = () => {};
  g.encoder.finish = () => ({});
  const screen = { width: 1920, height: 1080, createView: () => "screen" };
  const context = { __gpuHandle: true, canvas: { width: 1920, height: 1080 }, configure() {}, getCurrentTexture: () => screen, present() {} };
  const makeMutable = value => ({ __shared: true, value });
  const mocks = {
    react: {}, "react-native": { Platform: { OS: "macos" }, PixelRatio: { get: () => 1 } }, "@shopify/react-native-skia": {}, "react-native-webgpu": {},
    "@legend-apps/presentation": {}, "./slidesStore": {},
    "./gpuRenderGraph": { prepareRenderGraph, encodeRenderGraph },
    "react-native-reanimated": { makeMutable, runOnUI: fn => fn },
  };
  const { startShaderCanvas, submitGPUFrame } = new Function("require", "exports", "navigator", code + "\nreturn { startShaderCanvas, submitGPUFrame };")(
    name => mocks[name] ?? require(name), {},
    { gpu: { requestAdapter: async () => ({ requestDevice: async () => g.device }), getPreferredCanvasFormat: () => "bgra8unorm" } },
  );
  let stop;
  const resources = await new Promise((resolve, reject) => {
    stop = startShaderCanvas({ canvas: { current: {} }, surfaceContext: () => context, renderGraph: definition, code: "", particles: false, particleCount: 1,
      setResources: value => { if (value) resolve(value); }, setError: error => { if (error) reject(new Error(error)); }, reportError: reject });
  });
  // Worklet closures copy plain objects; shared values and native GPU handles retain identity.
  const copy = value => {
    if (!value || typeof value !== "object" || value.__shared || value.__gpuHandle) return value;
    return Array.isArray(value) ? value.map(copy) : Object.fromEntries(Object.entries(value).map(([key, field]) => [key, copy(field)]));
  };
  expect(resources.graph.__shared).toBe(true);
  for (let frame = 0; frame < 6; frame++) submitGPUFrame(copy(resources), frame, 1, 6);
  expect(g.textures).toHaveLength(3); expect(g.groups).toHaveLength(4);
  screen.width = 3840; screen.height = 2160;
  for (let frame = 0; frame < 6; frame++) submitGPUFrame(copy(resources), frame, 1, 6);
  expect(g.textures).toHaveLength(6); expect(g.groups).toHaveLength(8);
  expect(g.textures.slice(0, 3).every(texture => texture.destroyed)).toBe(true);
  for (let frame = 0; frame < 6; frame++) submitGPUFrame(copy(resources), frame, 1, 6, undefined, .75);
  expect(g.textures).toHaveLength(9); expect(g.groups).toHaveLength(12);
  expect(resources.graph.value.scale).toBe(.75);
  expect(g.textures.slice(3, 6).every(texture => texture.destroyed)).toBe(true);
  stop();
});

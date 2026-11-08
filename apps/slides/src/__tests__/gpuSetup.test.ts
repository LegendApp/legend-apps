// @ts-nocheck Native GPU validation is supplied by this test.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { fileURLToPath } from "node:url";
import { prepareRenderGraph, encodeRenderGraph } from "../gpuRenderGraph";

const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
const require = createRequire(filename);
const { code } = transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false, presets: [require.resolve("@react-native/babel-preset")],
});
async function setup(validationError, cancelDuringValidation = false) {
  const calls = [], resources = [], errors = [], reports = [];
  let resolveScope, done;
  const finished = new Promise(resolve => { done = resolve; });
  const device = {
    lost: new Promise(() => {}),
    addEventListener: () => calls.push("listener"), pushErrorScope: () => calls.push("scope"),
    popErrorScope: () => { calls.push("pop"); return new Promise(resolve => { resolveScope = resolve; }); },
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBuffer: () => ({}), createBindGroup: () => ({}),
    createComputePipeline: () => { calls.push("pipeline"); return {}; }, createRenderPipeline: () => { calls.push("pipeline"); return {}; },
    destroy: () => { calls.push("destroy"); done(); },
  };
  const mocks = { react: {}, "react-native": { Platform: { OS: "macos" }, PixelRatio: { get: () => 2 } }, "@shopify/react-native-skia": {}, "react-native-webgpu": {}, "@legend-apps/presentation": {}, "./slidesStore": {},
    "react-native-reanimated": { makeMutable: value => ({ value }), runOnUI: fn => fn } };
  const start = new Function("require", "exports", "navigator", code + "\nreturn startShaderCanvas;")(
    name => mocks[name] ?? require(name), {}, { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }), getPreferredCanvasFormat: () => "bgra8unorm" } },
  );
  const context = { configure() {}, canvas: { width: 100, height: 100 } };
  const stop = start({ canvas: { current: {} }, surfaceContext: () => context,
    code: "shader", width: 100, height: 100, particles: false, particleCount: 10,
    setResources: value => { resources.push(value); if (value) done(); }, setError: value => { if (value) errors.push(value); }, reportError: error => reports.push(error.message),
  });
  while (!resolveScope) await Promise.resolve();
  // The rendering context's drawable is sized in device pixels, not the view's points.
  expect(context.canvas).toEqual({ width: 200, height: 200 });
  expect(calls.indexOf("listener")).toBeLessThan(calls.indexOf("pipeline"));
  expect(calls.indexOf("scope")).toBeLessThan(calls.indexOf("pipeline"));
  expect(resources).toEqual([undefined]);
  if (cancelDuringValidation) stop();
  resolveScope(validationError);
  await finished;
  // Let the setup continuation finish even if cancellation destroyed the device first.
  await Promise.resolve(); await Promise.resolve();
  return { calls, resources, errors, reports, stop };
}

test("invalid pipelines are rejected before resources reach the frame renderer", async () => {
  const result = await setup({ message: "entry point not found" });
  expect(result.resources).toEqual([undefined]);
  expect(result.errors).toEqual(["entry point not found"]);
  expect(result.reports).toEqual(result.errors);
  expect(result.calls).toContain("destroy");
});
test("valid resources transfer only after validation and cancelled setup never transfers", async () => {
  const valid = await setup(null);
  expect(valid.resources.filter(Boolean)).toHaveLength(1);
  valid.stop();
  const cancelled = await setup(null, true);
  expect(cancelled.resources).toEqual([undefined]);
  expect(cancelled.errors).toEqual([]);
});

test.each(["web", "macos"])("canvas device handoff waits for deferred frame retirement on %s", async platform => {
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  const ui = [], pendingDevices = [], events = [], errors = [];
  let effects = [], callback, owner;
  const context = {
    canvas: { width: 100, height: 100 },
    configure: ({ device }) => { owner = device; events.push(["configure", device.id]); },
    getCurrentTexture: () => {
      if (!owner) throw new Error("Texture requested before configuration");
      return { width: 100, height: 100, createView: () => ({ device: owner }) };
    },
    present() {},
  };
  const mutable = value => ({ value, set(next) { this.value = next; } });
  const playback = { value: { phase: "playing", slideKey: "slide", stepKey: "step", stepIndex: 0 } };
  const mocks = {
    react: { useEffect: effect => effects.push(effect) },
    "react-native": { Platform: { OS: platform }, PixelRatio: { get: () => 1 } },
    "@shopify/react-native-skia": {}, "react-native-webgpu": {}, "./slidesStore": {},
    "@legend-apps/presentation": { usePresentationValue: field => field === "isActive", usePlayback: () => playback, samplePlayback: () => 0 },
    "./gpuRenderGraph": { prepareRenderGraph, encodeRenderGraph },
    "react-native-reanimated": { makeMutable: mutable, useSharedValue: mutable, useAnimatedReaction() {},
      useFrameCallback: fn => { callback = fn; return { setActive() {} }; }, runOnJS: fn => fn,
      runOnUI: fn => (...args) => ui.push(() => fn(...args)) },
  };
  const { startShaderCanvas, UIFrames } = new Function("require", "exports", "navigator", code + "\nreturn { startShaderCanvas, UIFrames };")(
    name => mocks[name] ?? require(name), {}, { gpu: { requestAdapter: async () => ({ requestDevice: async () => pendingDevices.shift() }), getPreferredCanvasFormat: () => "bgra8unorm" } },
  );
  const flushUI = () => { while (ui.length) ui.shift()(); };
  const begin = async id => {
    const ready = deferred(), validation = deferred(), transferred = deferred(), resources = [];
    let ownedGraph;
    const device = { id, lost: new Promise(() => {}), addEventListener() {}, pushErrorScope() {},
      popErrorScope: () => { ready.resolve(); return validation.promise; }, destroy: () => { if (ownedGraph) expect(ownedGraph.value).toBeUndefined(); events.push(["destroy", id]); },
      createBuffer: () => ({}), createSampler: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}),
      createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }), createRenderPipelineAsync: async () => ({}),
      queue: { writeBuffer() {}, submit() {} },
      createCommandEncoder: () => ({ finish() {}, beginRenderPass: descriptor => {
        const view = descriptor.colorAttachments[0].view;
        if (view.device !== device) throw new Error(`Device ${id} received a texture from device ${view.device.id}`);
        events.push(["draw", id]);
        return { setPipeline() {}, setBindGroup() {}, draw() {}, end() {} };
      } }),
    };
    pendingDevices.push(device);
    const stop = startShaderCanvas({ canvas: { current: {} }, surfaceContext: () => context, code: "", particles: false, particleCount: 1,
      renderGraph: { targets: [], passes: [{ kind: "fullscreen", id: `screen-${id}`, code: "", fragment: "main", output: "screen" }] },
      setResources: value => { resources.push(value); if (value) { ownedGraph = value.graph; transferred.resolve(value); } }, setError: error => { if (error) errors.push(error); }, reportError: error => errors.push(String(error)) });
    await ready.promise;
    return { stop, validation, transferred, resources };
  };
  const mount = resources => {
    effects = [];
    UIFrames({ resources, width: 100, height: 100, aspect: 1, brightness: 1, particleCount: 1, previewTime: 0,
      onReady() {}, onError: error => errors.push(error) });
    const tick = callback, cleanup = effects.map(effect => effect());
    return { tick: () => tick({ timeSincePreviousFrame: 16 }), stop: () => cleanup.forEach(fn => fn?.()) };
  };
  const configurations = () => events.filter(event => event[0] === "configure").map(event => event[1]);
  const old = await begin(1);
  expect(configurations()).toEqual([]);
  old.validation.resolve(null);
  const oldResources = await old.transferred.promise;
  expect(oldResources.graph.value).toBeUndefined();
  const oldFrames = mount(oldResources);
  expect(configurations()).toEqual([]);
  flushUI(); oldFrames.tick();
  expect(configurations()).toEqual([1]);
  old.stop(); oldFrames.stop();
  expect(oldResources.graph.value.passes).toHaveLength(1);
  const replacement = await begin(2);
  oldFrames.tick();
  expect(configurations()).toEqual([1]);
  replacement.validation.resolve(null);
  const newResources = await replacement.transferred.promise;
  const newFrames = mount(newResources);
  expect(configurations()).toEqual([1]);
  flushUI();
  expect(configurations()).toEqual([1, 2]);
  expect(oldResources.graph.value).toBeUndefined();
  expect(newResources.graph.value.passes).toHaveLength(1);
  expect(events.findIndex(event => event[0] === "destroy" && event[1] === 1)).toBeLessThan(events.findIndex(event => event[0] === "configure" && event[1] === 2));
  const draws = events.filter(event => event[0] === "draw").length;
  oldFrames.tick();
  expect(events.filter(event => event[0] === "draw")).toHaveLength(draws);
  newFrames.tick();
  expect(events.at(-1)).toEqual(["draw", 2]);
  const cancelled = await begin(3);
  cancelled.stop(); cancelled.validation.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  expect(cancelled.resources).toEqual([undefined]);
  expect(configurations()).toEqual([1, 2]);
  newFrames.tick();
  expect(errors).toEqual([]);
  replacement.stop(); newFrames.stop(); flushUI();
  expect(events.filter(event => event[0] === "destroy" && event[1] === 1)).toHaveLength(1);
  expect(events.filter(event => event[0] === "destroy" && event[1] === 2)).toHaveLength(1);
});


test("retired native error listeners do not retain their canvas program", async () => {
  const listeners = [], adapter = { device: undefined };
  const mocks = { react: {}, "react-native": { Platform: { OS: "macos" }, PixelRatio: { get: () => 1 } },
    "@shopify/react-native-skia": {}, "react-native-webgpu": {}, "@legend-apps/presentation": {}, "./slidesStore": {},
    "react-native-reanimated": { makeMutable: value => ({ value }), runOnUI: fn => fn } };
  const start = new Function("require", "exports", "navigator", code + "\nreturn startShaderCanvas;")(
    name => mocks[name] ?? require(name), {}, { gpu: { requestAdapter: async () => ({ requestDevice: async () => adapter.device }), getPreferredCanvasFormat: () => "bgra8unorm" } },
  );
  async function retire() {
    let clock, complete;
    const ready = new Promise(resolve => { complete = resolve; });
    adapter.device = {
      lost: new Promise(() => {}),
      addEventListener: (_type, callback) => listeners.push(callback),
      pushErrorScope() {}, popErrorScope: async () => null,
      createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
      createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}),
      createBuffer: () => { const value = {}; clock = new WeakRef(value); return value; },
      createRenderPipeline: () => ({}), destroy() {},
    };
    let stop = start({ canvas: { current: {} }, surfaceContext: () => ({ canvas: { width: 100, height: 100 } }),
      code: "shader", width: 100, height: 100, particles: false, particleCount: 0,
      setResources: value => { if (value) complete(); }, setError() {}, reportError() {},
    });
    await ready;
    stop(); stop = undefined; adapter.device = undefined;
    return clock;
  }
  const clock = await retire();
  expect(listeners).toHaveLength(1);
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    Bun.gc(true);
  }
  expect(clock.deref()).toBeUndefined();
});


test("GPU errors reach only the current canvas owner", () => {
  const create = new Function("require", "exports", code + "\nreturn shaderErrorHandlers;")(name => name.startsWith("@babel/runtime/") ? require(name) : {}, {});
  const errors = [], reports = [];
  const handlers = create({ setError: value => errors.push(value), reportError: value => reports.push(value) });
  let prevented = 0;
  const error = { message: "bad draw" }, event = { preventDefault: () => prevented++, error };
  handlers.uncaptured(event);
  handlers.lost({ reason: "destroyed", message: "retired" });
  handlers.lost({ reason: "unknown", message: "driver stopped" });
  expect(errors).toEqual(["bad draw", "WebGPU device lost: driver stopped"]);
  expect(reports).toEqual([error]);
  handlers.dispose();
  handlers.uncaptured(event);
  handlers.lost({ reason: "unknown", message: "late notification" });
  expect(errors).toHaveLength(2);
  expect(reports).toHaveLength(1);
  expect(prevented).toBe(2);
  const retiring = create({ setError: () => retiring.dispose(), reportError: value => reports.push(value) });
  retiring.uncaptured(event);
  expect(reports).toEqual([error, error]);
});

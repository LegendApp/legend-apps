// @ts-nocheck Native GPU handles are mocked; the actual host worklet is exercised.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { fileURLToPath } from "node:url";

function frames({ preview = false, active = true, effectActive = true, maxTime, frameTimeIndex, preparing = false, composite = false, data = false, clockMode = "step", simulation = true, graph = false, particleCount = 2048, particleVertexCount } = {}) {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [require.resolve("react-native-worklets/plugin")],
  });
  const effects = [], calls = [], events = [], uniforms = [], errors = [];
  const frameData={value:[1,2,3,4]}, renderScale={value:1,get(){return this.value;}};
  const playback = { value: { phase: preparing ? "preparing" : preview ? "preview" : active ? "playing" : "paused",
    slideKey: "slide", stepKey: "step", stepIndex: 1, stepTime: 0, slideTime: 10 } };
  let callback, reaction, reactionInputs, enabled = false, ready = 0;
  const frame = { setActive: value => { enabled = value; } };
  const pass = kind => ({
    setPipeline() {}, setBindGroup: (_, value) => calls.push([kind, value]),
    dispatchWorkgroups: count => calls.push(["dispatch", count]),
    draw: (...args) => calls.push(["draw", ...args]), end: () => events.push(["end", kind]),
  });
  const device = {
    queue: { writeBuffer: (_, __, values) => uniforms.push([...values]), submit: () => events.push(["submit"]) },
    createCommandEncoder: () => ({
      beginComputePass: () => { events.push(["begin", "compute"]); return pass("compute"); },
      beginRenderPass: ({ colorAttachments }) => { events.push(["begin", "render", colorAttachments[0].loadOp]); return pass("render"); }, finish() {},
    }),
    destroy: () => calls.push(["destroy"]),
  };
  const mocks = {
    react: { useRef: value => ({ current: value }), useEffect: effect => effects.push(effect) },
    "react-native": {},
    "@shopify/react-native-skia": {}, "react-native-webgpu": {},
    "@legend-apps/presentation": { usePresentationValue: field => ({
      isActive: active, isPreview: preview, isPreparing: preparing, stepIndex: 1,
    })[field], usePlayback: () => playback,
      samplePlayback: (state, previewTime, clock) => state.phase === "preview" ? previewTime : clock === "slide" ? state.slideTime : state.stepTime },
    "react-native-reanimated": {
      useSharedValue: value => ({ value }),
      useFrameCallback: fn => { callback = fn; return frame; },
      useAnimatedReaction: (prepare, fn) => { reactionInputs = prepare.__closure; let previous = prepare(); reaction = () => { const next = prepare(); fn(next, previous); previous = next; }; },
      runOnJS: fn => fn, runOnUI: fn => fn,
    },
    "./slidesStore": {},
    "./gpuRenderGraph": { encodeRenderGraph: (_, __, ___, ____, scale) => calls.push(["graph", scale]) },
  };
  const UIFrames = new Function("require", "exports", code + "\nreturn UIFrames;")(
    name => mocks[name] ?? require(name), {},
  );
  UIFrames({ resources: { alive: { value: true, set(value) { this.value = value; } }, disposed: { value: false }, configured: { value: false }, format: "bgra8unorm", device, context: { configure() {}, getCurrentTexture: () => ({ createView() {} }), present: () => events.push(["present"]) },
    clock: {}, graph: graph ? { value: {} } : undefined, states: [], groups: simulation ? ["A", "B"] : ["A"], compute: simulation ? {} : undefined, render: {}, particles: {}, frameData: data ? { size: 16 } : undefined,
    composite: composite ? { pipeline: {}, group: "lens", texture: { createView() {} } } : undefined },
    effectActive, maxTime, frameTimeIndex, clockMode, renderScale, frameData: data ? frameData : undefined, aspect: 2.61, brightness: 1, particleCount, particleVertexCount, previewTime: 7, onError: error => errors.push(error), onReady: () => ready++ });
  const cleanup = effects.map(effect => effect());
  return { calls, events, uniforms, errors, ready: () => ready, enabled: () => enabled,
    playback, frameData, reactionInputs, redraw: () => effects[0](),
    scale: value => { renderScale.value = value; reaction(); },
    tick: () => { playback.value = { ...playback.value, stepTime: playback.value.stepTime + 0.016 };
      callback({ timeSincePreviousFrame: 16 }); },
    stop: () => cleanup.forEach(fn => fn?.()), device };
}

test("active GPU frames alternate storage buffers and dispatch the configured particle count", () => {
  const f = frames();
  expect(f.enabled()).toBe(true);
  expect(f.calls).toContainEqual(["compute", "A"]);
  expect(f.calls).toContainEqual(["render", "B"]);
  expect(f.calls).toContainEqual(["dispatch", 32]);
  expect(f.calls).toContainEqual(["draw", 6, 2048]);
  f.tick();
  expect(f.ready()).toBe(1);
  expect(f.calls).toContainEqual(["compute", "B"]);
  expect(f.calls).toContainEqual(["render", "A"]);
  expect(f.uniforms.at(-1)[0]).toBeCloseTo(0.016);
  f.stop();
  expect(f.enabled()).toBe(false);
  const count = f.calls.length;
  f.tick();
  expect(f.calls.length).toBe(count);
  expect(f.calls.filter(call => call[0] === "destroy")).toHaveLength(1);
});

test("particle-free frames skip empty particle work but still clear, draw fullscreen passes and present", () => {
  for (const [particleCount, particleVertexCount] of [[0, 6], [2, 0], [2, 6]]) for (const composite of [false, true]) for (const simulation of [false, true]) {
    const f = frames({ particleCount, particleVertexCount, composite, simulation });
    f.tick();
    const dispatches = simulation && particleCount > 0;
    const frame = {
      draws: [["draw", 3], ...(particleCount && particleVertexCount ? [["draw", particleVertexCount, particleCount]] : []), ...(composite ? [["draw", 3]] : [])],
      events: [...(dispatches ? [["begin", "compute"], ["end", "compute"]] : []), ["begin", "render", "clear"], ["end", "render"],
        ...(composite ? [["begin", "render", "clear"], ["end", "render"]] : []), ["submit"], ["present"]],
    };
    expect(f.calls.filter(call => call[0] === "dispatch")).toEqual(dispatches ? [["dispatch", 1], ["dispatch", 1]] : []);
    expect(f.calls.filter(call => call[0] === "draw")).toEqual([...frame.draws, ...frame.draws]);
    expect(f.events).toEqual([...frame.events, ...frame.events]);
    f.stop();
  }
});

test("shared render scale redraws a paused graph at its frozen clock and frame", () => {
  const f = frames({ graph: true, simulation: false });
  f.tick();
  f.playback.value = { ...f.playback.value, phase: "paused" };
  const previous = f.uniforms.at(-1);
  f.scale(.75);
  expect(f.calls.at(-1)).toEqual(["graph", .75]);
  expect(f.uniforms.at(-1)).toEqual([previous[0], 0, previous[2], ...previous.slice(3)]);
  const count = f.calls.length;
  f.scale(.75); expect(f.calls).toHaveLength(count);
  f.scale(1); expect(f.calls.at(-1)).toEqual(["graph", 1]);
  f.stop();
});

test("scale reaction subscribes to graph uniforms without subscribing legacy frame-data shaders", () => {
  const contains = (value, target) => value === target || !!value && typeof value === "object" && Object.values(value).some(child => contains(child, target));
  for (const graph of [false, true]) {
    const f = frames({ graph, data: true, simulation: false });
    expect(contains(f.reactionInputs, f.frameData)).toBe(graph);
    f.stop();
  }
});

test("preview renders one deterministic frame without starting a loop", () => {
  const f = frames({ preview: true });
  expect(f.enabled()).toBe(false);
  expect(f.uniforms).toHaveLength(1);
  expect(f.uniforms[0].slice(0, 4)).toEqual([7, 0, 0, 1]);
  f.stop();
});

test("analytic effects draw and composite without compute dispatch or alternating buffers", () => {
  const f=frames({simulation:false,composite:true,data:true});
  f.tick();f.tick();
  expect(f.calls.some(call=>call[0]==="compute" || call[0]==="dispatch")).toBe(false);
  expect(f.calls.filter(call=>call[0]==="render").map(call=>call[1])).toEqual(["A","A","lens","A","A","lens","A","A","lens"]);
  expect(f.calls.filter(call=>call[0]==="draw")).toHaveLength(9);
  f.stop();
});

test("inactive effect layers prepare once without submitting ongoing frames", () => {
  const f = frames({ effectActive:false, data:true });
  expect(f.enabled()).toBe(false);
  expect(f.ready()).toBe(1);
  const count=f.uniforms.length;
  f.tick(); expect(f.uniforms).toHaveLength(count);
  f.stop();
});

test("finite GPU effects draw their final snapshot, stop submissions, and replay on a new step", () => {
  const f=frames({data:true,maxTime:2,frameTimeIndex:0});
  f.frameData.value=[2,2,3,4]; f.tick();
  expect(f.uniforms.at(-1)).toEqual([2,2,3,4]);
  const count=f.uniforms.length;
  f.tick(); f.tick(); expect(f.uniforms).toHaveLength(count);
  f.playback.value={...f.playback.value,stepKey:"replay",stepTime:0};
  f.frameData.value=[0,2,3,4]; f.tick();
  expect(f.uniforms.length).toBe(count+2);
  expect(f.uniforms.at(-1)).toEqual([0,2,3,4]);
  f.stop();
});

test("preparing surfaces submit one initial frame and acknowledge readiness without starting a loop", () => {
  const f = frames({ active: false, preview: true, preparing: true });
  expect(f.enabled()).toBe(false);
  expect(f.uniforms).toHaveLength(1);
  expect(f.uniforms[0].slice(0, 4)).toEqual([0, 0, 0, 1]);
  expect(f.ready()).toBe(1);
  f.tick();
  expect(f.uniforms).toHaveLength(1);
  expect(f.ready()).toBe(1);
  f.stop();
});

test("GPU submission errors stop subsequent rendering", () => {
  const f = frames();
  f.device.createCommandEncoder = () => { throw new Error("device unavailable"); };
  f.tick();
  expect(f.errors).toHaveLength(1);
  const count = f.uniforms.length;
  f.tick();
  expect(f.uniforms.length).toBe(count);
  f.stop();
});

test("frame data larger than its GPU buffer stops before upload and reports once", () => {
  const f = frames({ data: true });
  expect(f.uniforms.at(-1)).toEqual([1, 2, 3, 4]);
  f.frameData.value = [1, 2, 3, 4, 5];
  const count = f.uniforms.length;
  f.tick();
  expect(f.uniforms.slice(count).some(values => values.length === 5)).toBe(false);
  expect(f.errors).toHaveLength(1);
  const submitted = f.events.length;
  f.tick();
  expect(f.events).toHaveLength(submitted);
  expect(f.errors).toHaveLength(1);
  f.stop();
});

test("the native GPU bridge compiles with React Compiler and the worklet transform", () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  expect(() => transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [
      [require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }],
      require.resolve("react-native-worklets/plugin"),
    ],
  })).not.toThrow();
});


test("native devices require synchronization while browser devices use standard WebGPU", async () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [require.resolve("react-native-worklets/plugin")],
  });
  const platform = { OS: "macos" };
  const requestShaderDevice = new Function("require", "exports", code + "\nreturn requestShaderDevice;")(
    name => name.startsWith("@babel/") ? require(name) : name === "react-native" ? { Platform: platform } : ({}), {},
  );
  const descriptors = [];
  const device = {};
  expect(await requestShaderDevice({ requestDevice: async descriptor => {
    descriptors.push(descriptor);
    return device;
  } })).toBe(device);
  expect(descriptors).toEqual([{ requiredFeatures: ["implicit-device-synchronization"] }]);
  let attempts = 0;
  await expect(requestShaderDevice({ requestDevice: async () => {
    attempts++;
    throw new Error("Unsupported synchronization");
  } })).rejects.toThrow("Unsupported synchronization");
  expect(attempts).toBe(1);
  platform.OS = "web";
  expect(await requestShaderDevice({ requestDevice: async descriptor => {
    descriptors.push(descriptor);
    return device;
  } })).toBe(device);
  expect(descriptors.at(-1)).toBeUndefined();
});

test("missing WebGPU and renderer errors surface instead of switching renderers", () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename,"utf8"),{
    filename,babelrc:false,configFile:false,presets:[require.resolve("@react-native/babel-preset")],
    plugins:[require.resolve("react-native-worklets/plugin")],
  });
  let error,state=0;
  const renderer=new Function("require","exports",code+"\nreturn TypeGPUShader;")(
    name=>name.startsWith("@babel/") ? require(name) : name==="react" ? {
      useContext:()=>1,useRef:value=>({current:value}),useEffect(){},useLayoutEffect(){},
      useState:()=>[state++%3===2 ? error : undefined,()=>{}],
    } : name==="react-native" ? {Platform:{OS:"web"}} : name==="@legend-apps/presentation" ? {
      useBackgroundSize:()=>({width:1920,height:1080}),useBackgroundIntensity:()=>1,
      usePresentationValue:()=>0,usePreparationTask(){},
    } : name==="react/jsx-runtime" ? require(name) : {},{},
  );
  const originalNavigator=globalThis.navigator;
  try {
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{}});
    expect(()=>renderer({code:""})).toThrow("WebGPU is required");
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{gpu:{}}});
    error="WebGPU device lost";
    expect(()=>renderer({code:""})).toThrow("WebGPU device lost");
  } finally {Object.defineProperty(globalThis,"navigator",{configurable:true,value:originalNavigator});}
});

test("offscreen browser setup sizes first and allocates simulation resources only for compute programs", async () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [require.resolve("react-native-worklets/plugin")],
  });
  const start = new Function("require", "exports", code + "\nreturn startShaderCanvas;")(
    name => name.startsWith("@babel/") ? require(name) : name === "react-native" ? { Platform:{OS:"web"}, PixelRatio:{get:()=>2} }
      : name === "react-native-reanimated" ? {makeMutable:value=>({value}),runOnUI:fn=>fn} : {}, {},
  );
  const surface = {width:0,height:0};
  const assertSize = () => expect([surface.width,surface.height]).toEqual([2016,1000]);
  let configurations = 0;
  const context = {canvas:surface,configure:()=>{configurations++;assertSize();}};
  const buffers=[],computes=[];
  const device = {
    addEventListener(){},pushErrorScope(){},popErrorScope:async()=>null,lost:new Promise(()=>{}),destroy(){},
    createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),
    createBuffer:descriptor=>{buffers.push(descriptor);return {};},createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),
    createBindGroup:()=>({}),createComputePipeline:descriptor=>{computes.push(descriptor);return {};},createRenderPipeline:()=>({}),
  };
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device}),getPreferredCanvasFormat:()=>"bgra8unorm"}}});
  try {
    for (const simulation of [false,true]) await new Promise<void>((resolve,reject)=>{
      start({canvas:{current:{getContext:()=>{surface.width=0;surface.height=0;return context;}}},
        code:simulation ? "@compute @workgroup_size(64) fn simulate() {}" : "",particles:false,particleCount:1,width:2016,height:1000,displayScale:0.5,
        setResources:r=>{if(r){assertSize();expect(r.configured.value).toBe(false);expect(configurations).toBe(0);expect(r.states.length).toBe(simulation ? 2 : 0);expect(r.groups.length).toBe(simulation ? 2 : 1);resolve();}},setError:error=>{if(error)reject(new Error(error));},reportError:reject});
    });
    expect(buffers.filter(b=>b.usage===(128|8))).toHaveLength(2);
    expect(buffers.filter(b=>b.usage===(64|8))).toHaveLength(2);
    expect(computes).toHaveLength(1);
  } finally {Object.defineProperty(globalThis,"navigator",{configurable:true,value:originalNavigator});}
});


test("GPU particles reinitialize on preview promotion and step changes", () => {
  const f = frames({ preview: true });
  f.playback.value = { ...f.playback.value, phase: "playing", stepTime: 0 };
  f.tick();
  expect(f.uniforms.at(-1)[2]).toBe(0);
  f.tick();
  expect(f.uniforms.at(-1)[2]).toBe(1);
  f.playback.value = { ...f.playback.value, stepKey: "next", stepIndex: 2, stepTime: 0 };
  f.tick();
  expect(f.uniforms.at(-1)[2]).toBe(0);
  expect(f.uniforms.at(-1)[3]).toBe(2);
  f.stop();
});

test("geometry can retain slide time across steps while uploading UI data and composing a lens", () => {
  const f = frames({ composite:true, data:true, clockMode:"slide" });
  expect(f.uniforms[0][0]).toBe(10);
  expect(f.uniforms[0][6]).toBe(10);
  expect(f.uniforms[0][7]).toBe(0);
  expect(f.uniforms[1]).toEqual([1,2,3,4]);
  expect(f.calls).toContainEqual(["render","lens"]);
  expect(f.calls.filter(call => call[0]==="draw")).toHaveLength(3);
  f.playback.value={...f.playback.value,stepKey:"connect",stepIndex:2,stepTime:0};
  f.tick();
  expect(f.uniforms.at(-2)[0]).toBe(10);
  expect(f.uniforms.at(-2)[2]).toBe(0);
  f.playback.value={...f.playback.value,phase:"outgoing"};
  const count=f.uniforms.length;
  f.tick(); expect(f.uniforms).toHaveLength(count);
  f.stop();
});


test("multipass surfaces redraw a frozen frame after paused and outgoing resizing", () => {
  const f = frames({ graph: true, data: true });
  f.tick();
  const lastFrame = f.uniforms.at(-2);
  expect(f.calls.filter(call => call[0] === "graph")).toHaveLength(2);
  for (const phase of ["paused", "outgoing"]) {
    f.playback.value = { ...f.playback.value, phase, stepTime: lastFrame[0] };
    f.redraw();
    expect(f.uniforms.at(-2).slice(0, 4)).toEqual([lastFrame[0], 0, lastFrame[2], lastFrame[3]]);
    const count = f.uniforms.length;
    f.tick(); expect(f.uniforms).toHaveLength(count);
  }
  f.stop();
  expect(f.calls.filter(call => call[0] === "destroy")).toHaveLength(1);
});

test("frame failures report the latest slide context as well as stopping the surface", () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false, presets: [require.resolve("@react-native/babel-preset")],
  });
  let state = 0, refIndex = 0, slideIndex = 1, preview = false;
  const refs = [], errors = [], reports = [];
  const mocks = {
    react: { useContext: () => 1, useRef: value => refs[refIndex++] ??= { current: value }, useEffect() {}, useLayoutEffect: effect => effect(),
      useState: () => [state++ % 3 === 0 ? { id: 1 } : undefined, message => errors.push(message)] },
    "react-native": { View: "View", Platform: { OS: "web" } }, "react-native-webgpu": { Canvas: "Canvas" }, "@shopify/react-native-skia": {},
    "react-native-reanimated": {}, "./gpuRenderGraph": {},
    "@legend-apps/presentation": { useBackgroundSize: () => ({ width: 1920, height: 1080 }), useBackgroundIntensity: () => 1,
      usePresentationValue: field => field === "slideIndex" ? slideIndex : preview, usePreparationTask() {} },
    "./slidesStore": { reportSlideError: (...args) => reports.push(args) },
  };
  const renderer = new Function("require", "exports", "navigator", code + "\nreturn TypeGPUShader;")(
    name => mocks[name] ?? require(name), {}, { gpu: {} },
  );
  const first = renderer({ code: "" });
  const onError = first.props.children[1].props.onError;
  slideIndex = 4; preview = true; state = 0; refIndex = 0;
  renderer({ code: "" });
  onError("draw failed");
  expect(errors).toEqual(["draw failed"]);
  expect(reports).toEqual([["draw failed", 4, true]]);
});

test("React Compiler renders frame surfaces without reading shared values", () => {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [
      [require.resolve("babel-plugin-react-compiler"), { target: "19" }],
      require.resolve("react-native-worklets/plugin"),
    ],
  });
  let rendering = false, cache;
  const reads = [];
  const shared = (name, value) => ({ get value() { if (rendering) reads.push(name); return value; }, set value(next) { value = next; },
    get() { if (rendering) reads.push(name); return value; }, set(next) { value = next; } });
  const mocks = {
    react: { useEffect() {} },
    "react/compiler-runtime": { c: size => cache ??= new Array(size).fill(Symbol.for("react.memo_cache_sentinel")) },
    "react-native": {}, "@shopify/react-native-skia": {}, "react-native-webgpu": {}, "./slidesStore": {}, "./gpuRenderGraph": {},
    "@legend-apps/presentation": { usePresentationValue: () => false, usePlayback: () => playback, samplePlayback() {} },
    "react-native-reanimated": { useSharedValue: value => shared("local", value), useFrameCallback: () => ({ setActive() {} }),
      useAnimatedReaction() {}, runOnJS: fn => fn, runOnUI: fn => fn },
  };
  const playback = shared("playback", { phase: "playing" });
  const UIFrames = new Function("require", "exports", code + "\nreturn UIFrames;")(name => mocks[name] ?? require(name), {});
  const props = { resources: { alive: shared("alive", true), disposed: shared("disposed", false), configured: shared("configured", false),
    graph: shared("graph", {}), device: {}, context: {}, clock: {}, groups: [] }, renderScale: shared("renderScale", 1),
    frameData: shared("frameData", [0]), frameTimeIndex: 0, width: 1, height: 1, aspect: 1, brightness: 1, particleCount: 0, previewTime: 0,
    onError() {}, onReady() {} };
  rendering = true;
  UIFrames(props); UIFrames(props); UIFrames({ ...props, particleCount: 1, frameTimeIndex: undefined, maxTime: 2 });
  rendering = false;
  expect(reads).toEqual([]);
});

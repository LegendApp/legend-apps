// @ts-nocheck Native GPU handles are mocked; the actual host worklet is exercised.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { fileURLToPath } from "node:url";

function frames({ preview = false, active = true, preparing = false, composite = false, data = false, clockMode = "step" } = {}) {
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [require.resolve("react-native-worklets/plugin")],
  });
  const effects = [], calls = [], uniforms = [], errors = [];
  const playback = { value: { phase: preparing ? "preparing" : preview ? "preview" : active ? "playing" : "paused",
    slideKey: "slide", stepKey: "step", stepIndex: 1, stepTime: 0, slideTime: 10 } };
  let callback, enabled = false, ready = 0;
  const frame = { setActive: value => { enabled = value; } };
  const pass = kind => ({
    setPipeline() {}, setBindGroup: (_, value) => calls.push([kind, value]),
    dispatchWorkgroups: count => calls.push(["dispatch", count]),
    draw: (...args) => calls.push(["draw", ...args]), end() {},
  });
  const device = {
    queue: { writeBuffer: (_, __, values) => uniforms.push([...values]), submit() {} },
    createCommandEncoder: () => ({
      beginComputePass: () => pass("compute"), beginRenderPass: () => pass("render"), finish() {},
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
      runOnJS: fn => fn, runOnUI: fn => fn,
    },
    "./slidesStore": {},
  };
  const UIFrames = new Function("require", "exports", code + "\nreturn UIFrames;")(
    name => mocks[name] ?? require(name), {},
  );
  UIFrames({ resources: { alive: { value: true, set(value) { this.value = value; } }, disposed: { value: false }, device, context: { getCurrentTexture: () => ({ createView() {} }), present() {} },
    clock: {}, states: [], groups: ["A", "B"], compute: {}, render: {}, particles: {}, frameData: data ? {} : undefined,
    composite: composite ? { pipeline: {}, group: "lens", texture: { createView() {} } } : undefined },
    clockMode, frameData: data ? { value: [1,2,3,4] } : undefined, aspect: 2.61, brightness: 1, particleCount: 2048, previewTime: 7, onError: error => errors.push(error), onReady: () => ready++ });
  const cleanup = effects.map(effect => effect());
  return { calls, uniforms, errors, ready: () => ready, enabled: () => enabled,
    playback,
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

test("preview renders one deterministic frame without starting a loop", () => {
  const f = frames({ preview: true });
  expect(f.enabled()).toBe(false);
  expect(f.uniforms).toHaveLength(1);
  expect(f.uniforms[0].slice(0, 4)).toEqual([7, 0, 0, 1]);
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

// @ts-nocheck Bun globals and native GPU handles are supplied by this harness.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { releaseGPUResources } from "../gpuCleanup";

function loadCanvasLifecycle(requestAdapter) {
  const filename = fileURLToPath(new URL("../TypeGPU.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }]],
  });
  let destroyed = 0;
  let frame;
  const mocks = {
    "@legend-apps/presentation": {},
    "react-native": { StyleSheet: { create: (styles) => styles } },
    "react-native-webgpu": {},
    "typegpu": { tgpu: { initFromDevice: () => ({ destroy: () => { destroyed++; } }) } },
    "./slidesStore": {},
    "./gpuCleanup": { releaseGPUResources },
  };
  const start = new Function("require", "exports", "navigator", "requestAnimationFrame", "cancelAnimationFrame",
    code + "\nreturn startTypeGPUCanvas;",
  )(
    (name) => mocks[name] ?? require(name), {},
    { gpu: { requestAdapter, getPreferredCanvasFormat: () => "rgba8unorm" } },
    (callback) => { frame = callback; return 1; }, () => { frame = undefined; },
  );
  const errors = [];
  const messages = [];
  const options = {
    canvasRef: { current: {
      getNativeSurface: () => ({}),
      getContext: () => ({ configure() {}, present() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }),
    } },
    height: 540, width: 960,
    playback: { current: { isActive: true, isPreview: false, previewTime: 3.5, startedAt: 0 } },
    report: (error) => errors.push(error.message),
    resume: { current: undefined },
    setError: (error) => messages.push(error),
  };
  return { start: (scene) => start({ ...options, scene }), errors, messages, destroyed: () => destroyed, frame: (time) => frame?.(time) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const adapter = () => Promise.resolve({ requestDevice: async () => ({ lost: new Promise(() => {}) }) });

test("missing GPU adapters report setup failure", async () => {
  const canvas = loadCanvasLifecycle(async () => null);
  const dispose = canvas.start(() => { throw new Error("scene should not start"); });
  await settle();
  expect(canvas.errors).toEqual(["No WebGPU adapter is available."]);
  expect(canvas.messages.at(-1)).toBe("No WebGPU adapter is available.");
  dispose();
});

test("a scene that finishes after unmount releases its late resources", async () => {
  const canvas = loadCanvasLifecycle(adapter);
  let finish;
  let disposed = 0;
  const dispose = canvas.start(() => new Promise((resolve) => { finish = resolve; }));
  await settle();
  dispose();
  expect(canvas.destroyed()).toBe(1);
  finish({ render() {}, dispose() { disposed++; } });
  await settle();
  expect(disposed).toBe(1);
  expect(canvas.destroyed()).toBe(1);
  expect(canvas.errors).toEqual([]);
});

test("frame failures report the error and release the scene and device once", async () => {
  const canvas = loadCanvasLifecycle(adapter);
  let disposed = 0;
  const dispose = canvas.start(async () => ({ render() { throw new Error("render failed"); }, dispose() { disposed++; } }));
  await settle();
  canvas.frame(1000);
  expect(canvas.errors).toEqual(["render failed"]);
  expect(disposed).toBe(1);
  expect(canvas.destroyed()).toBe(1);
  dispose();
  expect(canvas.destroyed()).toBe(1);
});

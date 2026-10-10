// @ts-nocheck Native GPU validation is supplied by this test.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { fileURLToPath } from "node:url";

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
  const mocks = { react: {}, "react-native": { Platform: { OS: "macos" } }, "@shopify/react-native-skia": {}, "react-native-webgpu": {}, "@legend-apps/presentation": {}, "./slidesStore": {},
    "react-native-reanimated": { makeMutable: value => ({ value }), runOnUI: fn => fn } };
  const start = new Function("require", "exports", "navigator", code + "\nreturn startShaderCanvas;")(
    name => mocks[name] ?? require(name), {}, { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }), getPreferredCanvasFormat: () => "bgra8unorm" } },
  );
  const stop = start({ canvas: { current: { getContext: () => ({ configure() {} }), getNativeSurface: () => ({}) } },
    code: "shader", width: 100, height: 100, particles: false, particleCount: 10,
    setResources: value => { resources.push(value); if (value) done(); }, setError: value => { if (value) errors.push(value); }, reportError: error => reports.push(error.message),
  });
  while (!resolveScope) await Promise.resolve();
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

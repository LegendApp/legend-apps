// @ts-nocheck Exercise the actual Dawn compiler shipped with the app on macOS.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import React from "react";
import { act, create } from "react-test-renderer";
import { transformSync } from "@babel/core";
import { cloudProgram } from "../../examples/components/CloudProgram";
import { compileDeck } from "../../../../packages/presentation/src/compiler";
import { hostModules } from "../../../../packages/presentation/src/compiler/compileDeck";
import { buildWorldGraph } from "../../../../packages/slides-effects/packs/world/render";
import { customInstances, prepareWorldScene, primitive, sdfInstance } from "../../../../packages/slides-effects/packs/world/scene";

import { gameOfLifeShader } from "../../examples/components/GameOfLifeProgram";

import { boidsProgram } from "../../examples/components/TypeGPUBoids";

const require = createRequire(import.meta.url);
const programs = { cloudProgram, gameOfLifeShader, boidsProgram };
const root = path.resolve(import.meta.dir, "../../../..");
const worldDecks = ["world-tour", "data-flow", "cinematic-title"];
const compiledDecks = new Map();

function compileWorldDeck(name) {
  const file = path.join(root, "apps/slides/examples/3d", `${name}.mdx`);
  if (!compiledDecks.has(name)) compiledDecks.set(name, compileDeck(file, {
    source: fs.readFileSync(file, "utf8"), effectPacksDirectory: path.join(root, "packages/slides-effects/packs"),
  }).then(result => {
    if (!result.success) throw new Error(`${name}: ${result.errors.join("\n")}`);
    return result;
  }));
  return compiledDecks.get(name);
}

// Dawn's createShaderModule + getCompilationInfo: WGSL module validation only, not pipeline layout or rendering.
function validateShaders(shaders) {
  const webgpu = path.dirname(require.resolve("react-native-webgpu/package.json"));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "slides-shader-test-"));
  try {
    const executable = path.join(temporary, "validate");
    const build = spawnSync("clang++", ["-std=c++17", path.join(import.meta.dir, "fixtures/validateShader.cpp"),
      "-I", path.join(webgpu, "cpp/webgpu"), path.join(webgpu, "libs/apple/libwebgpu_dawn.xcframework/macos-arm64_x86_64/libwebgpu_dawn.a"),
      "-framework", "Metal", "-framework", "Foundation", "-framework", "QuartzCore", "-framework", "IOSurface", "-framework", "IOKit", "-o", executable], { encoding: "utf8", timeout: 30_000 });
    expect(build.stderr).toBe("");
    expect(build.status).toBe(0);
    const files = Object.entries(shaders).map(([name, code]) => {
      const file = path.join(temporary, `${name}.wgsl`); fs.writeFileSync(file, code); return file;
    });
    return spawnSync(executable, files, { encoding: "utf8", timeout: 60_000 });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

// Renders every slide of the real compiled deck, including Background content, and keeps each World graph pass.
async function worldPasses(name) {
  const compiled = await compileWorldDeck(name);
  const playback = { value: { phase: "preparing", slideKey: "", stepKey: "", slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } } };
  const presentation = require("@legend-apps/presentation");
  const module = { exports: {} }, passes = [];
  Function("require", "module", "exports", "global", compiled.code)(id => {
    if (id === "@legend-apps/presentation") return { ...presentation,
      Background: ({ children }) => React.createElement("background", null, children),
      GPURenderGraph: props => { passes.push(...props.passes.map(pass => ({ ...pass, label: `${name}-${passes.length}-${pass.id}` }))); return null; },
      usePresentationValue: () => undefined, useBackgroundSize: () => ({ width: 1920, height: 1080 }), usePlayback: () => playback,
      samplePlayback: (state, _preview, clock) => clock === "step" ? state.stepTime : state.slideTime };
    if (id === "react-native-reanimated") return { ...require(id),
      makeMutable: value => ({ value }), useSharedValue: value => React.useRef({ value }).current, useDerivedValue: read => ({ get value() { return read(); } }), useAnimatedReaction() {} };
    return require(id);
  }, module, module.exports, globalThis);
  let renderer;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await act(() => {
    renderer = create(React.createElement(module.exports.default, { components: {
      Deck: "deck", Slide: "slide", View: "view", Step: ({ children }) => children, Steps: ({ children }) => children(0),
    } }));
  });
  await act(() => renderer.unmount());
  return passes;
}

test("World decks compile to Hermes-ready modules that require only host packages", async () => {
  for (const name of worldDecks) {
    const { code } = await compileWorldDeck(name);
    const requires = new Set();
    let classes = 0;
    transformSync(code, { babelrc: false, configFile: false, code: false, sourceType: "script", plugins: [() => ({ visitor: {
      Class() { classes++; },
      CallExpression({ node }) { if (node.callee.name === "require") requires.add(node.arguments[0].value); },
    } })] });
    expect(classes, name).toBe(0);
    expect([...requires].filter(id => !hostModules.has(id)), name).toEqual([]);
    expect(code, name).not.toMatch(/regeneratorRuntime|@babel\/runtime/);
  }
}, 60_000);

test.skipIf(process.platform !== "darwin")("World decks evaluate in Hermes with strict host modules", async () => {
  const hermesPath = path.join(path.dirname(require.resolve("react-native/package.json")), "sdks/hermesc/osx-bin/hermes");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "slides-world-hermes-"));
  try {
    for (const name of worldDecks) {
      const probePath = path.join(temporary, `${name}.js`);
      fs.writeFileSync(probePath, [
        `var hosts = ${JSON.stringify([...hostModules])};`,
        "function host() { return new Proxy(function() {}, { get: function(_, key) { return key === Symbol.iterator ? [][Symbol.iterator] : key === Symbol.toPrimitive ? function() { return 0; } : host(); }, apply: host, construct: host }); }",
        "var module = { exports: {} };",
        `Function("require", "module", "exports", "global", ${JSON.stringify((await compileWorldDeck(name)).code)})(function(id) {`,
        '  if (hosts.indexOf(id) < 0) throw new Error("Deck requested unavailable host module " + id);',
        "  return host();",
        "}, module, module.exports, globalThis);",
        "print(typeof module.exports.default);",
      ].join("\n"));
      const probe = spawnSync(hermesPath, [probePath], { encoding: "utf8", timeout: 30_000 });
      expect(probe.error, name).toBeUndefined();
      expect(probe.stderr, name).toBe("");
      expect(probe.status, name).toBe(0);
      expect(probe.stdout.trim(), name).toBe("function");
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}, 60_000);

test("World decks render their real graphs on every slide", async () => {
  const passes = Object.fromEntries(await Promise.all(worldDecks.map(async name => [name, await worldPasses(name)])));
  for (const name of worldDecks) expect(passes[name].length, name).toBeGreaterThan(0);
  const ids = name => new Set(passes[name].map(pass => pass.id));
  for (const id of ["scene-custom-0", "scene-sdf-0", "custom-post-0", "dof-gather", "shafts", "floor"]) expect(ids("world-tour")).toContain(id);
  const shafts = name => new Set(passes[name].filter(pass => pass.id === "shafts").map(pass => pass.code));
  expect(shafts("cinematic-title").size).toBeGreaterThan(0);
  expect([...shafts("cinematic-title")].some(code => !shafts("world-tour").has(code))).toBe(true);
}, 60_000);

const qualityGraphs = () => ["low", "medium", "high", "auto"].flatMap(quality => buildWorldGraph(prepareWorldScene({ quality,
  instances: [primitive("sphere"), primitive("box"), primitive("ring"), primitive("tube"),
    ...customInstances({ wgsl: "fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex { return ShapeVertex(vec3f(f32(vid)),vec3f(0.,0.,1.)); }\nfn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material { return Material(vec3f(.5),vec3f(0.),.5,0.); }", vertexCount: 3 }),
    sdfInstance({ wgsl: "fn sdf(p:vec3f)->f32 { return length(p)-1.; }", bounds: [[-2, -2, -2], [2, 2, 2]] })],
  floor: { mirror: true }, dof: { aperture: .7 }, shafts: { intensity: 1 }, lights: [{ position: [0, 8, 0] }, { kind: "spot" }], fog: { density: .02 },
  bloom: { intensity: 1 }, chromatic: .2, rim: { intensity: 1 }, passes: [{ id: "lines", wgsl: "fn customPass(uv:vec2f,color:vec4f,ctx:PassContext)->vec4f { return color; }" }],
})).passes.map(pass => ({ ...pass, label: `quality-${quality}-${pass.id}` })));

test.skipIf(process.platform !== "darwin")("example and World programs compile with the app's native WebGPU shader compiler", async () => {
  const world = [...(await Promise.all(worldDecks.map(worldPasses))).flat(), ...qualityGraphs()];
  const unique = new Map(world.map(pass => [pass.code, pass.label]));
  const result = validateShaders({ ...programs, ...Object.fromEntries([...unique].map(([code, label]) => [label, code])) });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout.trim().split("\n")).toHaveLength(Object.keys(programs).length + unique.size);
  const [code, label] = [...unique].find(([, label]) => label.startsWith("world-tour-") && label.endsWith("scene-custom-0"));
  const invalid = validateShaders({ [label]: code.replace("fn shape(", "fn shape(undeclared_token ") });
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toMatch(/error|expected/i);
}, 120_000);

test("documented GPU decks compile using the shared-clock shader host", async () => {
  for (const name of ["examples/showcase.mdx"]) {
    const file = path.resolve(import.meta.dir, "../..", name);
    expect(fs.readFileSync(file, "utf8")).not.toMatch(/<TypeGPU\s/);
    const result = await compileDeck(file);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.code).toContain("TypeGPUShader");
  }
}, 60_000);

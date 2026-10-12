// @ts-nocheck Exercise the actual Dawn compiler shipped with the app on macOS.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createConstellation } from "../packs/particles/Constellation";
import { createInterfaceReveal } from "../packs/particles/InterfaceReveal";
import { createGlowField } from "../packs/particles/GlowField";




const programs = Object.fromEntries([
  ["constellation", createConstellation()],
  ["interface", createInterfaceReveal()], ["glow", createGlowField()],
  ["smallConstellation", createConstellation({ particleCount: 256, rows: 3, speed: 0.7, scale: 0.6 })],
  ["smallInterface", createInterfaceReveal({ particleCount: 256, columns: 24, speed: 1.5, scale: 0.8 })],
  ["smallGlow", createGlowField({ particleCount: 256, speed: 0.5, scale: 0.7, tintA: [1,0.3,0.1], tintB: [0.4,0.7,1] })],
].map(([name, {program}]) => [name, program]));
test.skipIf(process.platform !== "darwin")("default and configured particle programs compile with the app's native WebGPU shader compiler", () => {
  const require = createRequire(new URL("../../../apps/slides/package.json", import.meta.url));
  const webgpu = path.dirname(require.resolve("react-native-webgpu/package.json"));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "slides-shader-test-"));
  try {
    const executable = path.join(temporary, "validate");
    const build = spawnSync("clang++", ["-std=c++17", path.join(import.meta.dir, "../../../apps/slides/src/__tests__/fixtures/validateShader.cpp"),
      "-I", path.join(webgpu, "cpp/webgpu"), path.join(webgpu, "libs/apple/libwebgpu_dawn.xcframework/macos-arm64_x86_64/libwebgpu_dawn.a"),
      "-framework", "Metal", "-framework", "Foundation", "-framework", "QuartzCore", "-framework", "IOSurface", "-framework", "IOKit", "-o", executable], { encoding: "utf8", timeout: 30_000 });
    expect(build.stderr).toBe("");
    expect(build.status).toBe(0);
    const files = Object.entries(programs).map(([name, code]) => {
      const file = path.join(temporary, `${name}.wgsl`); fs.writeFileSync(file, code); return file;
    });
    const result = spawnSync(executable, files, { encoding: "utf8", timeout: 30_000 });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}, 60_000);

test("particle factories reject invalid renderer counts and geometry", () => {
  for (const create of [createConstellation, createInterfaceReveal, createGlowField]) {
    expect(create({ particleCount: 257 }).particleCount).toBe(257);
    for (const options of [{particleCount: 0}, {particleCount: 1.5}, {particleCount: 16385}, {speed: -1}, {scale: 0}]) expect(() => create(options)).toThrow();
  }
  expect(() => createConstellation({ rows: 0 })).toThrow();
  expect(() => createInterfaceReveal({ columns: 1 })).toThrow();
  expect(() => createGlowField({ tintA: [2,0,0] })).toThrow();
});

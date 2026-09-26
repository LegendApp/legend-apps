// @ts-nocheck Exercise the actual Dawn compiler shipped with the app on macOS.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { sidebarStorm } from "../../decks/react-native-desktop/sidebarStorm";
import { gpuConstellation } from "../../decks/react-native-desktop/packs/data/gpuConstellation";
import { gpuInterfaceReveal } from "../../decks/react-native-desktop/packs/data/gpuInterfaceReveal";
import { cloudProgram } from "../../examples/components/CloudProgram";
import { compileDeck } from "../../../../packages/presentation/src/compiler";

import { gameOfLifeShader } from "../../examples/components/GameOfLifeProgram";

import { boidsProgram } from "../../examples/components/TypeGPUBoids";

const programs = { sidebarStorm, gpuConstellation, gpuInterfaceReveal, cloudProgram, gameOfLifeShader, boidsProgram };
test.skipIf(process.platform !== "darwin")("example programs compile with the app's native WebGPU shader compiler", () => {
  const require = createRequire(import.meta.url);
  const webgpu = path.dirname(require.resolve("react-native-webgpu/package.json"));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "slides-shader-test-"));
  try {
    const executable = path.join(temporary, "validate");
    const build = spawnSync("clang++", ["-std=c++17", path.join(import.meta.dir, "fixtures/validateShader.cpp"),
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

test("documented GPU decks compile using the shared-clock shader host", async () => {
  for (const name of ["examples/showcase.mdx", "decks/react-native-desktop/talk.mdx", "decks/react-native-desktop/effects.mdx"]) {
    const file = path.resolve(import.meta.dir, "../..", name);
    expect(fs.readFileSync(file, "utf8")).not.toMatch(/<TypeGPU\s/);
    const result = await compileDeck(file);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.code).toContain("TypeGPUShader");
  }
}, 60_000);

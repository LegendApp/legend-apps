// @ts-nocheck Run the real Release post-processing without building, signing, or launching an app.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("packages/presentation/package.json"));
const { transformSync } = require("esbuild");

test("Release post-processing preserves the compiler helper emitted by Spark", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-release-helper-"));
  try {
    const app = path.join(root, "LegendSlides.app"), helper = path.join(app, "Contents/Helpers/slides-compiler.helper");
    fs.mkdirSync(helper, { recursive: true });
    fs.writeFileSync(path.join(helper, "run"), "built-in compiler bootstrap");
    fs.writeFileSync(path.join(root, "release-build.json"), JSON.stringify({ app }));
    const fakeFS = { ...fs, readFileSync: (file, ...args) => String(file).endsWith(".spark/release-build.json")
      ? JSON.stringify({ app }) : fs.readFileSync(file, ...args) };
    const source = fs.readFileSync(path.resolve("scripts/build-app.ts"), "utf8");
    const code = transformSync(source.slice(0, source.lastIndexOf("main().catch")) + "\nexport { buildOne };", { loader: "ts", format: "cjs" }).code.replace(/^#!.*\n/, "");
    const module = { exports: {} };
    const mocks = {
      "node:fs": fakeFS, "node:path": path,
      "node:child_process": { spawnSync: () => ({ status: 0, stdout: "", stderr: "Signature=adhoc" }) },
      "./lib/sparkWorkspaces": { sparkWorkspace: () => root },
      "./lib/slidesCompiler": { signSlidesCompiler() {} },
      "./lib/apps": { rootDir: process.cwd(), loadAppManifest: async () => ({ id: "slides" }), assertSupportedPlatform() {} },
      "./lib/run": { runCommand() {} },
    };
    Function("require", "module", "exports", code)(name => mocks[name], module, module.exports);
    await module.exports.buildOne("slides", "macos");
    expect(fs.readFileSync(path.join(helper, "run"), "utf8")).toBe("built-in compiler bootstrap");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

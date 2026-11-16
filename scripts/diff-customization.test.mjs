import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDiffCustomization, readDiffCustomizationBaseline } from "./diff-customization.mjs";

test("compiles the actual Diff viewer with shared host imports", async () => {
  const baseline = readDiffCustomizationBaseline();
  const result = await compileDiffCustomization(baseline, baseline.files);
  expect(result.baseId).toBe(baseline.baseId);
  expect(result.code).toContain("diff-host/diffSettings");
  expect(result.code).toContain("DiffViewerWindow");
  expect(result.code).toContain("customizationSettingsTextColor");
  expect(result.code).not.toContain("react.production");
  expect(/\basync\s+(?:function|\()/.test(result.code)).toBe(false);
  expect(/function\s*\*/.test(result.code)).toBe(false);
  expect(result.code.includes("jsxDEV")).toBe(false);
});

test("development CLI compiles production JSX for the Hermes host", () => {
  const baseline = readDiffCustomizationBaseline();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./diff-customization.mjs", import.meta.url))], {
    input: JSON.stringify({ baseId: baseline.baseId, files: baseline.files }),
    env: { ...process.env, NODE_ENV: "development" },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  expect(result.status).toBe(0);
  const compiled = JSON.parse(result.stdout);
  expect(compiled.baseId).toBe(baseline.baseId);
  expect(compiled.code.includes("jsxDEV")).toBe(false);
  expect(/\basync\s+(?:function|\()/.test(compiled.code)).toBe(false);
  expect(/function\s*\*/.test(compiled.code)).toBe(false);
});

test("rejects new native imports and invalid source before activation", async () => {
  const baseline = readDiffCustomizationBaseline();
  await expect(compileDiffCustomization(baseline, { ...baseline.files, "diffPalette.ts": 'import "new-native-module"; export function getDiffPalette() {}' })).rejects.toThrow("Unavailable import");
  await expect(compileDiffCustomization(baseline, { ...baseline.files, "DiffViewerWindow.tsx": "export default <" })).rejects.toThrow();
});

test("packaged customizer helper is a bundle codesign accepts inside an app", () => {
  const app = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "diff-customizer-")), "Fixture.app");
  try {
    fs.mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
    fs.copyFileSync("/usr/bin/true", path.join(app, "Contents/MacOS/Fixture"));
    fs.writeFileSync(path.join(app, "Contents/Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>so.legend.diff.fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
    const helper = path.join(app, "Contents/Helpers/diff-customizer.helper");
    const packaged = spawnSync(process.execPath, [fileURLToPath(new URL("./package-diff-customizer.mjs", import.meta.url)), helper], { encoding: "utf8" });
    expect(packaged.stderr).toBe("");
    const plist = JSON.parse(spawnSync("plutil", ["-convert", "json", "-o", "-", path.join(helper, "Info.plist")], { encoding: "utf8" }).stdout);
    expect(plist).toMatchObject({ CFBundleIdentifier: "so.legend.diff.macos.customizer", CFBundleExecutable: "bun", CFBundlePackageType: "BNDL" });
    const signed = spawnSync("codesign", ["--force", "--sign", "-", "--deep", app], { encoding: "utf8" });
    expect(signed.stderr).not.toContain("bundle format unrecognized");
    expect(signed.status).toBe(0);
    expect(spawnSync("codesign", ["--verify", "--deep", "--strict", app]).status).toBe(0);
  } finally {
    fs.rmSync(path.dirname(app), { recursive: true, force: true });
  }
}, 120_000);

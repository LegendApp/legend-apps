import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
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

import { test, expect } from "bun:test";
import { compileDiffCustomization, readDiffCustomizationBaseline } from "./diff-customization.mjs";

test("compiles the actual Diff viewer with shared host imports", async () => {
  const baseline = readDiffCustomizationBaseline();
  const result = await compileDiffCustomization(baseline, baseline.files);
  expect(result.baseId).toBe(baseline.baseId);
  expect(result.code).toContain("diff-host/diffSettings");
  expect(result.code).toContain("DiffViewerWindow");
  expect(result.code).not.toContain("react.production");
});

test("rejects new native imports and invalid source before activation", async () => {
  const baseline = readDiffCustomizationBaseline();
  await expect(compileDiffCustomization(baseline, { ...baseline.files, "diffPalette.ts": 'import "new-native-module"; export function getDiffPalette() {}' })).rejects.toThrow("Unavailable import");
  await expect(compileDiffCustomization(baseline, { ...baseline.files, "DiffViewerWindow.tsx": "export default <" })).rejects.toThrow();
});

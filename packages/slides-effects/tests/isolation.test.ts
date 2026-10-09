// @ts-nocheck The native dependencies are supplied by the test host.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileDeck } from "../../presentation/src/compiler";

test("a selected background bundles no atmosphere catalog or talk assets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-effect-isolation-"));
  try {
    const deck = path.join(root, "deck.mdx");
    fs.writeFileSync(deck, 'export { Droplets } from "slides:backgrounds/Droplets"\n\n# Standalone');
    const result = await compileDeck(deck);
    expect(result.success).toBe(true);
    if (!result.success) throw Error(result.errors.join("\n"));
    for (const name of ["Smoke", "Fluid", "Wireframe", "AnimatedAtmosphere", "TypeGPUGlassBackground"]) {
      expect(result.dependencies.some(file => file.endsWith(`/${name}.tsx`))).toBe(false);
    }
    expect(result.dependencies.some(file => file.includes("rnconnection-assets"))).toBe(false);
    let compilations = 0;
    const module = { exports: {} };
    Function("require", "module", "exports", result.code)(name => name === "@shopify/react-native-skia"
      ? { Skia: { RuntimeEffect: { Make: () => { compilations++; return {}; } } } }
      : name === "react-native" ? { StyleSheet: { create: value => value, absoluteFillObject: {} } } : {}, module, module.exports);
    expect(compilations).toBe(0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

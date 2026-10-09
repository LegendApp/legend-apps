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

test("media, charts and Lottie entrypoints compile independently without demo assets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-effect-content-"));
  try {
    for (const [name, entry] of [["AppCarousel", "media/AppCarousel"], ["LottiePlayer", "animation/LottiePlayer"], ["BarRow", "charts/BarRow"]]) {
      const deck = path.join(root, "deck.mdx");
      fs.writeFileSync(deck, `export { ${name} } from "slides:${entry}"\n\n# External content`);
      const result = await compileDeck(deck);
      expect(result.success).toBe(true);
      if (!result.success) throw Error(result.errors.join("\n"));
      expect(result.code).toContain("__workletHash");
      expect(result.dependencies.some(file => /rnconnection-assets|AppShowcase|native-orbit/.test(file))).toBe(false);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("particle and material entries bundle independently through the deck transforms", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-effect-programs-"));
  try {
    for (const [name, entry] of [["createGlowField", "particles/GlowField"], ["createWindowStorm", "particles/WindowStorm"],
      ["createConstellation", "particles/Constellation"], ["createInterfaceReveal", "particles/InterfaceReveal"],
      ["TrajectoryEmitter", "particles/TrajectoryEmitter"], ["GlassStrike", "materials/GlassStrike"],
      ["ImageShatter", "materials/ImageShatter"], ["Flames", "materials/Fire"],
      ["prismaticTear", "materials/Distortion"], ["createRefractionShader", "materials/Refraction"]]) {
      const deck = path.join(root, "deck.mdx");
      fs.writeFileSync(deck, `export { ${name} } from "slides:${entry}"\n\n# Standalone effect`);
      const result = await compileDeck(deck);
      expect(result.success, JSON.stringify(result.errors)).toBe(true);
      if (!result.success) throw Error(result.errors.join("\n"));
      expect(result.dependencies.some(file => /legend-talks|rnconnection-assets|AnimatedAtmosphere/.test(file))).toBe(false);
      expect(result.dependencies.filter(file => file.endsWith("pack.json")).length).toBe(1);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

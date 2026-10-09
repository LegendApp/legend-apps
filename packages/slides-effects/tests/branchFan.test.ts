// @ts-nocheck Compile the optional dependency graph, then rasterize with real Skia.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { compileDeck } from "../../presentation/src/compiler";

test("standalone branch fans compile lazily and draw caller geometry on two stage sizes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-branch-fan-"));
  let surface, paint, kit;
  const effects = [];
  try {
    const deck = path.join(root, "deck.mdx");
    fs.writeFileSync(deck, 'export { BranchFan, createBranchFanShader } from "slides:diagrams/BranchFan"\n\n# Arbitrary fan');
    const result = await compileDeck(deck);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    if (!result.success) throw Error(result.errors.join("\n"));
    expect(result.code).toContain("react/compiler-runtime");
    expect(result.dependencies.filter(file => file.endsWith("pack.json")).length).toBe(2);
    expect(result.dependencies.some(file => file.includes("legend-talks"))).toBe(false);
    let compilations = 0;
    const module = { exports: {} };
    Function("require", "module", "exports", result.code)(name => name === "@shopify/react-native-skia"
      ? { Skia: { RuntimeEffect: { Make: () => { compilations++; return {}; } } } } : {}, module, module.exports);
    expect(compilations).toBe(0);
    const { createBranchFanShader } = module.exports;
    const require = createRequire(new URL("../../../apps/slides/package.json", import.meta.url));
    const skiaRequire = createRequire(require.resolve("@shopify/react-native-skia"));
    const entry = skiaRequire.resolve("canvaskit-wasm");
    kit = await skiaRequire("canvaskit-wasm")({ locateFile: file => path.join(path.dirname(entry), file) });
    surface = kit.MakeSurface(240, 135); paint = new kit.Paint();
    for (const [width, height, root, ends] of [
      [1920,1080,{x: 900,y: 120},[{x: 200,y: 850},{x: 900,y: 800},{x: 1600,y: 850}]],
      [960,540,{x: 480,y: 40},[{x: 100,y: 470},{x: 850,y: 470}]],
    ]) {
      const errors = [];
      const effect = kit.RuntimeEffect.Make(createBranchFanShader({root, ends, strands: 3, twist: 8}), error => errors.push(error));
      expect(errors).toEqual([]); expect(effect).not.toBeNull(); effects.push(effect);
      const shader = effect.makeShader([2, 1, 1.2]);
      const canvas = surface.getCanvas();
      canvas.clear(kit.TRANSPARENT); canvas.save(); canvas.scale(240 / width, 135 / height);
      paint.setShader(shader); canvas.drawRect(kit.XYWHRect(0,0,width,height), paint); canvas.restore(); surface.flush();
      const image = surface.makeImageSnapshot();
      expect(image.readPixels(0, 0, {width: 240,height: 135,alphaType: kit.AlphaType.Premul,
        colorType: kit.ColorType.RGBA_8888,colorSpace: kit.ColorSpace.SRGB}).some(value => value > 0)).toBe(true);
      image.delete(); paint.setShader(null); shader.delete();
    }
    expect(() => createBranchFanShader({root: {x: 0,y: 100},ends: [{x: 20,y: 50}]})).toThrow();
  } finally {
    paint?.delete(); surface?.delete(); effects.forEach(effect => effect.delete());
    fs.rmSync(root, {recursive: true,force: true});
  }
}, 30000);

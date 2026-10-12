// @ts-nocheck Compile and rasterize actual pack shaders with real Skia.
import { expect, mock, test } from "bun:test";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
mock.module("@legend-apps/presentation", () => ({ GPUShader:"gpu", PresentationCanvas: "canvas", useAnimatedShaderUniforms: () => ({}), useGPUShaderData: () => ({}), FocusSurfaceContext: {} }));
mock.module("@shopify/react-native-skia", () => ({ Canvas: "canvas", Fill: "fill", ImageShader: "image-shader", Shader: "shader",
  useImage: () => ({}), Skia: { RuntimeEffect: { Make: () => ({}) } } }));
const { createIntactGlassShader } = await import("../packs/materials/GlassStrike");
const { createImageShatterGPU } = await import("../packs/materials/ImageShatterGPU");
const { createFallingSpritesGPU } = await import("../packs/materials/FallingSpritesGPU");
const { createGlassStrikeGPU } = await import("../packs/materials/GlassStrikeGPU");
const { createGlassPanelsShader } = await import("../packs/materials/GlassPanels");
const { flameSource } = await import("../packs/materials/Fire");
const { createRefractionShader } = await import("../packs/materials/Refraction");

test("intact glass geometry scales consistently and retained Skia materials render", async () => {
  const require = createRequire(new URL("../../../apps/slides/package.json", import.meta.url));
  const skiaRequire = createRequire(require.resolve("@shopify/react-native-skia"));
  const entry = skiaRequire.resolve("canvaskit-wasm");
  const kit = await skiaRequire("canvaskit-wasm")({ locateFile: file => join(dirname(entry), file) });
  const effects = [];
  function compile(source) {
    const errors = [];
    const effect = kit.RuntimeEffect.Make(source, error => errors.push(error));
    expect(errors).toEqual([]); expect(effect).not.toBeNull();
    effects.push(effect); return effect;
  }
  const textureEffect = compile("half4 main(float2 p) { return half4(fract(p.x/300.0),fract(p.y/300.0),0.7,1); }");
  const texture = textureEffect.makeShader([]);
  const surface = kit.MakeSurface(240, 135), paint = new kit.Paint();
  function render(effect, uniforms, scale = 1 / 8, child = false) {
    const data = Array.from({ length: effect.getUniformCount() }, (_, index) => uniforms[effect.getUniformName(index)]).flat();
    expect(data.every(Number.isFinite)).toBe(true);
    const shader = child ? effect.makeShaderWithChildren(data, [texture]) : effect.makeShader(data);
    const canvas = surface.getCanvas();
    canvas.clear(kit.TRANSPARENT); canvas.save(); canvas.scale(scale, scale);
    paint.setShader(shader); canvas.drawRect(kit.XYWHRect(0, 0, 240 / scale, 135 / scale), paint); canvas.restore(); surface.flush();
    const image = surface.makeImageSnapshot();
    const pixels = Uint8Array.from(image.readPixels(0, 0, { width: 240, height: 135, alphaType: kit.AlphaType.Premul,
      colorType: kit.ColorType.RGBA_8888, colorSpace: kit.ColorSpace.SRGB }));
    image.delete(); paint.setShader(null); shader.delete(); return pixels;
  }
  try {
    const strike = compile(createIntactGlassShader());
    const smallStrike = compile(createIntactGlassShader({ centerY: 150, scale: 0.5 }));
    for (const time of [0.17, 1, 6]) {
      const uniforms = { time, slideTime: time + 10, broken: 0, resolveToCheck: 1, settled: 0, phase: 0, centerX: 848, panelHalfHeight: 151 };
      expect(render(smallStrike, { ...uniforms, centerX: 424 }, 1 / 4)).toEqual(render(strike, uniforms));
    }
    compile(createIntactGlassShader({ centerY: 200, halfWidth: 180, radius: 24, strikeTint: [0.8,0.3,1], checkTint: [0.2,0.7,1],
      strokePoints: [[-220,-140],[220,140],[220,-140],[-220,140]] }));
    const flames = compile(flameSource);
    expect(flameSource).not.toContain("uniform shader");
    expect(render(flames, { time:0,fireWidth:368,barHeight:30,intensity:1 }, 1/4).every(v=>v===0)).toBe(true);
    expect(render(flames, { time:5.4,fireWidth:368,barHeight:30,intensity:1 }, 1/4).some(v=>v>0)).toBe(true);
    expect(render(flames, { time:5.4,fireWidth:368,barHeight:30,intensity:0 }, 1/4).every(v=>v===0)).toBe(true);
    const panels = [{ x: 10, y: 20, width: 400, height: 180, radius: 30 }];
    expect(render(compile(createGlassPanelsShader(panels, [0.5,0.7,1])), { time: 2, pulse: 0, edgeMotion: 0 }).some(v => v > 0)).toBe(true);
    for (const options of [{}, { radii: [12,24], ramp: { response: 0.5, moreRefraction: 8, peak: 24 } }]) {
      expect(render(compile(createRefractionShader(options)), { resolution: [1920,1080], time: 8, strength: 18,
        surfaceA: [0.1,0.1,0.4,0.4], surfaceB: [0.5,0.5,0.9,0.9] }, 1 / 8, true).some(v => v > 0)).toBe(true);
    }
  } finally { paint.delete(); surface.delete(); texture.delete(); effects.forEach(effect => effect.delete()); }
}, 30000);

test("invalid material geometry fails before shader compilation", () => {
  expect(() => createIntactGlassShader({ scale: 0 })).toThrow();
  expect(() => createGlassStrikeGPU(1920,1080,{ strikeTint: [2,0,0] })).toThrow();
  expect(() => createImageShatterGPU({ imageWidth: 0, imageHeight: 400, centerX: 500, centerY: 320 },1920,1080,1)).toThrow();
  expect(() => createFallingSpritesGPU(600, 30, 800, 0)).toThrow();
  expect(() => createRefractionShader({ ramp: { response: 1, moreRefraction: 1, peak: 2 } })).toThrow();
});

import { expect, test } from "bun:test";
import { d } from "typegpu";
import { defineJourneyEffect, type JourneyEffectGraph } from "../../../../packages/slides-effects/packs/journey/effects";
import { buildJourneyGraph } from "../../../../packages/slides-effects/packs/journey/render";
import { instanceField, prepareJourneyScene, primitive, sampleJourneyUniforms, journeyHeaderSize, journeyInstanceSize } from "../../../../packages/slides-effects/packs/journey/scene";

const clock = (stepIndex: number) => ({ slideTime: 2, stepTime: 1, stepIndex, stepOrigins: {} as Record<number, number> });

export const testTint = defineJourneyEffect({
  name: "test-tint", params: { gain: d.f32, tint: d.vec3f }, defaults: { gain: 1, tint: [1, 1, 1] },
  build: ({ input, id }): JourneyEffectGraph => ({ passes: [
    { id: id("blur"), fragment: "blur", reads: { source: input }, output: id("blur"), wgsl: "@fragment fn blur(@location(0) uv:vec2f)->@location(0) vec4f { return textureSampleLevel(source,linearSampler,uv,0.); }" },
    { id: id("mix"), fragment: "tint", reads: { source: input, blurred: id("blur"), depth: "depth" }, output: id(),
      wgsl: "@fragment fn tint(@location(0) uv:vec2f)->@location(0) vec4f { let p=params(); return vec4f(mix(textureSampleLevel(source,linearSampler,uv,0.).rgb,textureSampleLevel(blurred,linearSampler,uv,0.).rgb*p.tint,p.gain*depthAt(uv)/100.),1.); }" },
  ] }),
});

test("Journey effects get typed params after the instances, named bindings and Pass-style placement", () => {
  const scene = prepareJourneyScene({ instances: [primitive("sphere"), primitive("box")], bloom: { intensity: 1 },
    effects: [{ use: testTint({ gain: { 0: 0.25, 1: 0.75 }, tint: "#ff0000" }), after: "tonemap" }, { use: testTint() }] });
  const base = journeyHeaderSize + 2 * journeyInstanceSize;
  expect(scene.effectUses.map(use => use.base)).toEqual([base, base + 4]);
  const graph = buildJourneyGraph(scene);
  expect(graph.uniformsSize).toBe(base + 8);
  const ids = graph.passes.map(pass => pass.id);
  // The default placement (after bloom) stops the tone map fusing bloom; the explicit one follows the tone map.
  expect(ids.slice(ids.indexOf("bloom-composite"))).toEqual(["bloom-composite", "test-tint-2-blur", "test-tint-2-mix", "sharp-clear", "sharp-box", "sharp-sphere", "tonemap", "test-tint-blur", "test-tint-mix", "screen"]);
  const mix = graph.passes.find(pass => pass.id === "test-tint-mix")!;
  expect(mix.code).toContain("struct TestTintParams {");
  expect(mix.code).toContain(`fn params()->TestTintParams { return TestTintParams(uniforms[${base}u],vector(${base + 1}u)); }`);
  expect(mix.code).toContain("@group(0) @binding(4) var blurred:texture_2d<f32>;");
  expect(mix.code).toContain("texture_depth_multisampled_2d");
  for (const step of [0, 1]) {
    const values = sampleJourneyUniforms(scene, clock(step));
    expect(values.length).toBe(base + 8);
    expect([values[base], values[base + 1], values[base + 2], values[base + 3]]).toEqual([step ? 0.75 : 0.25, 1, 0, 0]);
    expect(values[base + 4]).toBe(1);
  }
});

test("Journey effects reject unknown params and placements", () => {
  expect(() => testTint({ strength: 1 } as never)).toThrow("has no param strength");
  expect(() => buildJourneyGraph(prepareJourneyScene({ instances: [], effects: [{ use: testTint(), before: "scene" }] }))).toThrow("Invalid Journey post-pass placement");
  expect(() => prepareJourneyScene({ instances: [], effects: [{ use: { effect: "missing", values: {}, options: {} } }] })).toThrow("Unknown Journey effect: missing");
});

test("Journey mesh instances write and load the same typed JourneyInstance layout", () => {
  const scene = prepareJourneyScene({ instances: [primitive("box", { position: [1, 2, 3], color: "#ff0000", size: 2 })] });
  const values = sampleJourneyUniforms(scene, clock(0)), base = journeyHeaderSize;
  expect(journeyInstanceSize).toBe(33);
  expect([values[base + instanceField.position], values[base + instanceField.position + 2], values[base + instanceField.radius]]).toEqual([1, 3, 2]);
  expect(values[base + instanceField.color]).toBe(1);
  const code = buildJourneyGraph(scene).passes.find(pass => pass.id === "scene-box")!.code;
  expect(code).toContain("struct JourneyInstance {");
  expect(code).toContain(`vector(base+${instanceField.color}u)`);
  expect(code).toContain("result.color=part.color;");
});

import { expect, test } from "bun:test";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { prepareWorldScene, sampleWorldUniforms } from "../packs/world/scene";
import { clockAtTime } from "../packs/world/camera";

test("scene emissive scale has an identity default and shares the animated uniform snapshot", () => {
  const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
  expect(sampleWorldUniforms(prepareWorldScene({ instances: [] }), clock)[18]).toBe(1);
  const scene = prepareWorldScene({ instances: [], emissiveScale: [{ at: 0, value: 1 }, { at: 2, value: 3, duration: 2, ease: "linear" }] });
  expect(sampleWorldUniforms(scene, clockAtTime(clock, 3))[18]).toBe(2);
});

test("color operators survive serialized topology and keep a single output conversion", () => {
  for (const toneMapping of ["aces", "neutral", "aces-filmic", "agx"] as const) {
    const scene = prepareWorldScene({ instances: [], toneMapping });
    const graph = buildWorldGraph(JSON.parse(JSON.stringify(worldGraphTopology(scene))));
    const output = graph.passes.find(pass => pass.id === "tonemap")!;
    expect(output.code.match(/fn toneMap\(/g)).toHaveLength(1);
    expect(output.code.match(/color=srgb\(color\)/g)).toHaveLength(1);
    expect(output.code).toContain("color=toneMap(color*uniforms[8]*frame.brightness)");
    const linear = buildWorldGraph(prepareWorldScene({ instances: [], toneMapping, outputColorSpace: "linear-srgb" }));
    expect(linear.passes.find(pass => pass.id === "tonemap")!.code).not.toContain("color=srgb(color)");
  }
});

test("luminance bloom preserves HDR color above the threshold and leaves soft-knee decks unchanged", () => {
  const code = (mode?: "soft" | "unreal") => buildWorldGraph(prepareWorldScene({ instances: [], bloom: { mode } })).passes.find(pass => pass.id === "bloom-threshold")!.code;
  expect(code()).toContain("soft*soft");
  expect(code("unreal")).toContain("dot(color,vec3f(.2126,.7152,.0722))");
  expect(code("unreal")).toContain("color*smoothstep(uniforms[10],uniforms[10]+.01,brightness)");
});

test("Unreal bloom radius redistributes mip energy without adding render passes", () => {
  const graph = (mode?: "soft" | "unreal") => buildWorldGraph(prepareWorldScene({ instances: [], quality: "high", bloom: { mode } }));
  const soft = graph(), unreal = graph("unreal");
  expect(unreal.passes.map(pass => pass.id)).toEqual(soft.passes.map(pass => pass.id));
  expect(unreal.targets).toEqual(soft.targets);
  for (const [mip, factor] of [[0, "1.0"], [4, "0.2"]] as const) {
    expect(unreal.passes.find(pass => pass.id === `bloom-up-${mip}`)!.code).toContain(`mix(${factor},1.2-${factor},clamp(uniforms[11],0.,1.))`);
  }
});

test("floor emission stays opt-in and is sampled with the scene color controls", () => {
  const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
  expect(sampleWorldUniforms(prepareWorldScene({ instances: [], floor: {} }), clock)[19]).toBe(0);
  const scene = prepareWorldScene({ instances: [], floor: { emissive: 1.25 } });
  expect(sampleWorldUniforms(scene, clock)[19]).toBe(1.25);
  expect(buildWorldGraph(scene).passes.find(pass => pass.id === "floor")!.code).toContain("vector(40u)*uniforms[19]");
});

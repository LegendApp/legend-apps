import { expect, test } from "bun:test";
import { buildJourneyGraph, journeyGraphTopology } from "../packs/journey/render";
import { prepareJourneyScene, sampleJourneyUniforms } from "../packs/journey/scene";
import { pillarInstances, routedTubeInstances } from "../packs/journey/stage";
import { burstInstances } from "../packs/journey/motion";
import { clockAtTime } from "../packs/journey/camera";

test("scene emissive scale has an identity default and shares the animated uniform snapshot", () => {
  const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
  expect(sampleJourneyUniforms(prepareJourneyScene({ instances: [] }), clock)[18]).toBe(1);
  const scene = prepareJourneyScene({ instances: [], emissiveScale: [{ at: 0, value: 1 }, { at: 2, value: 3, duration: 2, ease: "linear" }] });
  expect(sampleJourneyUniforms(scene, clockAtTime(clock, 3))[18]).toBe(2);
});

test("color operators survive serialized topology and keep a single output conversion", () => {
  for (const toneMapping of ["aces", "neutral", "aces-filmic", "agx"] as const) {
    const scene = prepareJourneyScene({ instances: [], toneMapping, bloom: { mode: "unreal" } });
    const graph = buildJourneyGraph(JSON.parse(JSON.stringify(journeyGraphTopology(scene))));
    const output = graph.passes.find(pass => pass.id === "tonemap")!;
    expect(graph.passes.map(pass => pass.id)).not.toContain("bloom-composite");
    expect(output.reads).toEqual([expect.any(String), "bloom-up@0"]);
    expect(output.code).toContain("textureSampleLevel(bloom,linearSampler,uv,0.).rgb*uniforms[9]");
    expect(output.code.match(/fn toneMap\(/g)).toHaveLength(1);
    expect(output.code.match(/color=srgb\(color\)/g)).toHaveLength(1);
    expect(output.code).toContain("color=toneMap(color*uniforms[8]*frame.brightness)");
    const linear = buildJourneyGraph(prepareJourneyScene({ instances: [], toneMapping, outputColorSpace: "linear-srgb" }));
    expect(linear.passes.find(pass => pass.id === "tonemap")!.code).not.toContain("color=srgb(color)");
    expect(linear.passes.find(pass => pass.id === "tonemap")!.code).toContain("color=mix(color,vector(60u),amount)");
  }
});

test("luminance bloom preserves HDR color above the threshold and leaves soft-knee decks unchanged", () => {
  const code = (mode?: "soft" | "unreal") => buildJourneyGraph(prepareJourneyScene({ instances: [], bloom: { mode } })).passes.find(pass => pass.id === "bloom-threshold")!.code;
  expect(code()).toContain("soft*soft");
  expect(code("unreal")).toContain("dot(color,vec3f(.2126,.7152,.0722))");
  expect(code("unreal")).toContain("color*smoothstep(params().threshold,params().threshold+.01,brightness)");
  expect(code("unreal")).toContain("BloomParams(uniforms[9u],uniforms[10u],uniforms[11u])");
});

test("Unreal bloom radius redistributes mip energy without adding render passes", () => {
  const graph = (mode?: "soft" | "unreal") => buildJourneyGraph(prepareJourneyScene({ instances: [], quality: "high", bloom: { mode } }));
  const soft = graph(), unreal = graph("unreal");
  expect(unreal.passes.map(pass => pass.id)).toEqual(soft.passes.map(pass => pass.id));
  expect(unreal.targets).toEqual(soft.targets);
  for (const [mip, factor] of [[0, "1.0"], [4, "0.2"]] as const) {
    expect(unreal.passes.find(pass => pass.id === `bloom-up-${mip}`)!.code).toContain(`mix(${factor},1.2-${factor},clamp(params().radius,0.,1.))`);
  }
});

test("floor emission stays opt-in and is sampled with the scene color controls", () => {
  const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
  expect(sampleJourneyUniforms(prepareJourneyScene({ instances: [], floor: {} }), clock)[19]).toBe(0);
  const scene = prepareJourneyScene({ instances: [], floor: { emissive: 1.25 } });
  expect(sampleJourneyUniforms(scene, clock)[19]).toBe(1.25);
  expect(buildJourneyGraph(scene).passes.find(pass => pass.id === "floor")!.code).toContain("vector(40u)*uniforms[19]");
});

test("material controls preserve primitive defaults and support authored HDR accents", () => {
  expect(pillarInstances({ id: "column", value: 1 })[1].emissive.initial).toBe(5);
  const material = { albedo: "#808080", metal: .3, roughness: .35 };
  const column = pillarInstances({ id: "column", value: 1, capEmissive: 1.2, material });
  expect(column[0].material).toEqual(material);
  expect(column[1].emissive.initial).toBe(1.2);
  const pulses = routedTubeInstances({ id: "path", path: [[0, 0, 0], [1, 0, 0]], pulses: [{ emissive: 10, trailEmissive: 4 }] }).filter(instance => instance.route?.pulse);
  expect(pulses[0].emissive.initial).toBe(10);
  expect(pulses[1].emissive.initial).toBeLessThan(4);
  const sparks = burstInstances({ position: [0, 0, 0], count: 3, colors: ["#ffffff", "#ff0000"], emissive: 6 });
  expect(sparks.map(instance => instance.emissive.initial)).toEqual([6, 6, 6]);
  expect(sparks[0].color.initial).toEqual(sparks[2].color.initial);
  expect(sparks[0].color.initial).not.toEqual(sparks[1].color.initial);

});

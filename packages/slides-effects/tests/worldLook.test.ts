import { expect, test } from "bun:test";
import { buildWorldGraph } from "../packs/world/render";
import { orbInstances, prepareWorldScene, primitive, sprayInstances } from "../packs/world/scene";

for (const quality of ["low", "medium", "high"] as const) {
  test(`round particles use one instanced quad with surface depth at ${quality} quality`, () => {
    const scene = prepareWorldScene({ quality, floor: { mirror: true }, instances: [
      primitive("box"), ...orbInstances({ count: 1000 }), ...sprayInstances({ rate: 1000, lifetime: 2 }),
    ] });
    const graph = buildWorldGraph(scene);
    for (const id of ["scene-sphere", "reflection-sphere"]) {
      const draw = graph.passes.find(pass => pass.id === id)!;
      expect(draw.kind).toBe("render");
      if (draw.kind !== "render") throw new Error("Expected sphere render pass");
      expect(draw.vertexCount).toBe(6);
      const vertex = draw.code.slice(draw.code.indexOf("@vertex"), draw.code.indexOf("struct SphereResult"));
      expect(vertex).toContain("result.opacity<=.001 || center.w+extent<=.05 || center.w-extent>=500.");
      expect(draw.instanceCount).toBe(3000);
      expect(draw.code).toContain("@builtin(frag_depth)");
      expect(draw.code).toContain("if(field<=0.");
      expect(draw.code).toContain("fwidth(field)");
      expect(draw.code).toContain("normal=normalize(local/radii)");
      expect(draw.code).toContain("(iid+1u)");
    }
    const reflection = graph.targets.find(target => target.id === "reflect")!;
    const hdr = graph.targets.find(target => target.id === "hdr")!;
    expect(reflection).toMatchObject({ scale: hdr.scale, samples: hdr.samples });
    expect(graph.passes.filter(pass => pass.kind === "render")).toHaveLength(5);
  });
}

test("bloom uses round kernels with a soft threshold knee", () => {
  const graph = buildWorldGraph(prepareWorldScene({ instances: [], bloom: {} }));
  const code = (id: string) => graph.passes.find(pass => pass.id === id)!.code;
  expect(code("bloom-threshold")).toContain("downsample13(uv,true)");
  expect(code("bloom-threshold")).toContain("soft*soft");
  expect(code("bloom-down-1")).toContain("downsample13(uv,false)");
  expect(code("bloom-up-0")).toContain("tent9(uv)");
});

import { describe, expect, test } from "bun:test";
import type { ClockSample } from "../packs/world/camera";
import { buildWorldGraph } from "../packs/world/render";
import { instanceOpacity, instancePosition, prepareWorldScene, primitive, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { glyphVertexCount, layoutText3D, text3dBuffer, text3dInstances } from "../packs/world/text3d";
import { font } from "../packs/world/text3d-font";

function clock(time: number, step = 0, origins: Record<number, number> = { 0: 0 }): ClockSample {
  return { slideTime: time, stepTime: time - (origins[step] ?? 0), stepIndex: step, stepOrigins: origins };
}
const scene = (instances: ReturnType<typeof text3dInstances>) => prepareWorldScene({ instances });

describe("world Text3D", () => {
  test("decodes outlines whose cap triangles cover the filled area, holes included", () => {
    const words = text3dBuffer(font.name, "text3d-0").init!;
    const integers = new Uint32Array(words.buffer);
    for (const char of ["O", "B", "8", "A", "%"]) {
      const glyph = font.chars.indexOf(char), header = glyph * 6;
      const [start, points, segments, , triangles, triangleCount] = Array.from(integers.subarray(header, header + 6));
      const point = (i: number) => [words[start + i * 6], words[start + i * 6 + 1]];
      let capArea = 0;
      for (let t = 0; t < triangleCount; t++) {
        const packed = integers[triangles + t], [a, b, c] = [packed & 1023, packed >> 10 & 1023, packed >> 20 & 1023].map(point);
        capArea += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      }
      // Each segment's outward normal points out of the solid, so the signed outline area equals the filled area.
      let outlineArea = 0;
      for (let s = 0; s < font.glyphs[glyph][2]; s++) {
        const pair = integers[segments + s], a = point(pair & 65535), b = point(pair >>> 16);
        outlineArea += (a[0] * b[1] - b[0] * a[1]) / 2;
        const normal = [words[start + (pair & 65535) * 6 + 2], words[start + (pair & 65535) * 6 + 3]];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-4) expect(normal[0] * (b[1] - a[1]) - normal[1] * (b[0] - a[0])).toBeGreaterThan(0);
      }
      expect(points).toBeGreaterThan(3);
      expect(capArea).toBeGreaterThan(0.05);
      expect(outlineArea).toBeCloseTo(capArea, 3);
    }
  });
  test("lays out with kerning, alignment and lines", () => {
    const [a, v] = layoutText3D(font, "AV", { align: "left" });
    expect(v.x - a.x).toBeCloseTo(a.advance / 2 + font.kerning.AV + v.advance / 2);
    expect(font.kerning.AV).toBeLessThan(0);
    const centered = layoutText3D(font, "HI HI");
    expect(centered[0].x - centered[0].advance / 2).toBeCloseTo(-(centered[3].x + centered[3].advance / 2), 5);
    const lines = layoutText3D(font, "A\nB", { lineHeight: 1.2 });
    expect(lines.map(glyph => glyph.y + 0)).toEqual([0, -1.2]);
    expect(layoutText3D(font, "é")[0].char).toBe("é");
    expect(font.chars[layoutText3D(font, "é")[0].index]).toBe("?");
  });
  test("glyphs fly in individually on their step with a stagger and settle at home", () => {
    const instances = text3dInstances({ id: "t", text: "GO NOW", size: 2, position: [1, 2, 3], enter: { step: 1, offset: [0, 0, 8], rotation: [0, 90, 0], stagger: 0.1, duration: 0.8 } });
    expect(instances.map(instance => instance.id)).toEqual(["t:0", "t:1", "t:2", "t:3", "t:4"]);
    const prepared = scene(instances);
    const [first, last] = [prepared.instances[0], prepared.instances[4]];
    expect(instanceOpacity(first, clock(5, 0))).toBe(0);
    expect(instancePosition(first, clock(5, 0))[2]).toBeCloseTo(11);
    const playing = clock(1.3, 1, { 0: 0, 1: 1 });
    expect(instancePosition(first, playing)[2]).toBeLessThan(instancePosition(last, playing)[2]);
    const settled = clock(4, 1, { 0: 0, 1: 1 });
    expect(instanceOpacity(last, settled)).toBe(1);
    expect(instancePosition(first, settled)).toEqual([1 + first.glyph!.home[0], 2 + first.glyph!.home[1], 3]);
    expect(first.glyph!.home[0]).toBeLessThan(0);
    const values = sampleWorldUniforms(prepared, clock(1.05, 1, { 0: 0, 1: 1 }));
    const index = worldHeaderSize;
    expect(values[index + 11]).toBe(font.chars.indexOf("G"));
    expect(values[index + 13]).toBeGreaterThan(0);
    expect(values[index + 3]).toBe(2);
    expect(prepared.instances.every(instance => instance.motion === undefined)).toBe(true);
    expect(scene(text3dInstances({ text: "Still" })).instances.every(instance => instance.motion === "static")).toBe(true);
  });
  test("per-glyph motion overrides color, rotation and offset", () => {
    const instances = text3dInstances({ text: "AB", glyphs: (index) => index === 1 ? { color: "#ff0000", rotation: [0, 0, 30], offset: [0, 1, 0] } : undefined });
    const values = sampleWorldUniforms(scene(instances), clock(0));
    const b = worldHeaderSize + worldInstanceSize;
    expect(values[b + 4]).toBeCloseTo(1); expect(values[b + 5]).toBe(0);
    expect(values[b + 14]).toBe(30);
    expect(values[b + 1] - values[worldHeaderSize + 1]).toBeCloseTo(1);
  });
  test("draws every glyph of one font in one instanced pass with its outline buffer", () => {
    const glyphs = [...text3dInstances({ text: "ONE DRAW" }), primitive("sphere"), ...text3dInstances({ text: "TWO", position: [0, -2, 0] })];
    const graph = buildWorldGraph(prepareWorldScene({ instances: glyphs, floor: { mirror: true } }));
    const passes = graph.passes.filter(pass => pass.id.includes("glyphs"));
    expect(passes.map(pass => pass.id)).toEqual(["reflection-glyphs-0", "scene-glyphs-0"]);
    const pass = passes[1] as Extract<typeof passes[number], { kind: "render" }>;
    expect(pass.instanceCount).toBe(10);
    expect(pass.vertexCount).toBe(Math.max(..."ONEDRAWTWO".split("").map(char => glyphVertexCount(font, font.chars.indexOf(char), 2))));
    expect(pass.reads).toEqual(["text3d-0"]);
    expect(graph.buffers?.map(buffer => buffer.id)).toEqual(["text3d-0"]);
    expect(graph.uniformsSize).toBe(worldHeaderSize + 11 * worldInstanceSize);
  });
  test("each font gets its own pass and outline buffer", () => {
    const graph = buildWorldGraph(prepareWorldScene({ instances: [...text3dInstances({ text: "AB" }), ...text3dInstances({ text: "cd", mono: true }), ...text3dInstances({ text: "E" })] }));
    expect(graph.passes.filter(pass => pass.id.includes("glyphs")).map(pass => [pass.id, (pass as { instanceCount?: number }).instanceCount, pass.reads])).toEqual([
      ["scene-glyphs-0", 3, ["text3d-0"]], ["scene-glyphs-1", 2, ["text3d-1"]]]);
    expect(graph.buffers?.map(buffer => buffer.id)).toEqual(["text3d-0", "text3d-1"]);
  });
});

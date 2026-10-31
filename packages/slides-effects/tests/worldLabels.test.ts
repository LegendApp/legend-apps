import { describe, expect, test } from "bun:test";
import type { ClockSample, Vec3 } from "../packs/world/camera";
import { glyphAdvances, glyphCell, glyphFirst } from "../packs/world/glyphs";
import { buildWorldGraph } from "../packs/world/render";
import { cardInstances, compileTrack, formatRowLabel, sampleTrack, instanceOpacity, instancePosition, labelInstance, labelWidth, packLabelText, prepareWorldScene, primitive,
  recyclePathPoint, recycleSlot, rowInstances, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";

function clock(time: number, step = 0, origins: Record<number, number> = { 0: 0 }): ClockSample {
  return { slideTime: time, stepTime: time - (origins[step] ?? 0), stepIndex: step, stepOrigins: origins };
}
function unpack(values: ArrayLike<number>, index: number, length: number) {
  let text = "";
  for (let i = 0; i < length; i++) {
    const k = Math.floor(i / 3), field = index + (k < 11 ? 12 + k : 13 + k);
    text += String.fromCharCode(Math.floor(values[field] / 128 ** (i % 3)) % 128);
  }
  return text;
}

describe("world labels", () => {
  test("measures proportional text from the atlas advances and mono text in fixed cells", () => {
    const advance = (c: string) => glyphAdvances[c.charCodeAt(0) - glyphFirst];
    expect(labelWidth("Ada", false)).toBeCloseTo(advance("A") + advance("d") + advance("a"));
    expect(labelWidth("{ id: 1 }", true)).toBeCloseTo(9 * 0.6);
    expect(labelWidth("é", false)).toBeCloseTo(advance("?"));
  });
  test("packs three characters per float into the slot's spare fields and round-trips them exactly", () => {
    const values = new Float32Array(worldInstanceSize);
    const text = `{ id: 3, name: "Linus" } -> rendered row #3 with extra tail`.slice(0, 57);
    packLabelText(text, values, 0);
    expect(unpack(values, 0, text.length)).toBe(text);
    for (const field of [0, 3, 7, 8, 9, 10, 11, 23]) expect(values[field]).toBe(0);
  });
  test("formats row templates from items, logical index and slot", () => {
    expect(formatRowLabel("{item}", ["Ada", "Grace"], 3, 1)).toBe("Grace");
    expect(formatRowLabel("item {index} · C{slot}", undefined, 12, 4)).toBe("item 12 · C4");
  });
  test("attaches to a moving parent and draws in its own pass after the opaque geometry", () => {
    const card = primitive("box", { id: "card", position: { 0: [0, 0, 0], 1: [4, 0, 0] } });
    const scene = prepareWorldScene({ instances: [labelInstance({ text: "Ada", attach: "card", position: [0.1, 0, 0.2], color: "#ffb547" }), card] });
    expect(scene.instances.at(-1)!.label).toBeDefined();
    const label = scene.instances.at(-1)!;
    expect(instancePosition(label, clock(10, 1, { 0: 0, 1: 0 }))).toEqual([4.1, 0, 0.2]);
    const values = sampleWorldUniforms(scene, clock(0)) as number[];
    const index = worldHeaderSize + worldInstanceSize;
    expect(values[index + 9]).toBe(3);
    expect(unpack(values, index, 3)).toBe("Ada");
    const graph = buildWorldGraph(scene);
    const pass = graph.passes.find(item => item.id === "scene-labels")!;
    expect(pass).toMatchObject({ kind: "render", instanceCount: 1, reads: ["glyphs"] });
    expect(graph.buffers?.[0]).toMatchObject({ id: "glyphs", size: 95 * glyphCell * glyphCell });
    expect(graph.passes.indexOf(pass)).toBe(graph.passes.length - 1 - graph.passes.slice().reverse().findIndex(item => item.id.startsWith("scene-")));
    expect(() => prepareWorldScene({ instances: [labelInstance({ text: "x", attach: "missing" })] })).toThrow("Unknown world label parent");
  });
});

test("delayed step keyframes hold the previous value until their delay elapses", () => {
  const track = compileTrack([{ step: 0, value: 0 }, { step: 1, value: 1, duration: 1, ease: "linear" as const, delay: 2 }, { step: 1, value: 0, duration: 1, ease: "linear" as const, delay: 4 }]);
  const origins = { 0: 0, 1: 10 };
  expect(sampleTrack(track, clock(11, 1, origins))).toBe(0);
  expect(sampleTrack(track, clock(12.5, 1, origins))).toBeCloseTo(0.5);
  expect(sampleTrack(track, clock(13.5, 1, origins))).toBe(1);
  expect(sampleTrack(track, clock(14.5, 1, origins))).toBeCloseTo(0.5);
  // A completed step without an origin settles every delayed frame.
  expect(sampleTrack(track, clock(20, 2, { 2: 20 }))).toBe(0);
});

describe("recycled rows", () => {
  test("each container holds the mounted row congruent to its slot; only the top one travels", () => {
    expect([0, 1, 2, 3, 4].map(slot => recycleSlot(slot, 5, 1, 1).logical)).toEqual([0, 1, 2, 3, 4]);
    expect(recycleSlot(0, 5, 1, 1.4)).toEqual({ logical: 0, travel: expect.closeTo(0.4) });
    expect(recycleSlot(1, 5, 1, 1.4).travel).toBe(-1);
    // After a full row the container that travelled holds the next row past the bottom buffer.
    expect(recycleSlot(0, 5, 1, 2).logical).toBe(5);
  });
  test("the path leaves upward, loops right of the column and docks horizontally", () => {
    const start: Vec3 = [0, 3, 0], end: Vec3 = [0, -3, 0];
    expect(recyclePathPoint(start, end, 6, 1, 0)).toEqual([0, 3, 0]);
    const last = recyclePathPoint(start, end, 6, 1, 1);
    expect(last[0]).toBeCloseTo(0); expect(last[1]).toBeCloseTo(-3);
    let previous = start, longest = 0;
    for (let i = 1; i <= 200; i++) {
      const point = recyclePathPoint(start, end, 6, 1, i / 200);
      longest = Math.max(longest, Math.hypot(point[0] - previous[0], point[1] - previous[1]));
      expect(point[0]).toBeGreaterThanOrEqual(-1e-9); expect(point[0]).toBeLessThanOrEqual(6 + 1e-9);
      expect(point[1]).toBeLessThanOrEqual(4 + 1e-9);
      previous = point;
    }
    // Uniform arc-length sampling: no step is much longer than the average.
    expect(longest).toBeLessThan(0.15);
    expect(recyclePathPoint(start, end, 6, 1, 0.01)[1]).toBeGreaterThan(3);
    expect(recyclePathPoint(start, end, 6, 1, 0.5)[0]).toBeCloseTo(6);
  });
  test("a recycled container moves continuously across row boundaries and swaps content at the dock", () => {
    const options = { id: "list", count: 5, spacing: 1, scroll: [{ at: 0, value: 1 }, { at: 1, value: 3, duration: 2, ease: "linear" as const }],
      items: ["Ada", "Grace", "Linus", "Margaret", "Alan", "Barbara", "Ken"], labels: [{ text: "{item}" }], recycle: { above: 1, below: 1, ghosts: 2 } };
    const scene = prepareWorldScene({ instances: rowInstances(options) });
    const slot = scene.instances.find(item => item.id === "list:slot:0")!;
    const at = (time: number) => instancePosition(slot, clock(time));
    for (const boundary of [2, 3]) {
      const before = at(boundary - 1e-4), after = at(boundary + 1e-4);
      expect(Math.hypot(before[0] - after[0], before[1] - after[1])).toBeLessThan(0.01);
    }
    expect(at(1)[1]).toBeCloseTo(2); // top buffer row of a three-row window centred on 0
    expect(at(2)[1]).toBeCloseTo(-2); // docked in the bottom buffer
    expect(at(3)[1]).toBeCloseTo(-1); // then scrolls up into the window
    const label = scene.instances.find(item => item.id === "list:slot:0:label:0")!;
    const text = (time: number) => {
      const index = scene.instances.indexOf(label), values = sampleWorldUniforms(scene, clock(time)) as number[];
      return unpack(values, worldHeaderSize + index * worldInstanceSize, values[worldHeaderSize + index * worldInstanceSize + 9]);
    };
    expect(text(1)).toBe("Ada");
    expect(text(1.4)).toBe("Ada");
    expect(text(1.9)).toBe("Barbara");
    expect(instanceOpacity(label, clock(1.75))).toBeCloseTo(0, 1);
    const ghost = scene.instances.find(item => item.id === "list:ghost:0")!;
    expect(instanceOpacity(ghost, clock(1))).toBe(0);
    expect(instanceOpacity(ghost, clock(1.5))).toBeGreaterThan(0);
  });
});

describe("world cards", () => {
  test("lay out an avatar initial, title, subtitle and meta from the card's largest size", () => {
    const [card, ...labels] = cardInstances({ id: "ada", title: "ada", subtitle: "Lovelace", meta: "key 1", scale: [{ step: 0, value: [4, 0, 0] }, { step: 1, value: [4, 0.6, 0.2] }] });
    expect(card.card).toEqual({ radius: 0.12, bevel: 0.02, edge: 0.6, avatar: 0.62 });
    expect(labels.map(label => [label.id, label.label!.text, label.label!.attach])).toEqual([
      ["ada:initials", "A", "ada"], ["ada:title", "ada", "ada"], ["ada:subtitle", "Lovelace", "ada"], ["ada:meta", "key 1", "ada"]]);
    const [initials, title, , meta] = labels.map(label => label.label!.offset.initial);
    expect(initials[0]).toBeCloseTo(-2 + 0.3);
    expect(title[0]).toBeGreaterThan(initials[0] + 0.6 * 0.62 / 2);
    expect(meta[0]).toBeLessThan(2);
    expect(initials[2]).toBeCloseTo(0.11);
    expect(cardInstances({ id: "code", title: "{ id: 1 }", avatar: 0 }).map(item => item.id)).toEqual(["code", "code:title"]);
    expect(() => cardInstances({ title: "Ada" })).toThrow("needs an id");
  });
  test("write their shape into the slot and draw in card passes before labels", () => {
    const scene = prepareWorldScene({ instances: [...cardInstances({ id: "ada", title: "Ada", radius: 0.2 }), primitive("box")], floor: { mirror: true } });
    const index = scene.instances.findIndex(item => item.card);
    const values = sampleWorldUniforms(scene, clock(0)) as number[];
    const base = worldHeaderSize + index * worldInstanceSize;
    expect([values[base + 11], values[base + 16], values[base + 17], values[base + 18]]).toEqual([0.2, 0.02, 0.6, 0.62]);
    const ids = buildWorldGraph(scene).passes.map(pass => pass.id);
    expect(ids.indexOf("scene-cards")).toBeGreaterThan(ids.indexOf("scene-box"));
    expect(ids.indexOf("scene-labels")).toBeGreaterThan(ids.indexOf("scene-cards"));
    expect(ids).toContain("reflection-cards");
  });
  test("rows can be cards and their labels can show the item's initial", () => {
    const [slot] = rowInstances({ id: "pool", count: 2, height: 0.66, card: { avatar: 0.62 } });
    expect(slot.card).toEqual({ radius: 0.12, bevel: 0.02, edge: 0.6, avatar: 0.62 });
    expect(slot.scale.initial[1]).toBe(0.66);
    expect(formatRowLabel("{initial}", ["grace"], 0, 0)).toBe("G");
  });
});

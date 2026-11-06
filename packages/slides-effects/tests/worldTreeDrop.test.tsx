import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { Scene, Tree, expandScene, laneScene, readScenes } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { instanceField, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { trackIds } from "../packs/world/track";
const NODES = [{ id: "app" }, { id: "a", p: 0 }, { id: "b", p: 0 }, { id: "a1", p: 1 }, { id: "b1", p: 2 }];
const tree = <Tree id="t" nodes={NODES} levelHeight={1.6} drop={.5} />;
const scene = () => prepareWorldSlides([{ children: expandScene(tree) }])[0].scenePlan!.content.prepared;
const sample = (s: ReturnType<typeof scene>, step: number, time: number, origins?: Record<number, number>) => {
  const state = { ...createPlaybackState({ phase: "playing", slideKey: "0", stepKey: `0/${step}`, stepIndex: step }), slideTime: time, stepTime: time, ...origins ? { stepOrigins: origins } : {} };
  const values = sampleWorldUniforms(s, state) as number[], ids = trackIds(s);
  return (id: string, field: keyof typeof instanceField, offset = 0) => { const at = worldHeaderSize + ids.indexOf(id) * worldInstanceSize + instanceField[field] + offset; return values[at]; };
};

test("drop entrance: rows fall from below the row above, settle home, wipe once; no sparks", () => {
  expect(() => readScenes([<Scene id="s">{tree}</Scene>])).not.toThrow();
  const s = scene(), ids = trackIds(s);
  expect(ids.some(id => id.includes("/landing"))).toBe(false);
  expect(ids.filter(id => id.includes("/wipe")).length).toBeGreaterThan(0);
  const box = (id: string) => `box:t/${id}/plate`;
  // Before the drop: boxes are invisible and lifted, never into the row above.
  const early = sample(s, 0, .2);
  expect(early(box("a"), "opacity")).toBe(0);
  const yAt = (f: ReturnType<typeof sample>, id: string) => f(box(id), "position", 1);
  const rows: [string, string][] = [["a", "app"], ["b", "app"], ["a1", "a"], ["b1", "b"]];
  let minGap = Infinity;
  for (let t = 0; t <= 3; t += .02) {
    const f = sample(s, 0, t);
    for (const [low, high] of rows) if (f(box(low), "opacity") > 0) minGap = Math.min(minGap, (yAt(f, high) - .41) - (yAt(f, low) + .41));
  }
  expect(minGap).toBeGreaterThan(0);
  // Settled pose (held) equals home and the wipe is gone, also when held on a later step.
  for (const f of [sample(s, 0, 30), sample(s, 1, 0, { 0: -30, 1: 0 }), sample(s, 1, 5, { 0: -30, 1: 0 })]) {
    expect(f(box("a1"), "opacity")).toBeCloseTo(1);
    for (const id of ids.filter(id => id.includes("/wipe"))) expect(f(id, "opacity")).toBe(0);
  }
  // Interrupted: advancing to step 1 mid-drop keeps falling from where it was, then rests home.
  const home = yAt(sample(s, 0, 30), "a1"), mid = sample(s, 1, 0, { 0: -1, 1: 0 }), done = sample(s, 1, 3, { 0: -1, 1: 0 });
  expect(yAt(mid, "a1")).toBeGreaterThan(home + .05);
  expect(yAt(mid, "a1")).toBeLessThan(home + 1);
  expect(yAt(done, "a1")).toBeCloseTo(home);
  expect(minGap).toBeLessThan(Infinity);
});

for (const id of ["wide-tree", "deep-tree", "signals-tree", "keystroke-react"]) {
  test(`${id}: shared entrance falls, settles and wipes without landing particles`, () => {
    const s = prepareWorldSlides([{ children: expandScene(<Tree id={id} nodes={NODES}
      {...id === "keystroke-react" ? { drop: 1.5 } : {}}
      flash={[{ step: 1, color: "#ffaa00", repeat: "infinite", every: 2 }]} />) }])[0].scenePlan!.content.prepared;
    const ids = trackIds(s), plate = `box:${id}/a/plate`;
    expect(ids.some(id => id.includes("/landing"))).toBe(false);
    expect(ids.filter(id => id.includes("/wipe")).length).toBe(NODES.length * 2);
    expect(sample(s, 0, 1)(plate, "opacity")).toBe(0);
    expect(sample(s, 0, 4)(plate, "opacity")).toBeCloseTo(1);
    expect(sample(s, 0, 1.9)(plate, "position", 1)).toBeGreaterThan(sample(s, 0, 4)(plate, "position", 1));
    expect(s.instances.some(part => part.id?.includes("/edge") && part.route?.pulse)).toBe(true);
  });
}

for (const [id, step, delay] of [["renders-tree", 1, 0], ["renders-notes", 1, .3], ["renders-steps", 3, 0], ["react20-history", 2, 0]] as const) {
  test(`${id}: drop waits for the whole-part reveal step and move`, () => {
    const s = prepareWorldSlides([{ children: expandScene(<Tree id={id} nodes={NODES}
      enter={{ step, delay, duration: 1, from: [0, -14, 0] }} />) }])[0].scenePlan!.content.prepared;
    const ids = trackIds(s), plate = `box:${id}/app/plate`;
    expect(ids.some(id => id.includes("/landing"))).toBe(false);
    expect(sample(s, 0, 30)(plate, "opacity")).toBe(0);
    const origins = { 0: -30, [step]: 0 };
    expect(sample(s, step, 1 + delay, origins)(plate, "opacity")).toBe(0);
    const falling = sample(s, step, 2.8 + delay, origins), settled = sample(s, step, 5 + delay, origins);
    expect(falling(plate, "opacity")).toBeCloseTo(1);
    expect(falling(plate, "position", 1)).toBeGreaterThan(settled(plate, "position", 1));
    expect(settled(plate, "opacity")).toBeCloseTo(1);
    for (const wipe of ids.filter(id => id.includes("/wipe"))) expect(settled(wipe, "opacity")).toBe(0);
  });
}

// Pit assembly has its own transfer and landing choreography.
test("laneScene retains its separate tree assembly entrance", () => {
  const s = prepareWorldSlides([{ children: laneScene([{ layout: "track-left", parts: <Tree id="pit-tree" nodes={NODES} /> }], 0) }])[0].scenePlan!.content.prepared;
  const ids = trackIds(s);
  expect(ids.some(id => id.includes("/landing"))).toBe(true);
  expect(ids.some(id => id.includes("/wipe"))).toBe(false);
});

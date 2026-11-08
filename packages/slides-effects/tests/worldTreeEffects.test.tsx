import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { Keys, Tree, expandScene } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { instanceField, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds } from "../packs/world/track";

const nodes = [{ id: "root" }, { id: "left", p: 0 }, { id: "right", p: 0 }];
const prepare = (children: React.ReactNode) => prepareWorldSlides([{ children: expandScene(children) }])[0].scenePlan!.content.prepared;
const playback = (time: number, step = 0, slide = "0") => ({ ...createPlaybackState({ phase: "playing", slideKey: slide, stepKey: `${slide}/${step}`, stepIndex: step }),
  slideTime: time, stepTime: time, stepOrigins: { 0: -10, [step]: 0 } });
const field = (values: ArrayLike<number>, ids: string[], id: string, name: keyof typeof instanceField, axis = 0) => {
  const slot = ids.indexOf(id);
  expect(slot).toBeGreaterThanOrEqual(0);
  return values[worldHeaderSize + slot * worldInstanceSize + instanceField[name] + axis];
};

const sources = [
  { scene: prepare(<Tree id="tree" nodes={nodes} flash={[{ step: 3, ids: ["left", "right"], color: "#ffaa00", wave: false, from: "root", repeat: "infinite", every: 2 }]} />), step: 3, match: "/beam" },
  { scene: prepare(<Keys id="list" keys={["A", "B", "C", "D"]} viewport={3} scroll={1} window={2} links={3} />), step: 3, match: "/link/" },
  { scene: prepare(<Keys id="list" keys={["A", "B", "C", "D"]} viewport={3} scroll={1} window={2} links={3} />), step: 3, match: "/edge" },
];
for (const { scene, step, match } of sources) test(`${match === "/beam" ? "direct tree connectors" : match === "/edge" ? "viewport frames" : "viewport links"} stay in the bloom path while held and departing`, () => {
  const ids = trackIds(scene), connectors = ids.filter(id => id.includes(match));
  expect(connectors.length).toBeGreaterThan(0);
  const options = { position: [0, 0, 14] as [number, number, number], target: [0, 0, 0] as [number, number, number], duration: 1 };
  let frame = createTrackFrame();
  for (const time of [0, .1, .5, 3, 30]) {
    const state = playback(time, step);
    frame = sampleTrackFrame(frame, sampleWorldUniforms(scene, state, null, 1, 1, true) as number[], ids, state, options);
    for (const id of connectors) expect(field(frame.values, ids, id, "sharp")).toBe(0);
  }
  const lines = scene.instances.filter(part => part.id?.includes(match) && !part.route?.pulse);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const id = `tube:${line.id}`;
    expect(field(frame.values, ids, id, "opacity")).toBeGreaterThan(0);
    expect(field(frame.values, ids, id, "emissive")).toBeGreaterThan(1);
  }
  const incoming = prepare(<Tree id="next" nodes={nodes} />), retained = retainTrackScene(incoming, scene);
  const retainedIds = trackIds(retained);
  for (const time of [0, .2, .6, 1.1]) {
    const state = playback(time, 0, "1");
    frame = sampleTrackFrame(frame, sampleWorldUniforms(retained, state, null, 1, 1, true) as number[], retainedIds, state, options, trackIds(incoming));
    for (const line of lines) {
      const id = `tube:${line.id}`;
      expect(field(frame.values, retainedIds, id, "sharp")).toBe(0);
      if (time === 0) expect(field(frame.values, retainedIds, id, "opacity")).toBeGreaterThan(0);
      if (time > 1) expect(field(frame.values, retainedIds, id, "opacity")).toBe(0);
    }
  }
});

const wipe = () => {
  const scene = prepare(<Tree id="tree" nodes={[{ id: "root", width: 4 }]} drop={.5} />), ids = trackIds(scene);
  const bands = ids.filter(id => id.startsWith("card:tree/root/wipe0/"));
  const sample = (time: number) => sampleWorldUniforms(scene, playback(time)) as number[];
  const read = (time: number, id: string, name: keyof typeof instanceField, axis = 0) => field(sample(time), ids, id, name, axis);
  return { bands, read };
};

test("tree wipe has a translucent center without a strong rim or adjacent solid faces", () => {
  const scene = prepare(<Tree id="tree" nodes={[{ id: "root", width: 4 }]} drop={.5} />);
  const bands = scene.instances.filter(part => part.id?.includes("/wipe"));
  expect(bands).toHaveLength(1);
  expect(bands[0].card?.flat).toBe(true);
  expect(bands[0].card!.fill).toBeGreaterThan(0);
  expect(bands[0].card!.fill).toBeLessThan(1);
  expect(bands[0].card!.edge).toBeLessThan(bands[0].card!.fill);
  expect(bands[0].card?.glow).toBeGreaterThan(.1);
  expect(bands[0].card?.radius).toBeGreaterThan(0);
});

test("tree wipe crosses the full face at a steady speed and fades with the sweep endpoints", () => {
  const { bands, read } = wipe(), middle = bands[Math.floor(bands.length / 2)];
  const x = (time: number) => read(time, middle, "position");
  const opacity = (time: number) => read(time, middle, "opacity");
  expect(x(1.22)).toBeLessThan(-2);
  expect(x(1.94)).toBeGreaterThan(2);
  const moves = [1.4, 1.5, 1.6, 1.7].map(t => x(t + .05) - x(t));
  for (const delta of moves) expect(delta).toBeCloseTo(moves[0], 4);
  expect(opacity(1.22)).toBe(0);
  expect(opacity(1.3)).toBeGreaterThan(0);
  expect(opacity(1.87)).toBeGreaterThan(0);
  expect(opacity(1.94)).toBeCloseTo(0);
  expect(opacity(30)).toBe(0);
});

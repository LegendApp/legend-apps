import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { Keys, Tree, expandScene } from "../packs/world/Authoring";
import { DOF, prepareWorldSlides } from "../packs/world/World";
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


test("static tree nodes keep a contained sheen and semantic flashes without substitute entrances", () => {
  const scene = prepare(<Tree id="static" nodes={nodes} drop={false} flash={[
    { step: 1, color: "#ffaa00", repeat: "infinite", every: 2 },
    { step: 2, ids: ["left"], color: "#ffaa00", wave: false, from: "root", repeat: "infinite", every: 2 },
  ]} />), ids = trackIds(scene);
  expect(ids.some(id => id.includes("/landing"))).toBe(false);
  expect(scene.instances.some(part => part.route?.pulse)).toBe(true);
  const plate = "box:static/left/plate", band = "card:static/left/wipe0/band";
  const home = sampleWorldUniforms(scene, playback(30)) as number[];
  let visible = 0;
  for (let time = 0; time < 4; time += .04) {
    const values = sampleWorldUniforms(scene, playback(time)) as number[];
    expect(field(values, ids, plate, "opacity")).toBe(1);
    for (let axis = 0; axis < 3; axis++) expect(field(values, ids, plate, "position", axis)).toBeCloseTo(field(home, ids, plate, "position", axis));
    if (field(values, ids, band, "opacity") <= 0) continue;
    visible++;
    for (let axis = 0; axis < 2; axis++) {
      const distance = Math.abs(field(values, ids, band, "position", axis) - field(values, ids, plate, "position", axis));
      expect(distance + field(values, ids, band, "scale", axis) / 2 + .01).toBeLessThan(field(values, ids, plate, "scale", axis) / 2);
    }
  }
  expect(visible).toBeGreaterThan(5);
  const sheen = scene.instances.find(part => part.id === "static/left/wipe0/band")!;
  expect(sheen.card?.fill).toBeGreaterThan(0);
  expect(sheen.card?.glow).toBe(0);
  expect(sheen.card?.edge).toBe(0);
  const idle = sampleWorldUniforms(scene, playback(0, 1)) as number[];
  const lit = sampleWorldUniforms(scene, playback(.28, 1)) as number[];
  expect(field(lit, ids, "box:static/root/plate", "emissive")).toBeGreaterThan(field(idle, ids, "box:static/root/plate", "emissive"));
  const beam = scene.instances.find(part => part.id?.startsWith("static/left/beam") && !part.route?.pulse)!;
  expect(beam).toBeDefined();
  const signal = sampleWorldUniforms(scene, playback(.5, 2)) as number[];
  expect(field(signal, ids, `tube:${beam.id}`, "opacity")).toBeGreaterThan(0);
});

test("depth-routed trees sharpen continuously with the live camera through reverse and interruption", () => {
  const scene = prepare(<><Tree id="depth" at={[0, 0, -18]} drop={false} sharp={false} nodes={[{ id: "root" }]} /><DOF focusRange={2.4} aperture={1.8} maxBlur={4} /></>), ids = trackIds(scene);
  const options = { position: [0, 0, 14] as [number, number, number], target: [0, 0, 0] as [number, number, number], duration: 1,
    steps: { 1: { shift: [0, 0, -18] as [number, number, number], duration: 1, ease: "linear" as const } } };
  const at = (previous: ReturnType<typeof createTrackFrame>, step: number, time: number) => {
    const clock = { ...playback(time, step), slideTime: 30 };
    return sampleTrackFrame(previous, sampleWorldUniforms(scene, clock, null, 1, 1, true) as number[], ids, clock, options);
  };
  const coc = (frame: ReturnType<typeof createTrackFrame>) => {
    const v = frame.values, p = ids.indexOf("box:depth/root/plate") * worldInstanceSize + worldHeaderSize;
    const forward = [v[4] - v[0], v[5] - v[1], v[6] - v[2]], length = Math.hypot(...forward);
    const depth = forward.reduce((sum, x, axis) => sum + (v[p + axis] - v[axis]) * x / length, 0);
    return Math.max(0, Math.abs(depth - v[32]) - v[54]) / depth * v[33];
  };
  let frame = at(createTrackFrame(), 0, 3), last = coc(frame);
  expect(last).toBeGreaterThan(.5);
  const held = frame;
  frame = at(frame, 1, 0);
  expect(coc(frame)).toBeCloseTo(last);
  const values = [];
  for (let i = 1; i <= 20; i++) {
    frame = at(frame, 1, i / 20);
    const blur = coc(frame);
    expect(blur).toBeLessThanOrEqual(last + 1e-6);
    expect(field(frame.values, ids, "box:depth/root/plate", "sharp")).toBe(0);
    values.push(blur); last = blur;
  }
  expect(values.filter(blur => blur > .05 && blur < .7).length).toBeGreaterThan(5);
  expect(last).toBe(0);
  const back = at(frame, 0, 0);
  expect(coc(back)).toBeCloseTo(last);
  const midway = at(back, 0, .4), interrupted = at(midway, 1, 0);
  expect(coc(interrupted)).toBeCloseTo(coc(midway));
  expect(coc(at(interrupted, 1, 1))).toBe(0);
  expect(coc(at(back, 0, 1))).toBeCloseTo(coc(held));
});

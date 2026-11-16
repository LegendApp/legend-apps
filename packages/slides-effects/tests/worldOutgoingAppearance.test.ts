// @ts-ignore Bun supplies this API at runtime; this workspace has no Bun declarations.
import { expect, test } from "bun:test";
import { advancePlayback, createPlaybackState, transitionPlayback } from "../../presentation/src/playbackState";
import { cardInstances, instanceField, prepareWorldSample, prepareWorldScene, rowInstances, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, type TrackFrame } from "../packs/world/track";
import { prepareWorldPlans, sampleWorldPlan, worldPlanCopies, worldPlanIds } from "../packs/world/plan";
import { sampleWorldClock } from "../packs/world/timing";

const scenes = [0, 1].map(index => prepareWorldScene({ instances: [
  ...cardInstances({ id: `panel${index}`, title: "Panel", color: index ? "#0000ff" : "#ff0000", fill: 1, flat: true }),
  ...cardInstances({ id: `blurred${index}`, sharp: false, position: [-3, 0, 0] }),
  ...rowInstances({ id: `rows${index}`, count: 2, speed: .1, position: [3, 0, 0], items: ["A", "B", "C"], labels: [{ text: "{item}" }], card: { fill: 1 } }),
] }));
const plan = prepareWorldPlans(scenes).get(scenes[0])!;
const options = { duration: 1, spacing: 32, turn: 0, rise: 0 };
const select = (index: number) => ({ phase: "playing" as const, slideKey: `${index}:active`, stepKey: "0:active", stepIndex: 0 });
function part(frame: TrackFrame, id: string): number[] {
  const slot = frame.ids.indexOf(id);
  expect(slot).toBeGreaterThanOrEqual(0);
  const at = worldHeaderSize + slot * worldInstanceSize;
  return Array.from(frame.values.slice(at, at + worldInstanceSize));
}

test.each([false, true])("outgoing appearance keeps its route and live clock (pooled %s)", pooled => {
  let state = advancePlayback(advancePlayback(createPlaybackState(select(0)), 1000), 2000);
  let frame = createTrackFrame(), scene = scenes[0], declared = scenes[0];
  function sample() {
    const source = prepareWorldSample(pooled ? declared : scene);
    const clock = sampleWorldClock(state, 4, "slide", undefined, false);
    const raw = sampleWorldUniforms(source, clock, null, 1, 1, true);
    const values = pooled ? sampleWorldPlan(raw, worldPlanCopies(declared, plan), new Float32Array(plan.size), plan.lightOffset) : raw;
    frame = sampleTrackFrame(frame, values as number[], pooled ? worldPlanIds(scene, plan) : trackIds(scene), state, options, trackIds(declared), { scene: source, clock, ids: trackIds(pooled ? declared : scene) });
  }
  function navigate(index: number) {
    scene = retainTrackScene(scenes[index], scene, declared, pooled, frame.visible, true);
    declared = scenes[index];
    state = transitionPlayback(state, select(index));
    sample();
  }
  sample();
  const body = "card:panel0", label = "label:panel0:title";
  const row = trackIds(scenes[0]).find(id => id.startsWith("card:rows0"))!;
  const held = part(frame, body), heldLabel = part(frame, label), heldRow = part(frame, row);
  expect(held[instanceField.sharp]).toBe(1);
  navigate(1);
  expect(part(frame, body)).toEqual(held);
  expect(part(frame, label)).toEqual(heldLabel);
  expect(part(frame, row)).toEqual(heldRow);
  for (const timestamp of [2016, 2050, 2150]) {
    state = advancePlayback(state, timestamp);
    sample();
    for (const id of [body, label, row]) expect(part(frame, id)[instanceField.sharp]).toBe(1);
    expect(part(frame, "card:blurred0")[instanceField.sharp]).toBe(0);
    expect(part(frame, body).slice(24, 32)).toEqual(held.slice(24, 32));
  }
  expect(part(frame, row)[1]).not.toBe(heldRow[1]);
  expect(frame.departures![0].clock.slideTime).toBeCloseTo(1.15);
  const departing = part(frame, body);
  navigate(0);
  expect(part(frame, body)).toEqual(departing);
  state = advancePlayback(state, 2200);
  sample();
  navigate(1);
  expect(part(frame, body)[instanceField.sharp]).toBe(1);
  state = advancePlayback(state, 3200);
  sample();
  expect(part(frame, body)[23]).toBe(0);
  expect(part(frame, "card:panel1")[instanceField.sharp]).toBe(1);
  expect(frame.departures).toEqual([]);
  navigate(0);
  expect(part(frame, "card:panel1")[instanceField.sharp]).toBe(1);
  state = advancePlayback(state, 3250);
  sample();
  expect(part(frame, "card:panel1")[instanceField.sharp]).toBe(1);
});

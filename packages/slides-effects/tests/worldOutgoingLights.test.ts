// @ts-ignore Bun supplies this API at runtime.
import { expect, test } from "bun:test";
import { advancePlayback, createPlaybackState, transitionPlayback, type PlaybackState } from "../../presentation/src/playbackState";
import { prepareWorldSample, prepareWorldScene, sampleWorldUniforms, worldHeaderSize, worldLightCountSlot, worldLightOffsetSlot, worldLightSize, worldInstanceSize, primitive, type LightOptions, type PreparedWorldScene } from "../packs/world/scene";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, buildCourse, trackX, type TrackFrame } from "../packs/world/track";
import { prepareWorldPlans, sampleWorldPlan, worldPlanCopies, worldPlanFits, worldPlanIds } from "../packs/world/plan";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { sampleWorldClock } from "../packs/world/timing";
import { defineWorldEffect } from "../packs/world/effects";
import { d } from "typegpu";

const select = (index: number, phase: PlaybackState["phase"] = "playing") => ({ phase, slideKey: `${index}:active`, stepKey: "0:active", stepIndex: 0 });
const sweep = (x: number): LightOptions => ({ kind: "spot", position: [{ at: 0, value: [x, 1, 3], duration: 0 }, { at: 0, value: [x + 10, 3, 5], duration: 10 }],
  target: [{ at: 0, value: [x, 0, -2], duration: 0 }, { at: 0, value: [x + 5, 2, -4], duration: 10 }],
  intensity: [{ at: 0, value: 320, duration: 0 }, { at: 0, value: 640, duration: 10 }],
  color: [{ at: 0, value: "#ff0000", duration: 0 }, { at: 0, value: "#0000ff", duration: 10 }],
  range: [{ at: 0, value: 9, duration: 0 }, { at: 0, value: 18, duration: 10 }],
  angle: [{ at: 0, value: .4, duration: 0 }, { at: 0, value: .8, duration: 10 }] });
const shared: LightOptions = { position: [10, 5, -6], intensity: 25, range: 40 };
const scenes = [0, 1, 2, 3].map(index => prepareWorldScene({ instances: [], keyLight: {}, environment: {},
  lights: [shared, ...Array.from({ length: index === 0 ? 3 : 2 }, (_, i) => sweep(index * 20 + i))] }));
const options = { spacing: 32, duration: 1, turn: 12, rise: 0, course: Array.from({ length: 16 }, () => ({ spacing: 32, duration: 1, turn: 12, rise: 0 })) };
const plan = prepareWorldPlans(scenes).get(scenes[0])!;
function sample(frame: TrackFrame, state: PlaybackState, scene: PreparedWorldScene, declaration = scene, pooled = false, mode: "slide" | "step" = "slide") {
  const prepared = prepareWorldSample(pooled ? declaration : scene), clock = sampleWorldClock(state, 4, mode, undefined, false);
  const raw = sampleWorldUniforms(prepared, clock, null, 1, 1, true);
  const values = pooled ? sampleWorldPlan(raw, worldPlanCopies(declaration, plan), new Float32Array(plan.size), plan.lightOffset) : raw;
  return sampleTrackFrame(frame, values as number[], pooled ? worldPlanIds(scene, plan) : trackIds(scene), state, options, trackIds(declaration), { scene: prepared, clock, ids: trackIds(declaration) });
}
function values(frame: TrackFrame, id: string) {
  const slot = frame.lights!.findIndex(light => light.id === id), base = frame.values[worldLightOffsetSlot] + slot * worldLightSize;
  expect(slot).toBeGreaterThanOrEqual(0);
  return Array.from(frame.values.slice(base, base + worldLightSize));
}
function start() {
  let state = createPlaybackState(select(0));
  state = advancePlayback(advancePlayback(state, 1000), 3000);
  return { state, frame: sample(createTrackFrame(), state, scenes[0], scenes[0], true) };
}

test("light-only departures keep every animated field and station target until exact focus", () => {
  let { state, frame } = start();
  const id = scenes[0].lightIds[1], held = values(frame, id);
  state = transitionPlayback(state, select(1));
  const retained = retainTrackScene(scenes[1], scenes[0]);
  expect(retained.lightIds).toHaveLength(6);
  expect(worldPlanFits(retained, plan)).toBe(true);
  frame = sample(frame, state, retained, scenes[1], true);
  expect(frame.values[worldLightCountSlot]).toBe(6);
  expect(values(frame, id)).toEqual(held);
  const gap = sample({ ...frame, output: undefined, retired: { ...frame.retired } }, { ...state, phase: "playing" }, retained, scenes[1], true);
  expect(values(gap, id)).toEqual(held);
  state = advancePlayback(state, 3500);
  frame = sample(frame, state, retained, scenes[1], true);
  const moving = values(frame, id);
  for (const field of [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]) expect(moving[field]).not.toBe(held[field]);
  const source = sampleWorldUniforms(prepareWorldSample(scenes[0]), frame.lights!.find(light => light.id === id)!.clock);
  const base = source[worldLightOffsetSlot] + worldLightSize;
  const course = buildCourse(options, 16);
  expect(moving[0]).toBeCloseTo(source[base] + trackX(course, source[base + 2]), 5);
  expect(moving[8]).toBeCloseTo(source[base + 8] + trackX(course, source[base + 10]), 5);
  const incoming = values(frame, scenes[1].lightIds[1]);
  const rawIncoming = sampleWorldUniforms(scenes[1], sampleWorldClock(state, 4, "slide", undefined, false));
  expect(incoming[2]).toBeCloseTo(rawIncoming[rawIncoming[worldLightOffsetSlot] + worldLightSize + 2] - 32, 5);
  expect(incoming[10]).toBeCloseTo(rawIncoming[rawIncoming[worldLightOffsetSlot] + worldLightSize + 10] - 32, 5);
  expect(frame.lights!.filter(light => light.id === scenes[0].lightIds[0])).toHaveLength(1);
  const nonLight = Array.from(frame.values.slice(112, 126));
  expect(nonLight.every(Number.isFinite)).toBe(true);
  expect(nonLight[3]).toBeCloseTo(2.2);
  state = advancePlayback(state, 3999);
  frame = sample(frame, state, retained, scenes[1], true);
  expect(frame.lights!.some(light => light.id === id)).toBe(true);
  state = advancePlayback(state, 4000);
  frame = sample(frame, state, retained, scenes[1], true);
  expect(frame.cursor).toBe(1);
  expect(frame.values[worldLightCountSlot]).toBe(3);
  expect(frame.lights!.map(light => light.id)).toEqual(scenes[1].lightIds);
  expect(frame.departures).toEqual([]);
});

test("interrupted unions exceed five lights, reverse continuously, freeze paused and prune at focus", () => {
  let { state, frame } = start(), retained = scenes[0], declaration = scenes[0];
  for (const index of [1, 2, 3, 0]) {
    const old = frame.lights!.map(light => [light.id, light.clock.slideTime] as const);
    retained = retainTrackScene(scenes[index], retained, declaration, true, frame.visible);
    declaration = scenes[index];
    expect(worldPlanFits(retained, plan)).toBe(true);
    state = transitionPlayback(state, select(index));
    frame = sample(frame, state, retained, declaration, true);
    for (const [id, time] of old) expect(frame.lights!.find(light => light.id === id)!.clock.slideTime).toBe(time);
    expect(new Set(frame.lights!.map(light => light.id)).size).toBe(frame.lights!.length);
    state = advancePlayback(state, state.lastTimestamp! + 100);
    frame = sample(frame, state, retained, declaration, true);
  }
  expect(frame.lights!.length).toBe(10);
  const before = Array.from(frame.values);
  state = transitionPlayback(state, { ...state, phase: "paused" });
  state = advancePlayback(state, 20000);
  expect(sample(frame, state, retained, declaration, true)).toBe(frame);
  expect(Array.from(frame.values)).toEqual(before);
  state = transitionPlayback(state, { ...state, phase: "playing" });
  state = advancePlayback(advancePlayback(state, 21000), 21100);
  frame = sample(frame, state, retained, declaration, true);
  expect(Array.from(frame.values)).not.toEqual(before);
  const preview = sample(frame, { ...state, phase: "preview" }, retained, declaration, true);
  expect(preview.lights!.map(light => light.id)).toEqual(declaration.lightIds);
  state = advancePlayback(state, 24000);
  frame = sample(frame, state, retained, declaration, true);
  expect(frame.lights!.map(light => light.id)).toEqual(declaration.lightIds);
  const clean = retainTrackScene(scenes[1], retained, declaration, false, frame.visible);
  expect(clean.lightIds).toHaveLength(6);
});

test("pooled light offsets preserve headers and fit shader storage for empty and different scenes", () => {
  const empty = prepareWorldScene({ instances: [], keyLight: {}, lights: [] });
  const pool = prepareWorldPlans([...scenes, empty]).get(empty)!;
  expect(buildWorldGraph(pool.topology).uniformsSize).toBe(pool.size);
  for (const scene of [...scenes, empty]) {
    const raw = sampleWorldUniforms(scene, { slideTime: 1, stepTime: 1, stepIndex: 0, stepOrigins: {} });
    const packed = sampleWorldPlan(raw, worldPlanCopies(scene, pool), new Float32Array(pool.size), pool.lightOffset);
    expect(packed[worldLightOffsetSlot]).toBe(pool.lightOffset);
    for (let slot = 0; slot < worldHeaderSize; slot++) if (slot !== worldLightOffsetSlot) expect(packed[slot]).toBe(Float32Array.from(raw)[slot]);
    expect(Array.from(packed.slice(pool.lightOffset, pool.lightOffset + scene.lightIds.length * worldLightSize)))
      .toEqual(Array.from(Float32Array.from(raw.slice(scene.lightOffset, scene.uniformCount))));
    const graph = buildWorldGraph(worldGraphTopology(scene));
    expect(graph.uniformsSize).toBe(scene.uniformCount);
  }
  const lit = buildWorldGraph({ ...pool.topology, counts: { ...pool.topology.counts, box: 1 }, shafts: true });
  for (const id of ["scene-box", "shafts"]) {
    const code = lit.passes.find(pass => pass.id === id)?.code;
    expect(code).toBeDefined();
    expect(code!).toContain(`u32(uniforms[${worldLightOffsetSlot}])`);
    expect(code!).toContain("vector(base+8u)-vector(base)");
    expect(code!).toContain(`u32(uniforms[${worldLightCountSlot}])`);
  }
});

test("stale UI visibility cannot underallocate an interrupted light union", () => {
  const first = retainTrackScene(scenes[1], scenes[0]);
  const second = retainTrackScene(scenes[2], first, scenes[1], false, scenes[0].lightIds, false);
  const third = retainTrackScene(scenes[3], second, scenes[2], false, scenes[0].lightIds, false);
  expect(third.lightIds).toHaveLength(10);
  expect(buildWorldGraph(worldGraphTopology(third)).uniformsSize).toBe(third.uniformCount);
  const pruned = retainTrackScene(scenes[0], third, scenes[3], false, scenes[3].lightIds, true);
  expect(pruned.lightIds).toHaveLength(6);
  const duplicates = prepareWorldScene({ instances: [], lights: [shared, shared] });
  expect(new Set(duplicates.lightIds).size).toBe(2);
  expect(prepareWorldPlans([duplicates]).get(duplicates)!.topology.lightCount).toBe(2);
});

test("the retained World samples pooled outgoing lights through navigation and focus", async () => {
  const React = await import("react"), { act, create } = await import("react-test-renderer");
  const { observable } = await import("@legendapp/state");
  const { BackgroundHost, GPUShaderProvider, PresentationObservableProvider } = await import("@legend-apps/presentation");
  const { frames, flushUI } = await import("../../../apps/slides/src/__tests__/uiClockMock");
  const { WorldSlide, PointLight, SpotLight, prepareWorldSlides } = await import("../packs/world/World");
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const runtime = (index: number) => observable({ currentSlide: 0, currentStep: 0, slideIndex: index, stepIndex: 0, slideCount: 2, stepCount: 1,
    startedAt: 0, stepStartedAt: 0, isActive: index === 0, isPreview: false, isPreparing: index !== 0,
    playbackPhase: index === 0 ? "playing" : "preparing", playbackScope: "slide", direction: "forward", goTo() {}, next() {}, previous() {} });
  const runtimes = [runtime(0), runtime(1)];
  const props = [0, 1].map(index => ({ quality: "high" as const, track: { duration: 1, turn: 0, rise: 0 },
    children: [React.createElement(PointLight, { key: "shared", ...shared }), ...(index === 0
      ? [0, 1, 2].map(x => React.createElement(SpotLight, { key: x, ...sweep(x) }))
      : [React.createElement(PointLight, { key: "red", position: [-10, 4, -8], color: "#ff0000" })])] }));
  const prepared = prepareWorldSlides(props);
  const Renderer = (props: object) => React.createElement("world-gpu", props);
  const content = (index: number) => React.createElement(GPUShaderProvider, { renderer: Renderer },
    React.createElement(BackgroundHost, { slideIndex: index, color: "#05060a" }, ...prepared.map((props, i) =>
      React.createElement(PresentationObservableProvider, { key: i, value: runtimes[i] }, React.createElement(WorldSlide, { ...props, world: "lights" })))));
  let renderer: ReturnType<typeof create> | undefined;
  const tick = async (time: number) => { await act(() => { for (const frame of frames) frame.tick(time); }); };
  const snapshot = () => Array.from(renderer!.root.findByType("world-gpu").props.frameData.value) as number[];
  try {
    await act(() => { renderer = create(content(0)); });
    flushUI(); await tick(1000); await tick(3000);
    expect(snapshot()[worldLightCountSlot]).toBe(4);
    await act(() => {
      runtimes[0].assign({ currentSlide: 1, isActive: true, playbackPhase: "playing" });
      runtimes[1].assign({ currentSlide: 1, isActive: true, isPreparing: false, playbackPhase: "playing", startedAt: 3000, stepStartedAt: 3000 });
      renderer!.update(content(1));
    });
    flushUI(); await tick(3000);
    const request = snapshot();
    expect(request[worldLightCountSlot]).toBe(5);
    await tick(3500);
    const moving = snapshot();
    expect(moving[worldLightCountSlot]).toBe(5);
    for (let i = 2; i < 5; i++) expect(moving[moving[worldLightOffsetSlot] + i * worldLightSize]).not.toBe(request[request[worldLightOffsetSlot] + i * worldLightSize]);
    await tick(4500);
    expect(snapshot()[worldLightCountSlot]).toBe(2);
  } finally {
    await act(() => renderer?.unmount());
    flushUI();
  }
});


test("incoming light clocks keep step projection and explicit step resets", () => {
  let state = createPlaybackState(select(0));
  state = advancePlayback(advancePlayback(state, 1000), 3000);
  let frame = sample(createTrackFrame(), state, scenes[0], scenes[0], true, "step");
  state = transitionPlayback(state, { ...select(0), stepIndex: 1, stepKey: "1:new" });
  state = advancePlayback(advancePlayback(state, 3100), 3350);
  frame = sample(frame, state, scenes[0], scenes[0], true, "step");
  const clock = sampleWorldClock(state, 4, "step", undefined, false);
  const raw = sampleWorldUniforms(scenes[0], clock);
  for (let i = 0; i < scenes[0].lightIds.length; i++) {
    expect(frame.lights![i].clock.slideTime).toBe(clock.slideTime);
    const expected = Array.from(raw.slice(raw[worldLightOffsetSlot] + i * worldLightSize, raw[worldLightOffsetSlot] + (i + 1) * worldLightSize));
    const course = buildCourse(options, 16);
    expected[0] += trackX(course, expected[2]); expected[8] += trackX(course, expected[10]);
    values(frame, scenes[0].lightIds[i]).forEach((value, field) => expect(value).toBeCloseTo(expected[field], 4));
  }
});


test("effect parameters, mesh slots and key headers survive light storage relocation", () => {
  const effect = defineWorldEffect({ name: "light-pool-test", params: { gain: d.f32 }, defaults: { gain: 1 },
    build: ({ input, id }) => ({ passes: [{ id: id(), wgsl: "@fragment fn main()->@location(0) vec4f{return vec4f(1.);}", fragment: "main", reads: { source: input }, output: id("out") }] }) });
  const declarations = [1, 3].map(count => prepareWorldScene({
    instances: Array.from({ length: count }, (_, i) => primitive("box", { id: `part-${i}` })),
    lights: scenes[count === 1 ? 0 : 1].lights, effects: [{ use: effect({ gain: { 0: 2, 1: 5 } }) }], keyLight: {},
  }));
  const pools = prepareWorldPlans(declarations), pool = pools.get(declarations[0])!;
  expect(pools.get(declarations[1])).toBe(pool);
  expect(buildWorldGraph(pool.topology).uniformsSize).toBe(pool.size);
  for (const scene of declarations) {
    const clock = { slideTime: 2, stepTime: 2, stepIndex: 1, stepOrigins: { 0: 0, 1: 0 } };
    const raw = sampleWorldUniforms(scene, clock);
    const packed = sampleWorldPlan(raw, worldPlanCopies(scene, pool), new Float32Array(pool.size), pool.lightOffset);
    expect(pool.lightOffset).toBeGreaterThan(pool.topology.effects![0].base);
    expect(packed[pool.topology.effects![0].base]).toBe(raw[scene.effectUses[0].base]);
    expect(Array.from(packed.slice(112, 126))).toEqual(Array.from(Float32Array.from(raw.slice(112, 126))));
    expect(packed[worldLightOffsetSlot]).toBe(pool.lightOffset);
    expect(Array.from(packed.slice(pool.lightOffset, pool.lightOffset + scene.lightIds.length * worldLightSize)))
      .toEqual(Array.from(Float32Array.from(raw.slice(scene.lightOffset))));
  }
});


for (const pooled of [false, true]) for (const turn of [0, 12]) test(`matched light poses carry with meshes through reverse and interruption (pool=${pooled}, turn=${turn})`, () => {
  const declarations = [0, 1].map(index => prepareWorldScene({
    instances: [primitive("sphere", { id: "shared-body", position: [0, 0, -6] })],
    lights: [shared, sweep(4), { position: [index * 20, 4, -3], intensity: 50 }],
  }));
  const pool = prepareWorldPlans(declarations).get(declarations[0])!;
  const track = { spacing: 32, duration: 1, turn, rise: 0 };
  let state = advancePlayback(advancePlayback(createPlaybackState(select(0)), 1000), 3000);
  let frame = createTrackFrame();
  const run = (scene: PreparedWorldScene, declaration = scene) => {
    const prepared = prepareWorldSample(pooled ? declaration : scene), clock = sampleWorldClock(state, 4, "slide", undefined, false);
    const raw = sampleWorldUniforms(prepared, clock, null, 1, 1, true);
    const uniforms = pooled ? sampleWorldPlan(raw, worldPlanCopies(declaration, pool), new Float32Array(pool.size), pool.lightOffset) : raw;
    frame = sampleTrackFrame(frame, uniforms as number[], pooled ? worldPlanIds(scene, pool) : trackIds(scene), state, track, trackIds(declaration), { scene: prepared, clock, ids: trackIds(declaration) });
  };
  const poses = () => declarations[0].lightIds.slice(0, 2).map(id => {
    const light = values(frame, id);
    return [...light.slice(0, 3), ...light.slice(8, 11)];
  });
  const continuous = (before: number[][]) => poses().forEach((pose, light) => pose.forEach((value, axis) => expect(value).toBeCloseTo(before[light][axis], 4)));
  const pointFollowsBody = () => {
    const slot = frame.ids.indexOf("sphere:shared-body"), at = worldHeaderSize + slot * worldInstanceSize;
    const point = values(frame, declarations[0].lightIds[0]);
    expect(point[0] - frame.values[at] - trackX(buildCourse(track, 16), frame.values[at + 2])).toBeCloseTo(10, 4);
    expect(point[2] - frame.values[at + 2]).toBeCloseTo(0, 4);
  };
  run(declarations[0]);
  const held = poses();
  const incoming = retainTrackScene(declarations[1], declarations[0]);
  state = transitionPlayback(state, select(1)); run(incoming, declarations[1]); continuous(held);
  for (const stamp of [3150, 3300]) { state = advancePlayback(state, stamp); run(incoming, declarations[1]); pointFollowsBody(); }
  const interrupted = poses(), ownership = frame.lights[0].offset;
  expect(ownership).toBeGreaterThan(0); expect(ownership).toBeLessThan(32);
  const returning = retainTrackScene(declarations[0], incoming, declarations[1]);
  state = transitionPlayback(state, select(0)); run(returning, declarations[0]); continuous(interrupted);
  state = advancePlayback(state, 3500); run(returning, declarations[0]); pointFollowsBody();
  state = advancePlayback(state, 5000); run(returning, declarations[0]);
  expect(frame.cursor).toBe(0); expect(frame.lights[0].offset).toBe(0);
  state = transitionPlayback(state, select(1)); run(incoming, declarations[1]);
  state = advancePlayback(state, 7000); run(incoming, declarations[1]);
  expect(frame.cursor).toBe(1); expect(frame.lights[0].offset).toBe(32); pointFollowsBody();
  const settled = poses();
  state = transitionPlayback(state, select(0)); run(returning, declarations[0]); continuous(settled);
});

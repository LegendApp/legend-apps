import { expect, test } from "bun:test";
import { advancePlayback, createPlaybackState, transitionPlayback } from "../../presentation/src/playbackState";
import { sampleJourneyClock } from "../packs/journey/timing";
import { buildJourneyGraph } from "../packs/journey/render";
import { evaluateCamera } from "../packs/journey/camera";
import { customInstances, prepareJourneyScene, primitive, sampleTrack, sampleJourneyUniforms, journeyClockOffset } from "../packs/journey/scene";

const start = { phase: "playing" as const, slideKey: "0:1", stepKey: "0:1", stepIndex: 0 };
const elapsed = (seconds: number) => advancePlayback(advancePlayback(createPlaybackState(start), 0), seconds * 1000);
const stepOne = () => advancePlayback(transitionPlayback(elapsed(20), { ...start, stepIndex: 1, stepKey: "1:2" }), 21000);

test("step-local at keyframes start at zero after a long preceding build", () => {
  const state = stepOne();
  const track = primitive("box", { position: [{ at: 0, value: [0, 0, 0] }, { at: 0.5, value: [4, 0, 0], duration: 1 }] }).position;
  expect(sampleJourneyClock(state, 4, "step", 2, false).slideTime).toBe(0);
  expect(sampleTrack(track, sampleJourneyClock(state, 4, "step", 2, false))).toEqual([0, 0, 0]);
  const mid = advancePlayback(state, 22000);
  expect(sampleTrack(track, sampleJourneyClock(mid, 4, "step", 2, false))[0]).toBeCloseTo(2);
  expect(sampleJourneyClock(mid, 4, "slide", undefined, false).slideTime).toBe(22);
  expect(sampleJourneyClock(mid, 4, "global", undefined, false).slideTime).toBe(22);
});

test("early advance eases the current build to its endpoint without starting the next", () => {
  const state = elapsed(0.4), request = { request: 1, key: "0:1/0:1", start: 0.4, from: 0.4, to: 3 };
  const sample = (seconds: number) => sampleJourneyClock(elapsed(seconds), 4, "step", 3, false, request);
  expect(sample(0.4).slideTime).toBeCloseTo(0.4);
  expect(sample(0.55).slideTime).toBeCloseTo(1.7);
  expect(sample(0.7).slideTime).toBeCloseTo(3);
  expect(sample(0.9).slideTime).toBe(3);
  expect(sample(0.55).stepIndex).toBe(0);
  expect(state.slideTime).toBe(0.4);
  expect(sampleJourneyClock(elapsed(0.5), 4, "step", 3, false, request, 0.2).slideTime).toBeCloseTo(1.7);
  expect(sampleJourneyClock(stepOne(), 4, "step", 3, false, request).slideTime).toBe(0);
});

test("back steps settle at authored duration; replay starts at zero", () => {
  const back = transitionPlayback(stepOne(), { ...start, stepKey: "0:3" });
  const settled = sampleJourneyClock(back, 4, "step", 3, true);
  expect(settled.slideTime).toBe(3);
  expect(settled.stepTime).toBe(3);
  expect(sampleJourneyClock(back, 4, "step", 3, false).slideTime).toBe(0);
  const mesh = primitive("box", { position: [{ at: 0, value: [0, 0, 0] }, { at: 0.5, value: [4, 0, 0], duration: 2 }] });
  expect(sampleTrack(mesh.position, settled)).toEqual([4, 0, 0]);
});

test("local steps settle earlier step tracks and do not replay slide camera entry", () => {
  const clock = sampleJourneyClock(stepOne(), 4, "step", 3, false);
  const track = primitive("box", { position: { 0: [0, 0, 0], 1: [4, 0, 0], 2: [8, 0, 0] } }).position;
  expect(sampleTrack(track, clock)).toEqual([0, 0, 0]);
  const next = advancePlayback(transitionPlayback(stepOne(), { ...start, stepIndex: 2, stepKey: "2:3" }), 21000);
  expect(sampleTrack(track, sampleJourneyClock(next, 4, "step", 3, false))).toEqual([4, 0, 0]);
  const previous = { position: [20, 3, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 42, roll: 0 };
  expect(evaluateCamera({ shots: [{ at: 0, position: [0, 5, 18] }] }, clock, {}, previous).position).toEqual([0, 5, 18]);
});

test("preparation, thumbnails, paused and outgoing clocks keep their lifecycle", () => {
  const live = elapsed(1);
  expect(sampleJourneyClock({ ...live, phase: "preparing" }, 4, "step", 3, true).slideTime).toBe(0);
  expect(sampleJourneyClock({ ...live, phase: "preview" }, 4, "step", 3, true).slideTime).toBe(4);
  for (const phase of ["paused", "outgoing"] as const) {
    const frozen = transitionPlayback(live, { ...start, phase });
    expect(sampleJourneyClock(advancePlayback(frozen, 100000), 4, "step", 3, false).slideTime).toBe(1);
  }
});


test("custom geometry, post effects and grain use the same projected Journey time", () => {
  const clock = sampleJourneyClock(advancePlayback(stepOne(), 22000), 4, "step", 3, false);
  const scene = prepareJourneyScene({ instances: customInstances({ vertexCount: 3, wgsl: "fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex { return ShapeVertex(vec3f(ctx.time),vec3f(0.,1.,0.)); }" }),
    passes: [{ wgsl: "fn customPass(uv:vec2f,color:vec4f,ctx:PassContext)->vec4f { return color*ctx.time; }" }] });
  const values = sampleJourneyUniforms(scene, clock);
  expect(values.slice(journeyClockOffset, journeyClockOffset + 3)).toEqual([1, 1, 1]);
  const code = buildJourneyGraph(scene).passes.map(pass => pass.code).join("\n");
  expect(code).toContain("ShapeContext(uniforms[24],uniforms[24],uniforms[25],uniforms[26])");
  expect(code).toContain("PassContext(uniforms[24],uniforms[24],uniforms[25],uniforms[26],depthAt(uv))");
  expect(code).toContain("floor(uniforms[24]*24.)");
});

test("preparation resets local time while retaining the continuous UI timestamp for entry", () => {
  const before = elapsed(20);
  const preparing = transitionPlayback(before, { phase: "preparing", slideKey: "1:2", stepKey: "0:2", stepIndex: 0 });
  expect(preparing.lastTimestamp).toBeNull();
  expect(preparing.slideTime).toBe(0);
  const entry = transitionPlayback(preparing, { ...preparing, phase: "playing" });
  expect(entry.lastTimestamp).toBeNull();
  expect(sampleJourneyClock(entry, 4, "slide", undefined, false).time).toBe(20);
  const next = advancePlayback(entry, 21000);
  expect(next.slideTime).toBe(0);
  expect(sampleJourneyClock(next, 4, "slide", undefined, false).time).toBe(21);
});

// @ts-nocheck Exercise the pack's UI-clock boundary without a native GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { reactUI } from "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, mock, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createPlaybackState, advancePlayback, transitionPlayback } from "../../presentation/src/playbackState";
import { samplePlayback } from "../../presentation/src/playback";
import { PresentationObservableProvider, usePresentation$ } from "../../presentation/src/runtime";
import { useRuntimeProjection } from "../../presentation/src/useRuntimeProjection";
import { worldHeaderSize } from "../packs/world/scene";

const playback = { value: createPlaybackState({ phase: "playing", slideKey: "a", stepKey: "0", stepIndex: 0 }) };
const animated = { ...await import("react-native-reanimated") };
mock.module("react-native-reanimated", () => ({ ...animated, useDerivedValue(read) {
  const latest = React.useRef(read);
  latest.current = read;
  return React.useRef({ _isReanimatedSharedValue: true, get value() { return latest.current(); } }).current;
} }));
mock.module("@legend-apps/presentation", () => ({
  PresentationObservableProvider, PresentationCanvasScaleContext: React.createContext(1), usePresentation$, useRuntimeProjection,
  GPURenderGraph: props => React.createElement("render-graph", props),
  usePlayback: () => playback, samplePlayback, useBackgroundSize: () => ({ width: 1280, height: 720 }),
  usePresentationValue: () => playback.value.phase,
}));
const { World, Camera, Orbs, Sphere } = await import("../packs/world/World");

test("world uniforms sample preparation/preview and retain live continuity without React frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree, commits = 0;
  const scene = <><Camera shots={[{ at: 0, orbit: { center: [0, 0, 0], radius: 10, height: 3, speed: 0.2 } }]} /><Orbs count={1} /></>;
  const next = <Camera shots={[{ at: 0, position: [0, 5, 30], target: [0, 0, 0] }]} />;
  const draw = content => <Profiler id="world" onRender={() => commits++}>{content}</Profiler>;
  const mount = async (content, settle = true) => { await act(() => { tree = create(draw(content)); }); if (settle) reactUI(); };
  const unmount = async () => { await act(() => tree.unmount()); };
  const values = () => tree.root.findByType("render-graph").props.uniforms.value;
  try {
    await mount(<World id="continuity" background>{scene}</World>);
    expect(tree.root.findByType("render-graph").props.width).toBe(1280);
    const initialCommits = commits;
    playback.value = advancePlayback(advancePlayback(playback.value, 0), 2000);
    reactUI();
    const lastLive = values().slice(0, 3);
    expect(lastLive[0]).toBeCloseTo(Math.sin(0.4) * 10);
    expect(commits).toBe(initialCommits);
    await unmount();

    // A thumbnail of the next world must not replace the last live camera.
    playback.value = createPlaybackState({ phase: "preview", slideKey: "b-preview", stepKey: "0", stepIndex: 0 });
    await mount(<World id="continuity" enter={{ from: "previous", duration: 2 }}>{next}</World>);
    expect(values().slice(0, 3)).toEqual([0, 5, 30]);
    await unmount();

    playback.value = createPlaybackState({ phase: "preparing", slideKey: "b-prepare", stepKey: "0", stepIndex: 0 });
    await mount(<World id="continuity" enter={{ from: "previous", duration: 2 }}>{next}</World>);
    expect(values().slice(0, 3)).toEqual([0, 5, 30]);
    await unmount();

    // Explicitly inactive worlds also leave the retained live pose alone.
    playback.value = createPlaybackState({ phase: "playing", slideKey: "b-inactive", stepKey: "0", stepIndex: 0 });
    await mount(<World id="continuity" active={false}>{next}</World>);
    await unmount();

    playback.value = createPlaybackState({ phase: "playing", slideKey: "b", stepKey: "0", stepIndex: 0 });
    await mount(<World id="continuity" enter={{ from: "previous", duration: 2 }}>{next}</World>, false);
    expect(values().slice(0, 3)).toEqual(lastLive);
    reactUI();
    expect(values().slice(0, 3)).toEqual(lastLive);
    playback.value = advancePlayback(advancePlayback(playback.value, 3000), 5000);
    reactUI();
    expect(values().slice(0, 3)).toEqual([0, 5, 30]);
  } finally { await act(() => tree?.unmount()); }
});

test("equal-content parent renders and resize retain pipeline definitions while uniforms change", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  playback.value = createPlaybackState({ phase: "playing", slideKey: "identity", stepKey: "0", stepIndex: 0 });
  let tree;
  const content = (width = 800, x = 1, quality = "high") => <World width={width} height={500} quality={quality} exposure={{ 0: 1 }}>
    {"\n  "}<Camera shots={[{ at: 0, position: [0, 5, 18] }]} />
    <Sphere position={[x, 0, 0]} color="#22d3ee" />{"\n"}
  </World>;
  try {
    await act(() => { tree = create(content()); });
    const graph = () => tree.root.findByType("render-graph").props;
    const passes = graph().passes, targets = graph().targets;
    expect(tree.root.findAllByType("view")).toHaveLength(1);
    await act(() => tree.update(content()));
    expect(graph().passes).toBe(passes);
    expect(graph().targets).toBe(targets);
    await act(() => tree.update(content(1000, 4)));
    expect(graph().passes).toBe(passes);
    expect(graph().uniforms.value[worldHeaderSize]).toBe(4);
    expect(graph().width).toBe(1000);
    await act(() => tree.update(content(1000, 4, "low")));
    expect(graph().passes).not.toBe(passes);
  } finally { await act(() => tree?.unmount()); }
});

test("topology transitions retire a uniform generation with its original capacity", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  playback.value = createPlaybackState({ phase: "playing", slideKey: "generation-a", stepKey: "0", stepIndex: 0 });
  let renderer, overlayMounts = 0, overlayUnmounts = 0;
  function Overlay() {
    const [identity] = React.useState(() => ++overlayMounts);
    React.useEffect(() => () => { overlayUnmounts++; }, []);
    return <world-overlay identity={identity} />;
  }
  const content = (count, width = 800, exposure = 1) => <World id="uniform-generations" quality="auto" width={width} exposure={exposure}>
    <Camera shots={[{ at: 0, position: [0, 5, 18] }]} /><Orbs count={count} /><Overlay />
  </World>;
  const graph = () => renderer.root.findByType("render-graph").props;
  try {
    await act(() => { renderer = create(content(24)); });
    const first = graph();
    expect(first.uniforms.value).toHaveLength(first.uniformsSize);
    await act(() => renderer.update(content(24, 1000, 2)));
    expect(graph().uniforms).toBe(first.uniforms);
    expect(graph().passes).toBe(first.passes);
    expect(graph().uniforms.value[8]).toBe(2);
    playback.value = createPlaybackState({ phase: "playing", slideKey: "generation-b", stepKey: "0", stepIndex: 0 });
    await act(() => renderer.update(content(64)));
    const second = graph();
    expect(second.uniforms).not.toBe(first.uniforms);
    expect(second.uniforms.value).toHaveLength(second.uniformsSize);
    expect(first.uniforms.value).toHaveLength(first.uniformsSize);
    playback.value = createPlaybackState({ phase: "playing", slideKey: "generation-c", stepKey: "0", stepIndex: 0 });
    await act(() => renderer.update(content(24)));
    expect(graph().uniforms).not.toBe(first.uniforms);
    expect(graph().uniforms).not.toBe(second.uniforms);
    expect(graph().uniforms.value).toHaveLength(first.uniformsSize);
    expect(second.uniforms.value).toHaveLength(second.uniformsSize);
    expect(first.uniforms.value).toHaveLength(first.uniformsSize);
    expect(renderer.root.findByType("world-overlay").props.identity).toBe(1);
    expect(overlayMounts).toBe(1); expect(overlayUnmounts).toBe(0);
    for (let timestamp = 0; timestamp <= 6000; timestamp += 20) {
      playback.value = advancePlayback(playback.value, timestamp);
      reactUI();
    }
    const scale = graph().renderScale.value;
    expect(scale).toBeLessThan(1);
    await act(() => renderer.update(content(64)));
    reactUI();
    expect(graph().renderScale.value).toBe(scale);
  } finally { await act(() => renderer?.unmount()); }
});

test("a topology change during camera entry preserves the original slide anchor", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  playback.value = createPlaybackState({ phase: "playing", slideKey: "entry-origin", stepKey: "0", stepIndex: 0 });
  let renderer;
  const content = (count, entering = false) => <World id="topology-entry" quality="high" enter={entering ? { from: "previous", duration: 2 } : undefined}>
    <Camera shots={[{ at: 0, position: entering ? [0, 5, 30] : [0, 5, 10] }]} /><Orbs count={count} />
  </World>;
  const values = () => renderer.root.findByType("render-graph").props.uniforms.value;
  try {
    await act(() => { renderer = create(content(24)); });
    reactUI();
    playback.value = createPlaybackState({ phase: "playing", slideKey: "entry-target", stepKey: "0", stepIndex: 0 });
    await act(() => renderer.update(content(24, true)));
    reactUI();
    playback.value = advancePlayback(advancePlayback(playback.value, 0), 1000);
    reactUI();
    expect(values()[2]).toBe(20);
    await act(() => renderer.update(content(64, true)));
    reactUI();
    expect(values()[2]).toBe(20);
    playback.value = advancePlayback(playback.value, 1500);
    reactUI();
    expect(values()[2]).toBeCloseTo(28.75);
    playback.value = advancePlayback(playback.value, 2000);
    reactUI();
    expect(values()[2]).toBe(30);
  } finally { await act(() => renderer?.unmount()); }
});

test("auto resolution adapts without React frames and preserves the frozen pause/outgoing scale", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  playback.value = createPlaybackState({ phase: "playing", slideKey: "adaptive", stepKey: "0", stepIndex: 0 });
  let renderer, commits = 0;
  const content = (quality, active = true) => <Profiler id="adaptive" onRender={() => commits++}><World quality={quality} renderScale={0.8} active={active}><Sphere /></World></Profiler>;
  try {
    await act(() => { renderer = create(content("auto")); });
    const graph = () => renderer.root.findByType("render-graph").props;
    const passes = graph().passes, initialCommits = commits;
    for (let timestamp = 0; timestamp <= 6000; timestamp += 20) {
      playback.value = advancePlayback(playback.value, timestamp);
      reactUI();
    }
    expect(graph().renderScale.value).toBeLessThan(0.8);
    expect(graph().uniforms.value[35]).toBe(graph().renderScale.value);
    expect(graph().passes).toBe(passes); expect(commits).toBe(initialCommits);
    expect(playback.value.slideTime).toBeCloseTo(6);
    const frozenScale = graph().renderScale.value;
    playback.value = transitionPlayback(playback.value, { ...playback.value, phase: "paused" });
    reactUI();
    expect(graph().renderScale.value).toBe(frozenScale); expect(graph().uniforms.value[35]).toBe(frozenScale);
    playback.value = transitionPlayback(playback.value, { ...playback.value, phase: "playing" });
    playback.value = advancePlayback(playback.value, 50000);
    reactUI();
    expect(graph().renderScale.value).toBe(frozenScale); expect(playback.value.slideTime).toBeCloseTo(6);
    playback.value = transitionPlayback(playback.value, { ...playback.value, phase: "outgoing" });
    reactUI();
    expect(graph().renderScale.value).toBe(frozenScale);
    expect(graph().passes).toBe(passes); expect(commits).toBe(initialCommits);
    await act(() => renderer.update(content("auto", false)));
    reactUI();
    expect(graph().renderScale.value).toBe(frozenScale); expect(graph().passes).toBe(passes);
    playback.value = createPlaybackState({ phase: "preview", slideKey: "preview", stepKey: "1", stepIndex: 1 });
    reactUI();
    expect(graph().renderScale.value).toBe(0.8);
    playback.value = createPlaybackState({ phase: "playing", slideKey: "fixed", stepKey: "0", stepIndex: 0 });
    await act(() => renderer.update(content("high")));
    const fixedCommits = commits;
    for (let timestamp = 0; timestamp <= 6000; timestamp += 20) {
      playback.value = advancePlayback(playback.value, timestamp);
      reactUI();
    }
    expect(graph().renderScale.value).toBe(0.8); expect(commits).toBe(fixedCommits);
  } finally { await act(() => renderer?.unmount()); }
});

test("compiled recursive world evaluators survive an isolated UI-worklet closure", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "world-worklets-"));
  try {
    const { compileDeck } = await import("../../presentation/src/compiler");
    const deck = path.join(directory, "world.mdx");
    fs.writeFileSync(deck, 'export { World, sampleWorldUniforms, prepareWorldScene, graphInstances, pulseInstances, sprayInstances, rowInstances, voxelInstances, flyTo, tree, wave } from "slides:world/World"\n\n# World');
    const compiled = await compileDeck(deck, { effectPacksDirectory: path.resolve(import.meta.dirname, "../packs") });
    if (!compiled.success) throw new Error(compiled.errors.join("\n"));
    const require = createRequire(import.meta.url);
    const module = { exports: {} };
    const callbacks = [], mutables = [], preparations = [], reactions = [];
    const presentation = { PresentationObservableProvider, PresentationCanvasScaleContext: React.createContext(1), usePresentation$, useRuntimeProjection,
      GPURenderGraph: props => React.createElement("compiled-graph", props),
      usePlayback: () => playback, samplePlayback, useBackgroundSize: () => ({ width: 800, height: 500 }),
      usePresentationValue: () => playback.value.phase };
    const reanimated = {
      makeMutable: value => { const shared = { value }; mutables.push(shared); return shared; },
      useSharedValue: value => React.useRef({ value }).current,
      useAnimatedReaction: (prepare, react) => { preparations.push(prepare); reactions.push(react); },
      useDerivedValue: fn => { callbacks.push(fn); return { get value() { return fn(); } }; },
    };
    Function("require", "module", "exports", compiled.code)(name => {
      if (name === "react" || name === "react/compiler-runtime" || name === "react/jsx-runtime") return require(name);
      if (name === "react-native") return { View: "view", PixelRatio: { get: () => 2 } };
      if (name === "@legend-apps/presentation") return presentation;
      if (name === "react-native-reanimated") return reanimated;
      return {};
    }, module, module.exports);
    const cache = new Map();
    function restore(fn) {
      if (!fn.__workletHash) return fn;
      if (cache.has(fn)) return cache.get(fn);
      const context = { __closure: {}, _recur: null };
      const restored = Function(`return (${fn.__initData.code});`)().bind(context);
      context._recur = restored;
      cache.set(fn, restored);
      for (const [key, value] of Object.entries(fn.__closure)) {
        expect(value).not.toBe(presentation); expect(value).not.toBe(reanimated);
        context.__closure[key] = typeof value === "function" ? restore(value) : value;
      }
      return restored;
    }
    const api = module.exports;
    expect(api.sampleWorldUniforms.__workletHash).toBeNumber();
    const sample = restore(api.sampleWorldUniforms);
    const stage = { id: "zone", position: { initial: [5, 0, 0], frames: [] }, glow: { initial: 0.5, frames: [] } };
    const scene = api.prepareWorldScene({
      instances: [
        ...api.graphInstances({ data: api.tree("root", [["a", ["a1", "a2"]]]), activate: [api.wave({ from: "root", step: 1 })] }).map(instance => ({ ...instance, stages: [stage] })),
        ...api.pulseInstances({ id: "pulse", path: ["root", "a", "a1"], step: 1, duration: 4 }),
        ...api.sprayInstances({ id: "mist", under: "leaves:lit", rate: 4, lifetime: 2 }),
        ...api.rowInstances({ id: "rows", count: 4, changes: [{ row: 2, step: 2 }], speed: 1 }).map(instance => ({ ...instance, stages: [stage] })),
        ...api.voxelInstances({ id: "voxels", grid: [2, 2, 2], collapse: { step: 1, to: 0.2, duration: 2 } }),
      ],
      stages: [{ stage, parents: [] }], counter: { source: "voxels" }, dof: {},
      camera: { shots: [{ step: 0, position: [0, 4, 20] }, { step: 1, follow: "pulse", dolly: 5, focus: "pulse" },
        { step: 2, follow: "rows:row:2", dolly: 7, focus: "rows:row:2" }, api.flyTo("zone", { step: 3, arc: 3 })] },
      exposure: { 0: 1, 1: 1.5, 2: 0.8 }, bloom: { intensity: 1.4 },
    });
    for (const clock of [
      { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } },
      { slideTime: 3, stepTime: 1, stepIndex: 1, stepOrigins: { 0: 0, 1: 2 } },
      { slideTime: 3.99, stepTime: 1.99, stepIndex: 1, stepOrigins: { 0: 0, 1: 2 } },
      { slideTime: 4.01, stepTime: 2.01, stepIndex: 1, stepOrigins: { 0: 0, 1: 2 } },
      { slideTime: 1, stepTime: 1, stepIndex: 2, stepOrigins: { 2: 0 } },
      { slideTime: 0.5, stepTime: 0.5, stepIndex: 3, stepOrigins: { 3: 0 } },
    ]) expect(sample(scene, clock)).toEqual(api.sampleWorldUniforms(scene, clock));
    // Mapper inputs come from the serialized closure, including unread values.
    let renderer;
    try {
      playback.value = createPlaybackState({ phase: "playing", slideKey: "closure", stepKey: "0", stepIndex: 0 });
      await act(() => { renderer = create(React.createElement(api.World, { id: "closure" })); });
      const autoClosure = reactions.at(-2).__closure;
      const advanceScale = restore(autoClosure.resolutionEvaluator);
      let isolated = autoClosure.resolution.value, expected = autoClosure.resolution.value;
      for (let timestamp = 0; timestamp <= 6000; timestamp += 20) {
        const input = { timestamp, playing: true, key: "compiled" };
        isolated = advanceScale(isolated, input); expected = autoClosure.resolutionEvaluator(expected, input);
        expect(isolated).toEqual(expected);
      }
      expect(isolated.scale).toBeLessThan(1);
      const retained = mutables[0];
      expect(Object.values(callbacks.at(-1).__closure)).not.toContain(retained);
      await act(() => renderer.unmount());
      playback.value = createPlaybackState({ phase: "preview", slideKey: "closure-preview", stepKey: "0", stepIndex: 0 });
      await act(() => { renderer = create(React.createElement(api.World, { id: "closure", enter: { from: "previous" } })); });
      expect(Object.values(callbacks.at(-1).__closure)).not.toContain(retained);
      await act(() => renderer.unmount());
      playback.value = createPlaybackState({ phase: "playing", slideKey: "closure-next", stepKey: "0", stepIndex: 0 });
      await act(() => { renderer = create(React.createElement(api.World, { id: "closure", enter: { from: "previous" } })); });
      expect(Object.values(callbacks.at(-1).__closure)).toContain(retained);
      await act(() => renderer.unmount());
      const count = mutables.length;
      await act(() => { renderer = create(React.createElement(api.World, { quality: "high" })); });
      expect(mutables.length).toBe(count);
      expect(Object.values(preparations.at(-2).__closure)).not.toContain(playback);
      expect(restore(preparations.at(-2))()).toBeNull();
      expect(Object.values(callbacks.at(-2).__closure)).not.toContain(playback);
    } finally { await act(() => renderer?.unmount()); }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}, 30000);

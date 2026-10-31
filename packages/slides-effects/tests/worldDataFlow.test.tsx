// @ts-nocheck Inspect the real compiled deck and clock uniforms without a GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { compileDeck } from "../../presentation/src/compiler";
import { layoutTree } from "../packs/world/graph";
import { colorVector, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";

const playback = { value: { phase: "playing", slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } } };
let renderer, network;
// World uploads float32 uniforms, so exact expectations round the same way.
const f32 = Math.fround, f32Vector = vector => vector.map(f32);
const closeVector = (actual, expected) => expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 5));
const values = index => Array.from(renderer.root.findAllByType("world-gpu")[index].props.uniforms.value);
const instances = index => {
  const data = values(index), result = [];
  for (let offset = worldHeaderSize; offset < data.length; offset += worldInstanceSize) result.push(data.slice(offset, offset + worldInstanceSize));
  return result;
};
function sample(time, step = 0) {
  playback.value = { ...playback.value, slideTime: time, stepTime: time, stepIndex: step, stepOrigins: { 0: 0, [step]: 0 } };
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = path.resolve(import.meta.dirname, "../../..");
  const deckPath = path.join(root, "apps/slides/examples/3d/data-flow.mdx");
  const compiled = await compileDeck(deckPath, {
    source: readFileSync(deckPath, "utf8"), effectPacksDirectory: path.join(root, "packages/slides-effects/packs"),
  });
  if (!compiled.success) throw new Error(compiled.errors.join("\n"));
  const require = createRequire(import.meta.url), module = { exports: {} };
  Function("require", "module", "exports", compiled.code)(name => {
    if (name === "@legend-apps/presentation") return {
      defineTransition: definition => definition,
      Background: "background", GPURenderGraph: props => React.createElement("world-gpu", props),
      usePresentationValue: key => key === "playbackScope" ? "slide" : "playing",
      useBackgroundSize: () => ({ width: 1920, height: 1080 }),
      usePlayback: () => playback, samplePlayback: (state, _preview, clock) => clock === "step" ? state.stepTime : state.slideTime,
    };
    if (name === "react-native-reanimated") return {
      useSharedValue: value => React.useRef({ value }).current,
      useDerivedValue: read => ({ get value() { return read(); } }), useAnimatedReaction() {},
    };
    return require(name);
  }, module, module.exports);
  network = module.exports.network;
  await act(() => {
    renderer = create(React.createElement(module.exports.default, { components: {
      Deck: "deck", Slide: "slide", View: "view",
      Steps: ({ children }) => children(playback.value.stepIndex),
    } }));
  });
}, 30000);
afterAll(async () => { await act(() => renderer?.unmount()); });

test("all five scenes fill the background and retain short overlay titles and navigation states", () => {
  const slides = renderer.root.findAllByType("slide");
  expect(slides).toHaveLength(5);
  for (const slide of slides) {
    const backgrounds = slide.findAllByType("background");
    expect(backgrounds).toHaveLength(1);
    const graph = backgrounds[0].findByType("world-gpu").props;
    expect(graph.background).toBe(true);
    expect([graph.width, graph.height]).toEqual([1920, 1080]);
    expect(slide.findAllByType("text").some(text => text.props.className?.includes("text-6xl"))).toBe(true);
  }
  const navigation = renderer.root.findAll(node => typeof node.type === "function" && node.type.name === "Steps");
  expect(navigation.map(node => node.props.count)).toEqual([3, 2, 3, 3, 2]);
});

test("the 53-node cascade heats descendants then prunes to one branch while keeping dim geometry", () => {
  expect(layoutTree(network).nodes).toHaveLength(53);
  sample(0);
  const nodes = () => instances(0).filter(item => item[3] === f32(0.24));
  const edges = instances(0).filter(item => item[15] === f32(0.45));
  expect(nodes()).toHaveLength(53); expect(edges).toHaveLength(52);
  for (const item of [...nodes(), ...edges]) {
    expect(item[23]).toBe(1);
    expect(item.slice(4, 7)).toEqual(f32Vector(colorVector("#647b9a")));
  }
  expect(values(0)[1]).toBeCloseTo(1.8);
  expect(values(0)[9]).toBe(f32(1.8)); expect(values(0)[12]).toBe(f32(0.035));
  sample(0.5, 1);
  const partial = nodes().filter(item => item[30] > 0);
  expect(partial.length).toBeGreaterThan(1); expect(partial.length).toBeLessThan(53);
  sample(2, 1);
  expect(nodes().every(item => item[30] === 1)).toBe(true);
  closeVector(nodes()[0].slice(4, 7), colorVector("#ff36c8"));
  sample(2, 2);
  expect(nodes().filter(item => item[30] === 1)).toHaveLength(13);
  const target = layoutTree(network, { radius: 6.8, levelHeight: 1.7, position: [0, 3.2, 0] }).nodes.find(node => node.id === "e2");
  expect(target, "node e2").toBeDefined();
  closeVector(values(0).slice(4, 7), target.position);
  expect(values(0)[32]).toBeCloseTo(10);
});

test("the cyan orb follows one curved edge with a fainter trail and matching camera focus", () => {
  sample(2, 1);
  const head = instances(1).find(item => item[7] === 14);
  const trail = instances(1).find(item => item[7] === f32(14 * 0.3));
  expect(head, "orb head").toBeDefined();
  expect(trail, "orb trail").toBeDefined();
  expect(head.slice(4, 7)).toEqual(f32Vector(colorVector("#22d3ee")));
  expect(head.slice(8, 11)).toEqual([1, 1, 1]);
  expect(trail[19]).toBeCloseTo(head[3] * 0.18);
  expect(trail.slice(12, 15)).toEqual(head.slice(0, 3));
  expect(trail[15]).toBeGreaterThan(0);
  expect(values(1).slice(4, 7)).toEqual(head.slice(0, 3));
  expect(values(1)[32]).toBeCloseTo(7);
  expect(instances(1).filter(item => item[7] > 0 && item[3] === f32(0.2))).toHaveLength(2);
});

test("rows, stage flights and voxel reduction retain their clock-driven behavior", () => {
  sample(1, 1);
  expect(instances(2).filter(item => item[3] === 0.5 && item[7] > 1)).toHaveLength(1);
  expect(renderer.root.findAllByType("world-gpu")[2].props.passes.find(pass => pass.id === "scene-box").instanceCount).toBe(15);
  sample(3, 2);
  expect(values(3).slice(4, 7)).toEqual([10, 0, 0]);
  expect(values(3).slice(0, 3)).toEqual([12, 2.5, 10]);
  expect(values(3)[32]).toBeCloseTo(Math.hypot(2, 2.5, 10));
  sample(0);
  expect(values(4)[56]).toBe(1000);
  sample(2.4, 1);
  expect(values(4)[56]).toBe(200);
  expect(instances(4).filter(item => item[3] > 0 && item[3] <= f32(0.17))).toHaveLength(200);
});

import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { Cloud, Flight, Scene, TYPE, expandScene, flightStops, sceneLayouts } from "../packs/world/Authoring";
import { prepareWorldSlides, Stage, Text3D, WorldSlide } from "../packs/world/World";

import { sampleTrack } from "../packs/world/scene";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const words = ["one", ["two", "three"], "four"];

test("flight stops step into depth with varying sideways drift, or follow an authored path", () => {
  const stops = flightStops({ words, gap: 8 });
  expect(stops.map(p => p[2])).toEqual([-8, -16, -24]);
  expect(Math.sign(stops[0][0])).toBe(-Math.sign(stops[1][0]));
  expect(flightStops({ words, path: [[1, 2, -3]] })[0]).toEqual([1, 2, -3]);
});

test("the camera shifts onto each stop, holds on the last and keeps authored step overrides", async () => {
  let renderer: ReturnType<typeof create> | undefined;
  try {
    const at: [number, number, number] = [0, 4, 0];
    await act(() => { renderer = create(<Scene id="flight" layout="cloud" durations={[2, 1, 1, 1, 1]} camera={{ steps: { 4: { dolly: 2 } } }}>
      <Flight id="f" at={at} words={words} duration={.5} />
    </Scene>); });
    const steps = renderer!.root.findByType(WorldSlide).props.track.steps;
    const target = sceneLayouts.cloud.camera!.target!, stops = flightStops({ words });
    expect(steps[0]).toBeUndefined();
    expect(steps[1]).toEqual({ shift: stops[0].map((v, i) => v + at[i] - target[i]), duration: .5, ease: "out" });
    expect(steps[3].shift).toEqual(stops[2].map((v, i) => v + at[i] - target[i]));
    expect(steps[4]).toEqual({ ...steps[3], dolly: 2 });
  } finally { await act(() => renderer?.unmount()); }
});

test("flight words stay put while the next stops wait dimmed and passed ones fade", () => {
  const nodes = flat(expandScene(<Flight id="f" words={words} ahead={1} />));
  expect(nodes.find(n => n.type === Stage && n.props.id === "f/1")!.props.position).toEqual(flightStops({ words })[1]);
  const text = (id: string) => nodes.find(n => n.type === Text3D && n.props.id === id)!.props;
  const at = (track: unknown, step: number) => [...(track as { step: number; value: unknown }[])].reverse().find(f => f.step <= step)!.value;
  const [two, three] = [text("f/1/two"), text("f/1/three")];
  expect((two.position as number[])[0]).toBeLessThan((three.position as number[])[0]);
  expect([0, 1, 2, 3, 4].map(s => at(text("f/0/one").opacity, s))).toEqual([1, 1, 0, 0, 1]);
  expect([0, 1, 2, 3].map(s => at(two.opacity, s))).toEqual([0, 1, 1, 0]);
  expect(at(two.emissive, 2)).toBe(1);
  expect(at(two.emissive, 1)).toBeLessThan(.5);
});


test("Flight and Cloud sharpen only their current step selection, with a whole-part override", () => {
  for (const override of [undefined, true, false]) {
    const children = expandScene(<>
      <Flight id="flight" words={["one", "two"]} sharp={override} />
      <Cloud id="cloud" words={["one", "two"]} focus={["one", "two"]} sharp={override} />
    </>);
    const scene = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
    for (const stepIndex of [0, 1, 2, 3, 1]) {
      const clock = { slideTime: 10, stepTime: 0, stepIndex, stepOrigins: [0, 10, 10] };
      for (const instance of scene.instances.filter(instance => instance.glyph)) {
        const current = instance.id!.startsWith("flight/")
          ? instance.id!.includes(`/${Math.min(stepIndex - 1, 1)}/`)
          : instance.id!.includes(stepIndex === 0 ? "/one/" : "/two/");
        expect(instance.sharp).toBeDefined();
        expect(sampleTrack(instance.sharp!, clock)).toBe(Number(override ?? current));
      }
    }
  }
});

test("on gather every stop glides into one centered, evenly spaced row, lit and sharp, as the camera pulls back onto it", async () => {
  const hooks = ["useState", "useContext", "useReducer"], row: [number, number, number] = [0, 1, -20];
  const nodes = flat(expandScene(<Flight id="g" step={0} words={hooks} gather={2} row={row} />));
  const at = (track: unknown, step: number) => [...(track as { step: number; value: unknown }[])].reverse().find(f => f.step <= step)!.value;
  const stage = (k: number) => nodes.find(n => n.type === Stage && n.props.id === `g/${k}`)!.props;
  const text = (k: number) => nodes.find(n => n.type === Text3D && n.props.id === `g/${k}/${hooks[k]}`)!.props;
  expect(at(stage(0).position, 1)).toEqual(flightStops({ words: hooks })[0]);
  const lined = [0, 1, 2].map(k => at(stage(k).position, 2) as number[]);
  expect(lined.map(p => [p[1], p[2]])).toEqual([[1, -20], [1, -20], [1, -20]]);
  const edge = (k: number, side: number) => lined[k][0] + side * hooks[k].length * .6 * .5 * TYPE / 2;
  expect(edge(1, -1) - edge(0, 1)).toBeCloseTo(edge(2, -1) - edge(1, 1));
  expect(edge(0, -1)).toBeCloseTo(-edge(2, 1));
  expect([0, 1, 2].map(k => [at(text(k).opacity, 2), at(text(k).emissive, 2), at(stage(k).sharp, 2)])).toEqual([[1, 1, true], [1, 1, true], [1, 1, true]]);
  expect(at(text(0).opacity, 1)).toBe(0);
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(() => { renderer = create(<Scene id="gather" layout="cloud" durations={[2, 1, 1, 1]}>
      <Flight id="g" step={0} at={[0, 4, 0]} words={hooks} gather={2} row={row} />
    </Scene>); });
    const steps = renderer!.root.findByType(WorldSlide).props.track.steps, target = sceneLayouts.cloud.camera!.target!;
    expect(steps[1].dolly).toBeUndefined();
    expect(steps[2]).toMatchObject({ shift: [0, 5, -20].map((v, i) => v - target[i]), dolly: 1.5 });
    expect(steps[3]).toEqual(steps[2]);
  } finally { await act(() => renderer?.unmount()); }
});

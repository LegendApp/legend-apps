import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { Flight, Scene, expandScene, flightStops, sceneLayouts } from "../packs/world/Authoring";
import { Stage, Text3D, WorldSlide } from "../packs/world/World";

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
  const at = (track: unknown, step: number) => (track as { step: number; value: unknown }[]).findLast(f => f.step <= step)!.value;
  const [two, three] = [text("f/1/two"), text("f/1/three")];
  expect((two.position as number[])[0]).toBeLessThan((three.position as number[])[0]);
  expect([0, 1, 2, 3, 4].map(s => at(text("f/0/one").opacity, s))).toEqual([1, 1, 0, 0, 1]);
  expect([0, 1, 2, 3].map(s => at(two.opacity, s))).toEqual([0, 1, 1, 0]);
  expect(at(two.emissive, 2)).toBe(1);
  expect(at(two.emissive, 1)).toBeLessThan(.5);
});

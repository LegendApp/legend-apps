import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { CodeMorph, CodeTrace, expandScene } from "../packs/world/Authoring";
import { Text3D } from "../packs/world/World";
import { compileTrack, sampleTrack, type Animated } from "../packs/world/scene";
import { text3dInstances } from "../packs/world/text3d";
import { highlightedFence } from "./highlightedFence";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const clock = (stepIndex: number, stepTime: number) => ({ slideTime: stepIndex * 5 + stepTime, stepIndex, stepTime, stepOrigins: { 0: 0, 1: 5, 2: 10, 3: 15 } });
const value = <T extends number | [number, number, number]>(prop: unknown, step: number, time: number): T => sampleTrack(compileTrack(prop as Animated<T>), clock(step, time));

async function trace() {
  return flat(expandScene(<CodeTrace id="trace" source={1} reads={[3]} nodes={["Owner", "Reader"]}>
    {await highlightedFence('function App() {\n  const state = useState(0)\n  ignored()\n  return <span>{state}</span>\n}')}
    {await highlightedFence('const state = useSignal(0)\n<span>{state}</span>')}
  </CodeTrace>));
}

test("trace collapse uses token identities, continuous row spacing and panel dimensions", async () => {
  const tree = await trace(), tokens = tree.filter(node => node.type === Text3D && String(node.props.id).includes("/token"));
  expect(tokens.length).toBeGreaterThan(0);
  expect(tokens.filter(node => node.props.text === "span")).toHaveLength(2);
  for (const token of tokens.filter(node => node.props.text === "state" || node.props.text === "span")) {
    expect(value<number>(token.props.opacity, 1, 4)).toBe(1);
    expect(value<number>(token.props.opacity, 2, .5)).toBe(1);
    const start = value<[number, number, number]>(token.props.position, 2, .25), end = value<[number, number, number]>(token.props.position, 2, .75);
    const mid = value<[number, number, number]>(token.props.position, 2, .5);
    expect(start).not.toEqual(end);
    for (let axis = 0; axis < 3; axis++) expect(mid[axis]).toBeCloseTo((start[axis] + end[axis]) / 2);
    expect(value(token.props.position, 1, 4)).toEqual(start);
    expect(value(token.props.position, 2, .250001)[1]).toBeCloseTo(start[1]);
    expect(value(token.props.position, 2, .749999)[1]).toBeCloseTo(end[1]);
  }
  const panel = tree.find(node => node.props.id === "trace/card")!;
  const start = value<[number, number, number]>(panel.props.scale, 2, .25), end = value<[number, number, number]>(panel.props.scale, 2, .75);
  const mid = value<[number, number, number]>(panel.props.scale, 2, .5);
  for (const axis of [0, 1]) { expect(start[axis]).toBeGreaterThan(end[axis]); expect(mid[axis]).toBeCloseTo((start[axis] + end[axis]) / 2); }
  expect(value(panel.props.scale, 1, 4)).toEqual(start);
  expect(value<number>(panel.props.opacity, 3, 2)).toBe(0);
  const span = tokens.find(node => node.props.text === "span")!;
  expect(value<[number, number, number]>(span.props.position, 2, 2)[1]).toBeCloseTo(-.27 * 1.8);
  expect(value<number>(span.props.opacity, 3, 2)).toBe(0);
});

test("insertions fade and scale in, removals fade out, and changed words receive soft bands", async () => {
  const tree = await trace(), token = (text: string) => tree.find(node => node.type === Text3D && node.props.text === text)!;
  const added = text3dInstances(token("useSignal").props as never)[0], removed = text3dInstances(token("useState").props as never)[0];
  expect(sampleTrack(added.glyph!.opacity, clock(1, 4))).toBe(0);
  expect(sampleTrack(added.glyph!.opacity, clock(2, .375))).toBeCloseTo(.5);
  expect(sampleTrack(added.scale, clock(2, .5))[0]).toBeCloseTo(.9);
  expect(sampleTrack(added.scale, clock(2, 1))[0]).toBe(1);
  expect(sampleTrack(removed.glyph!.opacity, clock(2, .125))).toBeCloseTo(.5);
  expect(sampleTrack(removed.glyph!.opacity, clock(2, 1))).toBe(0);
  expect(sampleTrack(added.glyph!.opacity, clock(1, 4))).toBe(0);
  const words = tree.filter(node => String(node.props.id).includes("/word"));
  expect(words).toHaveLength(1);
  expect(words[0].props).toMatchObject({ flat: true, fill: .3, line: 1, glow: 0, radius: -4, color: "#5a96ff" });
  expect(value<number>(words[0].props.opacity, 2, 1)).toBe(1);
  expect(value<number>(words[0].props.opacity, 3, 0)).toBe(0);
});

test("repeated same-color tokens match one-to-one through a multiline rewrite", async () => {
  const tree = flat(expandScene(<CodeMorph id="m">{await highlightedFence('-read(item, item)\n+read(\n+  item,\n+  item\n+)', "diff-tsx")}</CodeMorph>));
  const items = tree.filter(node => node.type === Text3D && node.props.text === "item");
  expect(items).toHaveLength(2);
  expect(new Set(items.map(node => node.props.id)).size).toBe(2);
  for (const item of items) for (const time of [0, .25, .5, .75, 2]) expect(value<number>(item.props.opacity, 1, time)).toBe(1);
  const rows = items.map(node => value<[number, number, number]>(node.props.position, 1, 2)[1]);
  expect(rows).toEqual([-.27, -.54]);
});

test("shared trace nodes fly their compact tokens into the boxes as labels, with no doubles", async () => {
  const shares = [{ id: "owner", text: "useSignal" }, { id: "reader", text: "<span>{state}</span>" }];
  const tree = flat(expandScene(<CodeTrace id="trace" source={1} reads={[3]} nodes={shares}>
    {await highlightedFence('function App() {\n  const state = useState(0)\n  ignored()\n  return <span>{state}</span>\n}')}
    {await highlightedFence('const state = useSignal(0)\n<span>{state}</span>')}
  </CodeTrace>));
  expect(tree.filter(node => String(node.props.id).endsWith("/label"))).toHaveLength(0);
  const visible = tree.filter(node => node.type === Text3D && value<number>(node.props.opacity, 2, 2) === 1);
  shares.forEach(({ text }, k) => {
    const box = tree.find(node => node.props.id === `trace/node${k}`)!, center = (box.props.position as number[])[0], advance = .2 * 100 / 72 * .6;
    const glyphs = visible.flatMap(token => text3dInstances(token.props as never).map(glyph => {
      const at = value<[number, number, number]>(token.props.position, 3, 2), home = glyph.glyph!.home, offset = sampleTrack(glyph.glyph!.offset, clock(3, 2));
      return { x: at[0] + home[0] + offset[0], y: at[1], scale: sampleTrack(glyph.scale, clock(3, 2))[0], opacity: value<number>(token.props.opacity, 3, 2) };
    })).filter(glyph => glyph.opacity > 0 && Math.abs(glyph.y - (box.props.position as number[])[1]) < .01).sort((a, b) => a.x - b.x);
    const chars = [...text].flatMap((char, i) => char === " " ? [] : [center - text.length * advance / 2 + (i + .5) * advance]);
    expect(glyphs.map(glyph => glyph.x).map(x => x.toFixed(4))).toEqual(chars.map(x => x.toFixed(4)));
    for (const glyph of glyphs) expect(glyph.scale).toBeCloseTo(.2 / .13);
  });
  for (const token of visible.filter(node => ["const", "state", "=", "(", "0", ")"].includes(String(node.props.text)) && value<[number, number, number]>(node.props.position, 2, 2)[1] === 0))
    expect(value<number>(token.props.opacity, 3, .4)).toBe(0);
  for (const token of visible.filter(node => node.props.text === "useSignal")) {
    expect(value<number>(token.props.opacity, 3, .5)).toBe(1);
    const scale = sampleTrack(text3dInstances(token.props as never)[0].scale, clock(3, .5))[0];
    expect(scale).toBeGreaterThan(1); expect(scale).toBeLessThan(.2 / .13);
  }
  expect(value<number>(tree.find(node => node.props.id === "trace/card")!.props.opacity, 3, .4)).toBe(0);
  const box = tree.find(node => node.props.id === "trace/node1")!;
  expect(value<number>(box.props.opacity, 3, .6)).toBe(0);
  expect(value<number>(box.props.opacity, 3, 1)).toBe(1);
  const fences = [await highlightedFence('function App() {\n  const state = useState(0)\n  ignored()\n  return <span>{state}</span>\n}'), await highlightedFence('const state = useSignal(0)\n<span>{state}</span>')];
  expect(() => expandScene(<CodeTrace id="trace" source={1} reads={[3]} nodes={[{ id: "x", text: "missing" }, "Reader"]}>{fences}</CodeTrace>))
    .toThrow(/shared "x" text is not in compact line 1/);
});

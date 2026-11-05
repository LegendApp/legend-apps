import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { CodeMorph, CodePanel, CodeTrace, Layers, Scene, expandScene, readScenes } from "../packs/world/Authoring";
import { Card, Text3D } from "../packs/world/World";
import { colorVector, compileTrack, sampleTrack, type Animated } from "../packs/world/scene";
import { text3dInstances } from "../packs/world/text3d";
import type { CodeToken } from "../../presentation/src/codeHighlight";
import { highlightedFence } from "./highlightedFence";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const clock = (stepIndex: number, stepTime: number) => ({ slideTime: stepIndex * 5 + stepTime, stepIndex, stepTime, stepOrigins: { 0: 0, 1: 5, 2: 10, 3: 15 } });
const value = <T extends number | [number, number, number]>(prop: unknown, step: number, time = 4): T => sampleTrack(compileTrack(prop as Animated<T>), clock(step, time));

const source = 'function App() {\n  const [profile] = useState({ name: "Ada" })\n  // passed through\n  return <Editor profile={profile} />\n}';

test("trace keeps every syntax color during marking, collapse, extraction and reverse seeks", async () => {
  const parts = flat(expandScene(<CodeTrace id="trace" source={1} reads={[3]} pass={[2]} nodes={["Owner", "Reader"]}>
    {await highlightedFence(source)}
  </CodeTrace>));
  const text = parts.filter(node => node.type === Text3D && node.props.tokens);
  const colors = new Set<string>();
  for (const node of text) {
    const tokens = node.props.tokens as CodeToken[];
    const glyphs = text3dInstances(node.props as never);
    glyphs.forEach(glyph => {
      const token = tokens.find(token => glyph.id!.includes(`:${token.id}:`))!;
      colors.add(token.color);
      for (const step of [0, 1, 2, 3, 2, 1, 0]) for (const time of [0, .2, .7, 2, 4])
        expect(sampleTrack(glyph.color, clock(step, time))).toEqual(colorVector(token.color));
    });
  }
  expect(colors.size).toBeGreaterThan(4);
});

test("trace bands are soft, configurable backgrounds and disappear with the corresponding lines", async () => {
  const parts = flat(expandScene(<CodeTrace id="trace" source={1} reads={[3]} pass={[2]} nodes={["Owner", "Reader"]}
    highlight={{ source: "#ff9900", reads: "#3399ff", pass: "#aaaaaa", opacity: .16 }}>
    {await highlightedFence(source)}
  </CodeTrace>));
  const bands = parts.filter(node => String(node.props.id).endsWith("/glow"));
  expect(bands.map(node => node.props.color)).toEqual(["#ff9900", "#aaaaaa", "#3399ff"]);
  for (const band of bands) {
    expect(band.type).toBe(Card);
    expect(band.props).toMatchObject({ flat: true, fill: 1, edge: 0, glow: 0 });
    expect(value<number>(band.props.opacity, 0)).toBe(0);
    expect(value<number>(band.props.opacity, 1)).toBe(.16);
    expect(value<[number, number, number]>(band.props.position, 1)[2]).toBeLessThan(0);
    expect(value<number>(band.props.opacity, 3)).toBe(0);
  }
  expect(value<number>(bands[1].props.opacity, 2)).toBe(0);
  expect(value<number>(bands[0].props.opacity, 2)).toBe(.16);
  expect(value<[number, number, number]>(bands[0].props.position, 2)[1]).toBeCloseTo(0);
  expect(value<[number, number, number]>(bands[2].props.position, 2)[1]).toBeCloseTo(-.27 * 1.8);
});

test("trace layout centers the code first, then centers the extracted tree", async () => {
  const parts = flat(expandScene(<CodeTrace id="trace" source={1} reads={[3]} nodes={["Owner", "Reader"]}>
    {await highlightedFence(source)}
  </CodeTrace>, "trace"));
  const stage = parts.find(node => node.props.id === "trace")!;
  const panel = parts.find(node => node.props.id === "trace/card")!;
  const initial = value<[number, number, number]>(stage.props.position, 0), panelAt = value<[number, number, number]>(panel.props.position, 0);
  expect(initial[0] + panelAt[0]).toBeCloseTo(0);
  expect(initial[1] + panelAt[1]).toBeCloseTo(4.3);
  const extracted = value<[number, number, number]>(stage.props.position, 3);
  const nodes = parts.filter(node => /^trace\/node\d+$/.test(String(node.props.id))).map(node => node.props.position as number[]);
  for (const [axis, center] of [[0, 0], [1, 4.3]])
    expect(extracted[axis] + (Math.min(...nodes.map(p => p[axis])) + Math.max(...nodes.map(p => p[axis]))) / 2).toBeCloseTo(center);
  expect(extracted[0]).toBeLessThan(initial[0]);
  expect(value<[number, number, number]>(stage.props.position, 0)).toEqual(initial);
  expect(panel.props.fill).toBeGreaterThanOrEqual(.9);
  expect(panel.props.edge).toBeGreaterThan(0);
});

test("actual scene expansion rejects unhighlighted code, including later morph fences", async () => {
  for (const part of [<CodePanel id="c">const x = 1</CodePanel>, <CodeMorph id="c">-a</CodeMorph>,
    <CodeTrace id="c" source={0} reads={[1]} nodes={["a", "b"]}>const x = 1</CodeTrace>, <Layers id="c" words={["x"]}>x</Layers>,
    <CodePanel id="c"><pre>{React.createElement("code", { children: "const x = 1", highlighted: { tokens: [] } })}</pre></CodePanel>,
    <CodeMorph id="c"><>{await highlightedFence("-a\n+b", "diff")}<pre><code>{"-b\n+c"}</code></pre></></CodeMorph>]) {
    expect(() => expandScene(part)).toThrow("must be a fenced block");
    expect(() => readScenes([<Scene id="s">{part}</Scene>])).toThrow("must be a fenced block");
  }
});

test("panel and morph marks are configurable soft bands behind the syntax", async () => {
  for (const part of [<CodePanel id="c" marks={[{ text: "value", color: "#abcdef", opacity: .18 }]}>{await highlightedFence("const value = 1")}</CodePanel>,
    <CodeMorph id="c" marks={[{ text: "value", color: "#abcdef", opacity: .18 }]}>{await highlightedFence(" const value = 1", "diff")}</CodeMorph>]) {
    const marks = flat(expandScene(part)).filter(node => String(node.props.id).includes("/mark"));
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.type).toBe(Card);
      expect(mark.props).toMatchObject({ flat: true, fill: 1, edge: 0, glow: 0, color: "#abcdef", opacity: .18 });
      expect((mark.props.position as number[])[2]).toBeLessThan(0);
    }
  }
});

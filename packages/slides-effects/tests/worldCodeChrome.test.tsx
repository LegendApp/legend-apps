import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { highlightCode } from "../../presentation/src/compiler/remarkCodeHighlight";
import { CodeMorph, CodePanel, CodeTrace, Grid, Layers, Scene, expandScene, readScenes } from "../packs/world/Authoring";
import { Card, Text3D } from "../packs/world/World";
import { sampleTrack, compileTrack } from "../packs/world/scene";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const find = (node: React.ReactNode, id: string) => flat(node).find(n => n.props.id === id)!;

test("every code part in a scene must carry compiler highlighting", async () => {
  const source = "const a = 1;";
  const fence = <pre>{React.createElement("code", { children: source + "\n", highlighted: await highlightCode(source, "ts") })}</pre>;
  expect(readScenes([<Scene id="ok"><CodePanel id="code">{fence}</CodePanel></Scene>])[0].parts[0].tokens!.length).toBeGreaterThan(0);
  for (const part of [<CodePanel id="c">{source}</CodePanel>, <CodeMorph id="c">{source}</CodeMorph>,
    <CodeTrace id="c" source={0} reads={[0]} nodes={["a", "b"]}>{source}</CodeTrace>, <Layers id="c">{source}</Layers>])
    expect(() => readScenes([<Scene id="s">{part}</Scene>])).toThrow("must be a fenced block");
});

test("code panels take a border, and grids take mac window chrome and a vertical resize", () => {
  expect(find(expandScene(<CodePanel id="code" border={1.4}>{"x"}</CodePanel>), "code/card").props.edge).toBe(1.4);
  const flash = { step: 1, repeat: "infinite" as const };
  const tree = expandScene(<Grid id="g" count={4} columns={2} label="MyText" chrome="mac" fill={.95} border={1.2} resize="height" flash={flash} />);
  expect(find(tree, "g/frame").props).toMatchObject({ fill: .95, edge: 1.2 });
  expect(["g/dot0", "g/dot1", "g/dot2"].map(id => find(tree, id).props.color)).toEqual(["#ff5f57", "#febc2e", "#28c840"]);
  expect(find(tree, "g/bar").props.flat).toBe(true);
  expect(flat(tree).filter(n => n.type === Text3D).every(n => n.props.text === "MyText")).toBe(true);
  const scale = compileTrack(find(tree, "g/frame").props.scale as never);
  const sizes = [0, .3, .7, 1.05].map(t => sampleTrack(scale, { slideTime: 1 + t, stepTime: t, stepIndex: 1, stepOrigins: { 0: 0, 1: 1 } }) as number[]);
  expect(new Set(sizes.map(s => s[0].toFixed(3))).size).toBe(1);
  expect(new Set(sizes.map(s => s[1].toFixed(3))).size).toBeGreaterThan(1);
  expect(flat(expandScene(<Grid id="g" count={4} columns={2} />)).some(n => n.props.id === "g/bar")).toBe(false);
  expect(flat(tree).some(n => n.type === Card && n.props.id === "g/bar")).toBe(true);
});

import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import type { CodeHighlight } from "@legend-apps/presentation";
import { highlightCode } from "../../presentation/src/compiler/remarkCodeHighlight";
import { CodePanel, CodeMorph, CodeTrace, Scene, expandScene, readScenes } from "../packs/world/Authoring";
import { Text3D } from "../packs/world/World";
import { colorVector, prepareWorldScene, sampleWorldUniforms, sampleTrack, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { layoutText3D, text3dInstances } from "../packs/world/text3d";
import { font } from "../packs/world/text3d-mono";
import { createPlaybackState } from "../../presentation/src/playbackState";
import { createTrackFrame, sampleTrackFrame, trackIds } from "../packs/world/track";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{children?: React.ReactNode}>(child) ? [child, ...flat(child.props.children)] : []);
function fence(source: string, highlighted: CodeHighlight) { return <pre>{React.createElement("code", { children: source + "\n", ...{ highlighted } })}</pre>; }

test("World fences retain compiler tokens through scene preparation and map each glyph to its color", async () => {
  const source = '// 😀\n  const value = "é";\n\nvalue;';
  const highlighted = await highlightCode(source, "ts");
  const children = <CodePanel id="code">{fence(source, highlighted)}</CodePanel>;
  expect(readScenes([<Scene id="one">{children}</Scene>])[0].parts[0].tokens).toEqual(highlighted.tokens);
  const text = flat(expandScene(children)).find(node => node.type === Text3D)!;
  expect(text.props.tokens).toEqual(highlighted.tokens);
  const instances = text3dInstances(text.props as never);
  const values = sampleWorldUniforms(prepareWorldScene({ instances }), { slideTime: 4, stepTime: 4, stepIndex: 0, stepOrigins: {0:0} });
  const layout = layoutText3D(font, source, { align: "left" });
  expect(instances).toHaveLength(layout.length);
  layout.forEach((glyph, index) => {
    const token = highlighted.tokens.find(token => glyph.offset >= token.offset && glyph.offset < token.offset + token.content.length)!;
    const color = colorVector(token.color);
    color.forEach((value, axis) => expect(values[worldHeaderSize + index * worldInstanceSize + 4 + axis]).toBeCloseTo(value));
  });
});

test("same-text/color tokens carry across an inserted line and changed colors get distinct identities", async () => {
  const before = "const answer = 42;", after = '// moved\n' + before;
  const a = await highlightCode(before, "ts"), b = await highlightCode(after, "ts");
  const scene = (text: string, highlighted: CodeHighlight) => prepareWorldScene({ instances: text3dInstances({ id:"code", text, tokens:highlighted.tokens, mono:true }) });
  const first = scene(before, a), next = scene(after, b);
  const oldIds = trackIds(first), ids = trackIds(next);
  expect(oldIds.every(id => ids.includes(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  const playback = (slideKey: string, time: number) => ({...createPlaybackState({phase:"playing",slideKey,stepKey:"0",stepIndex:0}),slideTime:time,stepTime:time});
  const initial = sampleTrackFrame(createTrackFrame(), sampleWorldUniforms(first, playback("0", 0)) as number[], oldIds, playback("0", 0), {});
  const carried = sampleTrackFrame(initial, sampleWorldUniforms(next, playback("1", 0)) as number[], ids, playback("1", 0), {});
  oldIds.forEach(id => expect(carried.sources[ids.indexOf(id)]).toBe(oldIds.indexOf(id)));
  const changed = scene(before, {...a,tokens:a.tokens.map(token=>({...token,color:"#123456",id:token.id.replace(token.color,"#123456")}))});
  expect(trackIds(changed).some(id=>oldIds.includes(id))).toBe(false);
});

test("diff and trace animation start with syntax colors and diff additions settle back to them", async () => {
  const source = ' const a = 1;\n+const b = 2;';
  const highlighted = await highlightCode(source, "diff");
  const nodes = flat(expandScene(<CodeMorph id="change">{fence(source, highlighted)}</CodeMorph>)).filter(node => node.type === Text3D);
  for (const node of nodes) expect(node.props.tokens).toBeDefined();
  const addedNode = nodes.find(node => node.props.text === "const b = 2;")!;
  const added = text3dInstances(addedNode.props as never);
  const syntax = (addedNode.props.tokens as CodeHighlight["tokens"])[0].color;
  const initial = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0, 1: 1 } };
  const settled = { ...initial, slideTime: 10, stepTime: 9, stepIndex: 1 };
  for (const instance of added) {
    expect(sampleTrack(instance.color, initial)).toEqual(colorVector("#39d98a"));
    expect(sampleTrack(instance.color, settled)).toEqual(colorVector(syntax));
  }
  const code = "const a = 1;\nuse(a);";
  const tokens = await highlightCode(code, "ts");
  const trace = flat(expandScene(<CodeTrace id="trace" source={0} reads={[1]} nodes={["Owner","Reader"]}>{fence(code,tokens)}</CodeTrace>)).filter(node=>node.type===Text3D && node.props.tokens);
  expect(trace).toHaveLength(2);
  expect(trace.every(node => text3dInstances(node.props as never).length > 0)).toBe(true);
});

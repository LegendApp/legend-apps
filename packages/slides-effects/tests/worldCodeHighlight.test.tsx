import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import type { CodeHighlight } from "@legend-apps/presentation";
import { highlightCode } from "../../presentation/src/compiler/remarkCodeHighlight";
import { CodePanel, CodeMorph, CodeTrace, Scene, expandScene, readScenes } from "../packs/world/Authoring";
import { Text3D } from "../packs/world/World";
import { colorVector, compileTrack, prepareWorldScene, sampleWorldUniforms, sampleTrack, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
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

test("baked glyph tracks share samples and preserve staged color, glow and pose through seeks", () => {
  const glyphs = text3dInstances({ id: "letters", text: "Shared samples", position: { 0: [1, 2, 3], 1: [4, 5, 6] },
    color: { 0: "#123456", 1: "#abcdef" }, emissive: { 0: 0.4, 1: 1.2 }, opacity: { 0: 0, 1: 1 },
    enter: { step: 1, duration: 0.9, stagger: 0.03 },
    material: { albedo: { 0: "#234567", 1: "#fedcba" }, roughness: { 0: 0.2, 1: 0.8 }, metal: { 0: 0.4, 1: 0.7 }, rim: { 0: 0.6, 1: 0.3 } } });
  const stages = [
    { id: "fixed", position: compileTrack<[number, number, number]>([3.123456789, 2, -4]), glow: compileTrack(0.7) },
    { id: "moving", position: compileTrack<[number, number, number]>({ 0: [0, 0, 0], 1: [2, -3, 1] }), glow: compileTrack({ 0: 0.5, 1: 1.5 }) },
  ];
  const scene = prepareWorldScene({ instances: glyphs.map(instance => ({ ...instance, stages })) });
  const countTracks = scene.instances.reduce((sum, instance) => sum + [instance.position, instance.color, instance.emissive, instance.scale,
    instance.glyph!.offset, instance.glyph!.rotation, instance.glyph!.opacity].filter(track => track.frames.length).length, 0);
  expect(scene.uniformInputs.tracks.length).toBeLessThan(countTracks);
  expect(scene.uniformInputs.live).toEqual([]);
  const buffer = sampleWorldUniforms(scene, { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } }, null, 1, 1, true);
  const samples: [number, number, Record<number, number>][] = [
    [0, 0, { 0: 0 }], [1, 1, { 0: 0, 1: 1 }], [1, 1.23, { 0: 0, 1: 1 }], [1, 1.7, { 0: 0, 1: 1 }],
    [1, 5, { 0: 0, 1: 1 }], [0, 0.1, { 0: 0 }], [1, 0.3, { 1: 0 }], [3, 0, { 3: 0 }],
  ];
  for (const [step, time, origins] of samples) {
    const clock = { slideTime: time, stepTime: time - (origins[step] ?? 0), stepIndex: step, stepOrigins: origins };
    expect(sampleWorldUniforms(scene, clock, null, 1, 1, true)).toBe(buffer);
    expect(buffer).toEqual(Float32Array.from(sampleWorldUniforms(scene, clock)));
  }
});

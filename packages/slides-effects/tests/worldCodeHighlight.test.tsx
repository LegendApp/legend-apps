import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import type { CodeHighlight } from "@legend-apps/presentation";
import { highlightCode } from "../../presentation/src/compiler/remarkCodeHighlight";
import { CodePanel, CodeMorph, CodeTrace, Scene, expandScene, readScenes } from "../packs/world/Authoring";
import { Text3D, prepareWorldSlides } from "../packs/world/World";
import { buildWorldGraph } from "../packs/world/render";
import { cardInstances, instanceField, colorVector, compileTrack, prepareWorldScene, sampleWorldUniforms, sampleTrack, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
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

test("diff and trace animation retain syntax colors", async () => {
  const source = ' const a = 1;\n+const b = 2;';
  const highlighted = await highlightCode(source, "diff");
  const nodes = flat(expandScene(<CodeMorph id="change">{fence(source, highlighted)}</CodeMorph>)).filter(node => node.type === Text3D);
  for (const node of nodes) {
    expect(node.props.tokens).toBeDefined();
    const glyphs = text3dInstances(node.props as never);
    const syntax = (node.props.tokens as CodeHighlight["tokens"])[0].color;
    for (const stepIndex of [0, 1]) for (const stepTime of [0, .2, .7, 4]) for (const glyph of glyphs)
      expect(sampleTrack(glyph.color, { slideTime: stepTime + stepIndex, stepTime, stepIndex, stepOrigins: { 0: 0, 1: 1 } })).toEqual(colorVector(syntax));
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


test("morphs carry unchanged tokens through edits, insertions and reverse seeks with background bands only", async () => {
  const source = ' function Example() {\n-  const state = useState(0)\n+  const state = useObservable(0)\n+  const value = useValue(state)\n   return state\n-  obsolete()\n }';
  const second = ' function Example() {\n   const state = useObservable(0)\n   const value = useValue(state)\n-  return state\n+  return value\n }';
  const tree = flat(expandScene(<CodeMorph id="morph" highlight={{ opacity: .08 }}>{fence(source, await highlightCode(source, "diff-tsx"))}{fence(second, await highlightCode(second, "diff-tsx"))}</CodeMorph>));
  const text = tree.filter(node => node.type === Text3D);
  const named = (value: string) => text.filter(node => node.props.text === value);
  expect(named("useState")).toHaveLength(1);
  expect(named("useObservable")).toHaveLength(1);
  expect(named("return")).toHaveLength(1);
  const clock = (stepIndex: number, stepTime: number) => ({ slideTime: stepIndex + stepTime, stepIndex, stepTime, stepOrigins: { 0: 0, 1: 1, 2: 2 } });
  const returning = text3dInstances(named("return")[0].props as never)[0];
  expect(sampleTrack(returning.position, clock(0, 0))).not.toEqual(sampleTrack(returning.position, clock(1, 4)));
  for (const t of [0, .15, .5, 1, 4]) {
    expect(sampleTrack(returning.glyph!.opacity, clock(1, t))).toBe(1);
    expect(sampleTrack(returning.glyph!.opacity, clock(2, t))).toBe(1);
  }
  const unchanged = text3dInstances(named("Example")[0].props as never)[0];
  expect(unchanged.position.frames).toEqual([]);
  expect(unchanged.glyph!.opacity.frames).toEqual([]);
  const old = text3dInstances(named("useState")[0].props as never)[0], next = text3dInstances(named("useObservable")[0].props as never)[0];
  expect(sampleTrack(old.glyph!.opacity, clock(0, 4))).toBe(1);
  expect(sampleTrack(old.glyph!.opacity, clock(1, 4))).toBe(0);
  expect(sampleTrack(next.glyph!.opacity, clock(0, 4))).toBe(0);
  expect(sampleTrack(next.glyph!.opacity, clock(1, 4))).toBe(1);
  expect(sampleTrack(old.glyph!.opacity, clock(0, 0))).toBe(1);
  expect(sampleTrack(next.glyph!.opacity, clock(0, 0))).toBe(0);
  const strikes = tree.filter(node => String(node.props.id).endsWith("/strike"));
  expect(strikes).toHaveLength(1);
  expect(sampleTrack(compileTrack(strikes[0].props.position as never), clock(1, 4))[1]).toBeCloseTo(-3 * .27);
  const bands = tree.filter(node => String(node.props.id).includes("/band"));
  expect(bands.length).toBeGreaterThan(0);
  expect(bands.every(node => node.props.color === "#5a96ff" && node.props.fill === .3 && node.props.line === 1 && node.props.radius === -4)).toBe(true);
  expect(bands.every(node => node.props.flat && node.props.glow === 0)).toBe(true);
  const prepared = prepareWorldScene({ instances: bands.flatMap(node => cardInstances(node.props as never)) });
  const uniforms = sampleWorldUniforms(prepared, clock(1, 4), null, 1, 1, true);
  for (let i = 0; i < prepared.instances.length; i++) {
    const base = worldHeaderSize + i * worldInstanceSize;
    expect(uniforms[base + instanceField.geometry]).toBe(1);
    expect(uniforms[base + instanceField.opacity]).toBeCloseTo(sampleTrack(prepared.instances[i].card!.opacity!, clock(1, 4)));
    expect(uniforms[base + 4]).toBeCloseTo(colorVector("#5a96ff")[0]);
    expect(uniforms[base + instanceField.albedo]).toBeCloseTo(colorVector("#8cb9ff")[0]);
    expect(uniforms[base + 11]).toBe(-4);
    expect(uniforms[base + 15]).toBe(1);
    expect(uniforms[base + 17] * .22).toBeCloseTo(.55);
  }
  expect(bands.some(node => sampleTrack(compileTrack(node.props.opacity as never), clock(1, 4)) === .08)).toBe(true);
});

test("morphs band each run of new tokens on a changed line, but not wholly new lines", async () => {
  const source = '-import { a } from "react"\n+import { b, c } from "x/react"\n+const z = 1';
  const tree = flat(expandScene(<CodeMorph id="m" highlight={{ word: { opacity: .3 } }}>{fence(source, await highlightCode(source, "diff-tsx"))}</CodeMorph>));
  const words = tree.filter(node => String(node.props.id).includes("/word"));
  expect(words.map(node => node.props.id)).toEqual(["m/word0/0/9", "m/word0/0/22"]);
  expect(words.every(node => node.props.color === "#5a96ff")).toBe(true);
  const advance = (words[0].props.scale as number[])[0] - .08;
  expect((words[1].props.scale as number[])[0] - .08).toBeCloseTo(advance * 2 / 4);
  const clock = (stepIndex: number, stepTime: number) => ({ slideTime: stepIndex + stepTime, stepIndex, stepTime, stepOrigins: { 0: 0, 1: 1 } });
  expect(sampleTrack(compileTrack(words[0].props.opacity as never), clock(0, 4))).toBe(0);
  expect(sampleTrack(compileTrack(words[0].props.opacity as never), clock(1, 4))).toBeCloseTo(.3);
});

test("morph highlights clear on the next step and restore on reverse seeks", async () => {
  const source = "-const value = first()\n+const value = second()";
  const second = "-const value = second()\n+const value = third()";
  const tree = flat(expandScene(<CodeMorph id="m" marks={[{ text: "value", step: 1 }, { text: "third", step: 2 }]}>
    {fence(source, await highlightCode(source, "diff-tsx"))}
    {fence(second, await highlightCode(second, "diff-tsx"))}
  </CodeMorph>));
  const highlights = tree.filter(node => /\/(band|word|mark)/.test(String(node.props.id)));
  const scene = prepareWorldScene({ instances: highlights.flatMap(node => cardInstances(node.props as never)) });
  for (const stepIndex of [1, 2, 3, 2, 1, 3]) for (const stepTime of [0, .1, 1]) {
    const clock = { slideTime: stepIndex + stepTime, stepIndex, stepTime, stepOrigins: { 0: 0, 1: 1, 2: 2, 3: 3 } };
    const uniforms = sampleWorldUniforms(scene, clock, null, 1, 1, true);
    highlights.forEach((node, index) => {
      const id = String(node.props.id), active = /\/(band|word|mark)0\//.test(id) ? 1 : 2;
      const visible = id.includes("/mark") ? (sampleTrack(compileTrack(node.props.scale as never), clock) as number[])[0]
        : uniforms[worldHeaderSize + index * worldInstanceSize + instanceField.opacity];
      if (stepIndex > active) expect(visible).toBe(0);
      if (stepIndex === active && stepTime === 1 && !id.includes("/band0/0/") && !id.includes("/band1/0/"))
        expect(visible).toBeGreaterThan(0);
    });
  }
});

for (const opacity of [0, .2, 1]) test(`code highlights composite over their opaque backing at opacity ${opacity}`, async () => {
  const source = "const value = 1;\nprint(value);\nreturn value;";
  const highlighted = await highlightCode(source, "ts");
  const compact = "const value = 1;\nreturn value;";
  const diff = "-const value = 1;\n+const value = 2;";
  const variants = [
    <CodePanel id="code" marks={[{ text: "value", opacity }]}>{fence(source, highlighted)}</CodePanel>,
    <CodeMorph id="code" highlight={{ opacity, initial: false }}>{fence(diff, await highlightCode(diff, "diff-ts"))}</CodeMorph>,
    <CodeTrace id="code" source={0} reads={[2]} nodes={["Owner", "Reader"]} highlight={{ opacity }}>{fence(source, highlighted)}</CodeTrace>,
    <CodeTrace id="code" source={0} reads={[2]} nodes={["Owner", "Reader"]} highlight={{ opacity }}>
      {fence(source, highlighted)}{fence(compact, await highlightCode(compact, "ts"))}
    </CodeTrace>,
  ];
  for (const [variant, children] of variants.entries()) {
    const scene = prepareWorldSlides([{ children: expandScene(children) }])[0].scenePlan!.content.prepared;
    const pass = buildWorldGraph(scene).passes.find(p => p.id === "sharp-cards")!;
    expect(pass).toMatchObject({ blend: "over", depthCompare: "less-equal" });
    const expression = pass.code.match(/let alpha=(layer\.a[^;]+);/)![1];
    const alphaAt = new Function("fill", "opacity", "return " + expression.replace("layer.a", "fill"));
    const cards = scene.instances.filter(part => part.card);
    const highlights = cards.filter(part => part.card!.flat);
    expect(highlights.length).toBeGreaterThan(0);
    for (const stepIndex of [0, 1, 2, 1, 0]) for (const stepTime of [0, .2, 1]) {
      const values = sampleWorldUniforms(scene, { slideTime: stepIndex + stepTime, stepIndex, stepTime, stepOrigins: { 0: 0, 1: 1, 2: 2 } });
      const at = (part: typeof cards[number]) => worldHeaderSize + scene.instances.indexOf(part) * worldInstanceSize;
      for (const highlight of highlights) {
        const h = at(highlight), point = values.slice(h, h + 3);
        point[2] += values[h + instanceField.scale + 2] * values[h + instanceField.radius];
        let depth = Infinity, scenery = 1;
        // Intersect a ray from the sampled eye through the band's interior with the actual card draw range.
        for (const card of cards) {
          const base = at(card), half = values.slice(base + instanceField.scale, base + instanceField.scale + 3).map(v => v * values[base + instanceField.radius]);
          const t = (values[base + 2] + half[2] - values[2]) / (point[2] - values[2]);
          const x = values[0] + t * (point[0] - values[0]), y = values[1] + t * (point[1] - values[1]);
          if (half[0] <= .0001 || half[1] <= .0001 || Math.abs(x - values[base]) >= half[0] || Math.abs(y - values[base + 1]) >= half[1]) continue;
          const alpha = alphaAt(card.card!.fill, values[base + instanceField.opacity]);
          if (alpha < .003 || t > depth) continue;
          scenery *= 1 - alpha;
          depth = t;
        }
        expect(scenery, `variant ${variant}, ${highlight.id}, step ${stepIndex}, time ${stepTime}`).toBeCloseTo(0);
      }
    }
  }
});

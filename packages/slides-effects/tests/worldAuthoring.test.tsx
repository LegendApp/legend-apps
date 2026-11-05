import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import path from "node:path";
import { createRequire } from "node:module";
import { compileDeck } from "../../presentation/src/compiler";
import { Bars, CodeMorph, CodePanel, Counter, Headline, Keys, Rule, Scene, Tree, codeSource, defineSceneLayout, expandScene, laneScene, placeTree, readScenes, sceneLayouts } from "../packs/world/Authoring";
import { Box, Burst, Camera, Card, Custom, Pillar, RoundedBox, RoutedTube, Stage, Text3D, WorldSlide } from "../packs/world/World";

const fence = <pre><code className="language-tsx">{"function Example() {\n  return 42;\n}\n"}</code></pre>;
const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);

test("literal fences and scene declarations preserve code, layout and identity without mounting", () => {
  const content = [<Scene id="one" durations={[4, 6]}>
    <Headline id="title" at={[-4, 2, 0]}>A <em>title</em></Headline>
    <CodePanel id="source" at={[2, 4, 0]}>{fence}</CodePanel>
  </Scene>, <Scene id="two"><Counter id="count" label="COUNT" /></Scene>];
  const scenes = readScenes(content);
  expect(scenes[0].parts[0].text).toBe("A title");
  expect(scenes.map(s => s.durations)).toEqual([[4, 6], [6]]);
  expect(scenes[0].parts[1].text).toBe("function Example() {\n  return 42;\n}");
  expect(scenes[0].parts[1].at).toEqual([2, 4, 0]);
  const geometry = flat(expandScene(content[0].props.children));
  const panel = geometry.find(node => node.type === Stage && node.props.id === "source")!;
  expect(panel.props.position).toEqual([2, 4, 0]);
  expect(geometry.find(node => node.type === Text3D && node.props.id === "source/code")!.props.text).toBe(scenes[0].parts[1].text);
  expect(geometry.some(node => node.type === Card && node.props.id === "source/card")).toBe(true);
  expect(codeSource(fence)).toEndWith("\n}\n");
});

test("tree labels, stable ids and parent layout survive edits; malformed declarations fail clearly", () => {
  const nodes = [{ id: "root", label: "Owner" }, { id: "child", label: "Child", p: 0, x: 3 }];
  const tree = flat(expandScene(<Tree id="tree" nodes={nodes} />));
  const assembly = tree.find(node => node.type === Stage && node.props.id === "tree/child/assembly")!.props.position as { value: number[] }[];
  expect(assembly.at(-1)!.value).toEqual([3, .35, 0]);
  expect(tree.find(node => node.type === RoundedBox && node.props.id === "tree/child")!.props.material).toMatchObject({ metal: .85, roughness: .3 });
  expect(tree.some(node => node.type === Burst && node.props.id === "tree/child/landing")).toBe(true);
  expect(tree.find(node => node.type === Text3D && node.props.id === "tree/root/label")!.props.text).toBe("Owner");
  expect(() => readScenes([<Scene id="bad"><Headline id="same">A</Headline><Headline id="same">B</Headline></Scene>])).toThrow("Duplicate scene part");
  expect(() => readScenes([<Scene id="bad"><Tree id="tree" nodes={[{ id: "cycle", p: 0 }]} /></Scene>])).toThrow("parent must precede child");
});


test("a named layout places parts by kind and order; a named slot and explicit props win", () => {
  const [slide] = readScenes([<Scene id="tree" layout="track-left">
    <Headline id="title">Title</Headline>
    <Headline id="caption">Caption</Headline>
    <Headline id="caption2" slot="subtitle" delay={.1}>Other</Headline>
    <Headline id="free" at={[1,2,3]}>Free</Headline>
    <Counter id="a" label="A" />
    <Counter id="b" label="B" />
  </Scene>]);
  const part = (id: string) => slide.parts.find(p => p.id === id)!, slots = sceneLayouts["track-left"].slots;
  expect(part("title").at).toEqual(slots.title.at);
  expect(part("caption").at).toEqual(slots.subtitle.at);
  expect(part("caption2").at).toEqual(slots.subtitle.at);
  expect(part("caption2").delay).toBe(.1);
  expect(part("free").at).toEqual([1,2,3]);
  expect(part("free").size).toBe(slots.note.size);
  expect(part("b").at).toEqual(slots.stat2.at);
  expect(slide.camera).toEqual(sceneLayouts["track-left"].camera);
  expect(readScenes([<Scene id="c" layout="track-left" camera={{ duration: 2 }} />])[0].camera).toEqual({ ...sceneLayouts["track-left"].camera, duration: 2 });
  expect(() => readScenes([<Scene id="bad" layout="track-left"><Headline id="x" slot="nope">X</Headline></Scene>])).toThrow("Unknown layout slot: nope");
});

test("layouts place parts and frame the station; step camera moves come from the slide", () => {
  for (const [name, layout] of Object.entries(sceneLayouts)) expect([name, layout.camera?.steps]).toEqual([name, undefined]);
  const steps = { 2: { orbit: 30, duration: 1.6 } };
  expect(readScenes([<Scene id="list" layout="keys" camera={{ steps }} />])[0].camera).toEqual({ ...sceneLayouts.keys.camera, steps });
});

test("layouts and roles: unknown names fail without prepare, stay labels with it, and decks can add layouts", () => {
  const prepare = () => ({ elements: [], starts: [0], end: 1, slideBeats: [0], tracks: [] });
  expect(() => readScenes([<Scene id="bad" layout="nope" />])).toThrow("Unknown scene layout: nope");
  const [labelled] = readScenes([<Scene id="ok" layout="role" prepare={prepare}><Headline id="h" at={[0,1,0]}>H</Headline></Scene>]);
  expect(labelled.layout).toBe("role");
  expect(labelled.parts[0].at).toEqual([0,1,0]);
  expect(labelled.parts[0].size).toBeUndefined();
  defineSceneLayout("custom", { slots: { only: { kind: "headline", at: [9,9,9] } } });
  expect(flat(expandScene(<Headline id="h">H</Headline>, "custom"))[0].props.position).toEqual([9,9,9]);
  delete sceneLayouts.custom;
});

test("generic parts render from layouts without coordinates", () => {
  const nodes = placeTree([{ id: "root" }, { id: "a", p: 0 }, { id: "b", p: 0 }, { id: "a1", p: 1 }, { id: "a2", p: 1 }]);
  expect(nodes.map(n => [n.x, n.y])).toEqual([[0,2],[-2.9,.35],[2.9,.35],[-4.3,-1.3],[-1.5,-1.3]]);
  const beat = { start: 2, every: 1.5, count: 2 };
  const parts = flat(expandScene(<>
    <Headline id="big">Big</Headline>
    <Rule id="rule" />
    <Counter id="n" label="N" per={3} beat={beat} />
    <Tree id="t" nodes={[{ id: "root" }, { id: "kid", p: 0 }]} beat={beat} />
  </>, "statement"));
  const line = parts.find(n => n.props.id === "big")!, size = 1.25 * 100 / 72;
  expect(line.type).toBe(Text3D);
  expect(line.props.position).toEqual(sceneLayouts.statement.slots.line1.at as number[]);
  expect(line.props.size).toBeCloseTo(size);
  expect(line.props.depth).toBeCloseTo(.32 / size);
  expect(line.props.uppercase).toBe(true);
  expect(parts.find(n => n.props.id === "rule")!.type).toBe(Box);
  expect(parts.filter(n => n.type === Text3D && String(n.props.id).startsWith("n/value")).map(n => n.props.text)).toEqual(["0","3","6"]);
  expect((parts.find(n => n.type === RoutedTube)!.props.pulses as { at: number }[]).map(p => p.at)).toEqual([2,3.5]);
  const bars = flat(expandScene(<Bars id="b" items={[{ label: "A", value: 10 }, { label: "B", value: 5 }]} />, "title-bars"));
  expect(bars.filter(n => n.type === Pillar).map(n => [n.props.value, n.props.maximum])).toEqual([[10,10],[5,10]]);
});

test("leaf layout, tree flashes, key recycling and diff morphs come from props alone", () => {
  const nodes = placeTree([{ id: "r" }, { id: "a", p: 0 }, { id: "b", p: 0 }, { id: "a1", p: 1 }, { id: "a2", p: 1 }, { id: "b1", p: 2 }], { width: 12, levelHeight: 1 });
  expect(nodes.map(n => [n.x, n.y])).toEqual([[0,2],[-2,1],[4,1],[-4,0],[0,0],[4,0]]);
  const tree = flat(expandScene(<Tree id="t" nodes={[{ id: "p" }, { id: "m", p: 0 }, { id: "c", p: 1 }]} color="#555555"
    flash={[{ step: 1, color: "#ff0000", wave: false, from: "p", ids: ["c"] }]} />));
  expect(tree.filter(n => String(n.props.id).endsWith("/beam")).map(n => n.props.id)).toEqual(["t/c/beam"]);
  expect(tree.find(n => n.props.id === "t/m")!.props.color).toBe("#555555");
  expect((tree.find(n => n.props.id === "t/c")!.props.color as { value: string }[]).map(k => k.value)).toEqual(["#555555", "#ff0000"]);
  const keys = flat(expandScene(<Keys id="k" keys={["A", "B"]} next={["B", "C"]} />));
  const recycled = keys.find(n => n.props.id === "k/A")!.props.position as { value: number[] }[];
  expect(recycled[recycled.length - 1].value).toEqual([0, -.95, 0]);
  expect(keys.filter(n => String(n.props.id).startsWith("k/link/")).map(n => n.props.id)).toEqual(["k/link/B"]);
  const diff = (lines: string[]) => <pre><code className="language-diff">{lines.join("\n") + "\n"}</code></pre>;
  const morph = flat(expandScene(<CodeMorph id="m">{diff([" a", "-b", "+c"])}{diff([" a", " c", "+d"])}</CodeMorph>));
  expect(morph.filter(n => n.type === Text3D).map(n => n.props.text)).toEqual(["a", "b", "c", "d"]);
  expect(morph.filter(n => String(n.props.id).endsWith("/strike"))).toEqual([]);
  expect(() => expandScene(<CodeMorph id="bad">{diff([" a"])}{diff([" z", "+d"])}</CodeMorph>)).toThrow("diff 1 must start from the previous code");
  const marked = flat(expandScene(<CodeMorph id="mk" step={2} marks={[{ text: "b", step: 1 }, { text: "c", step: 3 }]}>{diff([" ab", " b"])}{diff([" ab", "-b", "+c"])}</CodeMorph>));
  const marks = marked.filter(n => String(n.props.id).startsWith("mk/mark"));
  expect(marks.map(n => n.props.id)).toEqual(["mk/mark0/0/1", "mk/mark0/1/0", "mk/mark1/1/0"]);
  expect((marks[0].props.scale as { step: number }[]).map(k => k.step)).toEqual([0, 1]);
});

test("lane scenes fly parts into the next scene's tree and bars, which grow in as they land", () => {
  const beat = { start: 2, every: 1.5, count: 2 };
  const scenes = [
    { layout: "statement", parts: <><Headline id="we" into="tree">Hi yo</Headline><Rule id="rule" /></> },
    { layout: "track-left", parts: <><Tree id="tree" into="bars" beat={beat} nodes={[{ id: "r" }, { id: "a", p: 0, typed: "Ada" }, { id: "b", p: 0, quiet: true }]} />
      <Counter id="n" label="N" per={3} beat={beat} /></> },
    { layout: "title-bars", parts: <Bars id="bars" items={[{ label: "A", value: 10 }, { label: "B", value: 5 }]} /> },
  ];
  const second = flat(laneScene(scenes, 1, { handheld: .02 }));
  const shots = second.find(n => n.type === Camera)!.props.shots as { at: number; position: number[]; idle?: unknown }[];
  expect(shots.map(s => [s.at, s.position[2]])).toEqual([[0, 11.6], [.25, 13 - 32]]);
  expect(shots[1].idle).toEqual({ position: [.02, .02, .02], speed: .37 });
  const flyer = second.find(n => n.props.id === "we/out")!;
  const motion = (flyer.props.glyphs as (i: number, ch: string, home: number[]) => { offset: { value: number[] }[] })(0, "H", [-1, 0, 0]);
  const at = sceneLayouts.statement.slots.line1.at as number[], node = sceneLayouts["track-left"].slots.tree.at as number[];
  expect(motion.offset[motion.offset.length - 1].value.map(v => +v.toFixed(3))).toEqual([0 - (at[0] - 1), +(node[1] + 2 - at[1]).toFixed(3), -32]);
  expect(second.find(n => n.props.id === "rule/out")!.type).toBe(Box);
  expect(second.find(n => n.type === Custom)!.props.count).toBe(4 * 14);
  const root = second.find(n => n.props.id === "tree/r")!.props.scale as { at: number }[];
  expect(root[1].at).toBe(1.25);
  expect((second.find(n => n.props.id === "tree/r")!.props.emissive as { at: number; value: number }[]).filter(k => k.value === .45).map(k => k.at)).toEqual([2, 3.5]);
  expect(second.find(n => n.props.id === "tree/b")!.props.emissive).toBe(.006);
  expect(second.filter(n => String(n.props.id).startsWith("tree/a/typed")).map(n => n.props.text)).toEqual(['"A"', '"Ad"']);
  const third = flat(laneScene(scenes, 2));
  expect(third.filter(n => n.type === Card && String(n.props.id).startsWith("tree/out/")).length).toBe(3);
  expect(third.find(n => n.props.id === "n/out")!.type).toBe(Stage);
  expect(third.filter(n => String(n.props.id).startsWith("n/out/value")).map(n => n.props.text)).toEqual(["6"]);
  expect(third.find(n => n.type === Pillar)!.props.at).toBe(1.3);
  expect(() => laneScene([scenes[0], scenes[2]], 1)).toThrow("must be a tree or bars");
});

test("the real MDX compiler resolves scene parts, code fences and presenter notes", async () => {
  const source = [
    'import { Scene, CodePanel } from "slides:world/Authoring"',
    'import { Card } from "slides:world/World"', '',
    '<Scene id="code" world="example"><CodePanel id="sample" at={[-4,3,0]}>', '',
    '```tsx', 'function Example() {', '  return 42;', '}', '```', '',
    '</CodePanel></Scene>', '', '<!-- Only presenter notes -->', '', '---', '',
    '<Scene id="column" world="example"><Card id="sample/card" position={[0,2,0]} scale={[1,4,1]} /></Scene>',
  ].join("\n");
  const root = path.resolve(import.meta.dirname, "../../..");
  const result = await compileDeck(path.join(root, "apps/slides/examples/demo.mdx"), {
    source, effectPacksDirectory: path.join(root, "packages/slides-effects/packs"),
  });
  if (!result.success) throw Error(result.errors.join("\n"));
  expect(result.warnings).toEqual([]);
  const require = createRequire(import.meta.url), module = { exports: {} as { default: React.ComponentType<{ components: Record<string, unknown> }> } };
  Function("require", "module", "exports", result.code)(require, module, module.exports);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let document: React.ReactNode, renderer: ReturnType<typeof create> | undefined;
  function CaptureDeck({ children }: { children?: React.ReactNode }) { document = children; return null; }
  const Document = module.exports.default;
  try {
    // Mount the compiled document with its real React memo hooks; inspect declarations without mounting their scenes.
    await act(() => { renderer = create(<Document components={{ Deck: CaptureDeck, Slide: "slide" }} />); });
    const parts = flat(document), panel = parts.find(node => node.props.id === "sample")!;
    expect(codeSource(panel.props.children as React.ReactNode)).toBe("function Example() {\n  return 42;\n}\n");
    expect(parts.filter(node => node.type === "slide").map(node => node.props.notes)).toEqual(["Only presenter notes", ""]);
    expect(parts.some(node => node.props.id === "sample/card")).toBe(true);
  } finally { if (renderer) await act(() => renderer!.unmount()); }

}, 30000);

test("re-rendering a compiled scene keeps its one plan, so every surface keeps one baked scene", async () => {
  const source = [
    'import { Scene } from "slides:world/Authoring"', '',
    'export function prepareScene(slides) { globalThis.__scenePlans = (globalThis.__scenePlans ?? 0) + 1; return { elements: [], tracks: [], slideBeats: [0], starts: [0, 1], end: 2 }; }', '',
    '<Scene id="one" world="example" prepare={prepareScene} durations={[1, 1]} />',
  ].join("\n");
  const root = path.resolve(import.meta.dirname, "../../..");
  const result = await compileDeck(path.join(root, "apps/slides/examples/demo.mdx"), {
    source, effectPacksDirectory: path.join(root, "packages/slides-effects/packs"),
  });
  if (!result.success) throw Error(result.errors.join("\n"));
  const require = createRequire(import.meta.url), module = { exports: {} as { default: React.ComponentType<{ components: Record<string, unknown> }> } };
  Function("require", "module", "exports", result.code)(require, module, module.exports);
  const { DeckContentContext, PresentationObservableProvider } = require("@legend-apps/presentation");
  const { observable } = require("@legendapp/state");
  const runtime$ = observable({ stepIndex: 0 });
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean; __scenePlans?: number };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  globals.__scenePlans = 0;
  let rerender: () => void = () => {};
  function Deck({ children }: { children?: React.ReactNode }) {
    const [, set] = React.useState(0);
    rerender = () => set(value => value + 1);
    // As the real deck does, each render publishes a new content array with the same declarations.
    const slides = React.Children.toArray(children);
    return <DeckContentContext.Provider value={slides}><PresentationObservableProvider value={runtime$}>{children}</PresentationObservableProvider></DeckContentContext.Provider>;
  }
  const Document = module.exports.default;
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(() => { renderer = create(<Document components={{ Deck, Slide: ({ children }: { children?: React.ReactNode }) => children }} />); });
    expect(globals.__scenePlans).toBe(1);
    await act(() => { rerender(); });
    await act(() => { runtime$.stepIndex.set(1); });
    expect(globals.__scenePlans).toBe(1);
  } finally { if (renderer) await act(() => renderer!.unmount()); }
}, 30000);


test("per-slide layout framing keeps the default rail gentle unless via controls are authored", async () => {
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(() => { renderer = create(<Scene id="gentle-layout" layout="keys" camera={{ turn: 0, rise: 0 }} />); });
    const track = renderer!.root.findByType(WorldSlide).props.track;
    expect(track.position).toEqual(sceneLayouts.keys.camera!.position);
    expect(track.target).toEqual(sceneLayouts.keys.camera!.target);
    expect(track.via).toBeUndefined();
    expect(track.viaTarget).toBeUndefined();
    const via: [number, number, number] = [1, 5, 20];
    await act(() => renderer!.update(<Scene id="gentle-layout" layout="keys" camera={{ via }} />));
    expect(renderer!.root.findByType(WorldSlide).props.track.via).toEqual(via);
  } finally { await act(() => renderer?.unmount()); }
});

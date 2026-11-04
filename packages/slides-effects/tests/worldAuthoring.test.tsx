import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import path from "node:path";
import { createRequire } from "node:module";
import { compileDeck } from "../../presentation/src/compiler";
import { Bars, CodePanel, Counter, Headline, Rule, Scene, Tree, codeSource, defineSceneLayout, expandScene, placeTree, readScenes, sceneLayouts } from "../packs/world/Authoring";
import { Box, Card, Pillar, RoutedTube, Stage, Text3D } from "../packs/world/World";

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
  expect(tree.find(node => node.type === Card && node.props.id === "tree/child")!.props.position).toEqual([3, .35, 0]);
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

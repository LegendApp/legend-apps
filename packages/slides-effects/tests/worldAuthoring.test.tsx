import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import path from "node:path";
import { createRequire } from "node:module";
import { compileDeck } from "../../presentation/src/compiler";
import { CodePanel, Counter, Headline, Scene, Tree, codeSource, expandScene, readScenes } from "../packs/world/Authoring";
import { Card, Stage, Text3D } from "../packs/world/World";

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
  expect(tree.find(node => node.type === Card && node.props.id === "tree/child")!.props.position).toEqual([3, 2 - 1.65, 0]);
  expect(tree.find(node => node.type === Text3D && node.props.id === "tree/root/label")!.props.text).toBe("Owner");
  expect(() => readScenes([<Scene id="bad"><Headline id="same">A</Headline><Headline id="same">B</Headline></Scene>])).toThrow("Duplicate scene part");
  expect(() => readScenes([<Scene id="bad"><Tree id="tree" nodes={[{ id: "cycle", p: 0 }]} /></Scene>])).toThrow("parent must precede child");
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

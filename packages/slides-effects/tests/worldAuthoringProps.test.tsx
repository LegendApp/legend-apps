import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import path from "node:path";
import { createRequire } from "node:module";
import { compileDeck } from "../../presentation/src/compiler";
import { Bars, CodePanel, Headline, Keys, Rule, Scene, expandScene, readScenes } from "../packs/world/Authoring";
import { checkPart, checkScene, defaultColors, enterDefaults, exitDefaults } from "../packs/world/authoringProps";
import { Box, Card, Fog, Orbs, Pillar, Stage, Text3D, prepareWorldSlides } from "../packs/world/World";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const find = (node: React.ReactNode, type: unknown, id: string) => flat(node).find(n => n.type === type && n.props.id === id)!;

test("invalid props fail naming the MDX line, the element and the prop", () => {
  const at = { mdxSource: "talk.mdx:12" };
  const fails = (check: () => void) => { try { check(); } catch (error) { return (error as Error).message; } throw Error("expected a failure"); };
  expect(fails(() => checkPart("headline", { ...at, id: "t", enter: { duration: -1 } }))).toBe('talk.mdx:12: <Headline id="t"> enter.duration must be a number of seconds > 0 (got -1).');
  expect(fails(() => checkPart("headline", { ...at, id: "t", dely: 1 }))).toBe('talk.mdx:12: <Headline id="t"> Unknown prop dely. Did you mean delay?');
  expect(fails(() => checkPart("rule", { id: "r", exit: { delay: 1 } }))).toBe('<Rule id="r"> exit.step is required.');
  expect(fails(() => checkPart("rule", { id: "r", color: "red" }))).toStartWith('<Rule id="r"> color must be #RGB, #RRGGBB or a theme color (text, muted');
  expect(fails(() => checkPart("bars", { id: "b", items: [{ label: "A" }] }))).toBe('<Bars id="b"> items[0].value is required.');
  expect(fails(() => checkPart("code", { id: "c", marks: [{ text: "x", step: 1.5 }] }))).toBe('<CodePanel id="c"> marks[0].step must be a step number (0, 1, 2…) (got 1.5).');
  expect(fails(() => checkScene({ ...at, id: "s", camera: { ease: "bounce" } }))).toBe('talk.mdx:12: <Scene id="s"> camera.ease must be one of "linear", "cubic", "out", "smoothstep", "expo", "spring" (got "bounce").');
  expect(fails(() => checkScene({ id: "s", camera: { steps: { 2: { orbit: 30, durtion: 1 } } } }))).toBe('<Scene id="s"> Unknown prop camera.steps[2].durtion. Did you mean camera.steps[2].duration?');
  expect(fails(() => checkScene({ id: "s", colors: { accent: "accent" } }))).toBe('<Scene id="s"> colors.accent must be #RGB or #RRGGBB (got "accent").');
  expect(fails(() => checkScene({ id: "s", ambient: ["dust", "snow"] }))).toStartWith('<Scene id="s"> ambient must be an ambient effect or a list of them');
  expect(fails(() => readScenes([<Scene id="s" layout="nope" />]))).toStartWith('<Scene id="s"> Unknown scene layout: nope.');
  // Props World passes through, and animated values, are not second-guessed.
  checkPart("headline", { id: "t", side: "#000", color: { 0: "#fff", 1: "accent" }, font: {}, glyphs: () => undefined });
  checkScene({ id: "s", clock: "step", quality: "high", camera: { fixed: ["dust:"], bank: 1.5, carry: { lift: 3 } } });
});

test("parts keep their geometry without the new props, and enter, exit and carry take documented defaults", () => {
  const plain = expandScene(<><Rule id="rule" /><Headline id="title">Hi</Headline></>);
  expect(flat(plain).some(n => n.type === Stage && String(n.props.id).endsWith("/motion"))).toBe(false);
  expect(find(plain, Text3D, "title").props.enter).toEqual({ at: undefined, offset: [-8, 0, -2], scale: 0, stagger: .025, duration: .8 });
  expect(find(plain, Text3D, "title").props.color).toBeUndefined();

  const moving = expandScene(<>
    <Rule id="rule" enter={{ step: 1 }} exit={{ step: 2, to: [0, 9, 0] }} />
    <Headline id="title" enter={{ delay: .4, from: [0, -3, 0], ease: "expo" }} exit={{ step: 1 }}>Hi</Headline>
    <Headline id="fresh" carry={false}>New</Headline>
  </>, undefined, { id: "slide2" });
  expect(find(moving, Stage, "rule/motion").props.position).toEqual([{ step: 0, value: enterDefaults.from },
    { step: 1, delay: 0, value: [0, 0, 0], duration: enterDefaults.duration, ease: "cubic" }, { step: 2, delay: 0, value: [0, 9, 0], duration: exitDefaults.duration, ease: "cubic" }]);
  const title = find(moving, Text3D, "title");
  expect(title.props.enter).toEqual({ at: .4, offset: [0, -3, 0], scale: 0, stagger: .025, duration: .8, ease: "expo" });
  expect(title.props.opacity).toEqual([{ step: 0, value: 1 }, { step: 1, delay: 0, value: 0, duration: exitDefaults.duration }]);
  expect(find(moving, Stage, "title/motion").props.position).toEqual([{ step: 0, value: [0, 0, 0] }, { step: 1, delay: 0, value: exitDefaults.to, duration: .8, ease: "cubic" }]);
  expect(find(moving, Text3D, "fresh@slide2")).toBeDefined();
});

test("scene colors theme the parts, and color props take theme names", () => {
  const plain = expandScene(<Rule id="rule" />);
  expect(find(plain, Box, "rule").props.color).toBe(defaultColors.accent);
  const themed = expandScene(<>
    <Rule id="rule" />
    <Headline id="title" color="highlight">Hi</Headline>
    <Keys id="keys" keys={["A", "B"]} next={["B", "C"]} />
  </>, undefined, { id: "s", colors: { accent: "#00ff00", highlight: "#123456", added: "#abcdef" } });
  expect(find(themed, Box, "rule").props.color).toBe("#00ff00");
  expect(find(themed, Text3D, "title").props.color).toBe("#123456");
  expect(find(themed, Card, "keys/copy/C/card").props.color).toBe("#abcdef");
  const [slide] = readScenes([<Scene id="s" layout="track-left" colors={{ muted: "#111111" }}><Headline id="a">A</Headline><Headline id="b">B</Headline></Scene>]);
  expect(slide.parts[1].color).toBe("#111111");
});

test("code panels and bar charts take style props with the old look as defaults", () => {
  const fence = "const a = 1;\n";
  const plain = expandScene(<CodePanel id="code">{fence}</CodePanel>);
  expect(find(plain, Card, "code/card").props).toMatchObject({ fill: .75, color: undefined });
  const styled = expandScene(<CodePanel id="code" fill={.4} padding={.5} panelColor="idle" textColor="hot" marks={[{ text: "a", color: "link" }]}>{fence}</CodePanel>);
  const card = find(styled, Card, "code/card");
  expect(card.props).toMatchObject({ fill: .4, color: defaultColors.idle });
  expect((card.props.scale as number[])[0] - (find(plain, Card, "code/card").props.scale as number[])[0]).toBeCloseTo(.4);
  expect(find(styled, Text3D, "code/code").props.color).toBe(defaultColors.hot);
  expect(flat(styled).find(n => String(n.props.id).startsWith("code/mark0/"))!.props.color).toBe(defaultColors.link);

  const items = [{ label: "A", value: 2 }, { label: "B", value: 4, color: "added" }];
  const bar = (node: React.ReactNode, i: number) => find(node, Pillar, `bars/${i}`).props;
  const before = expandScene(<Bars id="bars" items={items} />);
  expect(bar(before, 0)).toMatchObject({ maximum: 4, height: 4.3, width: 1.5, depth: 1.5, position: [-1.7, 0, 0], at: 1, duration: 1.6, ease: "out" });
  expect(bar(before, 1).color).toBe(defaultColors.added);
  const after = expandScene(<Bars id="bars" items={items} max={8} height={6} width={1} gap={2} delay={0} stagger={.5} duration={1} ease="linear" color="link" />);
  expect(bar(after, 0)).toMatchObject({ maximum: 8, height: 6, width: 1, depth: 1, position: [-1, 0, 0], at: 0, duration: 1, ease: "linear", color: defaultColors.link });
  expect(bar(after, 1).at).toBe(.5);
});

test("a scene's ambient effects come before its parts", () => {
  const scene = expandScene(<Rule id="rule" />, undefined, { id: "s", backgroundColor: "#010203", ambient: ["dust", { effect: "orbs", count: 5, color: "accent" }, "fog", "trails"] });
  const nodes = flat(scene);
  expect(nodes.find(n => n.type === Orbs && n.props.id === "ambient-dust")!.props.count).toBe(320);
  expect(nodes.find(n => n.type === Orbs && n.props.id === "ambient-orb")!.props).toMatchObject({ count: 5, colors: [defaultColors.accent] });
  expect(nodes.find(n => n.type === Fog)!.props.color).toBe("#010203");
  expect(nodes.some(n => n.props.id === "trails")).toBe(true);
  expect(nodes.findIndex(n => n.props.id === "rule")).toBeGreaterThan(nodes.findIndex(n => n.type === Fog));
});

test("the compiler marks authoring elements with their MDX line, so a bad prop names it", async () => {
  const source = [
    "---", "title: Props", "---", "",
    'import { Scene, Headline as Title } from "slides:world/Authoring"', "",
    "<!-- A note that shifts nothing -->", "",
    '<Scene id="one" world="example" camera={{ ease: "linear" }}>',
    '  <Title id="ok">Fine</Title>',
    "</Scene>", "", "---", "",
    '<Scene id="two" world="example">',
    '  <Title id="bad" enter={{ duration: 0 }}>Broken</Title>',
    "</Scene>",
  ].join("\n");
  const root = path.resolve(import.meta.dirname, "../../..");
  const result = await compileDeck(path.join(root, "apps/slides/examples/demo.mdx"), { source, effectPacksDirectory: path.join(root, "packages/slides-effects/packs") });
  if (!result.success) throw Error(result.errors.join("\n"));
  const require = createRequire(import.meta.url), module = { exports: {} as { default: React.ComponentType<{ components: Record<string, unknown> }> } };
  Function("require", "module", "exports", result.code)(require, module, module.exports);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let document: React.ReactNode, renderer: ReturnType<typeof create> | undefined;
  function CaptureDeck({ children }: { children?: React.ReactNode }) { document = children; return null; }
  const Document = module.exports.default;
  try {
    await act(() => { renderer = create(<Document components={{ Deck: CaptureDeck, Slide: "slide" }} />); });
    const scenes = flat(document).filter(node => (node.type as { name?: string }).name === "Scene");
    expect(scenes.map(scene => scene.props.mdxSource)).toEqual(["demo.mdx:9", "demo.mdx:15"]);
    expect(flat(scenes[1].props.children as React.ReactNode)[0].props.mdxSource).toBe("demo.mdx:16");
    expect(() => expandScene(scenes[0].props.children as React.ReactNode, undefined, scenes[0].props as never)).not.toThrow();
    expect(() => expandScene(scenes[1].props.children as React.ReactNode, undefined, scenes[1].props as never))
      .toThrow('demo.mdx:16: <Headline id="bad"> enter.duration must be a number of seconds > 0 (got 0).');
  } finally { if (renderer) await act(() => renderer!.unmount()); }
}, 30000);

test("the sample deck uses every scene prop, compiles, validates and plans", async () => {
  const root = path.resolve(import.meta.dirname, "../../.."), deck = path.join(root, "apps/slides/examples/3d/scene-props.mdx");
  const result = await compileDeck(deck, { effectPacksDirectory: path.join(root, "packages/slides-effects/packs") });
  if (!result.success) throw Error(result.errors.join("\n"));
  const require = createRequire(import.meta.url), module = { exports: {} as { default: React.ComponentType<{ components: Record<string, unknown> }> } };
  Function("require", "module", "exports", result.code)(require, module, module.exports);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let document: React.ReactNode, renderer: ReturnType<typeof create> | undefined;
  function CaptureDeck({ children }: { children?: React.ReactNode }) { document = children; return null; }
  const Document = module.exports.default;
  try {
    await act(() => { renderer = create(<Document components={{ Deck: CaptureDeck, Slide: "slide" }} />); });
    const scenes = flat(document).filter(node => (node.type as { name?: string }).name === "Scene").map(node => node.props as Record<string, never>);
    const used = new Set(scenes.flatMap(scene => [...Object.keys(scene), ...Object.keys(scene.camera ?? {}),
      ...flat(scene.children).flatMap(part => Object.keys(part.props))]));
    for (const prop of ["colors", "ambient", "ease", "duration", "via", "viaTarget", "carry", "steps", "enter", "exit", "fill", "padding", "panelColor", "textColor",
      "marks", "max", "height", "width", "gap", "stagger", "labelSize", "items"]) expect(used).toContain(prop);
    const slides = prepareWorldSlides(scenes.map(scene => ({ ...scene, track: { spacing: 32, ...scene.camera },
      children: expandScene(scene.children, scene.layout, scene as never) })) as never);
    expect(slides).toHaveLength(3);
  } finally { if (renderer) await act(() => renderer!.unmount()); }
}, 30000);

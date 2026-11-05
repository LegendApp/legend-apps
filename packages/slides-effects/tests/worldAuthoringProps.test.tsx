import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React from "react";
import { highlightedFence } from "./highlightedFence";
import { act, create } from "react-test-renderer";
import path from "node:path";
import { createRequire } from "node:module";
import { compileDeck } from "../../presentation/src/compiler";
import { Bars, CodeMorph, CodePanel, CodeTrace, Headline, Keys, Layers, Rule, Scene, Tree, expandScene, readScenes } from "../packs/world/Authoring";
import { checkPart, checkScene, defaultColors, enterDefaults, exitDefaults, sequenceDefaults } from "../packs/world/authoringProps";
import { Box, Card, Fog, Orbs, Pillar, Stage, Text3D, prepareWorldSlides } from "../packs/world/World";
import { cardInstances, instanceField, instanceOpacity, instancePosition, prepareWorldScene, sampleTrack, sampleWorldUniforms, worldHeaderSize, worldInstanceSize } from "../packs/world/scene";
import { text3dInstances } from "../packs/world/text3d";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const find = (node: React.ReactNode, type: unknown, id: string) => flat(node).find(n => n.type === type && n.props.id === id)!;

test("invalid props fail naming the MDX line, the element and the prop", async () => {
  const at = { mdxSource: "talk.mdx:12" };
  const fails = (check: () => void) => { try { check(); } catch (error) { return (error as Error).message; } throw Error("expected a failure"); };
  expect(fails(() => checkPart("headline", { ...at, id: "t", enter: { duration: -1 } }))).toBe('talk.mdx:12: <Headline id="t"> enter.duration must be a number of seconds > 0 (got -1).');
  expect(fails(() => checkPart("headline", { ...at, id: "t", dely: 1 }))).toBe('talk.mdx:12: <Headline id="t"> Unknown prop dely. Did you mean delay?');
  expect(fails(() => checkPart("rule", { id: "r", exit: { delay: 1 } }))).toBe('<Rule id="r"> exit.step is required.');
  expect(fails(() => checkPart("rule", { id: "r", color: "red" }))).toStartWith('<Rule id="r"> color must be #RGB, #RRGGBB or a theme color (text, muted');
  expect(fails(() => checkPart("bars", { id: "b", items: [{ label: "A" }] }))).toBe('<Bars id="b"> items[0].value is required.');
  expect(fails(() => checkPart("code", { id: "c", marks: [{ text: "x", step: 1.5 }] }))).toBe('<CodePanel id="c"> marks[0].step must be a step number (0, 1, 2…) (got 1.5).');
  expect(fails(() => checkPart("layers", { id: "l", bob: [.1, 0] }))).toBe('<Layers id="l"> bob must be an amplitude ≥ 0 or [amplitude, period in seconds > 0] (got [0.1,0]).');
  expect(fails(() => checkPart("layers", { id: "l", colors: ["accent", "pink"] }))).toStartWith('<Layers id="l"> colors[1] must be #RGB, #RRGGBB or a theme color');
  const invalidWords = <Layers id="l" words={["user", "state"]}>{await highlightedFence("state.user")}</Layers>;
  expect(fails(() => expandScene(invalidWords, "layers"))).toBe('<Layers id="l"> words: "state" is not in the code line after column 10.');
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
  expect(find(plain, Text3D, "title").props.enter).toEqual({ step: 0, delay: undefined, offset: [-8, 0, -2], scale: 0, stagger: .025, duration: .8 });
  expect(find(plain, Text3D, "title").props.color).toBeUndefined();

  const moving = expandScene(<>
    <Rule id="rule" enter={{ step: 1 }} exit={{ step: 2, to: [0, 9, 0] }} />
    <Headline id="title" enter={{ delay: .4, from: [0, -3, 0], ease: "expo" }} exit={{ step: 1 }}>Hi</Headline>
    <Headline id="fresh" carry={false}>New</Headline>
  </>, undefined, { id: "slide2" });
  expect(find(moving, Stage, "rule/motion").props.position).toEqual([{ step: 0, value: enterDefaults.from },
    { step: 1, delay: 0, value: [0, 0, 0], duration: enterDefaults.duration, ease: "cubic" }, { step: 2, delay: 0, value: [0, 9, 0], duration: exitDefaults.duration, ease: "cubic" }]);
  const title = find(moving, Text3D, "title");
  expect(title.props.enter).toEqual({ step: 0, delay: .4, offset: [0, -3, 0], scale: 0, stagger: .025, duration: .8, ease: "expo" });
  expect(title.props.opacity).toEqual([{ step: 0, value: 1 }, { step: 1, delay: 0, value: 0, duration: exitDefaults.duration }]);
  expect(find(moving, Stage, "title/motion").props.position).toEqual([{ step: 0, value: [0, 0, 0] }, { step: 1, delay: 0, value: exitDefaults.to, duration: .8, ease: "cubic" }]);
  expect(find(moving, Text3D, "fresh@slide2")).toBeDefined();
});

test("a sequence shows one part at a time: each waits right, slides to center on in, and off left on out", () => {
  const d = sequenceDefaults.distance, move = { delay: 0, duration: sequenceDefaults.duration, ease: "cubic" };
  const scene = expandScene(<>
    <Headline id="first" sequence={{ out: 1 }}>A</Headline>
    <Tree id="second" nodes={[{ id: "a" }]} sequence={{ in: 1, out: 2 }} />
    <Tree id="last" nodes={[{ id: "a" }]} sequence={{ in: 2, distance: 30 }} />
  </>, "tree-sequence");
  expect(find(scene, Stage, "first/sequence").props.position).toEqual([{ step: 0, value: [0, 0, 0] }, { step: 1, ...move, value: [-d, 0, 0] }]);
  expect(find(scene, Stage, "second/sequence").props.position).toEqual([{ step: 0, value: [d, 0, 0] }, { step: 1, ...move, value: [0, 0, 0] }, { step: 2, ...move, value: [-d, 0, 0] }]);
  expect(find(scene, Stage, "last/sequence").props.position).toEqual([{ step: 0, value: [30, 0, 0] }, { step: 2, ...move, value: [0, 0, 0] }]);
  // The layout stacks every tree in the center of frame.
  expect(find(scene, Stage, "second").props.position).toEqual(find(scene, Stage, "last").props.position);
  expect(() => checkPart("tree", { id: "t", nodes: [{ id: "a" }], sequence: { in: 1.5 } })).toThrow("sequence.in must be a step number");
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

test("code panels and bar charts take style props over the theme's panel defaults", async () => {
  const fence = await highlightedFence("const a = 1;");
  const plain = expandScene(<CodePanel id="code">{fence}</CodePanel>);
  expect(find(plain, Card, "code/card").props).toMatchObject({ fill: .9, edge: .9, color: defaultColors.panel });
  const diff = await highlightedFence(" A\n-B\n+C", "diff");
  for (const part of [<CodeMorph id="code">{diff}</CodeMorph>, <CodeTrace id="code" source={1} reads={[1]} nodes={["a", "b"]}>{fence}</CodeTrace>])
    expect(find(expandScene(part), Card, "code/card").props).toMatchObject({ fill: .9, edge: .9, color: defaultColors.panel });
  expect(find(expandScene(<CodeMorph id="code" fill={.5} border={1.2}>{diff}</CodeMorph>), Card, "code/card").props).toMatchObject({ fill: .5, edge: 1.2 });
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

test("headline entrances belong to their authored step and stay settled on later local clocks", () => {
  const glyph = (props: Record<string, unknown>) => {
    const text = find(expandScene(<Headline id="title" {...props}>A</Headline>), Text3D, "title");
    return prepareWorldScene({ instances: text3dInstances(text.props as never) }).instances[0];
  };
  const sample = (stepIndex: number, time: number) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });
  const initial = glyph({ delay: .6 });
  expect(instanceOpacity(initial, sample(0, .3))).toBe(0);
  expect(instanceOpacity(initial, sample(0, 2))).toBe(1);
  for (const step of [1, 2, 3]) {
    expect(instanceOpacity(initial, sample(step, 0))).toBe(1);
    expect(instancePosition(initial, sample(step, 0))).toEqual(instancePosition(initial, sample(0, 2)));
  }
  const delayed = glyph({ enter: { step: 2, delay: .4, duration: .8 } });
  expect(instanceOpacity(delayed, sample(1, 4))).toBe(0);
  expect(instanceOpacity(delayed, sample(2, .3))).toBe(0);
  expect(instanceOpacity(delayed, sample(2, .5))).toBeGreaterThan(0);
  expect(instanceOpacity(delayed, sample(3, 0))).toBe(1);
  expect(instanceOpacity(delayed, sample(1, 0))).toBe(0);
});

test("layer builds reveal one moving layer per step, preserve earlier layers, and reverse cleanly", () => {
  const children = expandScene(<Layers id="stack" count={4} label="Layer" meter={[.14, .19, .22, .23]} bob={0} orbit={0} />, "layers");
  const prepared = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const cards = Array.from({ length: 4 }, (_, k) => prepared.instances.find(instance => instance.id === `stack/${k}`)!);
  const fill = prepared.instances.find(instance => instance.id === "stack/fill")!;
  const sample = (stepIndex: number, time: number) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });
  for (const step of [0, 1, 2, 3, 2, 1, 0]) {
    const settled = sample(step, 2), before = sample(step, 0);
    expect(cards.map(card => instanceOpacity(card, settled))).toEqual(cards.map((_, k) => k <= step ? 1 : 0));
    expect(instanceOpacity(cards[step], before)).toBe(0);
    expect(instancePosition(cards[step], sample(step, .2))).not.toEqual(instancePosition(cards[step], settled));
    expect(sampleTrack(fill.scale, settled)[0]).toBeCloseTo([.14, .19, .22, .23][step] * 9);
    for (let k = 0; k < step; k++) expect(instancePosition(cards[k], before)).toEqual(instancePosition(cards[k], settled));
  }
});

test("landed layers keep moving out of phase in their own colors, and the value inside dims as each layer wraps it", () => {
  const children = expandScene(<Layers id="stack" count={3} value="v" colors={["#ff0000", "link"]} meter={[.1, .2, .3]} />, "layers");
  const prepared = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const cards = Array.from({ length: 3 }, (_, k) => prepared.instances.find(instance => instance.id === `stack/${k}`)!);
  const sample = (stepIndex: number, time: number) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });
  expect(cards.map(card => card.motion)).toEqual([undefined, undefined, undefined]);
  expect(cards.map(card => sampleTrack(card.color, sample(2, 3)))).toEqual([[1, 0, 0], ...Array(2).fill(sampleTrack(cards[1].color, sample(2, 3)))]);
  const drift = (card: typeof cards[number]) => instancePosition(card, sample(2, 3)).map((v, axis) => v - instancePosition(card, sample(2, 4))[axis]);
  expect(Math.hypot(...drift(cards[0]))).toBeGreaterThan(.01);
  expect(drift(cards[0])).not.toEqual(drift(cards[1]));
  const glow = (time: number) => sampleWorldUniforms(prepared, sample(2, time))[worldHeaderSize + prepared.instances.indexOf(cards[0]) * worldInstanceSize + instanceField.emissive];
  expect(glow(3)).not.toBeCloseTo(glow(3.8));
  const value = prepared.instances.find(instance => instance.id?.startsWith("stack/value/text") && instance.glyph)!;
  expect(sampleTrack(value.emissive, sample(2, 3))).toBeLessThan(sampleTrack(value.emissive, sample(0, 3)));
});

test("code line layers box one word per step, centered on it, and each word moves with its box once it lands", async () => {
  const children = expandScene(<Layers id="line" words={["state", "name"]} label="Proxy">{await highlightedFence("state.user.name")}</Layers>, "layers");
  const prepared = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const sample = (stepIndex: number, time: number) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });
  const glyphs = (column: number) => prepared.instances.filter(instance => instance.id?.startsWith(`line/text${column}`) && instance.glyph);
  expect([0, 5, 11].map(column => glyphs(column).length)).toEqual([5, 6, 4]);
  for (const [k, column] of [[0, 0], [1, 11]]) {
    const card = prepared.instances.find(instance => instance.id === `line/${k}`)!, word = glyphs(column);
    for (const time of [3, 4.7]) {
      const box = instancePosition(card, sample(1, time)), a = instancePosition(word[0], sample(1, time)), b = instancePosition(word[word.length - 1], sample(1, time));
      expect(box[0]).toBeCloseTo((a[0] + b[0]) / 2, 5);
      expect(box[1]).toBeCloseTo(a[1], 5);
    }
  }
  const late = glyphs(11)[0], dot = glyphs(5)[0];
  expect(instancePosition(late, sample(0, 3))).toEqual(instancePosition(late, sample(0, 4.7)));
  expect(instancePosition(late, sample(1, 3))).not.toEqual(instancePosition(late, sample(1, 4.7)));
  expect(instancePosition(dot, sample(1, 3))).toEqual(instancePosition(dot, sample(1, 4.7)));
});

test("card fades reach cached GPU uniforms and multiply each attached label only once", () => {
  const scene = prepareWorldScene({ instances: cardInstances({ id: "card", title: "Title", subtitle: "Subtitle", titleOpacity: .4,
    opacity: [{ step: 0, value: 0 }, { step: 1, value: 1, duration: 1, ease: "linear" }] }) });
  const card = scene.instances.find(instance => instance.id === "card")!;
  const title = scene.instances.find(instance => instance.id === "card:title")!;
  const subtitle = scene.instances.find(instance => instance.id === "card:subtitle")!;
  const index = worldHeaderSize + scene.instances.indexOf(card) * worldInstanceSize + instanceField.opacity;
  expect(card.motion).toBe("tracks");
  for (const [stepIndex, time, expected] of [[0, 2, 0], [1, .5, .5], [2, 0, 1], [0, 0, 0]]) {
    const clock = { slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } };
    expect(sampleWorldUniforms(scene, clock, null, 1, 1, true)[index]).toBeCloseTo(expected);
    expect(instanceOpacity(subtitle, clock)).toBeCloseTo(expected);
    expect(instanceOpacity(title, clock)).toBeCloseTo(expected * .4);
  }
});


test("sharp overrides apply to every code panel surface and glyph and validate booleans", async () => {
  expect(() => checkPart("headline", { id: "title", sharp: "true" })).toThrow("sharp must be true or false");
  for (const sharp of [true, false]) {
    const children = expandScene(<CodePanel id="panel" sharp={sharp}>{await highlightedFence("const value = 1;")}</CodePanel>);
    const scene = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
    expect(scene.instances.some(instance => instance.card)).toBe(true);
    expect(scene.instances.some(instance => instance.glyph)).toBe(true);
    for (const instance of scene.instances) expect(instance.sharp?.initial).toBe(Number(sharp));
  }
});

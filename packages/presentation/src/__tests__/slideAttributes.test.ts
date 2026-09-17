// @ts-nocheck Bun test types are not part of the app TypeScript project.
import { expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import { remarkSlideAttributes } from "../compiler/remarkSlideAttributes";

async function parse(source: string) {
  let tree;
  await compile(source, { remarkPlugins: [remarkSlideAttributes, () => (root) => { tree = root; }] });
  return tree;
}
const props = (node) => Object.fromEntries(node.attributes.map(({ name, value }) =>
  [name, typeof value === "object" ? value.data.estree.body[0].expression.value : value]));

test("step attributes emit numeric props and compose with shared markers", async () => {
  const tree = await parse('# Title {shared=title step=2}\n\nInitially visible {step=0}');
  expect(tree.children[0].name).toBe("Step");
  expect(props(tree.children[0])).toEqual({ at: 2 });
  expect(tree.children[0].children[0].name).toBe("SharedElement");
  expect(props(tree.children[0].children[0])).toEqual({ id: "title" });
  expect(props(tree.children[1])).toEqual({ at: 0 });
});

test("attributes reject invalid values, duplicates, unknown names and misplaced markers", async () => {
  for (const attr of ["step=-1", "step=1.5", "step=wat", "step=1 step=2", "step=1 unknown=2", "shared", "step=9007199254740992"]) {
    await expect(parse(`Text {${attr}}`)).rejects.toThrow();
  }
  await expect(parse("Text {step=1} {shared=title}")).rejects.toThrow("at the end");
});

test("JavaScript, JSX props and code examples are not parsed as attributes", async () => {
  const tree = await parse('Value {1 + 2}\n\n<Thing value={step + 1} />\n\n`{shared=title step=2}`\n\n```md\nText {step=1}\n```\n\nLiteral \\{step=1\\}');
  expect(tree.children[0].children.at(-1).type).toBe("mdxTextExpression");
  expect(tree.children[1].name).toBe("Thing");
  expect(tree.children[2].children[0].value).toBe("{shared=title step=2}");
  expect(tree.children[3].value).toBe("Text {step=1}");
  expect(tree.children[4].children[0].value).toBe("Literal {step=1}");
});

test("until hides a revealed block or a block visible from the beginning", async () => {
  const tree = await parse('Text {step=1 until=3}\n\nInitial text {until=2}');
  expect(props(tree.children[0])).toEqual({ at: 1, until: 3 });
  expect(props(tree.children[1])).toEqual({ at: 0, until: 2 });
  for (const attr of ["until=-1", "until=1.5", "until=0", "step=3 until=2", "step=2 until=2"]) {
    await expect(parse(`Text {${attr}}`)).rejects.toThrow();
  }
});

test("a steps directive wraps the following list and preserves nested items", async () => {
  for (const list of ['- One\n  - Nested\n- Two', '1. One\n   - Nested\n2. Two']) {
    const tree = await parse(`{steps}\n\n${list}\n\nAfter`);
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].name).toBe("Steps");
    expect(tree.children[0].children[0].type).toBe("list");
    expect(tree.children[0].children[0].children).toHaveLength(2);
    expect(tree.children[1].type).toBe("paragraph");
  }
  for (const source of ['{steps}\n\nNot a list', 'Text {steps}', '{steps=2}\n\n- One', '{steps step=1}\n\n- One']) {
    await expect(parse(source)).rejects.toThrow();
  }
});

test("focus targets compose with shared elements and reveals", async () => {
  const tree = await parse('## Details {focus=details shared=title step=1}');
  const region = tree.children[0].children[0];
  expect(tree.children[0].name).toBe("Step");
  expect(region.name).toBe("FocusRegion");
  expect(props(region)).toEqual({ id: "details" });
  expect(region.children[0].name).toBe("SharedElement");
  for (const attr of ['focus', 'focus=""', 'focus="two words"']) await expect(parse(`Text {${attr}}`)).rejects.toThrow("identifier");
});

test("effect attributes select existing presets inside shared and step wrappers", async () => {
  const { effectPresets } = await import("../../../../apps/slides/src/effects");
  for (const preset of Object.keys(effectPresets)) {
    const tree = await parse(`# Title {effect=${preset} shared=title step=1}`);
    const effect = tree.children[0].children[0].children[0];
    expect(effect.name).toBe("Effect");
    expect(props(effect)).toEqual({ preset });
    expect(effect.children[0].type).toBe("heading");
  }
  await expect(parse("Text {effect=unknown}")).rejects.toThrow("effect must be");
  await expect(parse("Text {effect}")).rejects.toThrow("effect must be");
});

test("class attributes style the text node inside every animation wrapper", async () => {
  const tree = await parse('## Title {class="text-center text-blue-400" shared=title step=1 effect=liquid focus=title}');
  const text = tree.children[0].children[0].children[0].children[0].children[0];
  expect(text.type).toBe("heading");
  expect(text.data.hProperties.className).toBe("text-center text-blue-400");
  for (const attr of ['class', 'class=""']) await expect(parse(`Text {${attr}}`)).rejects.toThrow("class requires");
});

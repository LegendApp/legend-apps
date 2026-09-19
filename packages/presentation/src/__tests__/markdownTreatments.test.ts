// @ts-nocheck Bun test types are not part of the app TypeScript project.
import { expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import { remarkSlideAttributes } from "../compiler/remarkSlideAttributes";

async function parse(source: string) {
  let tree: any;
  await compile(source, { remarkPlugins: [remarkSlideAttributes, () => (root: unknown) => { tree = root; }] });
  return tree;
}
const props = (node: any) => Object.fromEntries(node.attributes.map((a: any) => [a.name,
  typeof a.value === "string" ? a.value : Number(a.value.value)]));

test("Markdown treatments compose native reveals, surfaces and shared identities", async () => {
  const tree = await parse('# Hello {shared=title shared-resize=preserve surface=glow step=1 until=3 reveal=fade-up duration=650}');
  const reveal = tree.children[0];
  expect(reveal.name).toBe("Step");
  expect(props(reveal)).toEqual({ at: 1, until: 3, reveal: "fade-up", duration: 650 });
  const shared = reveal.children[0];
  expect(props(shared)).toEqual({ id: "title", resize: "preserve" });
  expect(shared.children[0].name).toBe("SlideSurface");
  expect(props(shared.children[0])).toEqual({ preset: "glow" });
  expect(shared.children[0].children[0].type).toBe("heading");
});

test("layout groups accept the same treatments and ordinary steps use native fade", async () => {
  const tree = await parse(':::group{surface=translucent step=2 reveal=zoom duration=0}\n\nHello\n\n:::\n\nWorld {step=1}');
  expect(props(tree.children[0])).toEqual({ at: 2, reveal: "zoom", duration: 0 });
  expect(tree.children[0].children[0].name).toBe("SlideSurface");
  expect(props(tree.children[1])).toEqual({ at: 1, reveal: "fade", duration: 450 });
});

test("invalid treatments fail at compile time", async () => {
  for (const attrs of ['shared-resize=preserve', 'shared=x shared-resize=warp', 'surface=glass', 'reveal=zoom', 'duration=500', 'step=1 reveal=bounce', 'step=1 duration=-1', 'step=1 duration=10001', 'step=1 duration=1.5']) {
    await expect(parse(`# Title {${attrs}}`)).rejects.toThrow();
  }
});

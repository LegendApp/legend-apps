// @ts-nocheck Bun tests run with native host mocks when needed.
import { expect, test } from "bun:test";
import { compile, evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { remarkSlideAttributes } from "../compiler/remarkSlideAttributes";
import { columnWeights, layoutOverflows, parseLayoutProps } from "../layout";

async function parse(source) {
  let tree;
  await compile(source, { remarkPlugins: [remarkSlideAttributes, () => (root) => { tree = root; }] });
  return tree;
}
const props = (node) => Object.fromEntries(node.attributes.map(({ name, value }) =>
  [name, typeof value === "object" ? value.data.estree.body[0].expression.value : value]));

test("nested layout directives retain Markdown and compose with animation attributes", async () => {
  const source = '::::columns{ratio="2:1" gap=48}\n\n:::group{padding=24 class="bg-slate-800" shared=card focus=detail step=1}\n\n## **Hello**\n\nBody text\n\n:::\n\n:::stack{height=300 justify=between}\n\nOne\n\nTwo\n\n:::\n\n::::';
  const tree = await parse(source);
  expect(props(tree.children[0])).toEqual({ kind: "columns", ratio: "2:1", gap: 48 });
  const step = tree.children[0].children[0];
  expect(step.name).toBe("Step");
  const group = step.children[0].children[0].children[0];
  expect(props(group)).toEqual({ kind: "group", padding: 24, className: "bg-slate-800" });
  expect(group.children.map((child) => child.type)).toEqual(["heading", "paragraph"]);
  expect(props(tree.children[0].children[1])).toMatchObject({ kind: "stack", height: 300, justify: "between" });
});

test("ratios, literal directives, code fences and escaped colons are preserved", async () => {
  const source = ':::group\n\nRatio 2:1\n\n```md\n:::grid{columns=3}\n```\n\n\\:::group\n\n:::';
  const tree = await parse(source);
  expect(tree.children[0].children[0].children.map((child) => child.value).join("")).toBe("Ratio 2:1");
  expect(tree.children[0].children[1].value).toBe(":::grid{columns=3}");
  expect(tree.children[0].children[2].children[0].value).toBe(":::group");
});

test("invalid containers and layout values produce author errors", async () => {
  for (const source of [
    ':::unknown\n\nHello\n\n:::', ':::group\n\nUnclosed', ':::group {gap=24}\n\nHi\n\n:::',
    ':::grid{columns=0}\n\nHi\n\n:::', ':::group{gap=-1}\n\nHi\n\n:::',
    ':::group{ratio="1:1"}\n\nHi\n\n:::', ':::columns{ratio="2:1"}\n\nOnly one\n\n:::',
    ':::group{align=nope}\n\nHi\n\n:::', ':::group{typo=1}\n\nHi\n\n:::',
    ':::group\n\nOne\n\n---\n\nTwo\n\n:::',
  ]) await expect(parse(source)).rejects.toThrow();
});

test("layout sizes, spacing, weights and overflow are independent of display scale", () => {
  expect(parseLayoutProps("stack", { width: "75%", height: "400", padding: "24", align: "center" }))
    .toEqual({ kind: "stack", width: "75%", height: 400, padding: 24, align: "center" });
  expect(columnWeights("2:1", 2)).toEqual([2, 1]);
  expect(columnWeights(undefined, 3)).toEqual([1, 1, 1]);
  expect(() => columnWeights("0:1", 2)).toThrow();
  expect(() => parseLayoutProps("grid", { columns: "1.5" })).toThrow();
  expect(layoutOverflows({ x: 120, y: 80, width: 1680, height: 920 }, { width: 1920, height: 1080 })).toBe(false);
  expect(layoutOverflows({ x: 120, y: 80, width: 1801, height: 920 }, { width: 1920, height: 1080 })).toBe(false);
  expect(layoutOverflows({ x: 120, y: 80, width: 1810, height: 920 }, { width: 1920, height: 1080 })).toBe(true);
  expect(layoutOverflows({ x: -2, y: 0, width: 100, height: 100 }, { width: 1920, height: 1080 })).toBe(true);
});

test("reveals inside layout directives are visible to the navigation step resolver", async () => {
  await import("../../../../apps/slides/src/__tests__/nativeMock");
  const { Step, resolveSteps } = await import("../../../../apps/slides/src/steps");
  const deck = await evaluate('::::grid{columns=2}\n\n:::group{step=2}\n\nHello\n\n:::\n\n::::', {
    ...runtime, remarkPlugins: [remarkSlideAttributes],
  });
  const resolved = resolveSteps(deck.default({ components: { Layout: "layout", Step } }));
  expect(resolved.steps).toBe(3);
});

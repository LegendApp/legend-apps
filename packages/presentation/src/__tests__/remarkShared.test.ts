// @ts-nocheck Bun test types are not part of the app TypeScript project.
import { expect, test } from "bun:test";
import { compile } from "@mdx-js/mdx";
import { remarkSlideAttributes } from "../compiler/remarkSlideAttributes";

async function parse(source: string) {
  let tree: any;
  await compile(source, { remarkPlugins: [remarkSlideAttributes, () => (root: unknown) => { tree = root; }] });
  return tree;
}

test("shared attributes wrap headings and formatted paragraphs without leaving executable expressions", async () => {
  for (const attribute of ['{shared=title}', '{shared="title"}', "{shared='title'}"]) {
    const root = await parse(`# Hello **world** ${attribute}\n\nSome *text* {shared=copy}`);
    expect(root.children.map((node: any) => node.name)).toEqual(["SharedElement", "SharedElement"]);
    expect(root.children[0].attributes[0].value).toBe("title");
    expect(root.children[1].attributes[0].value).toBe("copy");
    expect(root.children[0].children[0].type).toBe("heading");
    expect(root.children[0].children[0].children.some((node: any) => node.type === "strong")).toBe(true);
    expect(JSON.stringify(root)).not.toContain('"type":"mdxTextExpression"');
  }
});

test("code examples, escaped attributes, and unrelated MDX expressions remain intact", async () => {
  const root = await parse('`{shared=example}`\n\n```md\n# Heading {shared=title}\n```\n\nEscaped \\{shared=title\\}\n\nValue {1 + 2}');
  expect(root.children.some((node: any) => node.name === "SharedElement")).toBe(false);
  expect(root.children[0].children[0].value).toBe("{shared=example}");
  expect(root.children[1].value).toBe("# Heading {shared=title}");
  expect(root.children.at(-1).children.at(-1).value).toBe("1 + 2");
});

test("attributes require content and can use quoted punctuation in IDs", async () => {
  const root = await parse('## Heading {shared="hero.title-1"}');
  expect(root.children[0].attributes[0].value).toBe("hero.title-1");
});

test("unsupported placement fails at compile time instead of executing an assignment", async () => {
  for (const source of ["{shared=title}", "- Item {shared=title}", "Before {shared=title} after"]) {
    await expect(parse(source)).rejects.toThrow("at the end of a heading or paragraph");
  }
});

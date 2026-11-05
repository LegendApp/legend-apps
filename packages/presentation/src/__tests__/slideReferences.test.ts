import { expect, test } from "bun:test";
import { remarkSlides } from "../compiler/remarkSlides";

const element = (name: string, value?: string) => ({ type: "mdxJsxFlowElement", name, attributes: value ? [{ type: "mdxJsxAttribute", name: "name", value }] : [], children: [] });
function transform(config: string, content: object[], metadata?: string) {
  const root: any = { type: "root", children: [{ type: "yaml", value: config }, ...content,
    ...(metadata ? [{ type: "yaml", value: metadata }, element("ProxyDiagram")] : [])] };
  remarkSlides()(root);
  const deck = root.children[0];
  return { config: JSON.parse(deck.attributes[0].value), slides: deck.children.map((slide: any) => JSON.parse(slide.attributes[1].value)) };
}

test("deck options and slide IDs survive compilation with readable component slugs", () => {
  const result = transform("slideReferences: false", [element("World")], "id: stable-id");
  expect(result.config.slideReferences).toBe(false);
  expect(result.slides).toEqual([{ referenceSlug: "world" }, { id: "stable-id", referenceSlug: "proxy-diagram" }]);
  expect(transform("slideReferences: true", [element("Scene", "Proxy View")]).slides[0].referenceSlug).toBe("proxy-view");
  expect(transform("", [{ type: "mdxJsxFlowElement", name: "Layout", children: [element("RenderTree")] }]).slides[0].referenceSlug).toBe("render-tree");
  expect(transform("", [{ type: "heading", children: [{ type: "text", value: "Hello Slides" }] }]).slides[0].referenceSlug).toBe("hello-slides");
  expect(() => transform("slideReferences: sometimes", [])).toThrow("must be a boolean");
});

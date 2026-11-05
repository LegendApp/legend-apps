import { expect, test } from "bun:test";
import { parseRenderArgs } from "./slidesRender";

test("renders exclude references unless the flag opts in", () => {
  expect(parseRenderArgs(["deck.mdx"]).slideReferences).toBe(false);
  expect(parseRenderArgs(["deck.mdx", "--slide-references", "--slide", "14"]).slideReferences).toBe(true);
  expect(parseRenderArgs(["deck.mdx", "--slide", "14", "--slide-references"]).slideReferences).toBe(true);
  expect(() => parseRenderArgs(["deck.mdx", "--slide-references", "--slide-references"])).toThrow("Repeated option");
});

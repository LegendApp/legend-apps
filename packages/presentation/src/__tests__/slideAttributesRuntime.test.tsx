// @ts-nocheck Native leaves are mocked.
import { expect, test } from "bun:test";
import "../../../../apps/slides/src/__tests__/nativeMock";
const { Step, resolveSteps, stepStyle } = await import("../../../../apps/slides/src/steps");

test("compiled Markdown reveals participate in step discovery and reverse visibility", async () => {
  const { evaluate } = await import("@mdx-js/mdx");
  const runtime = await import("react/jsx-runtime");
  const { remarkSlideAttributes } = await import("../compiler/remarkSlideAttributes");
  const compiled = await evaluate('# Title {shared=title step=2}\n\nCopy {step=3}', {
    ...runtime, remarkPlugins: [remarkSlideAttributes],
  });
  const rendered = compiled.default({ components: { Step, SharedElement: "shared" } });
  const result = resolveSteps(rendered);
  expect(result.steps).toBe(4);
  expect([0, 2, 3, 1].map((step) => stepStyle(step, { at: 2 }).opacity)).toEqual([0, 1, 1, 0]);
});

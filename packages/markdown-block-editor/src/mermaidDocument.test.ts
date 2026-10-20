// @ts-expect-error Bun test types are not part of the application TypeScript project.
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { createMermaidDocument } from "./mermaidDocument";

async function renderDocument(source: string, render: (id: string, source: string) => Promise<{ svg: string }>) {
  const html = createMermaidDocument(source, false);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const messages: unknown[] = [];
  const diagram = { innerHTML: "", getBoundingClientRect: () => ({ height: 217.2 }) };
  await runInNewContext(scripts.at(-1)![1], {
    mermaid: { initialize() {}, render },
    document: { getElementById: () => diagram },
    window: { ReactNativeWebView: { postMessage: (message: string) => messages.push(JSON.parse(message)) } },
    ResizeObserver: class { observe() {} },
  });
  return { html, scripts, messages, diagram };
}

test("Mermaid source stays text even when it contains script-closing markup", async () => {
  const source = 'flowchart LR\n A["</script><script>throw new Error(1)</script>"] --> B';
  let received = "";
  const result = await renderDocument(source, async (_id, text) => {
    received = text;
    return { svg: '<svg viewBox="0 0 200 100"></svg>' };
  });
  expect(received).toBe(source);
  expect(result.scripts).toHaveLength(2);
  expect(result.diagram.innerHTML).toContain("<svg");
  expect(result.messages).toEqual([{ height: 218 }]);
  expect(result.html).toContain("default-src 'none'");
});

test("Mermaid renderer reports errors for the source-code fallback", async () => {
  const result = await renderDocument("not a diagram", async () => {
    throw new Error("Unknown diagram type\nLong diagnostic");
  });
  expect(result.messages).toEqual([{ error: "Unknown diagram type" }]);
  expect(result.diagram.innerHTML).toBe("");
});

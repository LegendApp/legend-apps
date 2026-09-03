// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { compileDeck } from "../compiler";
import { renderNativeChildren } from "../nativeChildren";

const temporaryDirectories: string[] = [];

function createDeck(files: Record<string, string>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "legend-slides-"));
  temporaryDirectories.push(directory);
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  return path.join(directory, "deck.mdx");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("compileDeck", () => {
  test("removes MDX whitespace and wraps literal native text", () => {
    const marker = React.createElement("marker");
    const children = renderNativeChildren(["\n", marker, "  copy  ", 0, "\t"], (text) => React.createElement("text", null, text));
    expect(children).toHaveLength(3);
    expect(React.isValidElement(children?.[0])).toBe(true);
    expect((children?.[1] as React.ReactElement).props.children).toBe("  copy  ");
    expect((children?.[2] as React.ReactElement).props.children).toBe("0");
  });

  test("wraps markdown slides and extracts frontmatter and notes", async () => {
    const deckPath = createDeck({
      "deck.mdx": `---\ntitle: Demo\ntransition: fade\n---\n# First\n<!-- first note -->\n---\ntransition: slide\n---\n# Second\n<!-- second note -->`,
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.code).toContain("title");
    expect(result.code).toContain("first note");
    expect(result.code).toContain("second note");
    expect(result.code).toContain("transition");
    expect(result.code).toContain("slide");
    expect(result.uniwindCode).toContain("stylesheet");
  });

  test("collects multiple notes and keeps per-slide frontmatter independent", async () => {
    const deckPath = createDeck({
      "deck.mdx": [
        "---",
        "title: Notes and metadata",
        "transition: fade",
        "---",
        "# First",
        "<!-- first note -->",
        "A paragraph.",
        "<!-- follow-up note -->",
        "---",
        "transition: none",
        "speaker: Jay",
        "---",
        "# Second",
        "<!-- second slide note -->",
      ].join("\n"),
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.code.indexOf("first note")).toBeLessThan(result.code.indexOf("follow-up note"));
    expect(result.code).toContain("second slide note");
    expect(result.code).toContain('speaker":"Jay');
    expect(result.code).toContain('transition":"none');
  });

  test("bundles local components and externalizes host packages", async () => {
    const deckPath = createDeck({
      "deck.mdx": `import { Card } from "./Card"\nimport { View } from "react-native"\n\n<Card><View className="bg-fuchsia-500" /></Card>`,
      "Card.tsx": `import React from "react"; export function Card({ children }: { children: React.ReactNode }) { return children; }`,
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "Card.tsx"));
    expect(result.code).toContain('require("react-native")');
    expect(result.uniwindCode).toContain("bg-fuchsia-500");
  });

  test("supports inline code and executable MDX expressions", async () => {
    const deckPath = createDeck({
      "deck.mdx": [
        "import { Text } from \"react-native\"",
        "",
        "Use `<View />` as inline code.",
        "",
        "{[1, 2, 3].map((value) => <Text key={value}>{value * 2}</Text>)}",
        "",
        "<!-- Explain that the expression renders live values. -->",
      ].join("\n"),
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.code).toContain("<View />");
    expect(result.code).toContain("value * 2");
    expect(result.code).toContain("Explain that the expression renders live values.");
  });

  test("compiles inline HTML, local pages, and React DOM components for Webview", async () => {
    const deckPath = createDeck({
      "deck.mdx": [
        '<Webview html={"<h1>Inline HTML</h1>"} />',
        "---",
        '<Webview src="./page.html" />',
        "---",
        '<Webview component="./WebDemo.tsx" props={{ label: "Bundled React" }} />',
      ].join("\n"),
      "page.html": "<!doctype html><title>Local page</title><h1>Local HTML</h1>",
      "WebDemo.tsx": [
        'import { useEffect, useState } from "react";',
        'export default function WebDemo({ label }: { label: string }) {',
        '  const [ready, setReady] = useState(false);',
        '  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);',
        '  return <main>{label}: {ready ? "ready" : "waiting"}</main>;',
        '}',
      ].join("\n"),
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencies).toContain(fs.realpathSync(path.join(path.dirname(deckPath), "page.html")));
    expect(result.dependencies).toContain(fs.realpathSync(path.join(path.dirname(deckPath), "WebDemo.tsx")));
    expect(result.code).toContain("Inline HTML");
    expect(result.code).toContain("page.html");
    expect(result.code).toContain("componentScript");
    expect(result.code).toContain("__LEGEND_SLIDES_PROPS__");
  });

  test("compiles the advanced example with custom components and animations", async () => {
    const deckPath = path.resolve(import.meta.dirname, "../../../../apps/slides/examples/showcase.mdx");
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "components/InteractiveCounter.tsx"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "components/LifecycleAnimation.tsx"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "components/SkiaNebula.tsx"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "components/TypeGPUBoids.tsx"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "vendor/typegpu-clouds/consts.ts"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "vendor/typegpu-clouds/scene.ts"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "vendor/typegpu-clouds/types.ts"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "vendor/typegpu-clouds/utils.ts"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "web/kinetic.html"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "web/WebParticleField.tsx"));
    expect(result.code).toContain('require("@legend-apps/presentation")');
    expect(result.code).toContain('require("@shopify/react-native-skia")');
    expect(result.code).toContain('require("react-native-webgpu")');
    expect(result.code).toContain('require("typegpu")');
    expect(result.code).toContain('require("@typegpu/react")');
    expect(result.code).toContain("Animated.timing");
    expect(result.code).toContain("createRenderPipeline");
    expect(result.code).toContain("createGuardedComputePipeline");
    expect(result.code).toContain("dispatchThreads");
    expect(result.code).toContain("raymarch");
    expect(result.code).toContain("sampleDensity");
    expect(result.code).toContain("cloudScene");
    expect(result.code).toContain("TypeGPU");
    expect(result.code).toContain("triangleAmount");
    expect(result.code).toContain("useConfigureContext");
    expect(result.code).toContain("__TYPEGPU_META__");
    expect(result.code).toContain("RuntimeEffect.Make");
    expect(result.code).toContain("useSlideLifecycle");
    expect(result.uniwindCode).toContain("bg-slate-800");
  });

  test("prefers macOS local modules and leaves comments in fenced code alone", async () => {
    const deckPath = createDeck({
      "deck.mdx": `import { value } from "./value"\n\n{value}\n\n\`\`\`html\n<!-- example, not a note -->\n\`\`\``,
      "value.ts": `export const value = "generic";`,
      "value.macos.ts": `export const value = "macos";`,
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.code).toContain("macos");
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "value.macos.ts"));
    expect(result.code).toContain("example, not a note");
  });

  test("rejects unavailable packages", async () => {
    const deckPath = createDeck({ "deck.mdx": `import leftPad from "left-pad"\n\n{leftPad("x", 2)}` });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join("\n")).toContain("is not available to decks");
  });

  test("reports the source location for failed local imports", async () => {
    const deckPath = createDeck({ "deck.mdx": `import missing from "./missing"\n\n{missing}` });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join("\n")).toMatch(/deck\.mdx:\d+:\d+:/);
    expect(result.errors.join("\n")).toContain('Could not resolve local import "./missing"');
  });

  test("rejects unavailable packages in Webview components", async () => {
    const deckPath = createDeck({
      "deck.mdx": '<Webview component="./WebDemo.tsx" />',
      "WebDemo.tsx": 'import leftPad from "left-pad"; export default function WebDemo() { return <p>{leftPad("x", 2)}</p>; }',
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join("\n")).toContain("is not available to Webview components");
  });

  test("rejects local imports outside the deck directory", async () => {
    const deckPath = createDeck({ "deck.mdx": `import value from "../outside"\n\n{value}` });
    fs.writeFileSync(path.join(path.dirname(path.dirname(deckPath)), "outside.ts"), "export default 1");
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.join("\n")).toContain("escapes the deck directory");
  });
});

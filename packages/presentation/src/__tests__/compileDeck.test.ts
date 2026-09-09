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
      "deck.mdx": `import { Card } from "./Card"\nimport LottieView from "lottie-react-native"\nimport { View } from "react-native"\n\n<Card><View className="bg-fuchsia-500" /><LottieView source={{ v: "5.7.4", fr: 60, ip: 0, op: 1, w: 1, h: 1, assets: [], layers: [] }} /></Card>`,
      "Card.tsx": `import React from "react"; export function Card({ children }: { children: React.ReactNode }) { return children; }`,
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "Card.tsx"));
    expect(result.code).toContain('require("react-native")');
    expect(result.code).toContain('require("lottie-react-native")');
    expect(result.uniwindCode).toContain("bg-fuchsia-500");
  });

  test("bundles a template selected by file name in deck frontmatter", async () => {
    const deckPath = createDeck({
      "deck.mdx": [
        "---",
        "title: Templates",
        "template: templates/Frame",
        "---",
        "# Framed slide",
      ].join("\n"),
      "templates/Frame.tsx": [
        'import type { PresentationTemplateProps } from "@legend-apps/presentation";',
        'import { View } from "react-native";',
        'export default function Frame({ children }: PresentationTemplateProps) {',
        '  return <View className="rounded-3xl bg-violet-950 p-12">{children}</View>;',
        '}',
      ].join("\n"),
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "templates/Frame.tsx"));
    expect(result.code).toContain("__legendSlidesTemplates");
    expect(result.code).toContain('"templates/Frame"');
    expect(result.code).toContain("rounded-3xl");
    expect(result.uniwindCode).toContain("bg-violet-950");
  });

  test("bundles deck and per-slide template files", async () => {
    const deckPath = createDeck({
      "deck.mdx": [
        "---",
        "template: templates/Default.tsx",
        "---",
        "# First",
        "---",
        "template: templates/Title.tsx",
        "---",
        "# Second",
        "---",
        "template: false",
        "---",
        "# Third",
      ].join("\n"),
      "templates/Default.tsx": "export default function Default({ children }) { return children; }",
      "templates/Title.tsx": "export default function Title({ children }) { return children; }",
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "templates/Default.tsx"));
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "templates/Title.tsx"));
    expect(result.code).toContain('template":"templates/Title.tsx');
    expect(result.code).toContain('template":false');
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

  test("lowers async code in MDX and local components for Hermes", async () => {
    const deckPath = createDeck({
      "deck.mdx": `import { compute } from "./compute"\n\nexport async function answer() { return await compute(); }\n\n# Async deck`,
      "compute.ts": `export async function compute() { return await Promise.resolve(42); }`,
    });
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // The inline sourcemap includes the original source; only inspect executable JS.
    const code = result.code.split("//# sourceMappingURL=")[0];
    expect(code).not.toMatch(/\basync\s+(?:function|\()/);
    const module = { exports: {} };
    new Function("module", "exports", "require", code)(module, module.exports, (name) => {
      if (name === "react/jsx-runtime") return { jsx() {}, jsxs() {} };
      throw new Error(`Unexpected import: ${name}`);
    });
    expect(await module.exports.answer()).toBe(42);
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

  test("compiles focus frontmatter and a live shared component from a local file", async () => {
    const deckPath = path.resolve(import.meta.dirname, "../../../../apps/slides/examples/focus.mdx");
    const result = await compileDeck(deckPath);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.code).toContain('"type":"focus","from":"engine","duration":1000');
    expect(result.code).toContain("FocusRegion");
    expect(result.code).toContain("SharedElement");
    expect(result.code).toContain("Animated.loop");
    expect(result.dependencies).toContain(path.join(path.dirname(deckPath), "components/FocusEngine.tsx"));
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

  test("rejects invalid and escaping template references", async () => {
    const invalidDeckPath = createDeck({ "deck.mdx": "---\ntemplate: 42\n---\n# Invalid" });
    const invalidResult = await compileDeck(invalidDeckPath);
    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.errors.join("\n")).toContain("Deck template must be a local file name or path");
    }

    const outsideTemplatePath = createDeck({
      "deck.mdx": "# Outside fixture",
      "Template.tsx": "export default () => null",
    });
    const outsideDirectory = path.dirname(outsideTemplatePath);
    const escapingReference = `../${path.basename(outsideDirectory)}/Template`;
    const escapingDeckPath = createDeck({
      "deck.mdx": `---\ntemplate: ${escapingReference}\n---\n# Escaping`,
    });
    const escapingResult = await compileDeck(escapingDeckPath);
    expect(escapingResult.success).toBe(false);
    if (!escapingResult.success) {
      expect(escapingResult.errors.join("\n")).toContain("escapes the deck directory");
    }
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

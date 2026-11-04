// @ts-nocheck Bun supplies the standalone compiler test API.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import React from "react";
import { compileDeck } from "../compiler";
import { codeHighlightVersion, highlightCode } from "../compiler/remarkCodeHighlight";

const require = createRequire(import.meta.url);
test("fences compile to colored native code props with exact text and no runtime highlighter", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-code-test-"));
  const previous = process.env.LEGEND_SLIDES_TRANSFORM_CACHE;
  process.env.LEGEND_SLIDES_TRANSFORM_CACHE = path.join(root, "cache");
  try {
    const source = 'function Example() {\n  const value = "hello";\n\n  return value;\n}';
    const deck = path.join(root, "deck.mdx");
    fs.writeFileSync(deck, `# Code\n\n\`\`\`ts\n${source}\n\`\`\``);
    const result = await compileDeck(deck);
    expect(result.success).toBe(true);
    const module = { exports: {} };
    Function("require", "module", "exports", result.code)(name => name === "react/compiler-runtime"
      ? { c: size => Array(size).fill(Symbol.for("react.memo_cache_sentinel")) } : require(name), module, module.exports);
    const tree = module.exports.default({ components: { Deck: "deck", Slide: "slide", pre: "pre", code: "code" } });
    const elements = [];
    const visit = node => React.Children.forEach(node, child => { if (React.isValidElement(child)) { elements.push(child); visit(child.props.children); } });
    visit(tree);
    const code = elements.find(element => element.props.highlighted);
    expect(code.type).toBe("code");
    expect(code.props.children).toBe(source + "\n");
    const highlighted = code.props.highlighted;
    expect(highlighted.version).toBe(codeHighlightVersion);
    expect(new Set(highlighted.tokens.map(token => token.color)).size).toBeGreaterThan(2);
    for (const token of highlighted.tokens) expect(source.slice(token.offset, token.offset + token.content.length)).toBe(token.content);
    expect(result.code).not.toMatch(/createHighlighter|oniguruma|highlightString/);
    expect(fs.readdirSync(path.join(root, "cache")).filter(name => name.endsWith(".cache")).some(name => fs.readFileSync(path.join(root, "cache", name), "utf8").includes(highlighted.tokens[0].color))).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.LEGEND_SLIDES_TRANSFORM_CACHE; else process.env.LEGEND_SLIDES_TRANSFORM_CACHE = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("versioned token cache survives compiler restart without calling Shiki; damage and old versions rebuild", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-code-cache-"));
  const previous = process.env.LEGEND_SLIDES_TRANSFORM_CACHE;
  process.env.LEGEND_SLIDES_TRANSFORM_CACHE = root;
  try {
    const source = "const answer = 42;", language = "typescript";
    const expected = await highlightCode(source, language);
    const key = version => createHash("sha256").update(JSON.stringify([version, language, source])).digest("hex");
    const file = path.join(root, "code", `${key(codeHighlightVersion)}.cache`);
    expect(fs.existsSync(file)).toBe(true);
    const child = Bun.spawn([process.execPath, "--eval", `import {mock} from "bun:test";
      mock.module("shiki", () => ({bundledLanguages:{}, createHighlighter(){throw Error("highlighted twice");}}));
      const {highlightCode} = await import(${JSON.stringify(path.resolve(import.meta.dirname, "../compiler/remarkCodeHighlight.ts"))});
      console.log(JSON.stringify(await highlightCode(${JSON.stringify(source)}, ${JSON.stringify(language)})));`], { env: process.env, stdout: "pipe", stderr: "pipe" });
    const [out, err, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(err).toBe(""); expect(status).toBe(0); expect(JSON.parse(out)).toEqual(expected);
    fs.renameSync(file, path.join(root, "code", `${key("old-highlighter/theme/0")}.cache`));
    expect(await highlightCode(source, language)).toEqual(expected);
    expect(fs.existsSync(file)).toBe(true);
    fs.writeFileSync(file, "damaged");
    expect(await highlightCode(source, language)).toEqual(expected);
    const edited = await highlightCode("const answer = 24;", language);
    expect(edited).not.toEqual(expected);
    for (const language of ["unknown-language", "constructor", "__proto__"])
      expect(await highlightCode(source, language)).toMatchObject({ foreground: expected.foreground });
    for (const empty of ["", "\n", "\n\n"]) expect((await highlightCode(empty)).tokens.every(token => token.content === "")).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.LEGEND_SLIDES_TRANSFORM_CACHE; else process.env.LEGEND_SLIDES_TRANSFORM_CACHE = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

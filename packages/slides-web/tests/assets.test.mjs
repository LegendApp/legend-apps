import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ExportAssets } from "../assets";
import { compileDeck } from "../../presentation/src/compiler/compileDeck";

test("embedded HTML follows local pages, CSS, modules, fetch data, fonts, srcsets and media", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-assets-")));
  const source = path.join(dir, "source"), out = path.join(dir, "out");
  await fs.mkdir(path.join(source, "nested"), { recursive: true });
  try {
    const files = {
      "page.html": '<!doctype html><link rel="stylesheet" href="./nested/style.css"><img src="nested/a%20b.png?x=1#image" srcset="nested/a%20b.png 1x, nested/other.png 2x"><video src="nested/movie.webm"></video><iframe src="nested/child.html"></iframe><script type="module" src="nested/main.js"></script><script type="application/json">{"untouched":true}</script><img src="https://example.com/remote.png">',
      "nested/child.html": '<img src="other.png"><style>body{background:url("a b.png")}</style>',
      "nested/style.css": '@import "./more.css"; @font-face{font-family:Nested;src:url("font.woff2")}body{font-family:Nested}',
      "nested/more.css": 'body{background:url("a b.png")}',
      "nested/main.js": 'import { message } from "./message.js"; fetch("data.json").then(r=>r.json()).then(data=>document.body.dataset.loaded=message+data.value);',
      "nested/message.js": 'export const message="hello";',
      "nested/data.json": '{"value":"offline"}',
      "nested/a b.png": "image", "nested/other.png": "image2", "nested/font.woff2": "font", "nested/movie.webm": "video",
    };
    for (const [file, value] of Object.entries(files)) await fs.writeFile(path.join(source, file), value);
    const assets = new ExportAssets(source, out);
    await assets.copy(path.join(source, "page.html"));
    const html = await fs.readFile(path.join(out, "assets/page.html"), "utf8");
    const css = await fs.readFile(path.join(out, "assets/nested/style.css"), "utf8");
    const script = await fs.readFile(path.join(out, "assets/nested/main.js"), "utf8");
    expect(html).not.toContain('type="module"');
    expect(html).toContain('type="application/json">{"untouched":true}');
    expect(html).toContain("./nested/a%20b.png?x=1#image");
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).toContain("data:image/png;base64,");
    expect(css).not.toContain(source);
    expect(script).toContain("data:application/json;base64,");
    expect(script).not.toContain('from "./message.js"');
    expect(await fs.readFile(path.join(out, "assets/nested/movie.webm"), "utf8")).toBe("video");
    expect(await fs.readFile(path.join(out, "assets/nested/child.html"), "utf8")).toContain("./other.png");
    expect([...assets.remoteURLs]).toEqual(["https://example.com/remote.png"]);
    const code = await assets.deck(`const src=${JSON.stringify(pathToFileURL(path.join(source, "nested/a b.png")).href)};const page={html:${JSON.stringify('<img src="nested/other.png">')}};`, path.join(source, "deck.mdx"), true);
    expect(code).toContain("data:image/png;base64,");
    expect(code).not.toContain("file:");
    expect(code.match(/data:image\/png;base64,/g)).toHaveLength(2);
    expect(assets.copied.has(path.join(source, "nested/font.woff2"))).toBe(false);
    expect(assets.copied.has(path.join(source, "nested/data.json"))).toBe(false);
    expect(await fs.exists(path.join(out, "assets/nested/font.woff2"))).toBe(false);
    expect(await fs.exists(path.join(out, "assets/nested/data.json"))).toBe(false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("missing, escaping and computed embedded dependencies fail with a useful diagnostic", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-assets-")));
  const source = path.join(dir, "source");
  await fs.mkdir(source);
  try {
    const assets = new ExportAssets(source, path.join(dir, "out"));
    const page = path.join(source, "page.html");
    await expect(assets.html('<img src="missing.png">', page)).rejects.toThrow("Missing local export asset");
    await fs.writeFile(path.join(dir, "private.png"), "private");
    await fs.symlink(path.join(dir, "private.png"), path.join(source, "linked.png"));
    await expect(assets.html('<img src="linked.png">', page)).rejects.toThrow("escapes deck");
    await expect(assets.html('<script>fetch(window.resource)</script>', page)).rejects.toThrow("computed fetch URL");
    await expect(assets.html('<script>fetch()</script>', page)).rejects.toThrow(`empty fetch URL in ${page}`);
    await expect(assets.html('<script>fetch(new URL("data.json", import.meta.url))</script>', page)).rejects.toThrow(`computed fetch URL in ${page}`);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("compiled HTML and JSX code fences remain unchanged", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-code-")));
  try {
    const deck = path.join(dir, "deck.mdx");
    await fs.writeFile(deck, '# Samples\n\n```html\n<img src="missing.png">\n<script>fetch(window.x)</script>\n```\n\n```tsx\n<View style={{flex:1}}>\n  <Text>hi</Text>\n</View>\n```');
    const compiled = await compileDeck(deck);
    expect(compiled.success).toBe(true);
    const assets = new ExportAssets(dir, path.join(dir, "out"));
    expect(await assets.deck(compiled.code, deck, false)).toBe(compiled.code);
    expect(assets.copied.size).toBe(0);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test("preserves SVGs, navigation and plain styles while rewriting resource URLs", async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-markup-")));
  try {
    const source = path.join(dir, "source"), out = path.join(dir, "out");
    await fs.mkdir(path.join(source, "sub"), { recursive: true });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text style="font-size:8px">a &amp; b</text></svg>';
    await fs.writeFile(path.join(source, "icon.svg"), svg);
    await fs.writeFile(path.join(source, "p.png"), "image");
    const assets = new ExportAssets(source, out), page = path.join(source, "page.html");
    await assets.copy(path.join(source, "icon.svg"));
    expect(await fs.readFile(path.join(out, "assets/icon.svg"), "utf8")).toBe(svg);
    const html = '<a href="/about">About</a><a href="../notes.md">Notes</a><a href="sub/">Dir</a><div style="color:red;font-size:14px">Text</div>';
    expect(await assets.html(html, page)).toBe(html);
    expect(await assets.html('<iframe src="sub/"></iframe>', page)).toBe('<iframe src="sub/"></iframe>');
    expect(await assets.html('<img src="//cdn.example.com/x.png">', page)).toContain('src="https://cdn.example.com/x.png"');
    const code = `const view=${JSON.stringify({ componentCss: 'body{background:url("p.png")}', componentScript: 'fetch("p.png")', srcdoc: '<img src="p.png">' })};`;
    const rewritten = await assets.deck(code, page, false);
    expect(rewritten.match(/data:image\/png;base64,/g)).toHaveLength(3);
    expect(rewritten).not.toContain(source);
    await assets.deck(`const text=${JSON.stringify(svg + " See https://example.com/docs.(see manual).")};`, page, false);
    expect([...assets.remoteURLs]).toEqual(["https://cdn.example.com/x.png", "https://example.com/docs"]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

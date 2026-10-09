import fs from "node:fs/promises";
import path from "node:path";
import { parseSync } from "@babel/core";
import { getDeckSourceStructure } from "../presentation/src/speakerNotesSource";

export type PreloadAsset = { source: string; slide: number; slides?: number[] };

export async function createPreloadManifest(deck: string, dependencies: string[], assets: string[]): Promise<PreloadAsset[]> {
  const source = await fs.readFile(deck, "utf8");
  const root = path.dirname(deck);
  const files = new Set(dependencies);
  const extensions = ["", ".macos.tsx", ".macos.ts", ".native.tsx", ".native.ts", ".tsx", ".ts", ".jsx", ".js", ".json", "/index.tsx", "/index.ts"];
  const resolve = (from: string, reference: string) => {
    if (!reference.startsWith(".")) return;
    const base = path.resolve(path.dirname(from), reference);
    return extensions.map(ext => base + ext).find(file => files.has(file) || assets.includes(file));
  };
  const imports = (code: string, filename: string) => {
    const tree = parseSync(code, { filename, babelrc: false, configFile: false, parserOpts: { plugins: ["typescript", "jsx"] } });
    return tree?.program.body.flatMap(node => {
      if (node.type === "ImportDeclaration") return [{ reference: node.source.value, names: node.specifiers.map(specifier => specifier.local.name) }];
      if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) return [{ reference: node.source.value, names: [] }];
      return [];
    }) ?? [];
  };
  const cache = new Map<string, string[]>();
  async function moduleAssets(file: string): Promise<string[]> {
    if (cache.has(file)) return cache.get(file)!;
    const found: string[] = [];
    cache.set(file, found);
    if (assets.includes(file)) {
      found.push(file);
      const stem = file.replace(/\.[^.]+$/, "");
      for (const extension of [".png", ".mp4", ".mov"]) {
        const companion = stem + extension;
        if (companion !== file && assets.includes(companion)) found.push(companion);
      }
    } else if (/\.[jt]sx?$/.test(file)) {
      for (const item of imports(await fs.readFile(file, "utf8"), file)) {
        const dependency = resolve(file, item.reference);
        if (dependency) found.push(...await moduleAssets(dependency));
      }
    }
    return found;
  }
  const bindings: Array<{ name: string; file: string }> = [];
  // MDX's module declarations are JavaScript, while the surrounding deck is Markdown.
  const body = source.replace(/^import\s+(?:[\s\S]*?\sfrom\s*)?["'][^"']+["'];?/gm, declaration => {
    for (const item of imports(declaration, deck + ".tsx")) {
      const file = resolve(deck, item.reference);
      if (file) bindings.push(...item.names.map(name => ({ name, file })));
    }
    return " ".repeat(declaration.length);
  });
  const manifest: PreloadAsset[] = [];
  const seen = new Map<string, PreloadAsset>();
  const add = (file: string, slide: number) => {
    const existing = seen.get(file);
    if (existing) {
      if (existing.slide !== slide && !existing.slides?.includes(slide)) (existing.slides ??= [existing.slide]).push(slide);
      return;
    }
    const asset = { source: "./assets/" + path.relative(root, file).split(path.sep).map(encodeURIComponent).join("/"), slide };
    seen.set(file, asset);
    manifest.push(asset);
  };
  const { slides } = getDeckSourceStructure(source);
  for (const [slide, range] of slides.entries()) {
    const text = body.slice(range.start, range.end);
    const references = bindings.flatMap(binding => {
      const escaped = binding.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const at = text.search(new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`));
      return at < 0 ? [] : [{ at, file: binding.file }];
    });
    for (const file of assets) {
      const at = text.indexOf(path.relative(root, file).split(path.sep).join("/"));
      if (at >= 0) references.push({ at, file });
    }
    references.sort((a, b) => a.at - b.at);
    for (const { file } of references) for (const asset of await moduleAssets(file)) add(asset, slide);
  }
  // Keep dynamically selected and otherwise unclassified media in the queue too.
  for (const file of assets) if (!seen.has(file)) add(file, slides.length);
  return manifest;
}

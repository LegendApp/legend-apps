import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { build } from "esbuild";
import { localDeckPlugin } from "./compileDeck";
import { transitionReference } from "./transitionLibrary";

/** Bundle helpers into one portable file; preserve the saved deck if it changed. */
export async function copyTransitionToDeck(deck: string, name: string, library: string) {
  const original = fs.readFileSync(deck, "utf8");
  const directory = path.dirname(deck);
  const result = await build({ stdin: { contents: `export { default } from ${JSON.stringify(`legend-transition:${name}`)};`, resolveDir: directory, loader: "ts" },
    bundle: true, format: "esm", platform: "neutral", write: false, plugins: [{ name: "portable-transition-assets", setup(api) {
      api.onLoad({ filter: /.*/, namespace: "deck-asset" }, (args) => {
        const mime = ({ ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" } as Record<string, string>)[path.extname(args.path).toLowerCase()];
        return { contents: `export default ${JSON.stringify(`data:${mime};base64,${fs.readFileSync(args.path).toString("base64")}`)};`, loader: "js" };
      });
    } }, localDeckPlugin(deck, library)] });
  let filename = `transition-${name}.ts`;
  let suffix = 2;
  while (fs.existsSync(path.join(directory, filename))) filename = `transition-${name}-${suffix++}.ts`;
  let replacements = 0;
  // Try every adjacent delimiter pair: a plain slide separator must not swallow
  // the opening delimiter of the following slide's frontmatter.
  const delimiters = [...original.matchAll(/^---[ \t]*\r?$/gm)];
  let updated = original;
  for (let index = delimiters.length - 2; index >= 0; index--) {
    const start = delimiters[index].index!;
    const end = delimiters[index + 1].index!;
    const yaml = original.slice(start + delimiters[index][0].length, end);
    const doc = parseDocument(yaml);
    if (!doc.errors.length) {
      const config = doc.toJS();
      if (config && transitionReference(config.transition) === name) {
        const value = config.transition;
        const { name: _name, ...settings } = typeof value === "object" ? value : {};
        doc.set("transition", doc.createNode({ ...settings, source: `./${filename}` }));
        replacements++;
        updated = updated.slice(0, start) + `---\n${String(doc)}---` + updated.slice(end + delimiters[index + 1][0].length);
      }
    }
  }
  if (!replacements) throw new Error(`The saved deck does not reference transition "${name}".`);
  if (fs.readFileSync(deck, "utf8") !== original) throw new Error("The deck changed during export. Try again.");
  fs.writeFileSync(path.join(directory, filename), result.outputFiles![0].text, { flag: "wx" });
  // The UI performs a native compare-and-write, protecting edits made during compilation.
  return { filename, original, updated };
}

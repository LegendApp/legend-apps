import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { build } from "esbuild";
import { getDeckSourceStructure } from "../speakerNotesSource";
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
  // Use the same metadata ranges as compilation and editing; examples are not metadata.
  const ranges = getDeckSourceStructure(original).frontmatter;
  let updated = original;
  for (const { start, end } of [...ranges].reverse()) {
    const yaml = original.slice(start, end);
    const doc = parseDocument(yaml);
    if (!doc.errors.length) {
      const config = doc.toJS();
      if (config && transitionReference(config.transition) === name) {
        const value = config.transition;
        const { name: _name, ...settings } = typeof value === "object" ? value : {};
        doc.set("transition", doc.createNode({ ...settings, source: `./${filename}` }));
        replacements++;
        updated = updated.slice(0, start) + String(doc) + updated.slice(end);
      }
    }
  }
  if (!replacements) throw new Error(`The saved deck does not reference transition "${name}".`);
  if (fs.readFileSync(deck, "utf8") !== original) throw new Error("The deck changed during export. Try again.");
  fs.writeFileSync(path.join(directory, filename), result.outputFiles![0].text, { flag: "wx" });
  // The UI performs a native compare-and-write, protecting edits made during compilation.
  return { filename, original, updated };
}

#!/usr/bin/env bun
// Scaffold one gallery effect: an example deck (the docs example and the recording script) plus its catalog entry.
import fs from "node:fs";
import path from "node:path";

const usage = `Usage: bun run effects:add <pack>/<slug> --export <Symbol> [--title T] [--description D] [--tags a,b] [--scaffold-export]

Creates packages/slides-effects/examples/<slug>/example.mdx and appends the matching
entry (snippet = example source) to packages/slides-effects/catalog.json.
--scaffold-export  also create packs/<pack>/<Symbol>.tsx and add it to pack.json
                   (a runtime source change: bump the pack version before publishing).
One deck per effect. Keep it self-contained: no talk assets, explicit stage geometry.
Add reveal steps with <Step> only when the effect has states worth recording.`;

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) { console.log(usage); process.exit(args.length ? 0 : 2); }
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [pack, slug] = (args[0] ?? "").split("/");
const symbol = option("--export");
if (!pack || !slug || !symbol) { console.error(usage); process.exit(2); }
if (!/^[a-z][a-z0-9-]*$/.test(pack) || !/^[a-z][a-z0-9-]*$/.test(slug)) throw new Error("Pack and slug must be lowercase kebab-case.");
if (!/^[A-Z][A-Za-z0-9]*$/.test(symbol)) throw new Error("--export must be a PascalCase symbol.");

const root = path.resolve(import.meta.dirname, "../../packages/slides-effects");
const packDirectory = path.join(root, "packs", pack);
const manifestFile = path.join(packDirectory, "pack.json");
if (!fs.existsSync(manifestFile)) throw new Error(`Unknown pack "${pack}". Existing: ${fs.readdirSync(path.join(root, "packs")).join(", ")}`);
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
if (!manifest.exports?.[symbol]) {
  if (!args.includes("--scaffold-export")) throw new Error(`${pack} does not export "${symbol}". Add it to pack.json or pass --scaffold-export.`);
  const file = path.join(packDirectory, `${symbol}.tsx`);
  if (fs.existsSync(file)) throw new Error(`${file} exists but is not exported; add it to pack.json by hand.`);
  fs.writeFileSync(file, `import { View } from "react-native";

/** TODO: implement. Drive motion from the host playback clock, never a JS loop. */
export function ${symbol}({ width = 1696, height = 650 }: { width?: number; height?: number }) {
  return <View style={{ width, height }} />;
}
`);
  manifest.exports[symbol] = `./${symbol}.tsx`;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Scaffolded ${path.relative(process.cwd(), file)}. Bump ${pack} from ${manifest.version} before publishing.`);
}

const catalogFile = path.join(root, "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
if (catalog.effects.some((effect: { slug: string }) => effect.slug === slug)) throw new Error(`Catalog already has "${slug}".`);
const exampleFile = path.join(root, "examples", slug, "example.mdx");
if (fs.existsSync(exampleFile)) throw new Error(`${exampleFile} already exists.`);

const title = option("--title") ?? slug.replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
const source = `---
title: ${title}
---

import { View } from "react-native";
import { ${symbol} } from "slides:${pack}/${symbol}";


# ${title}

<View style={{ width: 1696, height: 650 }}>
<${symbol} />
</View>
`;
fs.mkdirSync(path.dirname(exampleFile), { recursive: true });
fs.writeFileSync(exampleFile, source);
catalog.effects.push({
  slug, title, pack, entry: symbol, symbol,
  description: option("--description") ?? `TODO: one sentence describing ${title}.`,
  tags: (option("--tags") ?? pack).split(",").map(tag => tag.trim()).filter(Boolean),
  props: [],
  snippet: source,
});
fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Added ${slug}:
  ${path.relative(process.cwd(), exampleFile)}
  catalog entry in ${path.relative(process.cwd(), catalogFile)}
Edit the example, then run: bun run effects:sync (copies example sources into catalog snippets)
Next: open it in Slides, then: bun run effects:record ${slug}`);

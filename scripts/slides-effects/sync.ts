#!/usr/bin/env bun
// Copy each example deck into its catalog snippet; legend-docs refresh requires them to be identical.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../packages/slides-effects");
const catalogFile = path.join(root, "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
const check = process.argv.includes("--check");
let changed = 0;
for (const effect of catalog.effects) {
  const file = path.join(root, "examples", effect.slug, "example.mdx");
  if (!fs.existsSync(file)) throw new Error(`Missing example for ${effect.slug}: ${file}`);
  const source = fs.readFileSync(file, "utf8");
  if (effect.snippet !== source) { effect.snippet = source; changed++; console.log(`${check ? "stale" : "synced"}: ${effect.slug}`); }
}
const orphans = fs.readdirSync(path.join(root, "examples")).filter(slug => !catalog.effects.some((effect: { slug: string }) => effect.slug === slug));
if (orphans.length) console.warn(`Examples without catalog entries: ${orphans.join(", ")}`);
if (check) process.exit(changed || orphans.length ? 1 : 0);
if (changed) fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + "\n");
console.log(changed ? `Updated ${changed} snippet(s).` : "Snippets match their examples.");

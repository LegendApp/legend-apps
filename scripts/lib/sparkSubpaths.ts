import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..", "..");

let cache: Map<string, string[]> | undefined;

/** Import subpath -> vendored native packages, read from the installed Spark umbrella's re-export shims. */
export function sparkSubpathPackages() {
  if (cache) return cache;
  const dir = path.join(rootDir, "node_modules", "@legendapp", "spark");
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) throw new Error("@legendapp/spark is not installed. Run bun install first.");
  const exports = JSON.parse(fs.readFileSync(manifest, "utf8")).exports as Record<string, unknown>;
  const map = new Map<string, string[]>();
  for (const [subpath, target] of Object.entries(exports)) {
    if (!subpath.startsWith("./") || typeof target !== "string" || !target.endsWith(".ts")) continue;
    let source: string;
    try { source = fs.readFileSync(path.join(dir, target), "utf8"); } catch { continue; }
    const packages = [...source.matchAll(/vendor\/node_modules\/(@legendapp\/spark-[a-z-]+)/g)].map((match) => match[1]);
    if (packages.length) map.set(`@legendapp/spark/${subpath.slice(2)}`, [...new Set(packages)]);
  }
  cache = map;
  return map;
}

/** Expand `@legendapp/spark/<subpath>` native module declarations to their vendored packages. */
export function expandSparkSubpath(name: string) {
  if (!name.startsWith("@legendapp/spark/")) return [name];
  const packages = sparkSubpathPackages().get(name);
  if (!packages) throw new Error(`Unknown Spark native module subpath ${name}. Known: ${[...sparkSubpathPackages().keys()].sort().join(", ")}`);
  return packages;
}

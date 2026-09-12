import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export type Grammar = {
  bundled: false;
  testFixture?: boolean;
  name: string; aliases: string[]; extensions: string[]; filenames: string[];
  scope: string; repository: string; revision: string; directory: string;
  symbol: string; query: string; inherits: string[]; refinements: string[]; dependencies: string[];
};
export const catalog: { schemaVersion: number; packABI: number; repository: string; grammars: Grammar[] } =
  JSON.parse(readFileSync(join(root, "grammars/catalog.json"), "utf8"));
export function sourceDirectory(g: Grammar) {
  return join(root, g.testFixture ? `packages/syntax-parser/vendor/tree-sitter/${g.name}` : `grammars/.cache/${g.name}`);
}
export function validateCatalog() {
  const names = new Set<string>();
  const ids = new Set(catalog.grammars.map((g) => g.name));
  for (const g of catalog.grammars) {
    if (g.bundled !== false) throw Error(`Grammar must be downloadable, not bundled: ${g.name}`);
    if (!/^[\w-]+\/[\w.-]+$/.test(g.repository) || !/^[a-f0-9]{40}$/.test(g.revision)
      || !/^tree_sitter_[a-z0-9_]+$/.test(g.symbol)) throw Error(`Invalid pinned source: ${g.name}`);
    for (const name of [g.name, ...g.aliases]) {
      if (!/^[a-z0-9_-]+$/.test(name) || names.has(name)) throw Error(`Duplicate/invalid language: ${name}`);
      names.add(name);
    }
    for (const name of [...g.dependencies, ...g.inherits]) if (!ids.has(name)) throw Error(`Unknown dependency: ${name}`);
  }
  const visit = (name: string, path: string[]) => {
    if (path.includes(name)) throw Error(`Grammar dependency cycle: ${[...path, name].join(" -> ")}`);
    const g = catalog.grammars.find((g) => g.name === name)!;
    for (const dependency of new Set([...g.dependencies, ...g.inherits])) visit(dependency, [...path, name]);
  };
  for (const g of catalog.grammars) visit(g.name, []);
}
export function queryFor(name: string): string {
  const g = catalog.grammars.find((g) => g.name === name);
  if (!g) throw Error(`Unknown language: ${name}`);
  const upstream = (name: string): string => {
    const entry = catalog.grammars.find((g) => g.name === name)!;
    let query = readFileSync(join(sourceDirectory(entry), "highlights.scm"), "utf8");
    const patches = JSON.parse(readFileSync(join(root, "grammars/query-patches.json"), "utf8"));
    for (const patch of patches[name] ?? []) {
      if (query.split(patch.from).length - 1 !== patch.count) throw Error(`Upstream query patch drift: ${name}`);
      query = query.replaceAll(patch.from, patch.to);
    }
    return [...entry.inherits.map(upstream), query].join("\n");
  };
  return [upstream(name),
    ...g.refinements.map((name) => readFileSync(join(root, `grammars/queries/${name}-refinements.scm`), "utf8")),
  ].join("\n");
}

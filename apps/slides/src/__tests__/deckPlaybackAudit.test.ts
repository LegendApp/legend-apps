import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

test("RNConnection and its local dependency graph leave animation clocks to the host", () => {
  const entry = fileURLToPath(new URL("../../decks/react-native-desktop/rnconnection.mdx", import.meta.url));
  const visited = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\b(?:requestAnimationFrame|setInterval|setTimeout|useFrameCallback|withTiming|withRepeat)\s*\(|\bAnimated\.(?:timing|loop|sequence|parallel)\s*\(|\b(?:performance|Date)\.now\s*\(/,
      `Deck component owns animation timing: ${file}`);
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      const path = resolve(dirname(file), match[1]);
      const dependency = [path, path + ".tsx", path + ".ts", resolve(path, "index.ts"), resolve(path, "index.tsx")]
        .find(candidate => /\.(?:ts|tsx)$/.test(candidate) && existsSync(candidate));
      if (dependency) visit(dependency);
    }
  }
  visit(entry);
  assert.ok(visited.size > 20, "Audit should cover nested components, not only the MDX entrypoint");
});

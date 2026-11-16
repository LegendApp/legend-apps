import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const packs = path.join(root, "packages/slides-effects/packs");

// Same archive the docs publisher hashes: every .ts/.tsx/.json file, sorted by path.
function runtimeFiles(directory: string, prefix = ""): [string, string][] {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(directory, entry.name), relative = prefix + entry.name;
    return entry.isDirectory() ? runtimeFiles(file, relative + "/") : /\.(tsx?|json)$/.test(file) ? [[relative, fs.readFileSync(file, "utf8")] as [string, string]] : [];
  });
}
const archiveSha = (id: string) => createHash("sha256")
  .update(JSON.stringify({ schemaVersion: 1, files: Object.fromEntries(runtimeFiles(path.join(packs, id))) }) + "\n").digest("hex");

function lockFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? lockFiles(file) : entry.name.endsWith(".effects.lock.json") ? [file] : [];
  });
}

test("shipped example decks pin the current version and archive of each pack", () => {
  const files = [...lockFiles(path.join(root, "apps/slides/examples")), ...lockFiles(path.join(root, "packages/slides-effects/examples"))];
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    for (const [id, pin] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")).packs) as [string, { version?: string; sha256?: string }][]) {
      const label = `${path.relative(root, file)}: ${id}`;
      expect(pin.version, label).toBe(JSON.parse(fs.readFileSync(path.join(packs, id, "pack.json"), "utf8")).version);
      expect(pin.sha256, label).toBe(archiveSha(id));
    }
  }
});

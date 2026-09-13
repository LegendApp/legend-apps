import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Supply real, unmodified source files. Each binary must use the same grammar
// objects and compiler flags. Compile everything before starting this matrix.
const [manifestPath, repetitions = "3", ...binaryPaths] = process.argv.slice(2);
if (!manifestPath || binaryPaths.length < 2) throw new Error("Usage: node benchmark-corpus.ts MANIFEST.json REPETITIONS BASELINE CANDIDATE [...]");
const fixtures: { name: string; path: string; language: string }[] = JSON.parse(readFileSync(manifestPath, "utf8"));
const binaries = binaryPaths.map((path) => resolve(path));
const records: Record<string, unknown>[] = [];
const expected = new Map<string, string>();
const count = Number(repetitions);
if (!Number.isInteger(count) || count < 1) throw new Error("Repetitions must be a positive integer");
for (const fixture of fixtures) {
  for (let repetition = 0; repetition < count; ++repetition) {
    const order = binaries.map((_, i) => (i + repetition) % binaries.length);
    for (const variant of order) {
      const result = JSON.parse(execFileSync(binaries[variant], [resolve(fixture.path), fixture.language, "roundtrip"], { encoding: "utf8", timeout: 180000 }));
      if (!result.hash || !Number.isFinite(result.highlight_ms)) throw new Error("Missing benchmark output");
      if (expected.has(fixture.name) && expected.get(fixture.name) !== result.hash) throw new Error(`Token mismatch: ${fixture.name}, variant ${variant}`);
      expected.set(fixture.name, result.hash);
      records.push({ fixture: fixture.name, variant, repetition, ...result });
    }
  }
  console.error(`Verified ${fixture.name}`);
}
console.log(JSON.stringify({
  date: new Date().toISOString(),
  cpu: execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], { encoding: "utf8" }).trim(),
  variants: binaryPaths.map((path) => path.split("/").pop()),
  scope: "Native mirror/parse/highlight, excluding file decoding, UI rendering and grammar downloading. Full token hashes must match.",
  fixtures: fixtures.map(({ name, path, language }) => ({ name, language, bytes: readFileSync(path).length, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") })),
  records,
}, null, 2));

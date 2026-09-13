import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Compile reference/optimized binaries first; never overlap compilation or CPU
// profiling with the timed matrix. Each record is a fresh native process.
const [directory, compilerFile, declarationsFile] = process.argv.slice(2);
if (!directory || !compilerFile || !declarationsFile) throw new Error("Usage: node benchmark-highlighting.ts BUILD_DIR TYPESCRIPT_JS LIB_DOM_D_TS");
const fixtures = [
  { name: "compiler", path: compilerFile, language: "javascript" },
  { name: "declarations", path: declarationsFile, language: "typescript" },
  { name: "synthetic-10MiB", path: "synthetic", language: "typescript" },
];
const records: Record<string, unknown>[] = [];
const hashes = new Map<string, string>();
for (const fixture of fixtures) for (let repetition = 0; repetition < 3; ++repetition) {
  for (const variant of repetition % 2 ? ["optimized", "reference"] : ["reference", "optimized"]) {
    for (const mode of fixture.name === "compiler" ? ["roundtrip", "worker", "4096", "whole", "scheduler"] : ["roundtrip"]) {
      const output = execFileSync(join(directory, variant), [fixture.path, fixture.language, mode], { encoding: "utf8", timeout: 180000 });
      const result = JSON.parse(output);
      if (result.hash) {
        if (hashes.has(fixture.name) && hashes.get(fixture.name) !== result.hash) throw new Error(`Token mismatch: ${fixture.name}/${variant}/${mode}`);
        hashes.set(fixture.name, result.hash);
      }
      records.push({ fixture: fixture.name, repetition, variant, ...result });
    }
  }
}
console.log(JSON.stringify({
  date: new Date().toISOString(),
  cpu: execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], { encoding: "utf8" }).trim(),
  scope: "Optimized native harness; scheduler uses real SourceInputView without UI drawing, downloads or theme I/O. Not end-to-end app time.",
  fixtures: fixtures.map(({ name, path }) => ({ name, sha256: path === "synthetic" ? null : createHash("sha256").update(readFileSync(path)).digest("hex") })),
  records,
}, null, 2));

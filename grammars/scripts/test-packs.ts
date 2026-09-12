import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { root } from "./catalog";
const output = resolve(process.argv[2]?.startsWith("--") ? ".legend/grammars/local" : process.argv[2] ?? ".legend/grammars/local");
const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
const archOption = process.argv.indexOf("--arch");
const selectedArch = archOption < 0 ? undefined : process.argv[archOption + 1];
if (selectedArch && !["arm64", "x86_64"].includes(selectedArch)) throw Error("Expected --arch arm64 or x86_64");
const run = (command: string, args: string[]) => execFileSync(command, args, { cwd: root, stdio: "inherit" });
const binaries = new Map<string, string>();
function binaryFor(arch: string) {
  if (binaries.has(arch)) return binaries.get(arch)!;
  // Fail clearly if this host cannot execute an architecture. Never publish a
  // pack that only passed a cross-compile without its parser/query being run.
  const build = mkdtempSync(join(tmpdir(), `legend-grammar-pack-test-${arch}-`));
  run("node", ["packages/syntax-parser/scripts/compile-tree-sitter.ts", build, "--runtime-only", "--arch", arch]);
  const objects = readdirSync(build).filter((name) => name.endsWith(".o")).map((name) => join(build, name));
  const binary = join(build, "pack-test");
  run("clang++", ["-std=c++20", "-arch", arch, "-O2", "-Wall", "-Wextra", "-Werror", "grammars/tests/Pack.test.cpp",
    "packages/syntax-parser/cpp/TreeSitterHighlighter.cpp", ...objects, "-o", binary]);
  binaries.set(arch, binary);
  return binary;
}
let checked = 0;
for (const pack of Object.values(manifest.packs) as any[]) {
  for (const [platform, artifact] of Object.entries(pack.platforms) as [string, any][]) {
    const path = join(output, artifact.filename);
    const bytes = readFileSync(path);
    if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw Error(`Corrupt pack ${path}`);
    run("codesign", ["--verify", "--strict", path]);
    const arch = platform.endsWith("arm64") ? "arm64" : "x86_64";
    if (selectedArch && arch !== selectedArch) continue;
    run(binaryFor(arch), [path]); checked++;
  }
}
if (!checked) throw Error("No executable packs for this host");

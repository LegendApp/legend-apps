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
const fixtures = JSON.parse(readFileSync(join(root, "grammars/tests/fixtures/expectations.json"), "utf8"));
function binaryFor(arch: string) {
  if (binaries.has(arch)) return binaries.get(arch)!;
  // Fail clearly if this host cannot execute an architecture. Never publish a
  // pack that only passed a cross-compile without its parser/query being run.
  run("/usr/bin/arch", [`-${arch}`, "/usr/bin/true"]);
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
const failures: string[] = [];
for (const [name, pack] of Object.entries(manifest.packs) as [string, any][]) {
  for (const [platform, artifact] of Object.entries(pack.platforms) as [string, any][]) {
    const path = join(output, artifact.filename);
    const bytes = readFileSync(path);
    if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw Error(`Corrupt pack ${path}`);
    run("codesign", ["--verify", "--strict", path]);
    const arch = platform.endsWith("arm64") ? "arm64" : "x86_64";
    if (selectedArch && arch !== selectedArch) continue;
    const fixture = fixtures[name];
    const dependencies = (pack.dependencies as string[]).map((name) => join(output, manifest.packs[name].platforms[platform].filename));
    const binary = binaryFor(arch);
    try {
      run(binary, [path, ...(fixture ? [join(root, "grammars/tests/fixtures", fixture.file), fixture.token, fixture.capture, ...dependencies] : [])]); checked++;
    } catch { failures.push(`${name}/${arch}`); }
  }
}
if (!checked) throw Error("No executable packs for this host");
if (failures.length) throw Error(`Failed grammar packs: ${failures.join(", ")}`);
console.log(`Verified ${checked} dynamically loaded grammar packs.`);

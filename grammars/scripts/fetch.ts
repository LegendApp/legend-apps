import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { catalog, sourceDirectory, sourcePatches, sourcePatchHash, validateCatalog } from "./catalog";
validateCatalog();
const scratch = mkdtempSync(join(tmpdir(), "legend-grammar-sources-"));
const selected = process.argv.indexOf("--language");
function generateIfNeeded(destination: string, patched = false) {
  if (!patched && existsSync(join(destination, "src/parser.c"))) return;
  const cli = process.env.LEGEND_TREE_SITTER_CLI;
  const grammar = !patched && existsSync(join(destination, "src/grammar.json")) ? "src/grammar.json" : "grammar.js";
  const args = ["generate", "--abi", "14", grammar];
  if (cli) {
    if (!execFileSync(cli, ["--version"], { encoding: "utf8" }).startsWith("tree-sitter 0.25.10")) throw Error("Expected tree-sitter-cli 0.25.10");
    execFileSync(cli, args, { cwd: destination, stdio: "inherit" });
  } else execFileSync("npx", ["--yes", "tree-sitter-cli@0.25.10", ...args], { cwd: destination, stdio: "inherit" });
}
for (const g of catalog.grammars.filter((g) => !g.testFixture)) {
  if (selected >= 0 && process.argv[selected + 1] !== g.name) continue;
  const destination = sourceDirectory(g);
  const metadata = join(destination, "UPSTREAM.json");
  const patches = sourcePatches[g.name] ?? [];
  const patchHash = sourcePatchHash(g.name);
  const cached = existsSync(metadata) ? JSON.parse(readFileSync(metadata, "utf8")) : undefined;
  if (!process.argv.includes("--force") && cached?.revision === g.revision && (cached.patchHash === patchHash || (!patches.length && !cached.patchHash))) {
    generateIfNeeded(destination); continue;
  }
  const archive = join(scratch, `${g.name}.tar.gz`);
  execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "2", "--max-time", "60",
    `https://codeload.github.com/${g.repository}/tar.gz/${g.revision}`, "-o", archive]);
  execFileSync("tar", ["-xzf", archive, "-C", scratch]);
  const checkout = join(scratch, `${g.repository.split("/")[1]}-${g.revision}`);
  for (const patch of patches) {
    const path = join(checkout, g.directory, patch.file);
    const source = readFileSync(path, "utf8");
    if (source.split(patch.from).length - 1 !== patch.count) throw Error(`Upstream source patch drift: ${g.name}/${patch.file}`);
    writeFileSync(path, source.replaceAll(patch.from, patch.to));
  }
  // Some upstreams publish grammar sources rather than generated C. Generate
  // in the complete checkout so grammar.js can resolve local helper modules.
  generateIfNeeded(join(checkout, g.directory), patches.length > 0);
  mkdirSync(destination, { recursive: true });
  cpSync(join(checkout, g.directory, "src"), join(destination, "src"), { recursive: true });
  if (existsSync(join(checkout, "common"))) cpSync(join(checkout, "common"), join(destination, "../common"), { recursive: true });
  const license = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENSE.MIT"].find((name) => existsSync(join(checkout, name)));
  if (!license) throw Error(`Missing license for ${g.name}`);
  cpSync(join(checkout, license), join(destination, "LICENSE"));
  if (g.query) cpSync(join(checkout, g.query), join(destination, "highlights.scm"));
  else writeFileSync(join(destination, "highlights.scm"), "; Highlights supplied by the catalog's local refinements.\n");
  writeFileSync(metadata, JSON.stringify({ repository: g.repository, revision: g.revision, patchHash }, null, 2) + "\n");
  generateIfNeeded(destination);
  console.log(`Fetched ${g.name} at ${g.revision}`);
}

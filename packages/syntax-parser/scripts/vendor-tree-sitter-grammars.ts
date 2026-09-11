import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { patchMdxGrammar } from "./patch-mdx-grammar.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "tree-sitter-grammars.json"), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "legend-tree-grammars-"));
const downloaded = new Map<string, string>();
for (const grammar of manifest.grammars) {
  if (!/^[a-z0-9-]+$/.test(grammar.name) || !/^[\w-]+\/[\w-]+$/.test(grammar.repository)
    || !/^[a-f0-9]{40}$/.test(grammar.revision)) throw new Error("Invalid pinned grammar manifest");
  const key = `${grammar.repository}@${grammar.revision}`;
  let checkout = downloaded.get(key);
  if (!checkout) {
    const archive = join(scratch, `${grammar.name}.tar.gz`);
    execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "2",
      `https://codeload.github.com/${grammar.repository}/tar.gz/${grammar.revision}`, "-o", archive]);
    execFileSync("tar", ["-xzf", archive, "-C", scratch]);
    checkout = join(scratch, `${grammar.repository.split("/")[1]}-${grammar.revision}`);
    downloaded.set(key, checkout);
  }
  const destination = join(root, "vendor/tree-sitter", grammar.name);
  mkdirSync(destination, { recursive: true });
  cpSync(resolve(checkout, grammar.directory, "src"), join(destination, "src"), { recursive: true });
  cpSync(join(checkout, "LICENSE"), join(destination, "LICENSE"));
  cpSync(join(checkout, grammar.query), join(destination, "highlights.scm"));
  if (grammar.name === "mdx") patchMdxGrammar(checkout, destination);
  // TS and TSX scanners include a shared sibling scanner. Keep upstream layout.
  if (existsSync(join(checkout, "common/scanner.h"))) {
    mkdirSync(join(root, "vendor/tree-sitter/common"), { recursive: true });
    cpSync(join(checkout, "common/scanner.h"), join(root, "vendor/tree-sitter/common/scanner.h"));
  }
  writeFileSync(join(destination, "UPSTREAM.json"), JSON.stringify({ repository: grammar.repository, revision: grammar.revision,
    ...(grammar.name === "mdx" ? { patch: "scripts/patch-mdx-grammar.ts", generator: "tree-sitter-cli@0.25.10", abi: 14 } : {}) }, null, 2) + "\n");
}
console.log(`Vendored ${manifest.grammars.length} pinned grammars. Scratch: ${scratch}`);

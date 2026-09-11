import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Small disposable repository outside the source checkout, for app smoke tests.
const directory = mkdtempSync(join(tmpdir(), "legend-diff-tree-smoke-"));
const source = ["export const greeting = \"Hello 🙂\";", "/* A multiline comment", "continues here */",
  ...Array.from({ length: 160 }, (_, index) => `export const value${index}: number = ${index};`),
  "export function answer() { return 42; }", ""].join("\n");
writeFileSync(join(directory, "example.ts"), source);
execFileSync("git", ["init", "--quiet", directory]);
execFileSync("git", ["-C", directory, "add", "example.ts"]);
execFileSync("git", ["-C", directory, "-c", "user.name=Diff Test", "-c", "user.email=diff-test@example.invalid", "commit", "--quiet", "-m", "test fixture"]);
writeFileSync(join(directory, "example.ts"), source.replace("Hello 🙂", "Tree-sitter 🙂").replace("return 42", "return 43"));
console.log(directory);

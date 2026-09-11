import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Slides permits HTML-style speaker notes in MDX. Keep this tiny extension
// explicit and reproducible; do not hand-edit the generated C parser.
export function patchMdxGrammar(checkout: string, destination: string) {
  const scratch = mkdtempSync(join(tmpdir(), "legend-mdx-notes-"));
  let source = readFileSync(join(checkout, "grammar.js"), "utf8");
  const line = "            $.code_span,";
  const comment = "    comment: (_) =>";
  if (source.split(line).length !== 2 || source.split(comment).length !== 2) throw new Error("Upstream MDX grammar changed; review the notes extension");
  source = source.replace(line, line + "\n            $.html_comment,");
  source = source.replace(comment, '    html_comment: (_) => token(seq("<!--", /([^-]|-[^-]|--+[^->])*/, /--+>/)),\n\n' + comment);
  writeFileSync(join(scratch, "grammar.js"), source);
  cpSync(join(checkout, "html_entities.json"), join(scratch, "html_entities.json"));
  const executable = process.env.LEGEND_TREE_SITTER_CLI ?? "npx";
  const args = process.env.LEGEND_TREE_SITTER_CLI ? [] : ["--yes", "--package=tree-sitter-cli@0.25.10", "tree-sitter"];
  const version = execFileSync(executable, [...args, "--version"], { encoding: "utf8" }).trim();
  if (!version.startsWith("tree-sitter 0.25.10 ")) throw new Error(`Unexpected parser generator: ${version}`);
  execFileSync(executable, [...args, "generate", "--abi", "14", "grammar.js"], { cwd: scratch, stdio: "inherit" });
  // Scanner is unchanged upstream code. Generation supplies parser/metadata and
  // matching headers; ordinary builds only compile these checked-in sources.
  cpSync(join(checkout, "src/scanner.c"), join(scratch, "src/scanner.c"));
  cpSync(join(scratch, "src"), join(destination, "src"), { recursive: true });
}

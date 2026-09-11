#include "../../syntax-parser/cpp/TreeSitterLineHighlighter.hpp"
#include <cassert>
#include <iostream>
using namespace margelo::nitro::legendapps::syntaxparser;
static void finish(TreeSitterLineHighlighter& syntax, const std::vector<std::string>& lines) {
  size_t slices = 0;
  while (!syntax.prepare(lines, 3)) assert(++slices < 100000);
}
int main() {
  assert(TreeSitterHighlighter::languageForPath("C:\\src\\FILE.TSX") == "tsx");
  assert(TreeSitterHighlighter::languageForPath("config.json5") == "json5");
  assert(TreeSitterHighlighter::languageForPath("main.mm").empty());
  assert(TreeSitterHighlighter::languageForPath("Dockerfile") == "dockerfile");
  std::vector<std::string> lines{"const greeting = \"🙂\"; /* comment", "still comment", "ends */ const value = 42;", ""};
  TreeSitterLineHighlighter syntax("typescript");
  assert(!syntax.prepare(lines, 1)); assert(syntax.preparedLines() == 1);
  finish(syntax, lines);
  auto captures = syntax.captures();
  auto rows = syntax.highlight(1, 2);
  assert(rows.size() == 2 && rows[0].tokens.size() == 1);
  assert(captures[rows[0].tokens[0].capture] == "comment");
  const auto first = syntax.highlight(0, 1)[0];
  bool comment = false;
  for (const auto& token : first.tokens) if (captures[token.capture] == "comment") {
    assert(token.start == 23); comment = true;
  }
  assert(comment);
  assert(syntax.highlight(99, 1).empty());
  assert(syntax.highlight(3, 1)[0].tokens.empty());
  TreeSitterLineHighlighter other("typescript");
  finish(other, {"const different = true;"});
  assert(!other.highlight(0, 1)[0].tokens.empty());
  assert(syntax.highlight(1, 1)[0].tokens.size() == rows[0].tokens.size());
  TreeSitterLineHighlighter markdown("mdx");
  finish(markdown, {"# Slide", "", "```rust", "fn main() {}", "```"});
  markdown.highlight(0, 5);
  const auto missing = markdown.missingLanguages();
  assert(std::find(missing.begin(), missing.end(), "rust") != missing.end());
  std::vector<std::string> large(10000, "const value = 42;");
  large[0] = "/* comment starts";
  large[9998] = "comment ends */";
  const auto preview = TreeSitterLineHighlighter::preview("typescript", large, 0);
  assert(preview && preview->size() == 128);
  assert(!TreeSitterLineHighlighter::preview("typescript", large, 9999));
  TreeSitterLineHighlighter full("typescript");
  finish(full, large);
  const auto tail = full.highlight(9997, 3);
  const auto fullCaptures = full.captures();
  assert(tail.size() == 3 && tail[0].tokens.size() == 1);
  assert(fullCaptures[tail[0].tokens[0].capture] == "comment");
  assert(!tail[2].tokens.empty());
  assert(full.highlight(0, 128).size() == preview->size());
  bool invalid = false;
  try { TreeSitterLineHighlighter bad("typescript"); finish(bad, {std::string("\xff")}); }
  catch (const std::runtime_error&) { invalid = true; }
  assert(invalid);
  TreeSitterLineHighlighter longLine("javascript");
  const std::vector<std::string> minified{"const text = \"" + std::string(1024 * 1024, 'x') + "🙂\";"};
  finish(longLine, minified);
  assert(!longLine.highlight(0, 1)[0].tokens.empty());
  std::cout << "Tree-sitter Diff adapter tests passed\n";
}

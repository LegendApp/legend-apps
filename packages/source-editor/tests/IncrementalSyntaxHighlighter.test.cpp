#include "../../syntax-parser/cpp/IncrementalSyntaxHighlighter.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <sstream>

using namespace margelo::nitro::legendapps::syntaxparser;

static std::shared_ptr<TextMateHighlighterContext> context(const std::string& root, const std::string& theme, bool tsx = false) {
  auto onig = textmate_oniglib_create();
  auto registry = textmate_registry_create(onig);
  assert(textmate_registry_add_grammar_from_file(registry, (root + "/tm-grammars/grammars/typescript.json").c_str()));
  if (tsx) assert(textmate_registry_add_grammar_from_file(registry, (root + "/tm-grammars/grammars/tsx.json").c_str()));
  std::ifstream file(root + "/tm-themes/themes/" + theme + ".json");
  std::ostringstream json; json << file.rdbuf();
  assert(textmate_registry_set_theme(registry, json.str().c_str()));
  auto grammar = textmate_registry_load_grammar(registry, tsx ? "source.tsx" : "source.ts");
  assert(grammar);
  return std::make_shared<TextMateHighlighterContext>(onig, registry, grammar, textmate_registry_get_color_map(registry));
}

static bool sameTokens(const HighlightedSyntaxLine& a, const HighlightedSyntaxLine& b) {
  if (a.text != b.text || a.tokens.size() != b.tokens.size()) return false;
  for (size_t i = 0; i < a.tokens.size(); ++i) {
    const auto& x = a.tokens[i]; const auto& y = b.tokens[i];
    if (x.start != y.start || x.length != y.length || x.foreground != y.foreground || x.fontStyle != y.fontStyle) return false;
  }
  return true;
}

int main(int argc, char** argv) {
  assert(argc == 2);
  const auto dark = context(argv[1], "dark-plus");
  {
    IncrementalSyntaxHighlighter repeated(dark);
    std::vector<IncrementalSyntaxLine> duplicateLines;
    for (uint64_t id = 1; id <= 2000; ++id) duplicateLines.push_back({id, "const same = 42;"});
    auto result = repeated.highlight(duplicateLines);
    assert(result.tokenizedCount < 10);
    assert(result.lines.back()->id == 2000);
    assert(sameTokens(*result.lines.front(), *result.lines.back()));
    // Identical source inside a comment must not reuse outside-comment colors.
    auto nested = repeated.highlight({{2001, "/*"}, {2002, "const same = 42;"}, {2003, "*/"}, {2004, "const same = 42;"}}, 2000);
    assert(!sameTokens(*nested.lines[1], *result.lines.back()));
    assert(sameTokens(*nested.lines[3], *result.lines.back()));
    // Eviction changes performance only, never output or incremental state.
    std::vector<IncrementalSyntaxLine> distinct;
    for (uint64_t id = 3000; id < 4200; ++id) distinct.push_back({id, "const n" + std::to_string(id) + " = 1;"});
    repeated.highlight(distinct, 2004);
    auto afterEviction = repeated.highlight({{5000, "const same = 42;"}}, 4199);
    assert(sameTokens(*afterEviction.lines[0], *result.lines.back()));
  }
  IncrementalSyntaxHighlighter incremental(dark);
  std::vector<IncrementalSyntaxLine> lines = {
    {1, "const greeting = \"👩🏽‍💻 hello\";"}, {2, "/* open comment"},
    {3, "const inside = 42;"}, {4, "*/"}, {5, "const after = true;"},
  };
  auto original = incremental.highlight(lines);
  assert(original.lines[0]->tokens.size() > 3);
  assert(original.lines[2]->tokens.size() == 1);
  assert(original.lines[2]->tokens[0].foreground != original.lines[4]->tokens[0].foreground);
  for (const auto& token : original.lines[0]->tokens) assert(token.start + token.length <= utf16Length(lines[0].text));
  auto unchanged = incremental.highlight(lines);
  assert(unchanged.tokenizedCount == 0 && unchanged.converged);
  assert(unchanged.lines[0] == original.lines[0]);

  lines[1].text = "// removed multiline opener";
  auto edited = incremental.highlight({lines.begin() + 1, lines.end()}, 1);
  auto fresh = IncrementalSyntaxHighlighter(dark).highlight(lines);
  for (size_t i = 0; i < edited.lines.size(); ++i) assert(sameTokens(*edited.lines[i], *fresh.lines[i + 1]));
  assert(edited.lines[1]->tokens.size() > 1);
  lines[1].text = "/* open comment"; // undo must propagate the state again
  auto undone = incremental.highlight({lines.begin() + 1, lines.end()}, 1);
  for (size_t i = 0; i < undone.lines.size(); ++i) assert(sameTokens(*undone.lines[i], *original.lines[i + 1]));

  incremental.erase({2, 3, 4});
  lines = {lines[0], {6, "const template = `first"}, {7, "${greeting} second`;"}, lines[4]};
  auto inserted = incremental.highlight({lines.begin() + 1, lines.end()}, 1);
  fresh = IncrementalSyntaxHighlighter(dark).highlight(lines);
  for (size_t i = 0; i < inserted.lines.size(); ++i) assert(sameTokens(*inserted.lines[i], *fresh.lines[i + 1]));

  auto light = IncrementalSyntaxHighlighter(context(argv[1], "github-light")).highlight(lines);
  assert(light.lines[0]->tokens[0].foreground != fresh.lines[0]->tokens[0].foreground);
  auto jsx = IncrementalSyntaxHighlighter(context(argv[1], "dark-plus", true)).highlight({{1, "export const App = () => <View title=\"test\">{42}</View>;"}});
  assert(jsx.lines[0]->tokens.size() > 8);

  std::vector<IncrementalSyntaxLine> large;
  for (uint64_t i = 1; i <= 10000; ++i) large.push_back({i, "const value = 42;"});
  IncrementalSyntaxHighlighter largeCache(dark);
  largeCache.highlight(large);
  large[0].text = "const value = 123;";
  auto bounded = largeCache.highlight({large.begin(), large.begin() + 128});
  assert(bounded.tokenizedCount == 1 && bounded.converged);
  std::cout << "Incremental syntax: real TextMate TS/TSX, UTF-16, multiline edits/undo, themes, and 10k-line convergence passed\n";
}

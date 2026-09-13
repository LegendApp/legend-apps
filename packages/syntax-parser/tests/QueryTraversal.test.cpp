#include "../cpp/TreeSitterHighlighter.hpp"
#include "../vendor/tree-sitter/Symbols.h"
#include <cassert>
#include <iostream>
#include <random>
#include <thread>

using namespace margelo::nitro::legendapps::syntaxparser;
extern "C" const TSLanguage* tree_sitter_javascript();

static uint64_t hash = 1469598103934665603ULL;
static void record(const std::vector<TreeSitterSpan>& spans) {
  for (const auto& span : spans) {
    hash = (hash ^ span.start) * 1099511628211ULL;
    hash = (hash ^ span.length) * 1099511628211ULL;
    for (const auto c : span.capture) hash = (hash ^ static_cast<unsigned char>(c)) * 1099511628211ULL;
  }
}
static void verify(const std::string& language, const std::u16string& source) {
  TreeSitterHighlighter highlighter(language);
  TreeSitterInput input{static_cast<uint32_t>(source.size()), [&](uint32_t offset) {
    return std::u16string_view(source).substr(offset, 3); // Exercise predicate reads across chunk boundaries.
  }};
  assert(highlighter.parse(input));
  const auto whole = highlighter.highlight(0, input.length);
  record(whole);
  for (uint32_t start = 0; start < input.length; start += 7) {
    const auto end = std::min(input.length, start + 13);
    auto window = highlighter.highlight(start, end);
    std::vector<TreeSitterSpan> clipped;
    for (auto span : whole) {
      const auto to = std::min(end, span.start + span.length);
      span.start = std::max(start, span.start);
      if (span.start < to) { span.length = to - span.start; clipped.push_back(span); }
    }
    assert(window.size() == clipped.size());
    for (size_t i = 0; i < window.size(); ++i) {
      assert(window[i].start == clipped[i].start && window[i].length == clipped[i].length
        && window[i].capture == clipped[i].capture);
    }
  }
}
int main() {
  // Complete matches can contain several captures, including captures outside
  // the viewport and multiple names on one node. Predicates apply to the match.
  const char* query = R"(
    (identifier) @variable
    (call_expression function: (identifier) @function arguments: (arguments) @arguments)
    ((variable_declarator name: (identifier) @constant value: (identifier) @type)
      (#eq? @constant "alpha") (#match? @type "^[A-Z]"))
    ((identifier) @first @second (#eq? @first "same"))
    ((identifier) @builtin (#match? @builtin "^[A-Z]") (#match? @builtin "^[A-Z_][A-Z\\d_]+$"))
    (array (identifier)+ @element)
  )";
  const auto compilations = TreeSitterHighlighter::queryCompilationCount();
  TreeSitterHighlighter::registerPack({1, "query-traversal-test", "source.js", query, tree_sitter_javascript});
  assert(TreeSitterHighlighter::queryCompilationCount() == compilations + 1);
  std::vector<std::thread> workers;
  for (int i = 0; i < 8; ++i) workers.emplace_back([] {
    TreeSitterHighlighter highlighter("query-traversal-test");
    assert(highlighter.rootScope() == "source.js");
  });
  for (auto& worker : workers) worker.join();
  assert(TreeSitterHighlighter::queryCompilationCount() == compilations + 1);
  const std::u16string original = u"const alpha = BETA; const other = Gamma; same(alpha, other); [alpha, BETA, same]; // 😀\r\n";
  for (const auto* language : {"query-traversal-test", "javascript", "typescript", "tsx"}) {
    verify(language, original);
    std::mt19937 random(91);
    const std::vector<std::u16string> inserts = {u"/*", u"*/", u"\n", u"'", u"😀", u"same", u"BETA", u"(", u"}"};
    for (int i = 0; i < 120; ++i) {
      auto source = original;
      const auto at = random() % (source.size() + 1);
      source.replace(at, random() % (source.size() - at + 1), inserts[random() % inserts.size()]);
      verify(language, source);
    }
  }
  std::cout << "Query traversal: overlapping/multi-capture/quantified matches, predicates, malformed text and viewport parity; hash=" << hash << '\n';
}

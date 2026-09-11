#include "../cpp/TreeSitterHighlighter.hpp"
#include "../vendor/tree-sitter/runtime/include/tree_sitter/api.h"
#include <cassert>
#include <iostream>

// Deliberately unprefixed: emulate a second native dependency embedding the
// runtime and the same JavaScript grammar. A symbol leak fails the link step.
extern "C" const TSLanguage* tree_sitter_javascript();

int main() {
  TSParser* other = ts_parser_new();
  assert(ts_parser_set_language(other, tree_sitter_javascript()));
  const std::string source = "const value = 42;";
  TSTree* tree = ts_parser_parse_string(other, nullptr, source.data(), source.size());
  assert(tree && !ts_node_has_error(ts_tree_root_node(tree)));
  using namespace margelo::nitro::legendapps::syntaxparser;
  TreeSitterHighlighter ours("javascript");
  const std::u16string text = u"const view = <View />;";
  assert(ours.parse({static_cast<uint32_t>(text.size()), [&](uint32_t offset) { return std::u16string_view(text).substr(offset); }}));
  assert(!ours.highlight(0, text.size()).empty());
  ts_tree_delete(tree);
  ts_parser_delete(other);
  std::cout << "Tree-sitter: isolated runtime and JavaScript grammar coexist with unprefixed copies\n";
}

#include "../vendor/tree-sitter/Symbols.h"
#include "../vendor/tree-sitter/runtime/include/tree_sitter/api.h"
#include <cassert>
#include <iostream>
#include <set>
#include <string>

extern "C" const TSLanguage* tree_sitter_javascript();
static std::multiset<uint16_t> patterns(TSQuery* query, TSTree* tree) {
  auto* cursor = ts_query_cursor_new();
  ts_query_cursor_exec(cursor, query, ts_tree_root_node(tree));
  TSQueryMatch match;
  std::multiset<uint16_t> result;
  while (ts_query_cursor_next_match(cursor, &match)) result.insert(match.pattern_index);
  ts_query_cursor_delete(cursor);
  return result;
}
int main() {
  auto* parser = ts_parser_new();
  assert(ts_parser_set_language(parser, tree_sitter_javascript()));
  const std::string source = "const value = 42; value; @@@";
  auto* tree = ts_parser_parse_string(parser, nullptr, source.data(), source.size());
  const std::string text = "(identifier) @name\n(number) @number\n(ERROR) @error\n(_) @wildcard";
  uint32_t offset; TSQueryError error;
  auto* query = ts_query_new(tree_sitter_javascript(), text.data(), text.size(), &offset, &error);
  assert(query);
  auto all = patterns(query, tree);
  assert(all.count(0) == 2 && all.count(1) == 1 && all.count(2) > 0 && all.count(3) > 0);
  // Pattern mutation must not leave cached offsets pointing to shifted entries.
  ts_query_disable_pattern(query, 0);
  all.erase(0); assert(patterns(query, tree) == all);
  ts_query_disable_pattern(query, 1);
  all.erase(1); assert(patterns(query, tree) == all);
  ts_query_disable_capture(query, "wildcard", 8);
  assert(patterns(query, tree) == all);
  ts_query_delete(query);
  query = ts_query_new(tree_sitter_javascript(), "", 0, &offset, &error);
  assert(query && patterns(query, tree).empty());
  ts_query_delete(query); ts_tree_delete(tree); ts_parser_delete(parser);
  std::cout << "Query dispatch: symbol hits/misses, ERROR, wildcard, disabled patterns/captures and empty queries passed\n";
}

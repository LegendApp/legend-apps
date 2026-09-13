#include "../cpp/QueryRegex.hpp"
#include <cassert>
#include <iostream>
#include <random>
using namespace margelo::nitro::legendapps::syntaxparser;
int main() {
  QueryRegexCache cache;
  std::vector<std::string> patterns = {"^[A-Z]", "^[A-Z_][A-Z\\d_]+$", "^(arguments|module|console|window|document)$", "a.*z", "^$", "[0-9]+", "^(|a)$", "^(a|)$", "^(a.*|b)$", "^(a\\d|b)$"};
  std::vector<std::regex> expressions;
  for (const auto& pattern : patterns) expressions.emplace_back(pattern, std::regex::ECMAScript | std::regex::optimize);
  std::vector<QueryRegex> optimized;
  for (const auto& pattern : patterns) optimized.emplace_back(pattern);
  const std::string alphabet = "ABCxyz_0129$\n\r\t\x7f";
  std::mt19937 random(29);
  std::vector<std::string> values = {"", "A", "AA", "A1", "_A", "console", "Console", "AA\n", "AA\r\n", "module", "window", "document", "arguments", std::string(300, 'A')};
  for (int i = 0; i < 20000; ++i) {
    std::string value;
    for (size_t count = random() % 24; count; --count) value += alphabet[random() % alphabet.size()];
    values.push_back(value);
  }
  for (int pass = 0; pass < 2; ++pass) for (const auto& value : values) for (const auto& expression : expressions)
    assert(cache.search(value, expression) == std::regex_search(value, expression));
  for (const auto& value : values) for (size_t i = 0; i < patterns.size(); ++i)
    assert(optimized[i].search(value) == std::regex_search(value, expressions[i]));
  std::cout << "Query regex cache: reference parity, collisions, repeats, long strings and control characters passed\n";
}

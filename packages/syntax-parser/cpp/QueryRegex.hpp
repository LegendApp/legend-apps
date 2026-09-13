#pragma once
#include <array>
#include <cstdint>
#include <memory>
#include <regex>
#include <string>
#include <string_view>
#include <vector>

namespace margelo::nitro::legendapps::syntaxparser {
// Recognize only exact, equivalent ASCII forms; every other pattern retains
// ECMAScript regex behavior. This is not a second general-purpose regex engine.
class QueryRegex {
  enum Kind { General, UpperPrefix, UpperConstant, LiteralAlternatives } kind_ = General;
  std::vector<std::string> alternatives_;
  std::regex expression_;
public:
  explicit QueryRegex(const std::string& pattern) : expression_(pattern, std::regex::ECMAScript | std::regex::optimize) {
    if (pattern == "^[A-Z]") kind_ = UpperPrefix;
    else if (pattern == "^[A-Z_][A-Z\\d_]+$") kind_ = UpperConstant;
    else if (pattern.starts_with("^(") && pattern.ends_with(")$")) {
      const auto body = pattern.substr(2, pattern.size() - 4);
      // Restrict this optimization to nonempty ASCII words, with no escaping,
      // regex metacharacters or empty alternatives.
      size_t start = 0;
      for (size_t i = 0; i <= body.size(); ++i) {
        if (i == body.size() || body[i] == '|') {
          if (i == start) return;
          alternatives_.push_back(body.substr(start, i - start)); start = i + 1;
        } else if (!((body[i] >= 'a' && body[i] <= 'z') || (body[i] >= 'A' && body[i] <= 'Z') || (body[i] >= '0' && body[i] <= '9') || body[i] == '_')) return;
      }
      kind_ = LiteralAlternatives;
    }
  }
  const std::regex& expression() const { return expression_; }
  bool general() const {
#if defined(LEGEND_SYNTAX_TEST_GRAMMARS) && defined(LEGEND_QUERY_REGEX_REFERENCE)
    return false; // Test-only baseline: bypass both fast paths and memoization.
#elif defined(LEGEND_SYNTAX_TEST_GRAMMARS) && defined(LEGEND_QUERY_REGEX_CACHE_ONLY)
    return true;
#else
    return kind_ == General;
#endif
  }
  bool search(const std::string& text) const {
#if defined(LEGEND_SYNTAX_TEST_GRAMMARS) && defined(LEGEND_QUERY_REGEX_REFERENCE)
    return std::regex_search(text, expression_);
#endif
    const auto upper = [](char c) { return c >= 'A' && c <= 'Z'; };
    if (kind_ == UpperPrefix) return !text.empty() && upper(text[0]);
    if (kind_ == UpperConstant) {
      if (text.size() < 2 || !(upper(text[0]) || text[0] == '_')) return false;
      for (char c : text) if (!(upper(c) || (c >= '0' && c <= '9') || c == '_')) return false;
      return true;
    }
    if (kind_ == LiteralAlternatives) {
      for (const auto& word : alternatives_) if (word == text) return true;
      return false;
    }
    return std::regex_search(text, expression_);
  }
};
// Pure text predicates can reuse answers across nodes/revisions. Direct mapping
// bounds both storage and lookup time; collisions replace entries, not answers.
// Expressions belong to immutable compiled queries and outlive this cache.
class QueryRegexCache {
  struct Entry { const std::regex* expression = nullptr; std::string text; bool matched = false; };
  // Most JS/TS predicates take a fast path. Avoid allocating a cache for those
  // workers, or for Markdown inline workers that never evaluate general regexes.
  std::unique_ptr<std::array<Entry, 512>> entries_;
public:
  bool search(const std::string& text, const std::regex& expression) {
    if (text.size() > 256) return std::regex_search(text, expression);
    if (!entries_) entries_ = std::make_unique<std::array<Entry, 512>>();
    auto& entry = (*entries_)[(std::hash<std::string>{}(text) ^ (reinterpret_cast<uintptr_t>(&expression) >> 4)) % entries_->size()];
    if (entry.expression == &expression && entry.text == text) return entry.matched;
    entry.expression = &expression; entry.text = text;
    return entry.matched = std::regex_search(text, expression);
  }
};
}

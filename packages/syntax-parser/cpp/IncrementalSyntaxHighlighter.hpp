#pragma once

#include "SyntaxHighlighter.hpp"
#include <cstdint>
#include <unordered_map>

namespace margelo::nitro::legendapps::syntaxparser {

struct StyledSyntaxToken {
  size_t start;
  size_t length;
  std::string foreground;
  int fontStyle;
};

struct HighlightedSyntaxLine {
  uint64_t id;
  std::string text;
  std::vector<StyledSyntaxToken> tokens;
};

struct IncrementalSyntaxLine { uint64_t id; std::string text; };
struct IncrementalSyntaxBatch {
  std::vector<std::shared_ptr<const HighlightedSyntaxLine>> lines;
  bool converged = false;
  size_t tokenizedCount = 0;
};

// Serial-worker owned. Immutable results may be read by the renderer. Stable
// line IDs allow insertions/deletions without renumbering the token cache.
class IncrementalSyntaxHighlighter {
public:
  IncrementalSyntaxHighlighter(std::string language, std::string theme);
  explicit IncrementalSyntaxHighlighter(std::shared_ptr<TextMateHighlighterContext> context);
  IncrementalSyntaxBatch highlight(const std::vector<IncrementalSyntaxLine>& lines, uint64_t previousLineId = 0);
  void erase(const std::vector<uint64_t>& ids);

private:
  struct Entry {
    TextMateStateStack before;
    TextMateStateStack after;
    std::shared_ptr<const HighlightedSyntaxLine> line;
  };
  std::string language_, theme_;
  std::shared_ptr<TextMateHighlighterContext> context_;
  SyntaxStyleState styles_;
  std::unordered_map<uint64_t, Entry> cache_;
};

} // namespace margelo::nitro::legendapps::syntaxparser

#include "IncrementalSyntaxHighlighter.hpp"
#include "../vendor/TextMateLib/packages/tml-cpp/src/types.h"
#include <stdexcept>

namespace margelo::nitro::legendapps::syntaxparser {

static bool sameState(TextMateStateStack left, TextMateStateStack right) {
  return left == right || (left && right && static_cast<tml::StateStack*>(left)->equals(static_cast<tml::StateStack*>(right)));
}

IncrementalSyntaxHighlighter::IncrementalSyntaxHighlighter(std::string language, std::string theme)
    : language_(std::move(language)), theme_(std::move(theme)) {}
IncrementalSyntaxHighlighter::IncrementalSyntaxHighlighter(std::shared_ptr<TextMateHighlighterContext> context)
    : context_(std::move(context)) {}

IncrementalSyntaxBatch IncrementalSyntaxHighlighter::highlight(const std::vector<IncrementalSyntaxLine>& lines, uint64_t previousLineId) {
  if (!context_) context_ = getHighlighterContext(language_, theme_);
  std::lock_guard<std::mutex> lock(context_->mutex);
  TextMateStateStack state = textmate_get_initial_state();
  if (previousLineId) {
    const auto previous = cache_.find(previousLineId);
    if (previous == cache_.end()) throw std::logic_error("Missing preceding syntax state");
    state = previous->second.after;
  }
  IncrementalSyntaxBatch result;
  for (const auto& input : lines) {
    const auto old = cache_.find(input.id);
    const auto before = state;
    if (old != cache_.end() && old->second.line->text == input.text && sameState(old->second.before, state)) {
      state = old->second.after;
      result.lines.push_back(old->second.line);
      result.converged = true;
      continue;
    }
    const auto tokenized = tokenizeSyntaxLine(*context_, input.text, state, styles_);
    auto line = std::make_shared<HighlightedSyntaxLine>(HighlightedSyntaxLine{input.id, input.text, {}});
    for (const auto& token : tokenized.tokens) {
      const auto& style = styles_.styles.at(static_cast<size_t>(token.styleId));
      line->tokens.push_back({static_cast<size_t>(token.startColumn), static_cast<size_t>(token.length), style.foreground, static_cast<int>(style.fontStyle)});
    }
    result.converged = old != cache_.end() && sameState(old->second.after, state);
    cache_.insert_or_assign(input.id, Entry{before, state, line});
    result.lines.push_back(std::move(line));
    ++result.tokenizedCount;
  }
  return result;
}

void IncrementalSyntaxHighlighter::erase(const std::vector<uint64_t>& ids) {
  for (auto id : ids) cache_.erase(id);
}

} // namespace margelo::nitro::legendapps::syntaxparser

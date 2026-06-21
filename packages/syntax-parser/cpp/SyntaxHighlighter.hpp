#pragma once

#include "../nitrogen/generated/shared/c++/SyntaxHighlightTiming.hpp"
#include "../nitrogen/generated/shared/c++/SyntaxRenderLine.hpp"
#include "../nitrogen/generated/shared/c++/SyntaxStyle.hpp"

#include "../vendor/TextMateLib/packages/tml-cpp/src/c_api.h"

#include <chrono>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace margelo::nitro::legenddesktop::syntaxparser {

using SyntaxClock = std::chrono::steady_clock;

struct SyntaxTokenizedLine {
  std::vector<SyntaxTokenRun> tokens;
  double tokenCount = 0;
};

struct SyntaxStyleState {
  std::vector<SyntaxStyle> styles;
  std::map<std::pair<int, int>, double> styleIds;
};

class TextMateHighlighterContext {
public:
  TextMateHighlighterContext(TextMateOnigLib onig, TextMateRegistry registry, TextMateGrammar grammar, TextMateColorMap* colorMap);
  TextMateHighlighterContext(const TextMateHighlighterContext&) = delete;
  TextMateHighlighterContext& operator=(const TextMateHighlighterContext&) = delete;
  ~TextMateHighlighterContext();

  TextMateGrammar grammar() const;
  TextMateColorMap* colorMap() const;

  std::mutex mutex;

private:
  TextMateOnigLib onig_ = nullptr;
  TextMateRegistry registry_ = nullptr;
  TextMateGrammar grammar_ = nullptr;
  TextMateColorMap* colorMap_ = nullptr;
};

double elapsedSyntaxMs(SyntaxClock::time_point start, SyntaxClock::time_point end);
double utf16Length(const std::string& text);
std::vector<std::string> splitSyntaxLines(const std::string& source);
std::shared_ptr<TextMateHighlighterContext> getHighlighterContext(const std::string& language, const std::string& theme);
SyntaxTokenizedLine tokenizeSyntaxLine(
    TextMateHighlighterContext& context,
    const std::string& line,
    TextMateStateStack& state,
    SyntaxStyleState& styleState);

} // namespace margelo::nitro::legenddesktop::syntaxparser

#pragma once

#include "../nitrogen/generated/shared/c++/SyntaxRenderLine.hpp"
#include "../nitrogen/generated/shared/c++/SyntaxStyle.hpp"

#include <chrono>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace margelo::nitro::legendapps::syntaxparser {

using SyntaxClock = std::chrono::steady_clock;

struct SyntaxScopeTokenRun {
  double startColumn = 0;
  double length = 0;
  double scopeId = 0;
};

struct SyntaxStyleState {
  std::vector<SyntaxStyle> styles;
};

struct SyntaxScopeState {
  std::vector<std::vector<std::string>> scopes;
  std::map<std::vector<std::string>, double> scopeIds;
};

double elapsedSyntaxMs(SyntaxClock::time_point start, SyntaxClock::time_point end);
double utf16Length(const std::string& text);
std::vector<std::string> splitSyntaxLines(const std::string& source);
std::string getSyntaxLanguageForPath(const std::string& path);
std::vector<SyntaxStyle> resolveSyntaxScopeStyles(
    const std::string& theme,
    const std::vector<std::vector<std::string>>& scopes,
    size_t startIndex);

} // namespace margelo::nitro::legendapps::syntaxparser

#include "SyntaxHighlighter.hpp"
#include "TreeSitterHighlighter.hpp"
#include <algorithm>

namespace margelo::nitro::legendapps::syntaxparser {
double elapsedSyntaxMs(SyntaxClock::time_point start, SyntaxClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

double utf16Length(const std::string& text) {
  size_t length = 0;
  size_t byteIndex = 0;

  while (byteIndex < text.size()) {
    const auto byte = static_cast<unsigned char>(text[byteIndex]);
    size_t codepointBytes = 1;
    size_t codeUnits = 1;

    if ((byte & 0b11100000u) == 0b11000000u) {
      codepointBytes = 2;
    } else if ((byte & 0b11110000u) == 0b11100000u) {
      codepointBytes = 3;
    } else if ((byte & 0b11111000u) == 0b11110000u) {
      codepointBytes = 4;
      codeUnits = 2;
    }

    byteIndex += std::min(codepointBytes, text.size() - byteIndex);
    length += codeUnits;
  }

  return static_cast<double>(length);
}

std::vector<std::string> splitSyntaxLines(const std::string& source) {
  std::vector<std::string> lines;
  std::string currentLine;

  for (const char character : source) {
    if (character == '\n') {
      if (!currentLine.empty() && currentLine.back() == '\r') {
        currentLine.pop_back();
      }
      lines.push_back(currentLine);
      currentLine.clear();
    } else {
      currentLine.push_back(character);
    }
  }

  lines.push_back(currentLine);
  return lines;
}


std::string getSyntaxLanguageForPath(const std::string& path) {
  return TreeSitterHighlighter::languageForPath(path);
}
} // namespace margelo::nitro::legendapps::syntaxparser

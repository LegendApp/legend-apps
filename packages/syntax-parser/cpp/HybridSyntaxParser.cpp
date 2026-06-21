#include "HybridSyntaxParser.hpp"

#include "../vendor/TextMateLib/packages/tml-cpp/src/c_api.h"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace margelo::nitro::legenddesktop::syntaxparser {

namespace {

using Clock = std::chrono::steady_clock;

constexpr uint32_t fontStyleMask = 0b00000000000000000111100000000000u;
constexpr uint32_t foregroundMask = 0b00000000111111111000000000000000u;
constexpr int fontStyleOffset = 11;
constexpr int foregroundOffset = 15;

struct GrammarConfig {
  std::string scopeName;
  std::vector<std::string> grammarFiles;
};

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

int getFontStyle(uint32_t metadata) {
  return static_cast<int>((metadata & fontStyleMask) >> fontStyleOffset);
}

int getForegroundId(uint32_t metadata) {
  return static_cast<int>((metadata & foregroundMask) >> foregroundOffset);
}

std::filesystem::path packageRoot() {
  auto current = std::filesystem::path(__FILE__);
  return current.parent_path().parent_path();
}

std::string readTextFile(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("Failed to read syntax asset: " + path.string());
  }

  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

std::vector<std::string> splitLines(const std::string& source) {
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

std::string normalizeOption(std::string value) {
  for (char& character : value) {
    if (character == '_' || character == ' ') {
      character = '-';
    } else {
      character = static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
    }
  }
  return value;
}

GrammarConfig getGrammarConfig(const std::string& language) {
  const auto normalized = normalizeOption(language);

  if (normalized == "typescript" || normalized == "ts") {
    return {
        "source.ts",
        {"javascript.json", "typescript.json"},
    };
  }

  if (normalized == "typescriptreact" || normalized == "tsx") {
    return {
        "source.tsx",
        {"javascript.json", "typescript.json", "jsx.json", "tsx.json"},
    };
  }

  if (normalized == "javascript" || normalized == "js") {
    return {
        "source.js",
        {"javascript.json"},
    };
  }

  throw std::runtime_error("Unsupported syntax language: " + language);
}

std::string getThemeFileName(const std::string& theme) {
  const auto normalized = normalizeOption(theme);

  if (normalized == "github-dark") {
    return "github-dark-dimmed.json";
  }

  if (normalized == "dark-plus") {
    return "dark-plus.json";
  }

  throw std::runtime_error("Unsupported syntax theme: " + theme);
}

void addStyle(
    std::vector<SyntaxStyle>& styles,
    std::map<std::pair<int, int>, double>& styleIds,
    int foregroundId,
    int fontStyle,
    const std::string& foreground) {
  const auto key = std::make_pair(foregroundId, fontStyle);
  if (styleIds.find(key) != styleIds.end()) {
    return;
  }

  const auto id = static_cast<double>(styles.size());
  styleIds[key] = id;
  styles.push_back(SyntaxStyle(id, foreground, static_cast<double>(fontStyle)));
}

} // namespace

HybridSyntaxParser::HybridSyntaxParser() : HybridObject(TAG) {}

std::shared_ptr<Promise<SyntaxHighlightResult>> HybridSyntaxParser::highlightString(
    const std::string& source,
    const std::string& language,
    const std::string& theme) {
  return Promise<SyntaxHighlightResult>::async([source, language, theme]() -> SyntaxHighlightResult {
    const auto startedAt = Clock::now();
    const auto root = packageRoot();
    const auto grammarsRoot = root / "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/raw";
    const auto themesRoot = root / "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes";
    const auto grammarConfig = getGrammarConfig(language);
    const auto themeJson = readTextFile(themesRoot / getThemeFileName(theme));

    TextMateOnigLib onig = textmate_oniglib_create();
    if (!onig) {
      throw std::runtime_error("Failed to create TextMate Oniguruma runtime.");
    }

    TextMateRegistry registry = textmate_registry_create(onig);
    if (!registry) {
      textmate_oniglib_dispose(onig);
      throw std::runtime_error("Failed to create TextMate registry.");
    }

    for (const auto& grammarFile : grammarConfig.grammarFiles) {
      const auto grammarPath = grammarsRoot / grammarFile;
      if (!textmate_registry_add_grammar_from_file(registry, grammarPath.string().c_str())) {
        textmate_registry_dispose(registry);
        textmate_oniglib_dispose(onig);
        throw std::runtime_error("Failed to register TextMate grammar: " + grammarPath.string());
      }
    }

    if (!textmate_registry_set_theme(registry, themeJson.c_str())) {
      textmate_registry_dispose(registry);
      textmate_oniglib_dispose(onig);
      throw std::runtime_error("Failed to set TextMate theme: " + theme);
    }

    TextMateColorMap* colorMap = textmate_registry_get_color_map(registry);
    if (!colorMap) {
      textmate_registry_dispose(registry);
      textmate_oniglib_dispose(onig);
      throw std::runtime_error("Failed to read TextMate theme color map.");
    }

    TextMateGrammar grammar = textmate_registry_load_grammar(registry, grammarConfig.scopeName.c_str());
    if (!grammar) {
      textmate_free_color_map(colorMap);
      textmate_registry_dispose(registry);
      textmate_oniglib_dispose(onig);
      throw std::runtime_error("Failed to load TextMate grammar scope: " + grammarConfig.scopeName);
    }

    const auto lines = splitLines(source);
    std::vector<SyntaxRenderLine> renderLines;
    std::vector<SyntaxStyle> styles;
    std::map<std::pair<int, int>, double> styleIds;
    renderLines.reserve(lines.size());

    TextMateStateStack state = textmate_get_initial_state();
    double tokenCount = 0;

    for (size_t lineIndex = 0; lineIndex < lines.size(); lineIndex += 1) {
      const auto& line = lines[lineIndex];
      const auto lineLength = utf16Length(line);
      TextMateTokenizeResult2* result = textmate_tokenize_line2_utf16(grammar, line.c_str(), state);
      if (!result) {
        textmate_free_color_map(colorMap);
        textmate_registry_dispose(registry);
        textmate_oniglib_dispose(onig);
        throw std::runtime_error("Failed to tokenize syntax line.");
      }

      state = result->ruleStack;
      std::vector<SyntaxTokenRun> tokens;
      tokens.reserve(result->tokenCount / 2);

      for (int i = 0; i + 1 < result->tokenCount; i += 2) {
        const auto startColumn = static_cast<double>(result->tokens[i]);
        const auto nextStartColumn = i + 2 < result->tokenCount
            ? static_cast<double>(result->tokens[i + 2])
            : lineLength;
        const auto length = nextStartColumn - startColumn;

        if (length <= 0) {
          continue;
        }

        const uint32_t metadata = result->tokens[i + 1];
        const int foregroundId = getForegroundId(metadata);
        const int fontStyle = getFontStyle(metadata);
        const std::string foreground = foregroundId >= 0 && foregroundId < colorMap->colorCount
            ? std::string(colorMap->colors[foregroundId])
            : std::string();

        addStyle(styles, styleIds, foregroundId, fontStyle, foreground);
        const auto styleId = styleIds.at(std::make_pair(foregroundId, fontStyle));
        tokens.push_back(SyntaxTokenRun(startColumn, length, styleId));
        tokenCount += 1;
      }

      renderLines.push_back(SyntaxRenderLine(
          static_cast<double>(lineIndex),
          line,
          std::move(tokens)));
      textmate_free_tokenize_result2(result);
    }

    textmate_free_color_map(colorMap);
    textmate_registry_dispose(registry);
    textmate_oniglib_dispose(onig);

    const auto finishedAt = Clock::now();
    SyntaxHighlightTiming timing(
        static_cast<double>(lines.size()),
        tokenCount,
        static_cast<double>(styles.size()),
        elapsedMs(startedAt, finishedAt));
    return SyntaxHighlightResult(std::move(renderLines), std::move(styles), timing);
  });
}

} // namespace margelo::nitro::legenddesktop::syntaxparser

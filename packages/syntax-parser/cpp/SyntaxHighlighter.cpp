#include "SyntaxHighlighter.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace margelo::nitro::legenddesktop::syntaxparser {

namespace {

constexpr uint32_t fontStyleMask = 0b00000000000000000111100000000000u;
constexpr uint32_t foregroundMask = 0b00000000111111111000000000000000u;
constexpr int fontStyleOffset = 11;
constexpr int foregroundOffset = 15;

struct GrammarConfig {
  std::string scopeName;
  std::vector<std::string> grammarFiles;
};

struct HighlighterCacheEntry {
  std::condition_variable cv;
  std::shared_ptr<TextMateHighlighterContext> context;
  SyntaxHighlightTiming timing;
  std::string error;
  bool failed = false;
  bool ready = false;
};

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

  if (normalized.empty()) {
    throw std::runtime_error("Unsupported syntax theme: " + theme);
  }

  for (const char character : normalized) {
    const bool isAlphaNumeric = std::isalnum(static_cast<unsigned char>(character));
    if (!isAlphaNumeric && character != '-') {
      throw std::runtime_error("Unsupported syntax theme: " + theme);
    }
  }

  return normalized + ".json";
}

std::vector<std::string> warmupLinesForLanguage(const std::string& language) {
  const auto normalized = normalizeOption(language);

  if (normalized == "tsx" || normalized == "typescriptreact") {
    return {
        "import React, { memo, useCallback, useMemo, useState } from \"react\";",
        "import { Pressable, StyleSheet, Text, View } from \"react-native\";",
        "",
        "type Item = {",
        "  id: string;",
        "  label?: string;",
        "  count: number;",
        "  tags: string[];",
        "  meta?: { selected?: boolean; tone: \"info\" | \"warning\" | \"danger\" };",
        "};",
        "",
        "type Props<T extends Item = Item> = {",
        "  value?: string | null;",
        "  count?: number;",
        "  items?: readonly T[];",
        "  onSelect?: (item: T, index: number) => void;",
        "};",
        "",
        "const titlePattern = /[A-Z][\\w-]+/g;",
        "const fallbackItems: Item[] = Array.from({ length: 24 }, (_, index) => ({",
        "  id: `row-${index}`;",
        "  label: index % 3 === 0 ? undefined : `Item ${index}`;",
        "  count: index * 2;",
        "  tags: [`tag-${index % 4}`, index > 10 ? \"later\" : \"early\"],",
        "  meta: { selected: index === 2, tone: index % 2 === 0 ? \"info\" : \"warning\" },",
        "}));",
        "",
        "function formatLabel(item: Item, index: number) {",
        "  const label = item.label?.trim() || `Untitled ${index}`;",
        "  return titlePattern.test(label) ? label.replace(titlePattern, (match) => match.toLowerCase()) : label;",
        "}",
        "",
        "export const WarmupRow = memo(function WarmupRow({ item, index, onSelect }: { item: Item; index: number; onSelect?: Props[\"onSelect\"] }) {",
        "  const selected = item.meta?.selected === true;",
        "  const handlePress = useCallback(() => {",
        "    onSelect?.(item, index);",
        "  }, [index, item, onSelect]);",
        "",
        "  return (",
        "    <Pressable",
        "      testID={`warmup-row-${item.id}`}",
        "      accessibilityRole=\"button\"",
        "      accessibilityState={{ selected }}",
        "      onPress={handlePress}",
        "      style={[styles.row, selected && styles.selectedRow]}",
        "    >",
        "      <View style={styles.content}>",
        "        <Text numberOfLines={1} style={styles.title}>",
        "          {formatLabel(item, index)}",
        "        </Text>",
        "        <Text style={styles.subtitle}>",
        "          {item.tags.map((tag) => `#${tag}`).join(\" \")}",
        "        </Text>",
        "      </View>",
        "      <Text style={styles.count}>{item.count ?? 0}</Text>",
        "    </Pressable>",
        "  );",
        "});",
        "",
        "export function WarmupList<T extends Item>({ value, count = 0, items, onSelect }: Props<T>) {",
        "  const [filter, setFilter] = useState(value ?? \"\");",
        "  const rows = useMemo(() => {",
        "    const source = items?.length ? items : fallbackItems;",
        "    return source",
        "      .filter((item) => !filter || item.label?.toLowerCase().includes(filter.toLowerCase()))",
        "      .map((item, index) => ({ ...item, count: item.count + count + index }));",
        "  }, [count, filter, items]);",
        "",
        "  return (",
        "    <View style={styles.container}>",
        "      <Text style={styles.heading}>{filter ? `Filtered: ${filter}` : \"All rows\"}</Text>",
        "      {rows.length > 0 ? rows.map((item, index) => (",
        "        <WarmupRow key={item.id} item={item} index={index} onSelect={onSelect} />",
        "      )) : (",
        "        <Text style={styles.empty}>No matches for {filter || \"current query\"}</Text>",
        "      )}",
        "      <Pressable onPress={() => setFilter((current) => current.slice(0, -1))}>",
        "        <Text>{`Clear ${filter.length}`}</Text>",
        "      </Pressable>",
        "    </View>",
        "  );",
        "}",
        "",
        "const styles = StyleSheet.create({",
        "  container: { flex: 1, padding: 12, gap: 8 },",
        "  row: { flexDirection: \"row\", alignItems: \"center\", gap: 8, paddingVertical: 4 },",
        "  selectedRow: { backgroundColor: \"#1f6feb22\" },",
        "  content: { flex: 1, minWidth: 0 },",
        "  heading: { fontWeight: \"700\" },",
        "  title: { color: \"#c9d1d9\" },",
        "  subtitle: { color: \"#8b949e\" },",
        "  count: { fontVariant: [\"tabular-nums\"] },",
        "  empty: { color: \"#f85149\" },",
        "});",
    };
  }

  return {
      "type Item = {",
      "  id: string;",
      "  label?: string;",
      "  count: number;",
      "  tags: string[];",
      "  meta?: { selected?: boolean; tone: \"info\" | \"warning\" | \"danger\" };",
      "};",
      "",
      "type Props<T extends Item = Item> = {",
      "  value?: string | null;",
      "  count?: number;",
      "  items?: readonly T[];",
      "  onSelect?: (item: T, index: number) => void;",
      "};",
      "",
      "const titlePattern = /[A-Z][\\w-]+/g;",
      "const fallbackItems: Item[] = Array.from({ length: 24 }, (_, index) => ({",
      "  id: `row-${index}`;",
      "  label: index % 3 === 0 ? undefined : `Item ${index}`;",
      "  count: index * 2;",
      "  tags: [`tag-${index % 4}`, index > 10 ? \"later\" : \"early\"],",
      "  meta: { selected: index === 2, tone: index % 2 === 0 ? \"info\" : \"warning\" },",
      "}));",
      "",
      "function formatLabel(item: Item, index: number) {",
      "  const label = item.label?.trim() || `Untitled ${index}`;",
      "  return titlePattern.test(label) ? label.replace(titlePattern, (match) => match.toLowerCase()) : label;",
      "}",
      "",
      "export function warmup<T extends Item>({ value, count = 0, items, onSelect }: Props<T>) {",
      "  const filter = value ?? \"\";",
      "  const source = items?.length ? items : fallbackItems;",
      "  const rows = source",
      "    .filter((item) => !filter || item.label?.toLowerCase().includes(filter.toLowerCase()))",
      "    .map((item, index) => ({ ...item, count: item.count + count + index }));",
      "",
      "  for (const [index, item] of rows.entries()) {",
      "    if (item.meta?.selected) {",
      "      onSelect?.(item, index);",
      "    }",
      "  }",
      "",
      "  return rows.reduce((total, item, index) => total + formatLabel(item, index).length + item.count, 0);",
      "}",
  };
}

void addStyle(
    SyntaxStyleState& styleState,
    int foregroundId,
    int fontStyle,
    const std::string& foreground) {
  const auto key = std::make_pair(foregroundId, fontStyle);
  if (styleState.styleIds.find(key) != styleState.styleIds.end()) {
    return;
  }

  const auto id = static_cast<double>(styleState.styles.size());
  styleState.styleIds[key] = id;
  styleState.styles.push_back(SyntaxStyle(id, foreground, static_cast<double>(fontStyle)));
}

std::shared_ptr<TextMateHighlighterContext> createHighlighterContext(
    const GrammarConfig& grammarConfig,
    const std::string& theme,
    const std::filesystem::path& grammarsRoot,
    const std::filesystem::path& themesRoot) {
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

  return std::make_shared<TextMateHighlighterContext>(onig, registry, grammar, colorMap);
}

SyntaxHighlighterWarmupResult createWarmedHighlighterContext(
    const std::string& language,
    const std::string& theme) {
  const auto startedAt = SyntaxClock::now();
  const auto root = packageRoot();
  const auto grammarsRoot = root / "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-grammars/raw";
  const auto themesRoot = root / "vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes";
  auto context = createHighlighterContext(getGrammarConfig(language), theme, grammarsRoot, themesRoot);
  const auto contextReadyAt = SyntaxClock::now();

  SyntaxStyleState styleState;
  TextMateStateStack state = textmate_get_initial_state();
  double tokenCount = 0;
  const auto lines = warmupLinesForLanguage(language);

  {
    std::lock_guard<std::mutex> contextLock(context->mutex);
    for (const auto& line : lines) {
      auto tokenizedLine = tokenizeSyntaxLine(*context, line, state, styleState);
      tokenCount += tokenizedLine.tokenCount;
    }
  }

  const auto finishedAt = SyntaxClock::now();
  return SyntaxHighlighterWarmupResult{
      context,
      SyntaxHighlightTiming(
          static_cast<double>(lines.size()),
          tokenCount,
          static_cast<double>(styleState.styles.size()),
          0,
          0,
          elapsedSyntaxMs(startedAt, contextReadyAt),
          elapsedSyntaxMs(contextReadyAt, finishedAt),
          elapsedSyntaxMs(contextReadyAt, finishedAt),
          elapsedSyntaxMs(startedAt, finishedAt)),
  };
}

} // namespace

TextMateHighlighterContext::TextMateHighlighterContext(
    TextMateOnigLib onig,
    TextMateRegistry registry,
    TextMateGrammar grammar,
    TextMateColorMap* colorMap)
    : onig_(onig), registry_(registry), grammar_(grammar), colorMap_(colorMap) {}

TextMateHighlighterContext::~TextMateHighlighterContext() {
  if (colorMap_) {
    textmate_free_color_map(colorMap_);
  }
  if (registry_) {
    textmate_registry_dispose(registry_);
  }
  if (onig_) {
    textmate_oniglib_dispose(onig_);
  }
}

TextMateGrammar TextMateHighlighterContext::grammar() const {
  return grammar_;
}

TextMateColorMap* TextMateHighlighterContext::colorMap() const {
  return colorMap_;
}

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

SyntaxHighlighterWarmupResult warmHighlighterContext(
    const std::string& language,
    const std::string& theme) {
  const auto normalizedLanguage = normalizeOption(language);
  const auto normalizedTheme = normalizeOption(theme);
  const auto key = normalizedLanguage + ":" + normalizedTheme;
  static std::mutex cacheMutex;
  static std::map<std::string, std::shared_ptr<HighlighterCacheEntry>> contextCache;
  std::shared_ptr<HighlighterCacheEntry> entry;
  bool shouldWarm = false;

  {
    std::unique_lock<std::mutex> lock(cacheMutex);
    const auto cached = contextCache.find(key);
    if (cached != contextCache.end()) {
      entry = cached->second;
      entry->cv.wait(lock, [&entry]() {
        return entry->ready || entry->failed;
      });
      if (entry->failed) {
        throw std::runtime_error(entry->error);
      }
      return SyntaxHighlighterWarmupResult{entry->context, entry->timing};
    }

    entry = std::make_shared<HighlighterCacheEntry>();
    contextCache[key] = entry;
    shouldWarm = true;
  }

  if (shouldWarm) {
    try {
      auto result = createWarmedHighlighterContext(language, theme);

      {
        std::lock_guard<std::mutex> lock(cacheMutex);
        entry->context = result.context;
        entry->timing = result.timing;
        entry->ready = true;
      }
      entry->cv.notify_all();
      return result;
    } catch (const std::exception& error) {
      {
        std::lock_guard<std::mutex> lock(cacheMutex);
        entry->error = error.what();
        entry->failed = true;
      }
      entry->cv.notify_all();
      throw;
    }
  }

  throw std::runtime_error("Failed to warm syntax highlighter.");
}

std::shared_ptr<TextMateHighlighterContext> getHighlighterContext(
    const std::string& language,
    const std::string& theme) {
  return warmHighlighterContext(language, theme).context;
}

SyntaxTokenizedLine tokenizeSyntaxLine(
    TextMateHighlighterContext& context,
    const std::string& line,
    TextMateStateStack& state,
    SyntaxStyleState& styleState) {
  const auto lineLength = utf16Length(line);
  TextMateTokenizeResult2* result = textmate_tokenize_line2_utf16(context.grammar(), line.c_str(), state);
  if (!result) {
    throw std::runtime_error("Failed to tokenize syntax line.");
  }

  state = result->ruleStack;
  SyntaxTokenizedLine tokenizedLine;
  tokenizedLine.tokens.reserve(result->tokenCount / 2);

  for (int i = 0; i + 1 < result->tokenCount; i += 2) {
    const auto startColumn = static_cast<double>(result->tokens[i]);
    const auto nextStartColumn = i + 2 < result->tokenCount
        ? static_cast<double>(result->tokens[i + 2])
        : lineLength;
    const auto length = nextStartColumn - startColumn;

    if (length > 0) {
      const uint32_t metadata = result->tokens[i + 1];
      const int foregroundId = getForegroundId(metadata);
      const int fontStyle = getFontStyle(metadata);
      TextMateColorMap* colorMap = context.colorMap();
      const std::string foreground = foregroundId >= 0 && foregroundId < colorMap->colorCount
          ? std::string(colorMap->colors[foregroundId])
          : std::string();

      addStyle(styleState, foregroundId, fontStyle, foreground);
      const auto styleId = styleState.styleIds.at(std::make_pair(foregroundId, fontStyle));
      tokenizedLine.tokens.push_back(SyntaxTokenRun(startColumn, length, styleId));
      tokenizedLine.tokenCount += 1;
    }
  }

  textmate_free_tokenize_result2(result);
  return tokenizedLine;
}

} // namespace margelo::nitro::legenddesktop::syntaxparser

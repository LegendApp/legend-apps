#include "SyntaxHighlighter.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <limits.h>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif

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

struct SyntaxAssetRoots {
  std::filesystem::path applicationSupportRoot;
  std::filesystem::path bundledRoot;
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

bool canReadFile(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  return static_cast<bool>(input);
}

#ifdef __APPLE__
std::string stringFromCFString(CFStringRef string) {
  if (!string) {
    return {};
  }

  char buffer[PATH_MAX];
  if (CFStringGetCString(string, buffer, sizeof(buffer), kCFStringEncodingUTF8)) {
    return std::string(buffer);
  }

  const CFIndex length = CFStringGetLength(string);
  const CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
  std::string value(static_cast<size_t>(maxSize), '\0');
  if (!CFStringGetCString(string, value.data(), maxSize, kCFStringEncodingUTF8)) {
    return {};
  }
  value.resize(std::char_traits<char>::length(value.c_str()));
  return value;
}

std::filesystem::path pathFromUrl(CFURLRef url) {
  if (!url) {
    return {};
  }

  UInt8 buffer[PATH_MAX];
  if (!CFURLGetFileSystemRepresentation(url, true, buffer, sizeof(buffer))) {
    return {};
  }
  return std::filesystem::path(reinterpret_cast<const char*>(buffer));
}

std::string applicationSupportFolderName() {
  CFBundleRef mainBundle = CFBundleGetMainBundle();
  if (!mainBundle) {
    return "Legend Desktop";
  }

  CFDictionaryRef info = CFBundleGetInfoDictionary(mainBundle);
  CFStringRef displayName = nullptr;
  CFStringRef bundleName = nullptr;

  if (info) {
    const void* displayValue = CFDictionaryGetValue(info, CFSTR("CFBundleDisplayName"));
    if (displayValue && CFGetTypeID(static_cast<CFTypeRef>(displayValue)) == CFStringGetTypeID()) {
      displayName = static_cast<CFStringRef>(displayValue);
    }

    const void* bundleValue = CFDictionaryGetValue(info, kCFBundleNameKey);
    if (bundleValue && CFGetTypeID(static_cast<CFTypeRef>(bundleValue)) == CFStringGetTypeID()) {
      bundleName = static_cast<CFStringRef>(bundleValue);
    }
  }

  const auto displayNameString = stringFromCFString(displayName);
  if (!displayNameString.empty()) {
    return displayNameString;
  }

  const auto bundleNameString = stringFromCFString(bundleName);
  if (!bundleNameString.empty()) {
    return bundleNameString;
  }

  const auto bundleIdentifierString = stringFromCFString(CFBundleGetIdentifier(mainBundle));
  return bundleIdentifierString.empty() ? "Legend Desktop" : bundleIdentifierString;
}

std::filesystem::path applicationSupportRoot() {
  const char* home = std::getenv("HOME");
  if (!home || home[0] == '\0') {
    return {};
  }

  return std::filesystem::path(home) / "Library" / "Application Support" / applicationSupportFolderName();
}

std::filesystem::path resourceBundleRoot(const char* bundleName) {
  CFBundleRef mainBundle = CFBundleGetMainBundle();
  if (!mainBundle) {
    return {};
  }

  CFStringRef bundleNameString = CFStringCreateWithCString(nullptr, bundleName, kCFStringEncodingUTF8);
  if (!bundleNameString) {
    return {};
  }

  CFURLRef bundleUrl = CFBundleCopyResourceURL(mainBundle, bundleNameString, CFSTR("bundle"), nullptr);
  CFRelease(bundleNameString);

  if (!bundleUrl) {
    return {};
  }

  CFBundleRef resourceBundle = CFBundleCreate(nullptr, bundleUrl);
  CFRelease(bundleUrl);

  if (!resourceBundle) {
    return {};
  }

  CFURLRef resourcesUrl = CFBundleCopyResourcesDirectoryURL(resourceBundle);
  const auto resourcesPath = pathFromUrl(resourcesUrl);
  if (resourcesUrl) {
    CFRelease(resourcesUrl);
  }
  CFRelease(resourceBundle);

  return resourcesPath;
}
#endif

SyntaxAssetRoots syntaxAssetRoots(const char* resourceBundleName, const char* assetFolderName) {
  SyntaxAssetRoots roots;
#ifdef __APPLE__
  const auto supportRoot = applicationSupportRoot();
  if (!supportRoot.empty()) {
    roots.applicationSupportRoot = supportRoot / "syntax-assets" / assetFolderName;
  }
  if (!roots.applicationSupportRoot.empty()) {
    std::error_code error;
    std::filesystem::create_directories(roots.applicationSupportRoot, error);
  }

  roots.bundledRoot = resourceBundleRoot(resourceBundleName);
#endif
  return roots;
}

std::filesystem::path resolveSyntaxAssetFile(const SyntaxAssetRoots& roots, const std::string& filename) {
  if (!roots.applicationSupportRoot.empty()) {
    const auto applicationSupportPath = roots.applicationSupportRoot / filename;
    if (canReadFile(applicationSupportPath)) {
      return applicationSupportPath;
    }
  }

  if (!roots.bundledRoot.empty()) {
    const auto bundledPath = roots.bundledRoot / filename;
    if (canReadFile(bundledPath)) {
      return bundledPath;
    }
  }

  return roots.applicationSupportRoot.empty() ? std::filesystem::path(filename) : roots.applicationSupportRoot / filename;
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

std::string lowerPath(std::string path) {
  for (char& character : path) {
    character = static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
  }
  return path;
}

std::string fileExtension(const std::string& path) {
  const auto slash = path.find_last_of("/\\");
  const auto dot = path.find_last_of('.');
  if (dot == std::string::npos || (slash != std::string::npos && dot < slash)) {
    return "";
  }
  return path.substr(dot + 1);
}

std::string fileName(const std::string& path) {
  const auto slash = path.find_last_of("/\\");
  return slash == std::string::npos ? path : path.substr(slash + 1);
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

  if (normalized == "javascriptreact" || normalized == "jsx") {
    return {
        "source.jsx",
        {"javascript.json", "jsx.json"},
    };
  }

  if (normalized == "javascript" || normalized == "js") {
    return {
        "source.js",
        {"javascript.json"},
    };
  }

  if (normalized == "json" || normalized == "jsonc" || normalized == "json5" || normalized == "jsonl") {
    return {
        "source.json",
        {"json.json"},
    };
  }

  if (normalized == "yaml" || normalized == "yml") {
    return {
        "source.yaml",
        {"yaml.json"},
    };
  }

  if (normalized == "markdown" || normalized == "md" || normalized == "mdx") {
    return {
        "text.html.markdown",
        {"markdown.json"},
    };
  }

  if (normalized == "css") {
    return {
        "source.css",
        {"css.json"},
    };
  }

  if (normalized == "scss") {
    return {
        "source.css.scss",
        {"css.json", "scss.json"},
    };
  }

  if (normalized == "html") {
    return {
        "text.html.basic",
        {"html.json"},
    };
  }

  if (normalized == "xml") {
    return {
        "text.xml",
        {"xml.json"},
    };
  }

  if (normalized == "shellscript" || normalized == "shell" || normalized == "bash" || normalized == "sh" || normalized == "zsh") {
    return {
        "source.shell",
        {"shellscript.json"},
    };
  }

  if (normalized == "python" || normalized == "py") {
    return {
        "source.python",
        {"python.json"},
    };
  }

  if (normalized == "ruby" || normalized == "rb") {
    return {
        "source.ruby",
        {"ruby.json"},
    };
  }

  if (normalized == "swift") {
    return {
        "source.swift",
        {"swift.json"},
    };
  }

  if (normalized == "kotlin" || normalized == "kt" || normalized == "kts") {
    return {
        "source.kotlin",
        {"kotlin.json"},
    };
  }

  if (normalized == "java") {
    return {
        "source.java",
        {"java.json"},
    };
  }

  if (normalized == "cpp" || normalized == "c++" || normalized == "cc" || normalized == "cxx" || normalized == "hpp" || normalized == "h++") {
    return {
        "source.cpp",
        {"cpp.json"},
    };
  }

  if (normalized == "c" || normalized == "h") {
    return {
        "source.c",
        {"c.json"},
    };
  }

  if (normalized == "objective-c" || normalized == "objc" || normalized == "m") {
    return {
        "source.objc",
        {"c.json", "objective-c.json"},
    };
  }

  if (normalized == "objective-cpp" || normalized == "objcpp" || normalized == "mm") {
    return {
        "source.objcpp",
        {"cpp.json", "objective-cpp.json"},
    };
  }

  if (normalized == "go") {
    return {
        "source.go",
        {"go.json"},
    };
  }

  if (normalized == "rust" || normalized == "rs") {
    return {
        "source.rust",
        {"rust.json"},
    };
  }

  if (normalized == "toml") {
    return {
        "source.toml",
        {"toml.json"},
    };
  }

  if (normalized == "dockerfile" || normalized == "docker") {
    return {
        "source.dockerfile",
        {"docker.json"},
    };
  }

  throw std::runtime_error("Unsupported syntax language: " + language);
}

std::string getThemeFileName(const std::string& theme) {
  const auto normalized = normalizeOption(theme);

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

  if (normalized == "yaml" || normalized == "yml") {
    return {
        "nodeLinker: node-modules",
        "npmScopes:",
        "  legend:",
        "    npmRegistryServer: \"https://registry.npmjs.org\"",
    };
  }

  if (normalized == "json" || normalized == "jsonc" || normalized == "json5" || normalized == "jsonl") {
    return {
        "{",
        "  \"name\": \"legend\",",
        "  \"private\": true,",
        "  \"scripts\": {",
        "    \"start\": \"bun start\"",
        "  }",
        "}",
    };
  }

  if (normalized == "markdown" || normalized == "md" || normalized == "mdx") {
    return {
        "# Legend",
        "",
        "A short paragraph with `inline code`.",
        "",
        "```ts",
        "const value = true;",
        "```",
    };
  }

  if (normalized == "css" || normalized == "scss") {
    return {
        ".root {",
        "  display: flex;",
        "  color: #c9d1d9;",
        "}",
    };
  }

  if (normalized == "html" || normalized == "xml") {
    return {
        "<section class=\"root\">",
        "  <h1>Legend</h1>",
        "</section>",
    };
  }

  if (normalized == "shellscript" || normalized == "shell" || normalized == "bash" || normalized == "sh" || normalized == "zsh") {
    return {
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "echo \"Legend\"",
    };
  }

  if (normalized == "python" || normalized == "py") {
    return {
        "def main():",
        "    value = \"Legend\"",
        "    print(value)",
    };
  }

  if (normalized == "ruby" || normalized == "rb") {
    return {
        "def main",
        "  puts \"Legend\"",
        "end",
    };
  }

  if (normalized == "swift") {
    return {
        "import Foundation",
        "",
        "let value = \"Legend\"",
        "print(value)",
    };
  }

  if (normalized == "kotlin" || normalized == "kt" || normalized == "kts") {
    return {
        "fun main() {",
        "  val value = \"Legend\"",
        "  println(value)",
        "}",
    };
  }

  if (normalized == "java") {
    return {
        "public class Legend {",
        "  public static void main(String[] args) {",
        "    System.out.println(\"Legend\");",
        "  }",
        "}",
    };
  }

  if (normalized == "cpp" || normalized == "c++" || normalized == "cc" || normalized == "cxx" || normalized == "hpp" || normalized == "h++") {
    return {
        "#include <string>",
        "",
        "auto value = std::string(\"Legend\");",
    };
  }

  if (normalized == "c" || normalized == "h") {
    return {
        "#include <stdio.h>",
        "",
        "int main(void) {",
        "  puts(\"Legend\");",
        "}",
    };
  }

  if (normalized == "objective-c" || normalized == "objc" || normalized == "m") {
    return {
        "#import <Foundation/Foundation.h>",
        "",
        "NSString *value = @\"Legend\";",
    };
  }

  if (normalized == "objective-cpp" || normalized == "objcpp" || normalized == "mm") {
    return {
        "#import <Foundation/Foundation.h>",
        "#include <string>",
        "",
        "auto value = std::string(\"Legend\");",
    };
  }

  if (normalized == "go") {
    return {
        "package main",
        "",
        "func main() {",
        "  println(\"Legend\")",
        "}",
    };
  }

  if (normalized == "rust" || normalized == "rs") {
    return {
        "fn main() {",
        "  let value = \"Legend\";",
        "  println!(\"{}\", value);",
        "}",
    };
  }

  if (normalized == "toml") {
    return {
        "name = \"legend\"",
        "private = true",
        "",
        "[scripts]",
        "start = \"bun start\"",
    };
  }

  if (normalized == "dockerfile" || normalized == "docker") {
    return {
        "FROM node:24",
        "WORKDIR /app",
        "CMD [\"bun\", \"start\"]",
    };
  }

  if (normalized == "javascript" || normalized == "js") {
    return {
        "const value = \"Legend\";",
        "console.log(value);",
    };
  }

  if (normalized == "javascriptreact" || normalized == "jsx") {
    return {
        "import React from \"react\";",
        "",
        "export function App() {",
        "  return <Text>Legend</Text>;",
        "}",
    };
  }

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
    const SyntaxAssetRoots& grammarsRoot,
    const SyntaxAssetRoots& themesRoot) {
  const auto themeJson = readTextFile(resolveSyntaxAssetFile(themesRoot, getThemeFileName(theme)));

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
    const auto grammarPath = resolveSyntaxAssetFile(grammarsRoot, grammarFile);
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
  const auto grammarsRoot = syntaxAssetRoots("RNSyntaxParserGrammars", "grammars");
  const auto themesRoot = syntaxAssetRoots("RNSyntaxParserThemes", "themes");
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

std::string getSyntaxLanguageForPath(const std::string& path) {
  const auto normalizedPath = lowerPath(path);
  const auto name = fileName(normalizedPath);
  const auto extension = fileExtension(normalizedPath);

  if (name == "dockerfile" || name.starts_with("dockerfile.")) {
    return "dockerfile";
  }

  if (name == ".yarnrc" || name == ".yarnrc.yml" || name == ".yarnrc.yaml" || extension == "yml") {
    return "yaml";
  }

  static const std::unordered_map<std::string, std::string> languagesByExtension = {
      {"bash", "shellscript"},
      {"c", "c"},
      {"cc", "cpp"},
      {"cpp", "cpp"},
      {"css", "css"},
      {"cxx", "cpp"},
      {"go", "go"},
      {"h", "c"},
      {"hpp", "cpp"},
      {"html", "html"},
      {"java", "java"},
      {"js", "javascript"},
      {"json", "json"},
      {"json5", "json"},
      {"jsonc", "json"},
      {"jsx", "javascriptreact"},
      {"kt", "kotlin"},
      {"kts", "kotlin"},
      {"m", "objective-c"},
      {"md", "markdown"},
      {"mdx", "markdown"},
      {"mm", "objective-cpp"},
      {"py", "python"},
      {"rb", "ruby"},
      {"rs", "rust"},
      {"scss", "scss"},
      {"sh", "shellscript"},
      {"swift", "swift"},
      {"toml", "toml"},
      {"ts", "typescript"},
      {"tsx", "tsx"},
      {"xml", "xml"},
      {"yaml", "yaml"},
      {"zsh", "shellscript"},
  };

  const auto match = languagesByExtension.find(extension);
  return match != languagesByExtension.end() ? match->second : "";
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
        contextCache.erase(key);
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

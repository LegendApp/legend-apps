#include "SyntaxHighlighter.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <limits.h>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif

namespace margelo::nitro::legendapps::syntaxparser {

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

std::shared_ptr<TextMateHighlighterContext> getHighlighterContext(
    const std::string& language,
    const std::string& theme) {
  const auto normalizedLanguage = normalizeOption(language);
  const auto normalizedTheme = normalizeOption(theme);
  const auto key = normalizedLanguage + ":" + normalizedTheme;
  static std::mutex cacheMutex;
  static std::map<std::string, std::shared_ptr<HighlighterCacheEntry>> contextCache;
  std::shared_ptr<HighlighterCacheEntry> entry;
  bool shouldLoad = false;

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
      return entry->context;
    }

    entry = std::make_shared<HighlighterCacheEntry>();
    contextCache[key] = entry;
    shouldLoad = true;
  }

  if (shouldLoad) {
    try {
      const auto grammarsRoot = syntaxAssetRoots("RNSyntaxParserGrammars", "grammars");
      const auto themesRoot = syntaxAssetRoots("RNSyntaxParserThemes", "themes");
      auto context = createHighlighterContext(getGrammarConfig(language), theme, grammarsRoot, themesRoot);

      {
        std::lock_guard<std::mutex> lock(cacheMutex);
        entry->context = context;
        entry->ready = true;
      }
      entry->cv.notify_all();
      return context;
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

  throw std::runtime_error("Failed to load syntax highlighter.");
}

std::string formatTextMateColor(uint32_t color) {
  std::ostringstream stream;
  stream
      << "#"
      << std::hex
      << std::nouppercase
      << std::setfill('0')
      << std::setw(2) << ((color >> 24) & 0xFF)
      << std::setw(2) << ((color >> 16) & 0xFF)
      << std::setw(2) << ((color >> 8) & 0xFF);
  return stream.str();
}

std::string joinScopePath(const std::vector<std::string>& scopes) {
  std::ostringstream stream;
  for (size_t index = 0; index < scopes.size(); index += 1) {
    if (index > 0) {
      stream << " ";
    }
    stream << scopes[index];
  }
  return stream.str();
}

std::shared_ptr<void> getCachedThemeHandle(const std::string& theme) {
  const auto normalizedTheme = normalizeOption(theme);
  static std::mutex cacheMutex;
  static std::map<std::string, std::shared_ptr<void>> themeCache;

  std::lock_guard<std::mutex> lock(cacheMutex);
  const auto cached = themeCache.find(normalizedTheme);
  if (cached != themeCache.end()) {
    return cached->second;
  }

  const auto themePath = resolveSyntaxAssetFile(
      syntaxAssetRoots("RNSyntaxParserThemes", "themes"),
      getThemeFileName(normalizedTheme));
  TextMateTheme themeHandle = textmate_theme_load_from_file(themePath.string().c_str());
  if (!themeHandle) {
    throw std::runtime_error("Failed to load syntax theme.");
  }

  auto managedTheme = std::shared_ptr<void>(themeHandle, textmate_theme_dispose);
  themeCache[normalizedTheme] = managedTheme;
  return managedTheme;
}

std::vector<SyntaxStyle> resolveSyntaxScopeStyles(
    const std::string& theme,
    const std::vector<std::vector<std::string>>& scopes,
    size_t startIndex) {
  auto themeHandle = getCachedThemeHandle(theme);

  const auto defaultForeground = textmate_theme_get_default_foreground(themeHandle.get());
  const auto safeStart = std::min(startIndex, scopes.size());
  std::vector<SyntaxStyle> styles;
  styles.reserve(scopes.size() - safeStart);

  for (size_t index = safeStart; index < scopes.size(); index += 1) {
    const auto scopePath = joinScopePath(scopes[index]);
    const auto foreground = textmate_theme_get_foreground(themeHandle.get(), scopePath.c_str(), defaultForeground);
    const auto fontStyle = textmate_theme_get_font_style(themeHandle.get(), scopePath.c_str(), 0);
    styles.push_back(SyntaxStyle(
        static_cast<double>(index),
        formatTextMateColor(foreground),
        static_cast<double>(std::max(0, fontStyle))));
  }

  return styles;
}

SyntaxTokenizedLine tokenizeSyntaxLine(
    TextMateHighlighterContext& context,
    const std::string& line,
    TextMateStateStack& state,
    SyntaxStyleState& styleState) {
  const auto lineLength = utf16Length(line);
  std::unique_ptr<TextMateTokenizeResult2, decltype(&textmate_free_tokenize_result2)> result(
      textmate_tokenize_line2_utf16(context.grammar(), line.c_str(), state),
      textmate_free_tokenize_result2);
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

  return tokenizedLine;
}

SyntaxScopeTokenizedLine tokenizeSyntaxScopeLine(
    TextMateHighlighterContext& context,
    const std::string& line,
    TextMateStateStack& state,
    SyntaxScopeState& scopeState) {
  std::unique_ptr<TextMateTokenizeResult, decltype(&textmate_free_tokenize_result)> result(
      textmate_tokenize_line_utf16(context.grammar(), line.c_str(), state),
      textmate_free_tokenize_result);
  if (!result) {
    throw std::runtime_error("Failed to tokenize syntax scope line.");
  }

  state = result->ruleStack;
  SyntaxScopeTokenizedLine tokenizedLine;
  tokenizedLine.tokens.reserve(result->tokenCount);

  for (int i = 0; i < result->tokenCount; i += 1) {
    const auto& token = result->tokens[i];
    const auto startColumn = static_cast<double>(token.startIndex);
    const auto length = static_cast<double>(token.endIndex - token.startIndex);
    if (length > 0) {
      std::vector<std::string> scopes;
      scopes.reserve(static_cast<size_t>(token.scopeDepth));
      for (int scopeIndex = 0; scopeIndex < token.scopeDepth; scopeIndex += 1) {
        const char* scope = token.scopes[scopeIndex];
        if (scope) {
          scopes.push_back(scope);
        }
      }

      auto scopeId = scopeState.scopeIds.find(scopes);
      if (scopeId == scopeState.scopeIds.end()) {
        const auto id = static_cast<double>(scopeState.scopes.size());
        scopeId = scopeState.scopeIds.emplace(scopes, id).first;
        scopeState.scopes.push_back(std::move(scopes));
      }

      tokenizedLine.tokens.push_back(SyntaxScopeTokenRun(startColumn, length, scopeId->second));
      tokenizedLine.tokenCount += 1;
    }
  }

  return tokenizedLine;
}

} // namespace margelo::nitro::legendapps::syntaxparser

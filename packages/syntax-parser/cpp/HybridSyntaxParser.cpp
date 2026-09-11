#include "HybridSyntaxParser.hpp"

#include "HybridSyntaxDocument.hpp"
#include "SyntaxHighlighter.hpp"
#include "TreeSitterHighlighter.hpp"
#include "TreeSitterLineHighlighter.hpp"
#include "GrammarInstaller.hpp"

#include <exception>
#include <thread>
#include <TargetConditionals.h>

namespace margelo::nitro::legendapps::syntaxparser {

HybridSyntaxParser::HybridSyntaxParser() : HybridObject(TAG) {}
bool HybridSyntaxParser::isTreeGrammarLoaded(const std::string& language) { return TreeSitterHighlighter::supports(language); }
std::string HybridSyntaxParser::getGrammarPlatform() {
#if !TARGET_OS_OSX
  return "unsupported";
#elif defined(__aarch64__)
  return "macos-arm64";
#else
  return "macos-x86_64";
#endif
}
std::shared_ptr<Promise<std::string>> HybridSyntaxParser::installTreeGrammar(const std::string& name, const std::string& url,
    const std::string& sha256, double bytes, const std::function<void(double, double)>& progress) {
  return Promise<std::string>::async([=] { return installGrammarPack(name, url, sha256, bytes, progress); });
}

std::shared_ptr<Promise<SyntaxHighlightResult>> HybridSyntaxParser::highlightString(
    const std::string& source,
    const std::string& language,
    const std::string& theme) {
  return Promise<SyntaxHighlightResult>::async([source, language, theme]() -> SyntaxHighlightResult {
    const auto startedAt = SyntaxClock::now();
    const auto context = getHighlighterContext(language, theme);
    std::lock_guard<std::mutex> contextLock(context->mutex);

    const auto lines = splitSyntaxLines(source);
    std::vector<SyntaxRenderLine> renderLines;
    SyntaxStyleState styleState;
    renderLines.reserve(lines.size());

    TextMateStateStack state = textmate_get_initial_state();
    double tokenCount = 0;

    for (size_t lineIndex = 0; lineIndex < lines.size(); lineIndex += 1) {
      auto tokenizedLine = tokenizeSyntaxLine(*context, lines[lineIndex], state, styleState);
      tokenCount += tokenizedLine.tokenCount;
      renderLines.push_back(SyntaxRenderLine(
          static_cast<double>(lineIndex),
          lines[lineIndex],
          std::move(tokenizedLine.tokens)));
    }

    const auto finishedAt = SyntaxClock::now();
    SyntaxHighlightTiming timing(
        static_cast<double>(lines.size()),
        tokenCount,
        static_cast<double>(styleState.styles.size()),
        0,
        0,
        0,
        0,
        elapsedSyntaxMs(startedAt, finishedAt),
        elapsedSyntaxMs(startedAt, finishedAt));
    return SyntaxHighlightResult(std::move(renderLines), std::move(styleState.styles), timing);
  });
}

std::shared_ptr<Promise<SyntaxFileLoadResult>> HybridSyntaxParser::loadCodeFile(
    const std::string& filePath,
    const std::string& language,
    const std::string& theme,
    double initialLineCount) {
  return Promise<SyntaxFileLoadResult>::async([filePath, language, theme, initialLineCount]() -> SyntaxFileLoadResult {
    const auto startedAt = SyntaxClock::now();
    std::shared_ptr<HybridSyntaxDocument> document;
    try {
      document = HybridSyntaxDocument::loadFile(filePath, language, theme);
    } catch (const std::exception&) {
      document = HybridSyntaxDocument::loadPlainFile(filePath);
    }
    const auto initialLinesStartedAt = SyntaxClock::now();
    SyntaxFileLoadResult result;
    result.document = document;
    result.initialLines = document->getPlainLines(0, initialLineCount);
    const auto initialLinesFinishedAt = SyntaxClock::now();
    document->setInitialLoadTiming(
        elapsedSyntaxMs(initialLinesStartedAt, initialLinesFinishedAt),
        elapsedSyntaxMs(startedAt, initialLinesFinishedAt));
    result.styles = document->getStyles();
    result.timing = document->getTiming();
    return result;
  });
}

std::shared_ptr<Promise<SyntaxHighlightResult>> HybridSyntaxParser::highlightTreeString(
    const std::string& source, const std::string& language, const std::string& theme) {
  return Promise<SyntaxHighlightResult>::async([=] {
    const auto began = SyntaxClock::now();
    const auto lines = splitSyntaxLines(source);
    std::vector<SyntaxRenderLine> rendered;
    std::vector<SyntaxStyle> styles;
    size_t tokenCount = 0;
    if (TreeSitterHighlighter::supports(language)) {
      TreeSitterLineHighlighter highlighter(language);
      while (!highlighter.prepare(lines, 256)) std::this_thread::yield();
      for (size_t start = 0; start < lines.size(); start += 128) {
        for (const auto& row : highlighter.highlight(start, 128)) {
          std::vector<SyntaxTokenRun> tokens;
          for (const auto& token : row.tokens) tokens.emplace_back(token.start, token.length, token.capture);
          tokenCount += tokens.size();
          rendered.emplace_back(row.index, lines[row.index], std::move(tokens));
        }
      }
      const auto captures = highlighter.captures();
      std::vector<std::vector<std::string>> scopes;
      for (size_t id = 0; id < captures.size(); ++id)
        scopes.push_back({TreeSitterHighlighter::rootScopeForCapture(id), TreeSitterHighlighter::themeScope(captures[id])});
      styles = resolveSyntaxScopeStyles(theme, scopes, 0);
    } else {
      for (size_t index = 0; index < lines.size(); ++index) rendered.emplace_back(index, lines[index], std::vector<SyntaxTokenRun>{});
    }
    const auto elapsed = elapsedSyntaxMs(began, SyntaxClock::now());
    const SyntaxHighlightTiming timing(lines.size(), tokenCount, styles.size(), 0, 0, 0, 0, elapsed, elapsed);
    return SyntaxHighlightResult(std::move(rendered), std::move(styles), timing);
  });
}

} // namespace margelo::nitro::legendapps::syntaxparser

#include "HybridSyntaxParser.hpp"

#include "HybridSyntaxDocument.hpp"
#include "SyntaxHighlighter.hpp"

namespace margelo::nitro::legenddesktop::syntaxparser {

HybridSyntaxParser::HybridSyntaxParser() : HybridObject(TAG) {}

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

std::shared_ptr<Promise<SyntaxHighlightTiming>> HybridSyntaxParser::warmSyntaxHighlighter(
    const std::string& language,
    const std::string& theme) {
  return Promise<SyntaxHighlightTiming>::async([language, theme]() -> SyntaxHighlightTiming {
    return warmHighlighterContext(language, theme).timing;
  });
}

std::shared_ptr<Promise<SyntaxFileLoadResult>> HybridSyntaxParser::loadCodeFile(
    const std::string& filePath,
    const std::string& language,
    const std::string& theme,
    double initialLineCount) {
  return Promise<SyntaxFileLoadResult>::async([filePath, language, theme, initialLineCount]() -> SyntaxFileLoadResult {
    const auto startedAt = SyntaxClock::now();
    auto document = HybridSyntaxDocument::loadFile(filePath, language, theme);
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

} // namespace margelo::nitro::legenddesktop::syntaxparser

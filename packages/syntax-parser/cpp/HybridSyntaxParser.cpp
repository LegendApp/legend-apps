#include "HybridSyntaxParser.hpp"

#include "HybridSyntaxDocument.hpp"
#include "SyntaxHighlighter.hpp"

namespace margelo::nitro::legenddesktop::syntaxparser {

HybridSyntaxParser::HybridSyntaxParser() : HybridObject(TAG) {}

namespace {

std::vector<std::string> warmupLinesForLanguage(const std::string& language) {
  if (language == "tsx" || language == "typescriptreact") {
    return {
        "import React, { useMemo } from \"react\";",
        "type Props = { value?: string; count: number };",
        "export const Warmup = ({ value, count }: Props) => <Text testID=\"warmup\">{value ?? count}</Text>;",
        "const items = [1, 2, 3].map((item) => ({ item, label: `${item}` }));",
    };
  }

  return {
      "type Props = { value?: string; count: number };",
      "export function warmup({ value, count }: Props) {",
      "  return [value ?? String(count), /[a-z]+/i.test(value ?? \"\")];",
      "}",
  };
}

} // namespace

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
    const auto startedAt = SyntaxClock::now();
    auto context = getHighlighterContext(language, theme);
    const auto contextReadyAt = SyntaxClock::now();
    std::lock_guard<std::mutex> contextLock(context->mutex);

    SyntaxStyleState styleState;
    TextMateStateStack state = textmate_get_initial_state();
    double tokenCount = 0;
    const auto lines = warmupLinesForLanguage(language);

    for (const auto& line : lines) {
      auto tokenizedLine = tokenizeSyntaxLine(*context, line, state, styleState);
      tokenCount += tokenizedLine.tokenCount;
    }

    const auto finishedAt = SyntaxClock::now();
    return SyntaxHighlightTiming(
        static_cast<double>(lines.size()),
        tokenCount,
        static_cast<double>(styleState.styles.size()),
        0,
        0,
        elapsedSyntaxMs(startedAt, contextReadyAt),
        elapsedSyntaxMs(contextReadyAt, finishedAt),
        elapsedSyntaxMs(contextReadyAt, finishedAt),
        elapsedSyntaxMs(startedAt, finishedAt));
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
    result.initialLines = document->getRenderLines(0, initialLineCount);
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

#include "HybridDiffDocument.hpp"

#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <algorithm>

namespace margelo::nitro::legenddesktop::diffparser {

struct DiffTokenizedSourceState {
  std::shared_ptr<syntaxparser::TextMateHighlighterContext> context;
  TextMateStateStack nextState = textmate_get_initial_state();
};

struct DiffSyntaxState {
  syntaxparser::SyntaxStyleState styleState;
};

namespace {

constexpr double diffRowKindLine = 2;
constexpr double diffChangeTypeRemove = 2;

DiffTokenizedSource makeTokenizedSource(const std::string& path, const std::string& source) {
  DiffTokenizedSource tokenizedSource;
  tokenizedSource.language = syntaxparser::getSyntaxLanguageForPath(path);
  tokenizedSource.enabled = !tokenizedSource.language.empty();
  if (tokenizedSource.enabled) {
    tokenizedSource.lines = syntaxparser::splitSyntaxLines(source);
    tokenizedSource.tokenCache.resize(tokenizedSource.lines.size());
    tokenizedSource.state = std::make_shared<DiffTokenizedSourceState>();
  }
  return tokenizedSource;
}

} // namespace

HybridDiffDocument::HybridDiffDocument(
    std::vector<DiffFileSummary> files,
    std::vector<DiffRenderRow> rows,
    std::vector<DiffFileSources> fileSources,
    std::string theme,
    DiffLoadTiming timing)
    : HybridObject(TAG),
      files_(std::move(files)),
      rows_(std::move(rows)),
      fileSources_(std::move(fileSources)),
      theme_(std::move(theme)),
      syntaxState_(std::make_shared<DiffSyntaxState>()),
      timing_(timing) {
  for (auto& sources : fileSources_) {
    sources.oldSource = makeTokenizedSource(sources.oldPath, sources.oldText);
    sources.newSource = makeTokenizedSource(sources.newPath, sources.newText);
    sources.oldText.clear();
    sources.newText.clear();
  }
}

double HybridDiffDocument::getRowCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(rows_.size());
}

double HybridDiffDocument::getFileCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(files_.size());
}

std::vector<DiffRenderRow> HybridDiffDocument::getRows(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));

  std::lock_guard<std::mutex> lock(mutex_);
  if (safeStart >= rows_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(rows_.size(), safeStart + safeCount);
  for (size_t index = safeStart; index < end; index += 1) {
    ensureRowTokens(index);
  }
  return std::vector<DiffRenderRow>(rows_.begin() + static_cast<std::ptrdiff_t>(safeStart), rows_.begin() + static_cast<std::ptrdiff_t>(end));
}

std::vector<DiffRenderRow> HybridDiffDocument::getPlainRows(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));

  std::lock_guard<std::mutex> lock(mutex_);
  if (safeStart >= rows_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(rows_.size(), safeStart + safeCount);
  return std::vector<DiffRenderRow>(rows_.begin() + static_cast<std::ptrdiff_t>(safeStart), rows_.begin() + static_cast<std::ptrdiff_t>(end));
}

std::vector<DiffFileSummary> HybridDiffDocument::getFiles() {
  std::lock_guard<std::mutex> lock(mutex_);
  return files_;
}

std::vector<DiffSyntaxStyle> HybridDiffDocument::getStyles() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<DiffSyntaxStyle> styles;
  styles.reserve(syntaxState_->styleState.styles.size());
  for (const auto& style : syntaxState_->styleState.styles) {
    styles.push_back(DiffSyntaxStyle(style.id, style.foreground, style.fontStyle));
  }
  return styles;
}

DiffLoadTiming HybridDiffDocument::getTiming() {
  std::lock_guard<std::mutex> lock(mutex_);
  return timing_;
}

size_t HybridDiffDocument::getExternalMemorySize() noexcept {
  std::lock_guard<std::mutex> lock(mutex_);
  size_t size = rows_.capacity() * sizeof(DiffRenderRow) + files_.capacity() * sizeof(DiffFileSummary);
  for (const auto& row : rows_) {
    size += row.text.capacity();
    size += row.tokens.capacity() * sizeof(DiffSyntaxTokenRun);
  }
  for (const auto& file : files_) {
    size += file.path.capacity() + file.oldPath.capacity() + file.status.capacity();
  }
  for (const auto& sources : fileSources_) {
    size += sources.oldPath.capacity() + sources.newPath.capacity();
    size += sources.oldText.capacity() + sources.newText.capacity();
    for (const auto* source : {&sources.oldSource, &sources.newSource}) {
      size += source->language.capacity();
      size += source->lines.capacity() * sizeof(std::string);
      size += source->tokenCache.capacity() * sizeof(std::optional<std::vector<DiffSyntaxTokenRun>>);
      for (const auto& line : source->lines) {
        size += line.capacity();
      }
      for (const auto& tokens : source->tokenCache) {
        if (tokens.has_value()) {
          size += tokens->capacity() * sizeof(DiffSyntaxTokenRun);
        }
      }
    }
  }
  size += syntaxState_->styleState.styles.capacity() * sizeof(syntaxparser::SyntaxStyle);
  return size;
}

void HybridDiffDocument::ensureRowTokens(size_t rowIndex) {
  if (rowIndex >= rows_.size()) {
    return;
  }

  auto& row = rows_[rowIndex];
  if (!row.tokens.empty() || row.kind != diffRowKindLine) {
    return;
  }

  const auto fileIndex = static_cast<size_t>(std::max(0.0, row.fileIndex));
  if (fileIndex >= fileSources_.size()) {
    return;
  }

  auto& sources = fileSources_[fileIndex];
  if (row.changeType == diffChangeTypeRemove) {
    row.tokens = tokensForLine(sources.oldSource, row.oldLineNumber);
  } else {
    row.tokens = tokensForLine(sources.newSource, row.newLineNumber);
  }
}

void HybridDiffDocument::ensureTokenized(DiffTokenizedSource& source, size_t lineIndexExclusive) {
  if (!source.enabled || source.language.empty()) {
    return;
  }

  const auto end = std::min(source.lines.size(), lineIndexExclusive);
  if (source.tokenizedLineCount >= end) {
    return;
  }

  try {
    if (!source.state) {
      source.state = std::make_shared<DiffTokenizedSourceState>();
    }

    if (!source.state->context) {
      source.state->context = syntaxparser::getHighlighterContext(source.language, theme_);
    }

    std::lock_guard<std::mutex> contextLock(source.state->context->mutex);
    while (source.tokenizedLineCount < end) {
      auto tokenizedLine = syntaxparser::tokenizeSyntaxLine(
          *source.state->context,
          source.lines[source.tokenizedLineCount],
          source.state->nextState,
          syntaxState_->styleState);
      std::vector<DiffSyntaxTokenRun> tokens;
      tokens.reserve(tokenizedLine.tokens.size());
      for (const auto& token : tokenizedLine.tokens) {
        tokens.push_back(DiffSyntaxTokenRun(token.startColumn, token.length, token.styleId));
      }
      source.tokenCache[source.tokenizedLineCount] = std::move(tokens);
      source.tokenizedLineCount += 1;
    }
  } catch (const std::exception&) {
    source.enabled = false;
  }
}

std::vector<DiffSyntaxTokenRun> HybridDiffDocument::tokensForLine(DiffTokenizedSource& source, double lineNumber) {
  if (!source.enabled || lineNumber < 1) {
    return {};
  }

  const auto lineIndex = static_cast<size_t>(lineNumber - 1);
  if (lineIndex >= source.lines.size()) {
    return {};
  }

  ensureTokenized(source, lineIndex + 1);
  if (lineIndex < source.tokenCache.size() && source.tokenCache[lineIndex].has_value()) {
    return *source.tokenCache[lineIndex];
  }
  return {};
}

} // namespace margelo::nitro::legenddesktop::diffparser

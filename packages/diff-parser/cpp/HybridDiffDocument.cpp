#include "HybridDiffDocument.hpp"

#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include "git2.h"
#include <sstream>
#include <unordered_set>

namespace margelo::nitro::legenddesktop::diffparser {

struct DiffTokenizedSourceState {
  std::shared_ptr<syntaxparser::TextMateHighlighterContext> context;
  TextMateStateStack nextState = textmate_get_initial_state();
};

struct DiffSyntaxState {
  syntaxparser::SyntaxStyleState styleState;
};

namespace {

constexpr double diffRowKindFileHeader = 0;
constexpr double diffRowKindLine = 2;
constexpr double diffChangeTypeAdd = 1;
constexpr double diffChangeTypeRemove = 2;
constexpr double emptySideBySideRowIndex = -1;

struct GitRepositoryDeleter {
  void operator()(git_repository* repo) const {
    git_repository_free(repo);
  }
};

struct GitTreeDeleter {
  void operator()(git_tree* tree) const {
    git_tree_free(tree);
  }
};

struct GitTreeEntryDeleter {
  void operator()(git_tree_entry* entry) const {
    git_tree_entry_free(entry);
  }
};

struct GitBlobDeleter {
  void operator()(git_blob* blob) const {
    git_blob_free(blob);
  }
};

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

std::string readFileText(const std::filesystem::path& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    return "";
  }

  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

std::string readHeadBlobText(const std::string& repositoryPath, const std::string& headTreeOid, const std::string& path) {
  if (repositoryPath.empty() || headTreeOid.empty() || path.empty()) {
    return "";
  }

  git_repository* rawRepo = nullptr;
  if (git_repository_open(&rawRepo, repositoryPath.c_str()) != 0) {
    return "";
  }
  std::unique_ptr<git_repository, GitRepositoryDeleter> repo(rawRepo);

  git_oid treeOid;
  if (git_oid_fromstr(&treeOid, headTreeOid.c_str()) != 0) {
    return "";
  }

  git_tree* rawTree = nullptr;
  if (git_tree_lookup(&rawTree, repo.get(), &treeOid) != 0) {
    return "";
  }
  std::unique_ptr<git_tree, GitTreeDeleter> tree(rawTree);

  git_tree_entry* rawEntry = nullptr;
  if (git_tree_entry_bypath(&rawEntry, tree.get(), path.c_str()) != 0) {
    return "";
  }
  std::unique_ptr<git_tree_entry, GitTreeEntryDeleter> entry(rawEntry);
  if (git_tree_entry_type(entry.get()) != GIT_OBJECT_BLOB) {
    return "";
  }

  git_blob* rawBlob = nullptr;
  if (git_blob_lookup(&rawBlob, repo.get(), git_tree_entry_id(entry.get())) != 0) {
    return "";
  }
  std::unique_ptr<git_blob, GitBlobDeleter> blob(rawBlob);
  const auto* content = static_cast<const char*>(git_blob_rawcontent(blob.get()));
  const auto size = git_blob_rawsize(blob.get());
  return content != nullptr && size > 0 ? std::string(content, content + size) : "";
}

std::string readWorkdirFileText(const std::string& workdirPath, const std::string& path) {
  if (workdirPath.empty() || path.empty()) {
    return "";
  }
  return readFileText(std::filesystem::path(workdirPath) / path);
}

bool isFileHeaderRow(const DiffRenderRow& row) {
  return row.kind == diffRowKindFileHeader;
}

bool isAddRow(const DiffRenderRow& row) {
  return row.changeType == diffChangeTypeAdd;
}

bool isRemoveRow(const DiffRenderRow& row) {
  return row.changeType == diffChangeTypeRemove;
}

double getSideBySideSourceStart(double oldRowIndex, double newRowIndex, double fallbackIndex) {
  if (oldRowIndex >= 0 && newRowIndex >= 0) {
    return std::min(oldRowIndex, newRowIndex);
  }
  if (oldRowIndex >= 0) {
    return oldRowIndex;
  }
  if (newRowIndex >= 0) {
    return newRowIndex;
  }
  return fallbackIndex;
}

double getSideBySideSourceEnd(double oldRowIndex, double newRowIndex, double fallbackIndex) {
  if (oldRowIndex >= 0 && newRowIndex >= 0) {
    return std::max(oldRowIndex, newRowIndex) + 1;
  }
  if (oldRowIndex >= 0) {
    return oldRowIndex + 1;
  }
  if (newRowIndex >= 0) {
    return newRowIndex + 1;
  }
  return fallbackIndex + 1;
}

DiffSideBySideLine createSideBySideLine(
    double index,
    std::string kind,
    double fileIndex,
    double hunkIndex,
    double oldRowIndex,
    double newRowIndex) {
  return DiffSideBySideLine(
      index,
      std::move(kind),
      fileIndex,
      hunkIndex,
      getSideBySideSourceStart(oldRowIndex, newRowIndex, index),
      getSideBySideSourceEnd(oldRowIndex, newRowIndex, index),
      oldRowIndex,
      newRowIndex);
}

std::vector<DiffSideBySideLine> createSideBySideLines(const std::vector<DiffRenderRow>& rows) {
  std::vector<DiffSideBySideLine> lines;
  std::vector<const DiffRenderRow*> contextRows;
  std::vector<const DiffRenderRow*> removedRows;
  std::vector<const DiffRenderRow*> addedRows;
  double currentFileIndex = -1;
  double currentHunkIndex = -1;

  auto pushLine = [&](std::string kind, double fileIndex, double hunkIndex, double oldRowIndex, double newRowIndex) {
    lines.push_back(createSideBySideLine(
        static_cast<double>(lines.size()),
        std::move(kind),
        fileIndex,
        hunkIndex,
        oldRowIndex,
        newRowIndex));
  };

  auto flushContextRows = [&]() {
    if (!contextRows.empty()) {
      for (const auto* row : contextRows) {
        pushLine("context", row->fileIndex, row->hunkIndex, row->index, row->index);
      }
      contextRows.clear();
    }
  };

  auto flushChangedRows = [&]() {
    if (!removedRows.empty() || !addedRows.empty()) {
      const auto lineCount = std::max(removedRows.size(), addedRows.size());
      const auto* firstRow = !removedRows.empty() ? removedRows.front() : addedRows.front();
      for (size_t index = 0; index < lineCount; index += 1) {
        pushLine(
            "change",
            firstRow->fileIndex,
            firstRow->hunkIndex,
            index < removedRows.size() ? removedRows[index]->index : emptySideBySideRowIndex,
            index < addedRows.size() ? addedRows[index]->index : emptySideBySideRowIndex);
      }
      removedRows.clear();
      addedRows.clear();
    }
  };

  auto flushRows = [&]() {
    flushContextRows();
    flushChangedRows();
  };

  for (const auto& row : rows) {
    if (isFileHeaderRow(row)) {
      flushRows();
      currentFileIndex = row.fileIndex;
      currentHunkIndex = row.hunkIndex;
      pushLine("file-header", row.fileIndex, row.hunkIndex, row.index, row.index);
    } else {
      if (currentFileIndex != row.fileIndex || currentHunkIndex != row.hunkIndex) {
        flushRows();
        currentFileIndex = row.fileIndex;
        currentHunkIndex = row.hunkIndex;
      }

      if (isRemoveRow(row)) {
        flushContextRows();
        if (!addedRows.empty()) {
          flushChangedRows();
        }
        removedRows.push_back(&row);
      } else if (isAddRow(row)) {
        flushContextRows();
        addedRows.push_back(&row);
      } else {
        flushChangedRows();
        contextRows.push_back(&row);
      }
    }
  }

  flushRows();
  return lines;
}

DiffSideBySideLineMetric createLineMetric(const DiffSideBySideLine& line, double index) {
  return DiffSideBySideLineMetric(
      index,
      line.kind,
      line.fileIndex,
      line.hunkIndex,
      line.sourceStart,
      line.sourceEnd);
}

std::unordered_set<int> createCollapsedFileIndexSet(const std::vector<double>& collapsedFileIndexes) {
  std::unordered_set<int> collapsedFileIndexSet;
  collapsedFileIndexSet.reserve(collapsedFileIndexes.size());
  for (const auto fileIndex : collapsedFileIndexes) {
    if (fileIndex >= 0) {
      collapsedFileIndexSet.insert(static_cast<int>(fileIndex));
    }
  }
  return collapsedFileIndexSet;
}

bool shouldIncludeSideBySideLine(
    const DiffSideBySideLine& line,
    const std::unordered_set<int>& collapsedFileIndexes) {
  return line.kind == "file-header" || !collapsedFileIndexes.contains(static_cast<int>(line.fileIndex));
}

} // namespace

HybridDiffDocument::HybridDiffDocument(
    std::vector<DiffFileSummary> files,
    std::vector<DiffRenderRow> rows,
    std::vector<DiffFileSources> fileSources,
    std::string repositoryPath,
    std::string workdirPath,
    std::string headTreeOid,
    std::string theme,
    DiffLoadTiming timing)
    : HybridObject(TAG),
      files_(std::move(files)),
      rows_(std::move(rows)),
      fileSources_(std::move(fileSources)),
      repositoryPath_(std::move(repositoryPath)),
      workdirPath_(std::move(workdirPath)),
      headTreeOid_(std::move(headTreeOid)),
      theme_(std::move(theme)),
      syntaxState_(std::make_shared<DiffSyntaxState>()),
      timing_(timing) {
  sideBySideLines_ = createSideBySideLines(rows_);
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

std::vector<DiffSideBySideLineMetric> HybridDiffDocument::getSideBySideLineMetrics(const std::vector<double>& collapsedFileIndexes) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  std::vector<DiffSideBySideLineMetric> metrics;
  metrics.reserve(sideBySideLines_.size());
  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      metrics.push_back(createLineMetric(line, static_cast<double>(metrics.size())));
    }
  }
  return metrics;
}

std::vector<DiffSideBySideLine> HybridDiffDocument::getSideBySideLines(
    double start,
    double count,
    const std::vector<double>& collapsedFileIndexes) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeCount == 0) {
    return {};
  }

  std::lock_guard<std::mutex> lock(mutex_);
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  std::vector<DiffSideBySideLine> lines;
  lines.reserve(safeCount);
  size_t logicalIndex = 0;
  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      if (logicalIndex >= safeStart && lines.size() < safeCount) {
        auto nextLine = line;
        nextLine.index = static_cast<double>(logicalIndex);
        lines.push_back(std::move(nextLine));
      }
      logicalIndex += 1;
      if (lines.size() >= safeCount) {
        break;
      }
    }
  }
  return lines;
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
  size += sideBySideLines_.capacity() * sizeof(DiffSideBySideLine);
  for (const auto& line : sideBySideLines_) {
    size += line.kind.capacity();
  }
  for (const auto& sources : fileSources_) {
    size += sources.oldPath.capacity() + sources.newPath.capacity() + sources.status.capacity();
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
    row.tokens = tokensForLine(ensureSourceLoaded(sources, true), row.oldLineNumber);
  } else {
    row.tokens = tokensForLine(ensureSourceLoaded(sources, false), row.newLineNumber);
  }
}

DiffTokenizedSource& HybridDiffDocument::ensureSourceLoaded(DiffFileSources& sources, bool oldSource) {
  auto& source = oldSource ? sources.oldSource : sources.newSource;
  auto& loaded = oldSource ? sources.oldSourceLoaded : sources.newSourceLoaded;
  if (!loaded) {
    loaded = true;
    if (!sources.isBinary) {
      const auto& path = oldSource ? sources.oldPath : sources.newPath;
      const bool canReadOldSource = oldSource && sources.status != "added" && sources.status != "untracked";
      const bool canReadNewSource = !oldSource && sources.status != "deleted";
      if (canReadOldSource) {
        source = makeTokenizedSource(path, readHeadBlobText(repositoryPath_, headTreeOid_, path));
      } else if (canReadNewSource) {
        source = makeTokenizedSource(path, readWorkdirFileText(workdirPath_, path));
      }
    }
  }
  return source;
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

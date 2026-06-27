#include "HybridDiffDocument.hpp"

#include "DiffParserCore.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include "git2.h"
#include <sstream>
#include <unordered_set>

#ifdef __APPLE__
#include <os/log.h>
#endif

namespace margelo::nitro::legenddesktop::diffparser {

struct DiffTokenizedSourceState {
  std::shared_ptr<syntaxparser::TextMateHighlighterContext> context;
  TextMateStateStack nextState = textmate_get_initial_state();
};

struct DiffSyntaxState {
  syntaxparser::SyntaxScopeState scopeState;
};

namespace {

constexpr double diffRowKindLine = 2;
constexpr double diffChangeTypeRemove = 2;
constexpr double emptySideBySideRowIndex = -1;
constexpr double defaultBackgroundTokenizeChunkRowCount = 16;
constexpr double defaultBackgroundTokenizeChunkBudgetMs = 3;
constexpr double sideBySideKindFileHeader = 0;
constexpr double sideBySideKindContext = 1;
constexpr double sideBySideKindChange = 2;
constexpr double sideBySideKindLine = 3;

#ifdef __APPLE__
os_log_t diffMemoryLog() {
  static os_log_t log = os_log_create("app.legend.diff.macos", "memory");
  return log;
}
#endif

void logDiffMemoryMessage(const std::string& message) {
#ifdef __APPLE__
  os_log_with_type(diffMemoryLog(), OS_LOG_TYPE_DEFAULT, "%{public}s", message.c_str());
#else
  std::fprintf(stderr, "%s\n", message.c_str());
#endif
}

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

DiffTokenizedSource makeTokenizedSource(const std::string& path, std::vector<std::string> lines) {
  DiffTokenizedSource tokenizedSource;
  tokenizedSource.language = syntaxparser::getSyntaxLanguageForPath(path);
  tokenizedSource.enabled = !tokenizedSource.language.empty();
  if (tokenizedSource.enabled) {
    tokenizedSource.lines = std::move(lines);
    tokenizedSource.tokenCache.resize(tokenizedSource.lines.size());
    tokenizedSource.state = std::make_shared<DiffTokenizedSourceState>();
  }
  return tokenizedSource;
}

DiffTokenizedSource makeTokenizedSource(const std::string& path, const std::string& source) {
  return makeTokenizedSource(path, syntaxparser::splitSyntaxLines(source));
}

void setSourceLine(std::vector<std::string>& lines, double lineNumber, const std::string& text) {
  if (lineNumber > 0) {
    const auto lineIndex = static_cast<size_t>(lineNumber - 1);
    if (lines.size() <= lineIndex) {
      lines.resize(lineIndex + 1);
    }
    lines[lineIndex] = text;
  }
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
    double kind,
    double fileIndex,
    double hunkIndex,
    double oldRowIndex,
    double newRowIndex) {
  return DiffSideBySideLine{
      .index = index,
      .kind = kind,
      .fileIndex = fileIndex,
      .hunkIndex = hunkIndex,
      .sourceStart = getSideBySideSourceStart(oldRowIndex, newRowIndex, index),
      .sourceEnd = getSideBySideSourceEnd(oldRowIndex, newRowIndex, index),
      .oldRowIndex = oldRowIndex,
      .newRowIndex = newRowIndex,
  };
}

std::string sideBySideKindString(double kind) {
  if (kind == sideBySideKindFileHeader) {
    return "file-header";
  }
  if (kind == sideBySideKindContext) {
    return "context";
  }
  if (kind == sideBySideKindChange) {
    return "change";
  }
  return "line";
}

DiffRenderRow createEmptyRenderRow() {
  return DiffRenderRow(
      emptySideBySideRowIndex,
      diffRowKindLine,
      emptySideBySideRowIndex,
      emptySideBySideRowIndex,
      emptySideBySideRowIndex,
      emptySideBySideRowIndex,
      0,
      "",
      {});
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

bool hasCollapsedFileIndexes(const std::unordered_set<int>& collapsedFileIndexes) {
  return !collapsedFileIndexes.empty();
}

bool shouldIncludeSideBySideLine(
    const DiffSideBySideLine& line,
    const std::unordered_set<int>& collapsedFileIndexes) {
  return line.kind == sideBySideKindFileHeader || !collapsedFileIndexes.contains(static_cast<int>(line.fileIndex));
}

} // namespace

HybridDiffDocument::HybridDiffDocument(
    std::vector<DiffFileSummary> files,
    std::vector<DiffRenderRow> rows,
    std::vector<DiffFileSources> fileSources,
    std::string repositoryPath,
    std::string workdirPath,
    std::string headTreeOid,
    DiffLoadTiming timing)
    : HybridObject(TAG),
      files_(std::move(files)),
      rows_(std::move(rows)),
      fileSources_(std::move(fileSources)),
      repositoryPath_(std::move(repositoryPath)),
      workdirPath_(std::move(workdirPath)),
      headTreeOid_(std::move(headTreeOid)),
      syntaxState_(std::make_shared<DiffSyntaxState>()),
      timing_(timing) {
  logMemorySnapshot("document.constructed");
}

HybridDiffDocument::~HybridDiffDocument() {
  stopBackgroundTokenization();
}

double HybridDiffDocument::getRowCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(rows_.size());
}

double HybridDiffDocument::getFileCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(files_.size());
}

double HybridDiffDocument::getTokenizedMaxRow() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(backgroundTokenizeRowIndex_);
}

double HybridDiffDocument::getScopeCount() {
  std::lock_guard<std::mutex> lock(syntaxMutex_);
  return static_cast<double>(syntaxState_->scopeState.scopes.size());
}

DiffCachedRow HybridDiffDocument::getRow(double index) {
  const auto safeIndex = static_cast<size_t>(std::max(0.0, std::floor(index)));
  std::lock_guard<std::mutex> lock(mutex_);
  if (safeIndex >= rows_.size()) {
    return DiffCachedRow(createEmptyRenderRow(), nitro::NullType());
  }

  auto plain = rows_[safeIndex];
  auto tokens = std::move(plain.tokens);
  plain.tokens = {};
  if (plain.kind == diffRowKindLine && safeIndex < backgroundTokenizeRowIndex_) {
    return DiffCachedRow(std::move(plain), std::move(tokens));
  }
  return DiffCachedRow(std::move(plain), nitro::NullType());
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
  if (safeStart <= backgroundTokenizeRowIndex_ && end > backgroundTokenizeRowIndex_) {
    const auto previousTokenizedMaxRow = backgroundTokenizeRowIndex_;
    backgroundTokenizeRowIndex_ = end;
    backgroundTokenizeNextRowIndex_ = std::max(backgroundTokenizeNextRowIndex_, backgroundTokenizeRowIndex_);
    tokenizedRowRanges_.push_back(DiffTokenizedRowRange(
        static_cast<double>(previousTokenizedMaxRow),
        static_cast<double>(backgroundTokenizeRowIndex_)));
    tokenizedRowVersion_.fetch_add(1);
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

void HybridDiffDocument::ensureSideBySideLinesLocked() {
  if (!sideBySideLinesReady_) {
    sideBySideLines_ = createDiffSideBySideLines(rows_);
    sideBySideLinesReady_ = true;
  }
}

double HybridDiffDocument::getSideBySideRowCount(const std::vector<double>& collapsedFileIndexes) {
  std::lock_guard<std::mutex> lock(mutex_);
  ensureSideBySideLinesLocked();
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);

  if (!hasCollapsedFileIndexes(collapsedFileIndexSet)) {
    return static_cast<double>(sideBySideLines_.size());
  }

  size_t count = 0;
  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      count += 1;
    }
  }
  return static_cast<double>(count);
}

std::vector<DiffSideBySideFileHeader> HybridDiffDocument::getSideBySideFileHeaders(const std::vector<double>& collapsedFileIndexes) {
  std::lock_guard<std::mutex> lock(mutex_);
  ensureSideBySideLinesLocked();
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  std::vector<DiffSideBySideFileHeader> fileHeaders;
  fileHeaders.reserve(files_.size());
  size_t logicalIndex = 0;

  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      if (line.kind == sideBySideKindFileHeader) {
        fileHeaders.push_back(DiffSideBySideFileHeader(
            line.fileIndex,
            line.sourceStart,
            static_cast<double>(logicalIndex)));
      }
      logicalIndex += 1;
    }
  }

  return fileHeaders;
}

double HybridDiffDocument::getSideBySideListIndexForSourceRow(
    double sourceRowIndex,
    const std::vector<double>& collapsedFileIndexes) {
  const auto safeSourceRowIndex = std::floor(sourceRowIndex);
  if (safeSourceRowIndex < 0) {
    return emptySideBySideRowIndex;
  }

  std::lock_guard<std::mutex> lock(mutex_);
  ensureSideBySideLinesLocked();
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  size_t logicalIndex = 0;
  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      if (line.sourceStart <= safeSourceRowIndex && safeSourceRowIndex < line.sourceEnd) {
        return static_cast<double>(logicalIndex);
      }
      logicalIndex += 1;
    }
  }

  return emptySideBySideRowIndex;
}

DiffSideBySideRenderRow HybridDiffDocument::createSideBySideRenderRow(const DiffSideBySideLine& line, double index, bool tokenizeRows) {
  const auto emptyRow = createEmptyRenderRow();
  const auto oldRowIndex = static_cast<size_t>(std::max(0.0, line.oldRowIndex));
  const auto newRowIndex = static_cast<size_t>(std::max(0.0, line.newRowIndex));
  const auto oldRowVisible = line.oldRowIndex >= 0 && oldRowIndex < rows_.size();
  const auto newRowVisible = line.newRowIndex >= 0 && newRowIndex < rows_.size();
  const auto newRowEqualsOldRow = oldRowVisible && newRowVisible && oldRowIndex == newRowIndex;

  if (tokenizeRows) {
    if (oldRowVisible) {
      ensureRowTokens(oldRowIndex);
    }
    if (newRowVisible && newRowIndex != oldRowIndex) {
      ensureRowTokens(newRowIndex);
    }
  }

  return DiffSideBySideRenderRow(
      index,
      sideBySideKindString(line.kind),
      line.fileIndex,
      line.hunkIndex,
      line.sourceStart,
      line.sourceEnd,
      oldRowVisible,
      newRowVisible,
      newRowEqualsOldRow,
      oldRowVisible ? rows_[oldRowIndex] : emptyRow,
      newRowVisible && !newRowEqualsOldRow ? rows_[newRowIndex] : emptyRow);
}

DiffSideBySideRenderRow HybridDiffDocument::getSideBySideRowForIndex(
    double index,
    const std::vector<double>& collapsedFileIndexes,
    bool tokenizeRows) {
  const auto safeIndex = static_cast<size_t>(std::max(0.0, std::floor(index)));

  std::lock_guard<std::mutex> lock(mutex_);
  ensureSideBySideLinesLocked();
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);

  if (!hasCollapsedFileIndexes(collapsedFileIndexSet)) {
    if (safeIndex < sideBySideLines_.size()) {
      return createSideBySideRenderRow(sideBySideLines_[safeIndex], static_cast<double>(safeIndex), tokenizeRows);
    }
    return createSideBySideRenderRow(createSideBySideLine(index, sideBySideKindLine, -1, -1, -1, -1), index, tokenizeRows);
  }

  size_t logicalIndex = 0;
  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      if (logicalIndex == safeIndex) {
        return createSideBySideRenderRow(line, static_cast<double>(logicalIndex), tokenizeRows);
      }
      logicalIndex += 1;
    }
  }

  return createSideBySideRenderRow(createSideBySideLine(index, sideBySideKindLine, -1, -1, -1, -1), index, tokenizeRows);
}

std::vector<DiffSideBySideRenderRow> HybridDiffDocument::getSideBySideRowsForRange(
    double start,
    double count,
    const std::vector<double>& collapsedFileIndexes,
    bool tokenizeRows) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeCount == 0) {
    return {};
  }

  std::lock_guard<std::mutex> lock(mutex_);
  ensureSideBySideLinesLocked();
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  std::vector<DiffSideBySideRenderRow> rows;
  rows.reserve(safeCount);

  if (!hasCollapsedFileIndexes(collapsedFileIndexSet)) {
    const auto end = std::min(sideBySideLines_.size(), safeStart + safeCount);
    for (size_t index = safeStart; index < end; index += 1) {
      rows.push_back(createSideBySideRenderRow(sideBySideLines_[index], static_cast<double>(index), tokenizeRows));
    }
    return rows;
  }

  size_t logicalIndex = 0;
  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      if (logicalIndex >= safeStart && rows.size() < safeCount) {
        rows.push_back(createSideBySideRenderRow(line, static_cast<double>(logicalIndex), tokenizeRows));
      }
      logicalIndex += 1;
      if (rows.size() >= safeCount) {
        break;
      }
    }
  }
  return rows;
}

DiffSideBySideRenderRow HybridDiffDocument::getPlainSideBySideRow(
    double index,
    const std::vector<double>& collapsedFileIndexes) {
  return getSideBySideRowForIndex(index, collapsedFileIndexes, false);
}

DiffSideBySideRenderRow HybridDiffDocument::getSideBySideRow(
    double index,
    const std::vector<double>& collapsedFileIndexes) {
  return getSideBySideRowForIndex(index, collapsedFileIndexes, true);
}

std::vector<DiffSideBySideRenderRow> HybridDiffDocument::getPlainSideBySideRows(
    double start,
    double count,
    const std::vector<double>& collapsedFileIndexes) {
  return getSideBySideRowsForRange(start, count, collapsedFileIndexes, false);
}

std::vector<DiffSideBySideRenderRow> HybridDiffDocument::getSideBySideRows(
    double start,
    double count,
    const std::vector<double>& collapsedFileIndexes) {
  return getSideBySideRowsForRange(start, count, collapsedFileIndexes, true);
}

double HybridDiffDocument::getTokenizedRowVersion() {
  return static_cast<double>(tokenizedRowVersion_.load());
}

std::vector<DiffTokenizedRowRange> HybridDiffDocument::consumeTokenizedRowRanges() {
  std::lock_guard<std::mutex> lock(mutex_);
  auto ranges = std::move(tokenizedRowRanges_);
  tokenizedRowRanges_.clear();
  return ranges;
}

std::vector<DiffFileSummary> HybridDiffDocument::getFiles() {
  std::lock_guard<std::mutex> lock(mutex_);
  return files_;
}

std::vector<DiffSyntaxScope> HybridDiffDocument::getScopes() {
  std::lock_guard<std::mutex> lock(syntaxMutex_);
  std::vector<DiffSyntaxScope> scopes;
  scopes.reserve(syntaxState_->scopeState.scopes.size());
  for (size_t index = 0; index < syntaxState_->scopeState.scopes.size(); index += 1) {
    scopes.push_back(DiffSyntaxScope(static_cast<double>(index), syntaxState_->scopeState.scopes[index]));
  }
  return scopes;
}

std::vector<DiffSyntaxStyle> HybridDiffDocument::getScopeStyles(const std::string& themeName, double fromScopeId) {
  std::lock_guard<std::mutex> lock(syntaxMutex_);
  const auto startIndex = static_cast<size_t>(std::max(0.0, std::floor(fromScopeId)));
  const auto resolvedStyles = syntaxparser::resolveSyntaxScopeStyles(themeName, syntaxState_->scopeState.scopes, startIndex);
  std::vector<DiffSyntaxStyle> styles;
  styles.reserve(resolvedStyles.size());
  for (const auto& style : resolvedStyles) {
    styles.push_back(DiffSyntaxStyle(style.id, style.foreground, style.fontStyle));
  }
  return styles;
}

DiffLoadTiming HybridDiffDocument::getTiming() {
  std::lock_guard<std::mutex> lock(mutex_);
  return timing_;
}

double HybridDiffDocument::startBackgroundTokenization(double chunkRowCount, double chunkBudgetMs) {
  stopBackgroundTokenization();

  const auto safeChunkRowCount = static_cast<size_t>(std::max(1.0, chunkRowCount));
  const auto safeChunkBudget = std::chrono::duration_cast<std::chrono::steady_clock::duration>(
      std::chrono::duration<double, std::milli>(std::max(1.0, chunkBudgetMs)));
  const auto generation = backgroundGeneration_.fetch_add(1) + 1;
  backgroundTokenizationRunning_.store(true);
  auto document = shared_cast<HybridDiffDocument>();
  logMemorySnapshot("background.start");

  backgroundThread_ = std::thread([document, generation, safeChunkRowCount, safeChunkBudget]() {
    bool shouldContinue = true;

    while (shouldContinue && document->backgroundGeneration_.load() == generation) {
      {
        std::unique_lock<std::mutex> lock(document->mutex_);
        shouldContinue = document->ensureNextBackgroundTokenChunk(lock, safeChunkRowCount, safeChunkBudget);
      }

      if (shouldContinue) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    }

    if (document->backgroundGeneration_.load() == generation) {
      document->backgroundTokenizationRunning_.store(false);
      document->logMemorySnapshot("background.beforeSourceRelease");
      {
        std::lock_guard<std::mutex> lock(document->mutex_);
        document->releaseCompletedSourceCaches();
      }
      document->logMemorySnapshot("background.complete");
    }
  });

  return getTokenizedRowVersion();
}

double HybridDiffDocument::startDefaultBackgroundTokenization() {
  return startBackgroundTokenization(defaultBackgroundTokenizeChunkRowCount, defaultBackgroundTokenizeChunkBudgetMs);
}

double HybridDiffDocument::stopBackgroundTokenization() {
  const auto wasRunning = backgroundTokenizationRunning_.load();
  backgroundGeneration_.fetch_add(1);
  backgroundTokenizationRunning_.store(false);

  if (backgroundThread_.joinable()) {
    if (backgroundThread_.get_id() == std::this_thread::get_id()) {
      backgroundThread_.detach();
    } else {
      backgroundThread_.join();
    }
  }

  if (wasRunning) {
    logMemorySnapshot("background.stop");
  }
  return getTokenizedRowVersion();
}

void HybridDiffDocument::appendProgressFile(
    DiffFileSummary file,
    DiffFileSources fileSources,
    DiffRenderRow headerRow) {
  std::lock_guard<std::mutex> lock(mutex_);
  files_.push_back(std::move(file));
  fileSources_.push_back(std::move(fileSources));
  rows_.push_back(std::move(headerRow));
  timing_.fileCount = static_cast<double>(files_.size());
  timing_.rowCount = static_cast<double>(rows_.size());
  sideBySideLinesReady_ = false;
  sideBySideLines_.clear();
}

void HybridDiffDocument::setProgressFiles(
    std::vector<DiffFileSummary> files,
    std::vector<DiffFileSources> fileSources) {
  std::lock_guard<std::mutex> lock(mutex_);
  files_ = std::move(files);
  fileSources_ = std::move(fileSources);
  timing_.fileCount = static_cast<double>(files_.size());
}

void HybridDiffDocument::appendProgressRow(DiffRenderRow row) {
  std::lock_guard<std::mutex> lock(mutex_);
  rows_.push_back(std::move(row));
  timing_.rowCount = static_cast<double>(rows_.size());
  sideBySideLinesReady_ = false;
  sideBySideLines_.clear();
}

void HybridDiffDocument::updateProgressFile(const DiffFileSummary& file) {
  const auto fileIndex = static_cast<size_t>(std::max(0.0, std::floor(file.index)));
  std::lock_guard<std::mutex> lock(mutex_);
  if (fileIndex < files_.size()) {
    files_[fileIndex] = file;
    if (fileIndex < fileSources_.size()) {
      auto& sources = fileSources_[fileIndex];
      sources.oldPath = file.oldPath;
      sources.newPath = file.path;
      sources.status = file.status;
      sources.isBinary = file.isBinary;
    }
  }
}

void HybridDiffDocument::setProgressRepositoryMetadata(
    std::string repositoryPath,
    std::string workdirPath,
    std::string headTreeOid) {
  std::lock_guard<std::mutex> lock(mutex_);
  repositoryPath_ = std::move(repositoryPath);
  workdirPath_ = std::move(workdirPath);
  headTreeOid_ = std::move(headTreeOid);
}

void HybridDiffDocument::setProgressTiming(const DiffLoadTiming& timing) {
  std::lock_guard<std::mutex> lock(mutex_);
  timing_ = timing;
  timing_.rowCount = static_cast<double>(rows_.size());
  timing_.fileCount = static_cast<double>(files_.size());
}

size_t HybridDiffDocument::getExternalMemorySizeLocked() const noexcept {
  size_t size = rows_.capacity() * sizeof(DiffRenderRow) + files_.capacity() * sizeof(DiffFileSummary);
  for (const auto& row : rows_) {
    size += row.text.capacity();
    size += row.tokens.capacity() * sizeof(DiffSyntaxTokenRun);
  }
  for (const auto& file : files_) {
    size += file.path.capacity() + file.oldPath.capacity() + file.status.capacity();
  }
  size += sideBySideLines_.capacity() * sizeof(DiffSideBySideLine);
  for (const auto& sources : fileSources_) {
    size += sources.oldPath.capacity() + sources.newPath.capacity() + sources.status.capacity();
    {
      std::lock_guard<std::mutex> sourceLock(*sources.oldSourceMutex);
      const auto& source = sources.oldSource;
      size += source.language.capacity();
      size += source.lines.capacity() * sizeof(std::string);
      size += source.tokenCache.capacity() * sizeof(std::optional<std::vector<DiffSyntaxTokenRun>>);
      for (const auto& line : source.lines) {
        size += line.capacity();
      }
      for (const auto& tokens : source.tokenCache) {
        if (tokens.has_value()) {
          size += tokens->capacity() * sizeof(DiffSyntaxTokenRun);
        }
      }
    }
    {
      std::lock_guard<std::mutex> sourceLock(*sources.newSourceMutex);
      const auto& source = sources.newSource;
      size += source.language.capacity();
      size += source.lines.capacity() * sizeof(std::string);
      size += source.tokenCache.capacity() * sizeof(std::optional<std::vector<DiffSyntaxTokenRun>>);
      for (const auto& line : source.lines) {
        size += line.capacity();
      }
      for (const auto& tokens : source.tokenCache) {
        if (tokens.has_value()) {
          size += tokens->capacity() * sizeof(DiffSyntaxTokenRun);
        }
      }
    }
  }
  {
    std::lock_guard<std::mutex> syntaxLock(syntaxMutex_);
    size += syntaxState_->scopeState.scopes.capacity() * sizeof(std::vector<std::string>);
    for (const auto& scopes : syntaxState_->scopeState.scopes) {
      size += scopes.capacity() * sizeof(std::string);
      for (const auto& scope : scopes) {
        size += scope.capacity();
      }
    }
  }
  return size;
}

size_t HybridDiffDocument::getExternalMemorySize() noexcept {
  std::lock_guard<std::mutex> lock(mutex_);
  return getExternalMemorySizeLocked();
}

void HybridDiffDocument::logMemorySnapshot(const std::string& reason) noexcept {
  try {
    std::lock_guard<std::mutex> lock(mutex_);
    size_t rowTextBytes = 0;
    size_t rowTokenRuns = 0;
    size_t filePathBytes = 0;
    size_t loadedSourceCount = 0;
    size_t sourceLineCount = 0;
    size_t sourceTextBytes = 0;
    size_t sourceTokenCacheSlots = 0;
    size_t sourceTokenRuns = 0;
    size_t sourceTokenizedLines = 0;

    for (const auto& row : rows_) {
      rowTextBytes += row.text.capacity();
      rowTokenRuns += row.tokens.capacity();
    }
    for (const auto& file : files_) {
      filePathBytes += file.path.capacity() + file.oldPath.capacity() + file.status.capacity();
    }

    auto addSourceStats = [&](const DiffTokenizedSource& source) {
      loadedSourceCount += source.enabled || !source.lines.empty() || !source.language.empty() ? 1 : 0;
      sourceLineCount += source.lines.size();
      sourceTokenCacheSlots += source.tokenCache.size();
      sourceTokenizedLines += source.tokenizedLineCount;
      for (const auto& line : source.lines) {
        sourceTextBytes += line.capacity();
      }
      for (const auto& tokens : source.tokenCache) {
        if (tokens.has_value()) {
          sourceTokenRuns += tokens->capacity();
        }
      }
    };

    for (const auto& sources : fileSources_) {
      {
        std::lock_guard<std::mutex> sourceLock(*sources.oldSourceMutex);
        addSourceStats(sources.oldSource);
      }
      {
        std::lock_guard<std::mutex> sourceLock(*sources.newSourceMutex);
        addSourceStats(sources.newSource);
      }
    }

    size_t scopeGroupCount = 0;
    size_t scopeStringCount = 0;
    size_t scopeBytes = 0;
    {
      std::lock_guard<std::mutex> syntaxLock(syntaxMutex_);
      scopeGroupCount = syntaxState_->scopeState.scopes.size();
      for (const auto& scopes : syntaxState_->scopeState.scopes) {
        scopeStringCount += scopes.size();
        scopeBytes += scopes.capacity() * sizeof(std::string);
        for (const auto& scope : scopes) {
          scopeBytes += scope.capacity();
        }
      }
    }

    std::ostringstream message;
    message
        << "[DiffMemory] " << reason
        << " externalBytes=" << getExternalMemorySizeLocked()
        << " files=" << files_.size()
        << " rows=" << rows_.size()
        << " rowCapacity=" << rows_.capacity()
        << " rowTextBytes=" << rowTextBytes
        << " rowTokenRuns=" << rowTokenRuns
        << " sideBySideRows=" << sideBySideLines_.size()
        << " sideBySideCapacity=" << sideBySideLines_.capacity()
        << " filePathBytes=" << filePathBytes
        << " loadedSources=" << loadedSourceCount
        << " sourceLines=" << sourceLineCount
        << " sourceTextBytes=" << sourceTextBytes
        << " sourceTokenCacheSlots=" << sourceTokenCacheSlots
        << " sourceTokenizedLines=" << sourceTokenizedLines
        << " sourceTokenRuns=" << sourceTokenRuns
        << " tokenizedMaxRow=" << backgroundTokenizeRowIndex_
        << " tokenizedNextRow=" << backgroundTokenizeNextRowIndex_
        << " scopeGroups=" << scopeGroupCount
        << " scopeStrings=" << scopeStringCount
        << " scopeBytes=" << scopeBytes;
    logDiffMemoryMessage(message.str());
  } catch (...) {
    logDiffMemoryMessage("[DiffMemory] snapshot.failed");
  }
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
  const bool oldSource = row.changeType == diffChangeTypeRemove;
  auto sourceMutex = oldSource ? sources.oldSourceMutex : sources.newSourceMutex;
  std::lock_guard<std::mutex> sourceLock(*sourceMutex);
  if (oldSource) {
    row.tokens = tokensForLine(ensureSourceLoaded(sources, true), row.oldLineNumber);
  } else {
    row.tokens = tokensForLine(ensureSourceLoaded(sources, false), row.newLineNumber);
  }
}

std::vector<DiffSyntaxTokenRun> HybridDiffDocument::tokenizeRowOutsideDocumentLock(const DiffRenderRow& row) {
  if (row.kind != diffRowKindLine) {
    return {};
  }

  const auto fileIndex = static_cast<size_t>(std::max(0.0, row.fileIndex));
  if (fileIndex >= fileSources_.size()) {
    return {};
  }

  auto& sources = fileSources_[fileIndex];
  const bool oldSource = row.changeType == diffChangeTypeRemove;
  auto sourceMutex = oldSource ? sources.oldSourceMutex : sources.newSourceMutex;
  std::lock_guard<std::mutex> sourceLock(*sourceMutex);
  if (oldSource) {
    return tokensForLine(ensureSourceLoaded(sources, true), row.oldLineNumber);
  }
  return tokensForLine(ensureSourceLoaded(sources, false), row.newLineNumber);
}

bool HybridDiffDocument::ensureNextBackgroundTokenChunk(
    std::unique_lock<std::mutex>& lock,
    size_t chunkRowCount,
    std::chrono::steady_clock::duration chunkBudget) {
  const auto start = backgroundTokenizeRowIndex_;
  size_t tokenizedCount = 0;
  const auto startedAt = std::chrono::steady_clock::now();

  while (backgroundTokenizeNextRowIndex_ < rows_.size() && tokenizedCount < chunkRowCount) {
    const auto rowIndex = backgroundTokenizeNextRowIndex_;
    backgroundTokenizeNextRowIndex_ += 1;
    const auto row = rows_[rowIndex];
    lock.unlock();
    auto tokens = tokenizeRowOutsideDocumentLock(row);
    lock.lock();
    if (rowIndex < rows_.size() && rows_[rowIndex].tokens.empty()) {
      rows_[rowIndex].tokens = std::move(tokens);
    }
    backgroundTokenizeRowIndex_ = std::max(backgroundTokenizeRowIndex_, rowIndex + 1);
    tokenizedCount += 1;
    if (tokenizedCount > 0 && std::chrono::steady_clock::now() - startedAt >= chunkBudget) {
      break;
    }
  }

  if (backgroundTokenizeRowIndex_ > start) {
    tokenizedRowRanges_.push_back(DiffTokenizedRowRange(
        static_cast<double>(start),
        static_cast<double>(backgroundTokenizeRowIndex_)));
    tokenizedRowVersion_.fetch_add(1);
    return true;
  }

  return false;
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
      if (sources.isUnifiedDiff) {
        source = makeUnifiedDiffSource(sources, oldSource);
      } else if (canReadOldSource) {
        source = makeTokenizedSource(path, readHeadBlobText(repositoryPath_, headTreeOid_, path));
      } else if (canReadNewSource) {
        source = makeTokenizedSource(path, readWorkdirFileText(workdirPath_, path));
      }
    }
  }
  return source;
}

DiffTokenizedSource HybridDiffDocument::makeUnifiedDiffSource(const DiffFileSources& sources, bool oldSource) {
  const auto& path = oldSource ? sources.oldPath : sources.newPath;
  const auto fileIndex = static_cast<size_t>(std::max(0.0, sources.fileIndex));
  std::vector<std::string> lines;
  if (sources.fileIndex >= 0 && fileIndex < files_.size()) {
    const auto& file = files_[fileIndex];
    const auto start = static_cast<size_t>(std::max(0.0, file.rowStart));
    const auto count = static_cast<size_t>(std::max(0.0, file.rowCount));
    const auto end = std::min(rows_.size(), start + count);
    for (size_t rowIndex = start; rowIndex < end; rowIndex += 1) {
      const auto& row = rows_[rowIndex];
      if (row.kind == diffRowKindLine) {
        setSourceLine(lines, oldSource ? row.oldLineNumber : row.newLineNumber, row.text);
      }
    }
  }
  return makeTokenizedSource(path, std::move(lines));
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
      source.state->context = syntaxparser::getHighlighterContext(source.language, "dark-plus");
    }

    std::lock_guard<std::mutex> syntaxLock(syntaxMutex_);
    std::lock_guard<std::mutex> contextLock(source.state->context->mutex);
    while (source.tokenizedLineCount < end) {
      auto tokenizedLine = syntaxparser::tokenizeSyntaxScopeLine(
          *source.state->context,
          source.lines[source.tokenizedLineCount],
          source.state->nextState,
          syntaxState_->scopeState);
      std::vector<DiffSyntaxTokenRun> tokens;
      tokens.reserve(tokenizedLine.tokens.size());
      for (const auto& token : tokenizedLine.tokens) {
        tokens.push_back(DiffSyntaxTokenRun(token.startColumn, token.length, token.scopeId));
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

void HybridDiffDocument::releaseCompletedSourceCaches() {
  if (backgroundTokenizeNextRowIndex_ < rows_.size()) {
    return;
  }

  for (auto& sources : fileSources_) {
    {
      std::lock_guard<std::mutex> sourceLock(*sources.oldSourceMutex);
      auto& source = sources.oldSource;
      source.lines.clear();
      source.lines.shrink_to_fit();
      source.tokenCache.clear();
      source.tokenCache.shrink_to_fit();
      source.state.reset();
    }
    {
      std::lock_guard<std::mutex> sourceLock(*sources.newSourceMutex);
      auto& source = sources.newSource;
      source.lines.clear();
      source.lines.shrink_to_fit();
      source.tokenCache.clear();
      source.tokenCache.shrink_to_fit();
      source.state.reset();
    }
  }
}

} // namespace margelo::nitro::legenddesktop::diffparser

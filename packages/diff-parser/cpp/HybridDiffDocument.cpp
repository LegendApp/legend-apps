#include "HybridDiffDocument.hpp"

#include "DiffParserCore.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include "git2.h"
#include <iterator>
#include <map>
#include <sstream>
#include <unordered_set>
#include <unordered_map>
#include <utility>

#ifdef __APPLE__
#include <malloc/malloc.h>
#include <os/log.h>
#endif

namespace margelo::nitro::legendapps::diffparser {

struct DiffTokenizedSourceState {
  std::shared_ptr<syntaxparser::TextMateHighlighterContext> context;
  TextMateStateStack nextState = textmate_get_initial_state();
};

struct DiffSyntaxState {
  syntaxparser::SyntaxScopeState scopeState;
};

namespace {

constexpr double diffRowKindLine = 2;
constexpr double diffChangeTypeAdd = 1;
constexpr double diffChangeTypeRemove = 2;
constexpr double emptySideBySideRowIndex = -1;
constexpr double defaultBackgroundTokenizeChunkRowCount = 16;
constexpr double defaultBackgroundTokenizeChunkBudgetMs = 3;
constexpr size_t maxTokenizeLinesPerRequest = 256;
constexpr size_t unlimitedTokenizeSourceLineBudget = std::numeric_limits<size_t>::max();
constexpr size_t retainedTokenizedRowWindowSize = 8192;
constexpr size_t retainedTokenizedRowWindowPadding = retainedTokenizedRowWindowSize / 2;
constexpr size_t retainedTokenizedRowEvictionMinRows = retainedTokenizedRowWindowSize * 2;
constexpr double sideBySideKindFileHeader = 0;
constexpr double sideBySideKindContext = 1;
constexpr double sideBySideKindChange = 2;
constexpr double sideBySideKindLine = 3;

std::atomic<uint64_t> nextDiffDocumentId{1};
std::mutex diffDocumentRegistryMutex;
std::map<uint64_t, std::weak_ptr<HybridDiffDocument>> diffDocumentRegistry;

template <typename T>
void clearVectorMemory(std::vector<T>& value) {
  std::vector<T>().swap(value);
}

template <typename T>
void clearDequeMemory(std::deque<T>& value) {
  std::deque<T>().swap(value);
}

void clearStringMemory(std::string& value) {
  std::string().swap(value);
}

#ifdef __APPLE__
os_log_t diffMemoryLog() {
  static os_log_t log = os_log_create("so.legend.diff.macos", "memory");
  return log;
}

void requestMallocPressureRelief() {
#if DEBUG
  malloc_zone_pressure_relief(nullptr, 0);
#endif
}
#else
void requestMallocPressureRelief() {}
#endif

void logDiffMemoryMessage(const std::string& message) {
  (void)message;
#if DEBUG
#ifdef __APPLE__
  os_log_with_type(diffMemoryLog(), OS_LOG_TYPE_DEFAULT, "%{public}s", message.c_str());
#else
  std::fprintf(stderr, "%s\n", message.c_str());
#endif
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

void resetTokenizedSource(DiffTokenizedSource& source) {
  source.enabled = false;
  source.language.clear();
  source.lines.clear();
  source.lines.shrink_to_fit();
  source.tokenCache.clear();
  source.tokenCache.shrink_to_fit();
  source.state.reset();
  source.tokenizedLineCount = 0;
}

void releaseTokenizedSourceText(DiffTokenizedSource& source) {
  source.lines.clear();
  source.lines.shrink_to_fit();
  source.state.reset();
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

std::string sanitizeBackingStorePathComponent(const std::string& value) {
  std::string sanitized;
  sanitized.reserve(value.size());
  for (const char character : value) {
    const auto byte = static_cast<unsigned char>(character);
    sanitized.push_back(std::isalnum(byte) || character == '.' || character == '-' || character == '_' ? character : '_');
  }
  if (sanitized.empty()) {
    return "source";
  }
  constexpr size_t maxFilenameComponentLength = 96;
  if (sanitized.size() > maxFilenameComponentLength) {
    sanitized.resize(maxFilenameComponentLength);
  }
  return sanitized;
}

void writeSourceLinesFile(const std::filesystem::path& path, const std::vector<std::string>& lines) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output) {
    return;
  }
  for (size_t index = 0; index < lines.size(); index += 1) {
    output << lines[index];
    if (index + 1 < lines.size()) {
      output << '\n';
    }
  }
}

class LocalRepoDiffBackingStore final : public DiffBackingStore {
public:
  LocalRepoDiffBackingStore(std::string repositoryPath, std::string workdirPath, std::string headTreeOid)
      : repositoryPath_(std::move(repositoryPath)),
        workdirPath_(std::move(workdirPath)),
        headTreeOid_(std::move(headTreeOid)) {}

  DiffTokenizedSource loadSource(
      const DiffFileSources& sources,
      bool oldSource,
      const DiffSourceFactory& unifiedDiffSourceFactory) override {
    if (sources.isUnifiedDiff) {
      return unifiedDiffSourceFactory();
    }
    if (sources.isBinary) {
      return {};
    }

    const auto& path = oldSource ? sources.oldPath : sources.newPath;
    const bool canReadOldSource = oldSource && sources.status != "added" && sources.status != "untracked";
    const bool canReadNewSource = !oldSource && sources.status != "deleted";
    if (canReadOldSource) {
      return makeTokenizedSource(path, readHeadBlobText(repositoryPath_, headTreeOid_, path));
    }
    if (canReadNewSource) {
      return makeTokenizedSource(path, readWorkdirFileText(workdirPath_, path));
    }
    return {};
  }

  size_t getExternalMemorySize() const noexcept override {
    return repositoryPath_.capacity() + workdirPath_.capacity() + headTreeOid_.capacity();
  }

private:
  std::string repositoryPath_;
  std::string workdirPath_;
  std::string headTreeOid_;
};

class UnifiedDiffBackingStore final : public DiffBackingStore {
public:
  UnifiedDiffBackingStore() {
    const auto basePath = std::filesystem::temp_directory_path() / "legend-diff-sources";
    std::error_code error;
    std::filesystem::create_directories(basePath, error);
    directoryPath_ = basePath / std::to_string(nextBackingStoreId_.fetch_add(1));
    std::filesystem::create_directories(directoryPath_, error);
  }

  ~UnifiedDiffBackingStore() override {
    std::error_code error;
    std::filesystem::remove_all(directoryPath_, error);
  }

  DiffTokenizedSource loadSource(
      const DiffFileSources& sources,
      bool oldSource,
      const DiffSourceFactory& unifiedDiffSourceFactory) override {
    const auto path = sourceFilePath(sources, oldSource);
    if (!path.empty() && std::filesystem::exists(path)) {
      const auto& sourcePath = oldSource ? sources.oldPath : sources.newPath;
      return makeTokenizedSource(sourcePath, readFileText(path));
    }

    auto source = unifiedDiffSourceFactory();
    if (!path.empty() && !source.lines.empty()) {
      std::error_code error;
      std::filesystem::create_directories(directoryPath_, error);
      writeSourceLinesFile(path, source.lines);
    }
    return source;
  }

  size_t getExternalMemorySize() const noexcept override {
    std::lock_guard<std::mutex> lock(mutex_);
    size_t size = directoryPath_.string().capacity();
    for (const auto& entry : sourcePaths_) {
      size += entry.first.capacity() + entry.second.string().capacity();
    }
    return size;
  }

private:
  std::string sourceKey(const DiffFileSources& sources, bool oldSource) const {
    return std::to_string(static_cast<size_t>(std::max(0.0, sources.fileIndex))) + (oldSource ? ":old:" : ":new:") + (oldSource ? sources.oldPath : sources.newPath);
  }

  std::filesystem::path sourceFilePath(const DiffFileSources& sources, bool oldSource) {
    if (directoryPath_.empty()) {
      return {};
    }

    std::lock_guard<std::mutex> lock(mutex_);
    const auto key = sourceKey(sources, oldSource);
    auto existing = sourcePaths_.find(key);
    if (existing != sourcePaths_.end()) {
      return existing->second;
    }

    const auto sourcePath = oldSource ? sources.oldPath : sources.newPath;
    const auto filename = std::to_string(sourcePaths_.size()) + "-" +
        sanitizeBackingStorePathComponent(sourcePath) +
        (oldSource ? ".old" : ".new");
    auto path = directoryPath_ / filename;
    sourcePaths_.emplace(key, path);
    return path;
  }

  static std::atomic<uint64_t> nextBackingStoreId_;
  mutable std::mutex mutex_;
  std::filesystem::path directoryPath_;
  std::unordered_map<std::string, std::filesystem::path> sourcePaths_;
};

std::atomic<uint64_t> UnifiedDiffBackingStore::nextBackingStoreId_{1};

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

size_t DiffBackingStore::getExternalMemorySize() const noexcept {
  return 0;
}

std::shared_ptr<DiffBackingStore> createLocalRepoDiffBackingStore(
    std::string repositoryPath,
    std::string workdirPath,
    std::string headTreeOid) {
  return std::make_shared<LocalRepoDiffBackingStore>(
      std::move(repositoryPath),
      std::move(workdirPath),
      std::move(headTreeOid));
}

std::shared_ptr<DiffBackingStore> createUnifiedDiffBackingStore() {
  return std::make_shared<UnifiedDiffBackingStore>();
}

HybridDiffDocument::HybridDiffDocument(
    std::vector<DiffFileSummary> files,
    std::vector<DiffRenderRow> rows,
    std::vector<DiffFileSources> fileSources,
    std::string repositoryPath,
    std::string workdirPath,
    std::string headTreeOid,
    std::shared_ptr<DiffBackingStore> backingStore,
    DiffLoadTiming timing)
    : HybridObject(TAG),
      documentId_(nextDiffDocumentId.fetch_add(1)),
      files_(std::move(files)),
      rowTokenized_(rows.size(), false),
      fileSources_(std::move(fileSources)),
      repositoryPath_(std::move(repositoryPath)),
      workdirPath_(std::move(workdirPath)),
      headTreeOid_(std::move(headTreeOid)),
      syntaxState_(std::make_shared<DiffSyntaxState>()),
      backingStore_(std::move(backingStore)),
      timing_(timing) {
  if (!backingStore_) {
    backingStore_ = createLocalRepoDiffBackingStore(repositoryPath_, workdirPath_, headTreeOid_);
  }
  rows_.reserve(rows.size());
  size_t rowTextBytes = 0;
  for (const auto& row : rows) {
    rowTextBytes += row.text.size();
  }
  rowText_.reserve(rowTextBytes);
  for (auto& row : rows) {
    appendStoredRowLocked(std::move(row));
  }
  logMemorySnapshot("document.constructed");
}

HybridDiffDocument::~HybridDiffDocument() {
  stopBackgroundTokenization();
  std::lock_guard<std::mutex> lock(diffDocumentRegistryMutex);
  diffDocumentRegistry.erase(documentId_);
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

double HybridDiffDocument::getDocumentId() {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (disposed_) {
      return 0;
    }
  }

  std::lock_guard<std::mutex> registryLock(diffDocumentRegistryMutex);
  diffDocumentRegistry[documentId_] = shared_cast<HybridDiffDocument>();
  return static_cast<double>(documentId_);
}

DiffCachedRow HybridDiffDocument::getRow(double index) {
  const auto safeIndex = static_cast<size_t>(std::max(0.0, std::floor(index)));
  std::lock_guard<std::mutex> lock(mutex_);
  if (safeIndex >= rows_.size()) {
    return DiffCachedRow(createEmptyRenderRow(), nitro::NullType());
  }

  auto plain = renderRowLocked(safeIndex);
  plain.tokens = {};
  if (plain.kind == diffRowKindLine && safeIndex < rowTokenized_.size() && rowTokenized_[safeIndex]) {
    auto tokens = cachedTokensForRowLocked(plain);
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
  std::vector<DiffRenderRow> requestedRows;
  requestedRows.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    auto row = renderRowLocked(index);
    row.tokens = {};
    if (index < rowTokenized_.size() && rowTokenized_[index]) {
      row.tokens = cachedTokensForRowLocked(row);
    }
    requestedRows.push_back(std::move(row));
  }
  markTokenizedRangeLocked(safeStart, end);
  return requestedRows;
}

std::vector<DiffRenderRow> HybridDiffDocument::getPlainRows(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));

  std::lock_guard<std::mutex> lock(mutex_);
  if (safeStart >= rows_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(rows_.size(), safeStart + safeCount);
  return renderRowsLocked(safeStart, end);
}

std::vector<double> HybridDiffDocument::getHunkRowIndexes() {
  std::lock_guard<std::mutex> lock(mutex_);
  return hunkRowIndexes_;
}

void HybridDiffDocument::appendStoredRowLocked(DiffRenderRow row) {
  DiffStoredRow storedRow;
  storedRow.index = row.index;
  storedRow.kind = row.kind;
  storedRow.fileIndex = row.fileIndex;
  storedRow.hunkIndex = row.hunkIndex;
  storedRow.oldLineNumber = row.oldLineNumber;
  storedRow.newLineNumber = row.newLineNumber;
  storedRow.changeType = row.changeType;
  storedRow.textOffset = rowText_.size();
  storedRow.textLength = row.text.size();
  rowText_.append(row.text);
  const bool startsHunk = storedRow.kind == diffRowKindLine
      && storedRow.hunkIndex >= 0
      && (rows_.empty()
          || rows_.back().kind != diffRowKindLine
          || rows_.back().fileIndex != storedRow.fileIndex
          || rows_.back().hunkIndex != storedRow.hunkIndex);
  if (startsHunk) {
    hunkRowIndexes_.push_back(static_cast<double>(rows_.size()));
  }
  appendChangedLineRunLocked(storedRow, rows_.size());
  rows_.push_back(std::move(storedRow));
}

void HybridDiffDocument::appendChangedLineRunLocked(const DiffStoredRow& row, size_t rowIndex) {
  const bool isAdded = row.kind == diffRowKindLine && row.changeType == diffChangeTypeAdd;
  const bool isRemoved = row.kind == diffRowKindLine && row.changeType == diffChangeTypeRemove;
  if (isAdded || isRemoved) {
    const bool continuesBlock = !changedLineBlocks_.empty()
        && changedLineBlocks_.back().rowEnd == rowIndex
        && changedLineBlocks_.back().fileIndex == row.fileIndex
        && changedLineBlocks_.back().hunkIndex == row.hunkIndex;
    if (!continuesBlock) {
      changedLineBlocks_.push_back(DiffChangedLineBlock{
          .rowStart = rowIndex,
          .rowEnd = rowIndex,
          .fileIndex = row.fileIndex,
          .hunkIndex = row.hunkIndex,
      });
    }

    auto& block = changedLineBlocks_.back();
    auto& runs = isAdded ? block.addedRuns : block.removedRuns;
    auto& count = isAdded ? block.addedCount : block.removedCount;
    const bool continuesRun = !runs.empty() && runs.back().rowStart + runs.back().rowCount == rowIndex;
    if (continuesRun) {
      runs.back().rowCount += 1;
    } else {
      runs.push_back(DiffChangedLineRun{
          .rowStart = rowIndex,
          .rowCount = 1,
          .ordinalStart = count,
      });
    }
    count += 1;
    block.rowEnd = rowIndex + 1;
  }
}

std::optional<DiffChangedLinePair> HybridDiffDocument::getChangedLinePair(double rowIndex) {
  const auto safeRowIndex = static_cast<size_t>(std::max(0.0, std::floor(rowIndex)));
  std::lock_guard<std::mutex> lock(mutex_);
  if (safeRowIndex >= rows_.size() || changedLineBlocks_.empty()) {
    return std::nullopt;
  }

  const auto blockAfter = std::upper_bound(
      changedLineBlocks_.begin(),
      changedLineBlocks_.end(),
      safeRowIndex,
      [](size_t index, const DiffChangedLineBlock& block) {
        return index < block.rowStart;
      });
  if (blockAfter == changedLineBlocks_.begin()) {
    return std::nullopt;
  }

  const auto& block = *std::prev(blockAfter);
  const auto& row = rows_[safeRowIndex];
  const bool isAdded = row.changeType == diffChangeTypeAdd;
  const bool isRemoved = row.changeType == diffChangeTypeRemove;
  if (safeRowIndex < block.rowStart || safeRowIndex >= block.rowEnd || (!isAdded && !isRemoved)) {
    return std::nullopt;
  }

  const auto& sourceRuns = isAdded ? block.addedRuns : block.removedRuns;
  const auto& counterpartRuns = isAdded ? block.removedRuns : block.addedRuns;
  const auto sourceRunAfter = std::upper_bound(
      sourceRuns.begin(),
      sourceRuns.end(),
      safeRowIndex,
      [](size_t index, const DiffChangedLineRun& run) {
        return index < run.rowStart;
      });
  if (sourceRunAfter == sourceRuns.begin()) {
    return std::nullopt;
  }

  const auto& sourceRun = *std::prev(sourceRunAfter);
  if (safeRowIndex >= sourceRun.rowStart + sourceRun.rowCount) {
    return std::nullopt;
  }
  const auto ordinal = sourceRun.ordinalStart + safeRowIndex - sourceRun.rowStart;
  const auto counterpartRunAfter = std::upper_bound(
      counterpartRuns.begin(),
      counterpartRuns.end(),
      ordinal,
      [](size_t targetOrdinal, const DiffChangedLineRun& run) {
        return targetOrdinal < run.ordinalStart;
      });
  if (counterpartRunAfter == counterpartRuns.begin()) {
    return std::nullopt;
  }

  const auto& counterpartRun = *std::prev(counterpartRunAfter);
  if (ordinal >= counterpartRun.ordinalStart + counterpartRun.rowCount) {
    return std::nullopt;
  }
  const auto counterpartRowIndex = counterpartRun.rowStart + ordinal - counterpartRun.ordinalStart;
  if (counterpartRowIndex >= rows_.size()) {
    return std::nullopt;
  }

  const auto addedRowIndex = isAdded ? safeRowIndex : counterpartRowIndex;
  const auto removedRowIndex = isRemoved ? safeRowIndex : counterpartRowIndex;
  return DiffChangedLinePair{
      .addedRow = renderRowLocked(addedRowIndex),
      .removedRow = renderRowLocked(removedRowIndex),
      .balanced = block.addedCount == block.removedCount,
  };
}

DiffRenderRow HybridDiffDocument::renderRowLocked(size_t index) const {
  if (index >= rows_.size()) {
    return createEmptyRenderRow();
  }

  const auto& row = rows_[index];
  const auto textOffset = std::min(rowText_.size(), row.textOffset);
  const auto textEnd = std::min(rowText_.size(), textOffset + row.textLength);
  const auto textLength = textEnd - textOffset;
  return DiffRenderRow(
      row.index,
      row.kind,
      row.fileIndex,
      row.hunkIndex,
      row.oldLineNumber,
      row.newLineNumber,
      row.changeType,
      rowText_.substr(textOffset, textLength),
      {});
}

std::vector<DiffRenderRow> HybridDiffDocument::renderRowsLocked(size_t start, size_t end) const {
  const auto safeStart = std::min(start, rows_.size());
  const auto safeEnd = std::min(rows_.size(), std::max(safeStart, end));
  std::vector<DiffRenderRow> rows;
  rows.reserve(safeEnd - safeStart);
  for (size_t index = safeStart; index < safeEnd; index += 1) {
    rows.push_back(renderRowLocked(index));
  }
  return rows;
}

void HybridDiffDocument::ensureSideBySideLinesLocked(size_t minLineCount) {
  const auto rowCount = rows_.size();
  const bool requiresAllRows = minLineCount == std::numeric_limits<size_t>::max();
  if (
      sideBySideLinesReady_ &&
      sideBySideSourceRowCount_ == rowCount &&
      (requiresAllRows || sideBySideLines_.size() >= minLineCount)) {
    return;
  }

  size_t targetRowCount = rowCount;
  if (!requiresAllRows) {
    targetRowCount = std::min(
        rowCount,
        std::max(
            sideBySideSourceRowCount_,
            std::min(rowCount, minLineCount + 256)));
  }

  bool shouldContinue = true;
  while (shouldContinue) {
    size_t rebuildStart = 0;
    if (sideBySideLinesReady_ && sideBySideSourceRowCount_ > 0 && !files_.empty()) {
      const auto rowAnchor = std::min(sideBySideSourceRowCount_, targetRowCount > 0 ? targetRowCount - 1 : 0);
      for (const auto& file : files_) {
        const auto fileStart = static_cast<size_t>(std::max(0.0, std::floor(file.rowStart)));
        if (fileStart <= rowAnchor) {
          rebuildStart = fileStart;
        } else {
          break;
        }
      }
    }

    if (rebuildStart == 0) {
      sideBySideLines_.clear();
    } else {
      auto eraseFrom = sideBySideLines_.end();
      for (auto iterator = sideBySideLines_.begin(); iterator != sideBySideLines_.end(); ++iterator) {
        if (iterator->sourceStart >= static_cast<double>(rebuildStart)) {
          eraseFrom = iterator;
          break;
        }
      }
      sideBySideLines_.erase(eraseFrom, sideBySideLines_.end());
    }

    auto nextLines = createDiffSideBySideLines(renderRowsLocked(rebuildStart, targetRowCount));
    const auto indexOffset = sideBySideLines_.size();
    sideBySideLines_.reserve(indexOffset + nextLines.size());
    for (auto& line : nextLines) {
      line.index = static_cast<double>(sideBySideLines_.size());
      sideBySideLines_.push_back(std::move(line));
    }

    sideBySideSourceRowCount_ = targetRowCount;
    sideBySideLinesReady_ = true;
    shouldContinue =
        !requiresAllRows &&
        sideBySideLines_.size() < minLineCount &&
        targetRowCount < rowCount;
    if (shouldContinue) {
      targetRowCount = std::min(
          rowCount,
          std::max(targetRowCount + 1024, targetRowCount * 2));
    }
  }
}

void HybridDiffDocument::enqueueTokenizationRangeLocked(size_t start, size_t end, bool highPriority, size_t sourceLineBudget) {
  if (rows_.empty()) {
    return;
  }

  const auto safeStart = std::min(start, rows_.size());
  const auto safeEnd = std::min(std::max(end, safeStart), rows_.size());
  if (safeStart >= safeEnd) {
    return;
  }

  DiffTokenizationRange range{safeStart, safeEnd, sourceLineBudget};
  if (highPriority) {
    backgroundTokenizeRanges_.push_front(range);
  } else {
    backgroundTokenizeRanges_.push_back(range);
  }
  backgroundTokenizeNextRowIndex_ = std::max(backgroundTokenizeNextRowIndex_, safeEnd);
}

bool HybridDiffDocument::enqueueTokenizationRangeIfNeededLocked(size_t start, size_t end) {
  const auto safeStart = std::min(start, rows_.size());
  const auto safeEnd = std::min(std::max(end, safeStart), rows_.size());
  if (safeStart >= safeEnd) {
    return false;
  }

  bool needsTokenization = false;
  for (size_t rowIndex = safeStart; rowIndex < safeEnd; rowIndex += 1) {
    if (
        rowIndex < rowTokenized_.size() &&
        rows_[rowIndex].kind == diffRowKindLine &&
        !rowTokenized_[rowIndex]) {
      needsTokenization = true;
      break;
    }
  }

  if (needsTokenization) {
    enqueueTokenizationRangeLocked(safeStart, safeEnd, true);
  }
  return needsTokenization;
}

void HybridDiffDocument::startQueuedTokenizationLocked(
    uint64_t generation,
    size_t chunkRowCount,
    std::chrono::steady_clock::duration chunkBudget) {
  if (backgroundTokenizationRunning_.load() || backgroundTokenizeRanges_.empty()) {
    return;
  }

  if (backgroundThread_.joinable()) {
    backgroundThread_.detach();
  }

  backgroundTokenizationRunning_.store(true);
  auto document = shared_cast<HybridDiffDocument>();

  backgroundThread_ = std::thread([document, generation, chunkRowCount, chunkBudget]() {
    bool shouldContinue = true;

    while (shouldContinue && document->backgroundGeneration_.load() == generation) {
      {
        std::unique_lock<std::mutex> lock(document->mutex_);
        shouldContinue = document->ensureNextBackgroundTokenChunk(lock, chunkRowCount, chunkBudget);
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
}

void HybridDiffDocument::advanceTokenizedMaxRowLocked() {
  while (
      backgroundTokenizeRowIndex_ < rowTokenized_.size() &&
      (rowTokenized_[backgroundTokenizeRowIndex_] || rows_[backgroundTokenizeRowIndex_].kind != diffRowKindLine)) {
    backgroundTokenizeRowIndex_ += 1;
  }
}

void HybridDiffDocument::markTokenizedRangeLocked(size_t start, size_t end) {
  if (start >= end) {
    return;
  }

  advanceTokenizedMaxRowLocked();
  tokenizedRowRanges_.push_back(DiffTokenizedRowRange(
      static_cast<double>(start),
      static_cast<double>(end)));
  tokenizedRowVersion_.fetch_add(1);
}

void HybridDiffDocument::clearTokenizedRowRangeLocked(size_t start, size_t end) {
  const auto safeStart = std::min(std::max(start, backgroundTokenizeRowIndex_), rowTokenized_.size());
  const auto safeEnd = std::min(std::max(end, safeStart), rowTokenized_.size());
  for (size_t index = safeStart; index < safeEnd; index += 1) {
    rowTokenized_[index] = false;
  }
}

void HybridDiffDocument::retainTokenizedRowsNearLocked(size_t start, size_t end) {
  if (rowTokenized_.size() <= retainedTokenizedRowEvictionMinRows || start >= end) {
    return;
  }

  const auto nextWindowStart = start > retainedTokenizedRowWindowPadding ? start - retainedTokenizedRowWindowPadding : 0;
  const auto nextWindowEnd = std::min(rowTokenized_.size(), end + retainedTokenizedRowWindowPadding);
  if (!retainedTokenizedRowWindowReady_) {
    retainedTokenizedRowWindowReady_ = true;
    retainedTokenizedRowWindowStart_ = nextWindowStart;
    retainedTokenizedRowWindowEnd_ = nextWindowEnd;
    releaseSourceCachesOutsideRowWindowLocked(nextWindowStart, nextWindowEnd);
    return;
  }

  if (nextWindowStart >= retainedTokenizedRowWindowStart_ && nextWindowEnd <= retainedTokenizedRowWindowEnd_) {
    return;
  }

  if (nextWindowStart > retainedTokenizedRowWindowStart_) {
    clearTokenizedRowRangeLocked(retainedTokenizedRowWindowStart_, std::min(nextWindowStart, retainedTokenizedRowWindowEnd_));
  }
  if (nextWindowEnd < retainedTokenizedRowWindowEnd_) {
    clearTokenizedRowRangeLocked(std::max(nextWindowEnd, retainedTokenizedRowWindowStart_), retainedTokenizedRowWindowEnd_);
  }
  if (nextWindowEnd < retainedTokenizedRowWindowStart_ || nextWindowStart > retainedTokenizedRowWindowEnd_) {
    clearTokenizedRowRangeLocked(retainedTokenizedRowWindowStart_, retainedTokenizedRowWindowEnd_);
  }

  retainedTokenizedRowWindowStart_ = nextWindowStart;
  retainedTokenizedRowWindowEnd_ = nextWindowEnd;
  releaseSourceCachesOutsideRowWindowLocked(nextWindowStart, nextWindowEnd);
}

void HybridDiffDocument::releaseSourceCachesOutsideRowWindowLocked(size_t start, size_t end) {
  for (auto& sources : fileSources_) {
    const auto fileIndex = static_cast<size_t>(std::max(0.0, sources.fileIndex));
    if (sources.fileIndex < 0 || fileIndex >= files_.size()) {
      continue;
    }

    const auto fileStart = static_cast<size_t>(std::max(0.0, files_[fileIndex].rowStart));
    const auto fileEnd = fileStart + static_cast<size_t>(std::max(0.0, files_[fileIndex].rowCount));
    if (fileEnd > start && fileStart < end) {
      continue;
    }

    {
      std::lock_guard<std::mutex> sourceLock(*sources.oldSourceMutex);
      if (sources.oldSourceLoaded) {
        resetTokenizedSource(sources.oldSource);
        sources.oldSourceLoaded = false;
      }
    }
    {
      std::lock_guard<std::mutex> sourceLock(*sources.newSourceMutex);
      if (sources.newSourceLoaded) {
        resetTokenizedSource(sources.newSource);
        sources.newSourceLoaded = false;
      }
    }
  }
}

void HybridDiffDocument::releaseAllSourceCachesLocked() {
  retainedTokenizedRowWindowReady_ = false;
  retainedTokenizedRowWindowStart_ = 0;
  retainedTokenizedRowWindowEnd_ = 0;
  for (auto& sources : fileSources_) {
    {
      std::lock_guard<std::mutex> sourceLock(*sources.oldSourceMutex);
      if (sources.oldSourceLoaded) {
        resetTokenizedSource(sources.oldSource);
        sources.oldSourceLoaded = false;
      }
    }
    {
      std::lock_guard<std::mutex> sourceLock(*sources.newSourceMutex);
      if (sources.newSourceLoaded) {
        resetTokenizedSource(sources.newSource);
        sources.newSourceLoaded = false;
      }
    }
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

  auto oldRow = oldRowVisible ? renderRowLocked(oldRowIndex) : emptyRow;
  auto newRow = newRowVisible && !newRowEqualsOldRow ? renderRowLocked(newRowIndex) : emptyRow;
  oldRow.tokens = {};
  newRow.tokens = {};
  if (oldRowVisible && oldRowIndex < rowTokenized_.size() && rowTokenized_[oldRowIndex]) {
    oldRow.tokens = cachedTokensForRowLocked(oldRow);
  }
  if (newRowVisible && !newRowEqualsOldRow && newRowIndex < rowTokenized_.size() && rowTokenized_[newRowIndex]) {
    newRow.tokens = cachedTokensForRowLocked(newRow);
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
      std::move(oldRow),
      std::move(newRow));
}

DiffSideBySideRenderRow HybridDiffDocument::getSideBySideRowForIndex(
    double index,
    const std::vector<double>& collapsedFileIndexes,
    bool tokenizeRows) {
  const auto safeIndex = static_cast<size_t>(std::max(0.0, std::floor(index)));

  std::lock_guard<std::mutex> lock(mutex_);
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);

  if (!hasCollapsedFileIndexes(collapsedFileIndexSet)) {
    ensureSideBySideLinesLocked(safeIndex + 1);
    if (safeIndex < sideBySideLines_.size()) {
      return createSideBySideRenderRow(sideBySideLines_[safeIndex], static_cast<double>(safeIndex), tokenizeRows);
    }
    return createSideBySideRenderRow(createSideBySideLine(index, sideBySideKindLine, -1, -1, -1, -1), index, tokenizeRows);
  }

  ensureSideBySideLinesLocked();
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
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  std::vector<DiffSideBySideRenderRow> rows;
  rows.reserve(safeCount);

  if (!hasCollapsedFileIndexes(collapsedFileIndexSet)) {
    ensureSideBySideLinesLocked(safeStart + safeCount);
    const auto end = std::min(sideBySideLines_.size(), safeStart + safeCount);
    for (size_t index = safeStart; index < end; index += 1) {
      rows.push_back(createSideBySideRenderRow(sideBySideLines_[index], static_cast<double>(index), tokenizeRows));
    }
    return rows;
  }

  ensureSideBySideLinesLocked();
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

DiffSyntaxStyle HybridDiffDocument::getNativeScopeStyle(const std::string& themeName, double scopeId) {
  std::lock_guard<std::mutex> lock(syntaxMutex_);
  const auto safeScopeId = static_cast<size_t>(std::max(0.0, std::floor(scopeId)));
  auto& styles = nativeScopeStyleCache_[themeName];
  if (styles.size() <= safeScopeId && styles.size() < syntaxState_->scopeState.scopes.size()) {
    const auto resolvedStyles = syntaxparser::resolveSyntaxScopeStyles(themeName, syntaxState_->scopeState.scopes, styles.size());
    styles.reserve(styles.size() + resolvedStyles.size());
    for (const auto& style : resolvedStyles) {
      styles.push_back(DiffSyntaxStyle(style.id, style.foreground, style.fontStyle));
    }
  }

  if (safeScopeId < styles.size()) {
    return styles[safeScopeId];
  }
  return DiffSyntaxStyle(static_cast<double>(safeScopeId), "", 0);
}

DiffLoadTiming HybridDiffDocument::getTiming() {
  std::lock_guard<std::mutex> lock(mutex_);
  return timing_;
}

double HybridDiffDocument::requestTokenizedRows(double start, double count, const std::string& reason) {
  (void)reason;
  const auto safeStart = static_cast<size_t>(std::max(0.0, std::floor(start)));
  const auto safeCount = static_cast<size_t>(std::max(0.0, std::ceil(count)));
  if (safeCount == 0) {
    return getTokenizedRowVersion();
  }

  std::lock_guard<std::mutex> lock(mutex_);
  const auto generation = backgroundGeneration_.load();
  retainTokenizedRowsNearLocked(safeStart, safeStart + safeCount);
  enqueueTokenizationRangeLocked(safeStart, safeStart + safeCount, true);
  startQueuedTokenizationLocked(
      generation,
      static_cast<size_t>(defaultBackgroundTokenizeChunkRowCount),
      std::chrono::duration_cast<std::chrono::steady_clock::duration>(
          std::chrono::duration<double, std::milli>(defaultBackgroundTokenizeChunkBudgetMs)));
  return getTokenizedRowVersion();
}

double HybridDiffDocument::requestTokenizedSideBySideRows(
    double start,
    double count,
    const std::vector<double>& collapsedFileIndexes,
    const std::string& reason) {
  (void)reason;
  const auto safeStart = static_cast<size_t>(std::max(0.0, std::floor(start)));
  const auto safeCount = static_cast<size_t>(std::max(0.0, std::ceil(count)));
  if (safeCount == 0) {
    return getTokenizedRowVersion();
  }

  std::lock_guard<std::mutex> lock(mutex_);
  ensureSideBySideLinesLocked();
  const auto collapsedFileIndexSet = createCollapsedFileIndexSet(collapsedFileIndexes);
  const auto safeEnd = safeStart + safeCount;
  size_t logicalIndex = 0;
  size_t requestedRowStart = rows_.size();
  size_t requestedRowEnd = 0;

  for (const auto& line : sideBySideLines_) {
    if (shouldIncludeSideBySideLine(line, collapsedFileIndexSet)) {
      if (logicalIndex >= safeStart && logicalIndex < safeEnd) {
        if (line.oldRowIndex >= 0) {
          const auto oldRowIndex = static_cast<size_t>(line.oldRowIndex);
          requestedRowStart = std::min(requestedRowStart, oldRowIndex);
          requestedRowEnd = std::max(requestedRowEnd, oldRowIndex + 1);
          enqueueTokenizationRangeLocked(oldRowIndex, oldRowIndex + 1, true);
        }
        if (line.newRowIndex >= 0 && line.newRowIndex != line.oldRowIndex) {
          const auto newRowIndex = static_cast<size_t>(line.newRowIndex);
          requestedRowStart = std::min(requestedRowStart, newRowIndex);
          requestedRowEnd = std::max(requestedRowEnd, newRowIndex + 1);
          enqueueTokenizationRangeLocked(newRowIndex, newRowIndex + 1, true);
        }
      }
      logicalIndex += 1;
      if (logicalIndex >= safeEnd) {
        break;
      }
    }
  }

  const auto generation = backgroundGeneration_.load();
  if (requestedRowStart < requestedRowEnd) {
    retainTokenizedRowsNearLocked(requestedRowStart, requestedRowEnd);
  }
  startQueuedTokenizationLocked(
      generation,
      static_cast<size_t>(defaultBackgroundTokenizeChunkRowCount),
      std::chrono::duration_cast<std::chrono::steady_clock::duration>(
          std::chrono::duration<double, std::milli>(defaultBackgroundTokenizeChunkBudgetMs)));
  return getTokenizedRowVersion();
}

double HybridDiffDocument::requestTokenizedFiles(const std::vector<double>& fileIndexes, const std::string& reason) {
  (void)reason;
  if (fileIndexes.empty()) {
    return getTokenizedRowVersion();
  }

  std::lock_guard<std::mutex> lock(mutex_);
  const auto generation = backgroundGeneration_.load();
  size_t requestedRowStart = rows_.size();
  size_t requestedRowEnd = 0;
  bool hasRequestedRange = false;

  for (const auto fileIndexValue : fileIndexes) {
    if (fileIndexValue < 0) {
      continue;
    }

    const auto fileIndex = static_cast<size_t>(std::floor(fileIndexValue));
    if (fileIndex >= files_.size()) {
      continue;
    }

    const auto& file = files_[fileIndex];
    const auto rowStart = static_cast<size_t>(std::max(0.0, std::floor(file.rowStart)));
    const auto rowCount = static_cast<size_t>(std::max(0.0, std::ceil(file.rowCount)));
    const auto rowEnd = std::min(rows_.size(), rowStart + rowCount);
    if (enqueueTokenizationRangeIfNeededLocked(rowStart, rowEnd)) {
      requestedRowStart = std::min(requestedRowStart, rowStart);
      requestedRowEnd = std::max(requestedRowEnd, rowEnd);
      hasRequestedRange = true;
    }
  }

  if (hasRequestedRange) {
    retainTokenizedRowsNearLocked(requestedRowStart, requestedRowEnd);
    startQueuedTokenizationLocked(
        generation,
        static_cast<size_t>(defaultBackgroundTokenizeChunkRowCount),
        std::chrono::duration_cast<std::chrono::steady_clock::duration>(
            std::chrono::duration<double, std::milli>(defaultBackgroundTokenizeChunkBudgetMs)));
  }
  return getTokenizedRowVersion();
}

double HybridDiffDocument::cancelTokenizationRequests(const std::string& reason) {
  (void)reason;
  stopBackgroundTokenization();
  std::lock_guard<std::mutex> lock(mutex_);
  backgroundTokenizeRanges_.clear();
  releaseAllSourceCachesLocked();
  return getTokenizedRowVersion();
}

double HybridDiffDocument::releaseNativeResources() {
  stopBackgroundTokenization();

  bool didDispose = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!disposed_) {
      disposed_ = true;
      didDispose = true;
      clearVectorMemory(files_);
      clearVectorMemory(rows_);
      clearStringMemory(rowText_);
      clearVectorMemory(hunkRowIndexes_);
      clearVectorMemory(changedLineBlocks_);
      clearVectorMemory(rowTokenized_);
      clearVectorMemory(sideBySideLines_);
      sideBySideLinesReady_ = false;
      sideBySideSourceRowCount_ = 0;
      clearVectorMemory(fileSources_);
      clearStringMemory(repositoryPath_);
      clearStringMemory(workdirPath_);
      clearStringMemory(headTreeOid_);
      backingStore_.reset();
      timing_ = DiffLoadTiming();
      backgroundTokenizeRowIndex_ = 0;
      backgroundTokenizeNextRowIndex_ = 0;
      clearDequeMemory(backgroundTokenizeRanges_);
      clearVectorMemory(tokenizedRowRanges_);
      retainedTokenizedRowWindowReady_ = false;
      retainedTokenizedRowWindowStart_ = 0;
      retainedTokenizedRowWindowEnd_ = 0;
      tokenizedRowVersion_.fetch_add(1);
    }
  }

  if (didDispose) {
    {
      std::lock_guard<std::mutex> syntaxLock(syntaxMutex_);
      syntaxState_ = std::make_shared<DiffSyntaxState>();
      nativeScopeStyleCache_.clear();
    }
    {
      std::lock_guard<std::mutex> registryLock(diffDocumentRegistryMutex);
      diffDocumentRegistry.erase(documentId_);
    }
    requestMallocPressureRelief();
    logMemorySnapshot("document.disposed");
  }

  return getTokenizedRowVersion();
}

double HybridDiffDocument::startBackgroundTokenization(double chunkRowCount, double chunkBudgetMs, double maxRowCount, double maxSourceLineCount) {
  const auto safeChunkRowCount = static_cast<size_t>(std::max(1.0, chunkRowCount));
  const auto safeChunkBudget = std::chrono::duration_cast<std::chrono::steady_clock::duration>(
      std::chrono::duration<double, std::milli>(std::max(1.0, chunkBudgetMs)));
  const auto safeSourceLineBudget = maxSourceLineCount > 0
      ? static_cast<size_t>(std::floor(maxSourceLineCount))
      : unlimitedTokenizeSourceLineBudget;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (disposed_) {
      return getTokenizedRowVersion();
    }
    const auto safeMaxRowCount = maxRowCount > 0
        ? static_cast<size_t>(std::floor(maxRowCount))
        : rows_.size();
    const auto backgroundEnd = std::min(rows_.size(), std::max(backgroundTokenizeRowIndex_, safeMaxRowCount));
    enqueueTokenizationRangeLocked(backgroundTokenizeRowIndex_, backgroundEnd, false, safeSourceLineBudget);
    if (!backgroundTokenizationRunning_.load()) {
      const auto generation = backgroundGeneration_.fetch_add(1) + 1;
      startQueuedTokenizationLocked(generation, safeChunkRowCount, safeChunkBudget);
    }
  }

  return getTokenizedRowVersion();
}

double HybridDiffDocument::startDefaultBackgroundTokenization() {
  return startBackgroundTokenization(defaultBackgroundTokenizeChunkRowCount, defaultBackgroundTokenizeChunkBudgetMs, 0, 0);
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

  {
    std::lock_guard<std::mutex> lock(mutex_);
    backgroundTokenizeRanges_.clear();
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
  if (disposed_) {
    return;
  }
  files_.push_back(std::move(file));
  fileSources_.push_back(std::move(fileSources));
  appendStoredRowLocked(std::move(headerRow));
  rowTokenized_.push_back(false);
  timing_.fileCount = static_cast<double>(files_.size());
  timing_.rowCount = static_cast<double>(rows_.size());
}

void HybridDiffDocument::setProgressFiles(
    std::vector<DiffFileSummary> files,
    std::vector<DiffFileSources> fileSources) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (disposed_) {
    return;
  }
  files_ = std::move(files);
  fileSources_ = std::move(fileSources);
  timing_.fileCount = static_cast<double>(files_.size());
}

void HybridDiffDocument::appendProgressRow(DiffRenderRow row) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (disposed_) {
    return;
  }
  appendStoredRowLocked(std::move(row));
  rowTokenized_.push_back(false);
  timing_.rowCount = static_cast<double>(rows_.size());
}

void HybridDiffDocument::updateProgressFile(const DiffFileSummary& file) {
  const auto fileIndex = static_cast<size_t>(std::max(0.0, std::floor(file.index)));
  std::lock_guard<std::mutex> lock(mutex_);
  if (disposed_) {
    return;
  }
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
  if (disposed_) {
    return;
  }
  repositoryPath_ = std::move(repositoryPath);
  workdirPath_ = std::move(workdirPath);
  headTreeOid_ = std::move(headTreeOid);
  backingStore_ = createLocalRepoDiffBackingStore(repositoryPath_, workdirPath_, headTreeOid_);
}

void HybridDiffDocument::setProgressTiming(const DiffLoadTiming& timing) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (disposed_) {
    return;
  }
  timing_ = timing;
  timing_.rowCount = static_cast<double>(rows_.size());
  timing_.fileCount = static_cast<double>(files_.size());
}

size_t HybridDiffDocument::getExternalMemorySizeLocked() const noexcept {
	  size_t size = rows_.capacity() * sizeof(DiffStoredRow) + rowText_.capacity() + files_.capacity() * sizeof(DiffFileSummary);
	  if (backingStore_) {
	    size += backingStore_->getExternalMemorySize();
	  }
  size += rowTokenized_.capacity() * sizeof(uint8_t);
  size += hunkRowIndexes_.capacity() * sizeof(double);
  size += changedLineBlocks_.capacity() * sizeof(DiffChangedLineBlock);
  for (const auto& block : changedLineBlocks_) {
    size += block.addedRuns.capacity() * sizeof(DiffChangedLineRun);
    size += block.removedRuns.capacity() * sizeof(DiffChangedLineRun);
  }
  size += backgroundTokenizeRanges_.size() * sizeof(DiffTokenizationRange);
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
  (void)reason;
#if DEBUG
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
    size_t tokenizedRowCount = 0;

    rowTextBytes = rowText_.capacity();
    for (const auto tokenized : rowTokenized_) {
      if (tokenized) {
        tokenizedRowCount += 1;
      }
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
        << " tokenizedRows=" << tokenizedRowCount
        << " tokenizedMaxRow=" << backgroundTokenizeRowIndex_
        << " tokenizedNextRow=" << backgroundTokenizeNextRowIndex_
        << " tokenizationQueuedRanges=" << backgroundTokenizeRanges_.size()
        << " scopeGroups=" << scopeGroupCount
        << " scopeStrings=" << scopeStringCount
        << " scopeBytes=" << scopeBytes;
    logDiffMemoryMessage(message.str());
  } catch (...) {
    logDiffMemoryMessage("[DiffMemory] snapshot.failed");
  }
#endif
}

std::vector<DiffSyntaxTokenRun> HybridDiffDocument::cachedTokensForRowLocked(const DiffRenderRow& row) {
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
  auto& source = oldSource ? sources.oldSource : sources.newSource;
  const auto loaded = oldSource ? sources.oldSourceLoaded : sources.newSourceLoaded;
  if (!loaded || (row.oldLineNumber < 1 && row.newLineNumber < 1)) {
    return {};
  }

  const auto lineNumber = oldSource ? row.oldLineNumber : row.newLineNumber;
  if (lineNumber < 1) {
    return {};
  }

  std::lock_guard<std::mutex> sourceLock(*sourceMutex);
  const auto lineIndex = static_cast<size_t>(lineNumber - 1);
  if (lineIndex < source.tokenCache.size() && source.tokenCache[lineIndex].has_value()) {
    return *source.tokenCache[lineIndex];
  }
  return {};
}

bool HybridDiffDocument::ensureRowTokens(size_t rowIndex) {
  if (rowIndex >= rows_.size()) {
    return false;
  }

  const auto row = renderRowLocked(rowIndex);
  if (rowIndex < rowTokenized_.size() && rowTokenized_[rowIndex]) {
    return true;
  }

  if (row.kind != diffRowKindLine) {
    if (rowIndex < rowTokenized_.size()) {
      rowTokenized_[rowIndex] = true;
    }
    return true;
  }

  const auto fileIndex = static_cast<size_t>(std::max(0.0, row.fileIndex));
  if (fileIndex >= fileSources_.size()) {
    if (rowIndex < rowTokenized_.size()) {
      rowTokenized_[rowIndex] = true;
    }
    return true;
  }

  auto& sources = fileSources_[fileIndex];
  const bool oldSource = row.changeType == diffChangeTypeRemove;
  auto sourceMutex = oldSource ? sources.oldSourceMutex : sources.newSourceMutex;
  std::lock_guard<std::mutex> sourceLock(*sourceMutex);
  const auto tokens = oldSource
      ? tokensForLine(ensureSourceLoaded(sources, true), row.oldLineNumber)
      : tokensForLine(ensureSourceLoaded(sources, false), row.newLineNumber);
  if (tokens.has_value() && rowIndex < rowTokenized_.size()) {
    rowTokenized_[rowIndex] = true;
  }
  return tokens.has_value();
}

bool HybridDiffDocument::tokenizeRowOutsideDocumentLock(const DiffRenderRow& row, size_t lineBudget, size_t* tokenizedLineDelta) {
  if (row.kind != diffRowKindLine) {
    return true;
  }

  const auto fileIndex = static_cast<size_t>(std::max(0.0, row.fileIndex));
  if (fileIndex >= fileSources_.size()) {
    return true;
  }

  auto& sources = fileSources_[fileIndex];
  const bool oldSource = row.changeType == diffChangeTypeRemove;
  auto sourceMutex = oldSource ? sources.oldSourceMutex : sources.newSourceMutex;
  std::lock_guard<std::mutex> sourceLock(*sourceMutex);
  if (oldSource) {
    return tokensForLine(ensureSourceLoaded(sources, true), row.oldLineNumber, lineBudget, tokenizedLineDelta).has_value();
  }
  return tokensForLine(ensureSourceLoaded(sources, false), row.newLineNumber, lineBudget, tokenizedLineDelta).has_value();
}

bool HybridDiffDocument::ensureNextBackgroundTokenChunk(
    std::unique_lock<std::mutex>& lock,
    size_t chunkRowCount,
    std::chrono::steady_clock::duration chunkBudget) {
  size_t changedStart = rows_.size();
  size_t changedEnd = 0;
  size_t tokenizedCount = 0;
  const auto startedAt = std::chrono::steady_clock::now();
  auto requeueRange = [this](const DiffTokenizationRange& range) {
    if (range.start >= range.end || range.sourceLineBudget == 0) {
      return;
    }
    if (range.sourceLineBudget == unlimitedTokenizeSourceLineBudget) {
      backgroundTokenizeRanges_.push_front(range);
    } else {
      backgroundTokenizeRanges_.push_back(range);
    }
  };

  while (!backgroundTokenizeRanges_.empty() && tokenizedCount < chunkRowCount) {
    auto range = backgroundTokenizeRanges_.front();
    backgroundTokenizeRanges_.pop_front();
    if (range.start >= range.end || range.start >= rows_.size()) {
      continue;
    }
    if (range.sourceLineBudget == 0) {
      continue;
    }

    const auto rowIndex = range.start;
    range.start += 1;
    if (rowIndex < rowTokenized_.size() && rowTokenized_[rowIndex]) {
      requeueRange(range);
      continue;
    }

    const auto sourceLineBudget = range.sourceLineBudget;
    const auto row = renderRowLocked(rowIndex);
    lock.unlock();
    size_t tokenizedLineDelta = 0;
    const auto rowTokenized = tokenizeRowOutsideDocumentLock(row, sourceLineBudget, &tokenizedLineDelta);
    lock.lock();
    if (sourceLineBudget != unlimitedTokenizeSourceLineBudget) {
      range.sourceLineBudget = tokenizedLineDelta >= sourceLineBudget ? 0 : sourceLineBudget - tokenizedLineDelta;
    }
    if (rowIndex < rows_.size() && rowIndex < rowTokenized_.size() && !rowTokenized_[rowIndex]) {
      if (rowTokenized) {
        rowTokenized_[rowIndex] = true;
        changedStart = std::min(changedStart, rowIndex);
        changedEnd = std::max(changedEnd, rowIndex + 1);
      } else if (range.sourceLineBudget > 0) {
        const auto retryRange = DiffTokenizationRange{rowIndex, rowIndex + 1, range.sourceLineBudget};
        if (range.sourceLineBudget == unlimitedTokenizeSourceLineBudget) {
          requeueRange(range);
          requeueRange(retryRange);
        } else {
          requeueRange(retryRange);
          requeueRange(range);
        }
        tokenizedCount += 1;
        if (tokenizedCount > 0 && std::chrono::steady_clock::now() - startedAt >= chunkBudget) {
          break;
        }
        continue;
      }
    }
    requeueRange(range);
    tokenizedCount += 1;
    if (tokenizedCount > 0 && std::chrono::steady_clock::now() - startedAt >= chunkBudget) {
      break;
    }
  }

  if (changedStart < changedEnd) {
    markTokenizedRangeLocked(changedStart, changedEnd);
  }

  return !backgroundTokenizeRanges_.empty();
}

DiffTokenizedSource& HybridDiffDocument::ensureSourceLoaded(DiffFileSources& sources, bool oldSource) {
  auto& source = oldSource ? sources.oldSource : sources.newSource;
  auto& loaded = oldSource ? sources.oldSourceLoaded : sources.newSourceLoaded;
  if (!loaded) {
    loaded = true;
    auto unifiedDiffSourceFactory = [this, &sources, oldSource] {
      return makeUnifiedDiffSource(sources, oldSource);
    };
    source = backingStore_
      ? backingStore_->loadSource(sources, oldSource, unifiedDiffSourceFactory)
      : unifiedDiffSourceFactory();
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
      const auto row = renderRowLocked(rowIndex);
      if (row.kind == diffRowKindLine) {
        setSourceLine(lines, oldSource ? row.oldLineNumber : row.newLineNumber, row.text);
      }
    }
  }
  return makeTokenizedSource(path, std::move(lines));
}

bool HybridDiffDocument::ensureTokenized(DiffTokenizedSource& source, size_t lineIndexExclusive, size_t lineBudget) {
  if (!source.enabled || source.language.empty()) {
    return true;
  }

  const auto end = std::min(source.lines.size(), lineIndexExclusive);
  if (source.tokenizedLineCount >= end) {
    return true;
  }

  if (lineBudget == 0) {
    return false;
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
    const auto budgetEnd = std::min(end, source.tokenizedLineCount + lineBudget);
    while (source.tokenizedLineCount < budgetEnd) {
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
    return source.tokenizedLineCount >= end;
  } catch (const std::exception&) {
    source.enabled = false;
  }
  return true;
}

std::optional<std::vector<DiffSyntaxTokenRun>> HybridDiffDocument::tokensForLine(
    DiffTokenizedSource& source,
    double lineNumber,
    size_t lineBudget,
    size_t* tokenizedLineDelta) {
  if (!source.enabled || lineNumber < 1) {
    return std::vector<DiffSyntaxTokenRun>{};
  }

  const auto lineIndex = static_cast<size_t>(lineNumber - 1);
  if (lineIndex >= source.lines.size()) {
    return std::vector<DiffSyntaxTokenRun>{};
  }

  const auto tokenizedLineCountBefore = source.tokenizedLineCount;
  const auto requestLineBudget = lineBudget == unlimitedTokenizeSourceLineBudget
      ? maxTokenizeLinesPerRequest
      : std::min(maxTokenizeLinesPerRequest, lineBudget);
  if (!ensureTokenized(source, lineIndex + 1, requestLineBudget)) {
    if (tokenizedLineDelta) {
      *tokenizedLineDelta += source.tokenizedLineCount - tokenizedLineCountBefore;
    }
    return std::nullopt;
  }
  if (tokenizedLineDelta) {
    *tokenizedLineDelta += source.tokenizedLineCount - tokenizedLineCountBefore;
  }
  if (lineIndex < source.tokenCache.size() && source.tokenCache[lineIndex].has_value()) {
    return *source.tokenCache[lineIndex];
  }
  return std::vector<DiffSyntaxTokenRun>{};
}

void HybridDiffDocument::releaseCompletedSourceCaches() {
  if (backgroundTokenizeRowIndex_ < rows_.size()) {
    return;
  }

  for (auto& sources : fileSources_) {
	    {
	      std::lock_guard<std::mutex> sourceLock(*sources.oldSourceMutex);
	      releaseTokenizedSourceText(sources.oldSource);
	    }
	    {
	      std::lock_guard<std::mutex> sourceLock(*sources.newSourceMutex);
	      releaseTokenizedSourceText(sources.newSource);
	    }
  }
}

std::shared_ptr<HybridDiffDocument> getRegisteredDiffDocument(double documentId) {
  const auto safeDocumentId = static_cast<uint64_t>(std::max(0.0, std::floor(documentId)));
  std::lock_guard<std::mutex> lock(diffDocumentRegistryMutex);
  const auto entry = diffDocumentRegistry.find(safeDocumentId);
  if (entry == diffDocumentRegistry.end()) {
    return nullptr;
  }

  auto document = entry->second.lock();
  if (!document) {
    diffDocumentRegistry.erase(entry);
  }
  return document;
}

} // namespace margelo::nitro::legendapps::diffparser

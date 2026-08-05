#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffDocumentSpec.hpp"
#include "DiffSideBySideProjection.hpp"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <deque>
#include <functional>
#include <limits>
#include <map>
#include <mutex>
#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace margelo::nitro::legendapps::diffparser {

struct DiffSyntaxState;
struct DiffTokenizedSourceState;

struct DiffTokenizedSource {
  bool enabled = false;
  std::string language;
  std::vector<std::string> lines;
  std::vector<std::optional<std::vector<DiffSyntaxTokenRun>>> tokenCache;
  std::shared_ptr<DiffTokenizedSourceState> state;
  size_t tokenizedLineCount = 0;
};

struct DiffFileSources {
  double fileIndex = -1;
  std::string oldPath;
  std::string newPath;
  std::string status;
  bool isBinary = false;
  bool isUnifiedDiff = false;
  bool oldSourceLoaded = false;
  bool newSourceLoaded = false;
  std::shared_ptr<std::mutex> oldSourceMutex = std::make_shared<std::mutex>();
  std::shared_ptr<std::mutex> newSourceMutex = std::make_shared<std::mutex>();
  DiffTokenizedSource oldSource;
  DiffTokenizedSource newSource;
};

using DiffSourceFactory = std::function<DiffTokenizedSource()>;

class DiffBackingStore {
public:
  virtual ~DiffBackingStore() = default;
  virtual DiffTokenizedSource loadSource(
      const DiffFileSources& sources,
      bool oldSource,
      const DiffSourceFactory& unifiedDiffSourceFactory) = 0;
  virtual size_t getExternalMemorySize() const noexcept;
};

std::shared_ptr<DiffBackingStore> createLocalRepoDiffBackingStore(
    std::string repositoryPath,
    std::string workdirPath,
    std::string headTreeOid);

std::shared_ptr<DiffBackingStore> createUnifiedDiffBackingStore();

struct DiffSideBySideLine {
  int32_t fileIndex = -1;
  int32_t hunkIndex = -1;
  int32_t oldRowIndex = -1;
  int32_t newRowIndex = -1;
  uint8_t kind = 0;
};

static_assert(sizeof(DiffSideBySideLine) == 20);

struct DiffTokenizationRange {
  size_t start = 0;
  size_t end = 0;
  size_t sourceLineBudget = std::numeric_limits<size_t>::max();
};

struct DiffStoredRow {
  uint64_t textOffset = 0;
  uint32_t textLength = 0;
  int32_t fileIndex = -1;
  int32_t hunkIndex = -1;
  int32_t oldLineNumber = -1;
  int32_t newLineNumber = -1;
  uint8_t kind = 0;
  uint8_t changeType = 0;
};

static_assert(sizeof(DiffStoredRow) == 32);

struct DiffChangedLineRun {
  uint32_t rowStart = 0;
  uint32_t rowCount = 0;
  uint32_t ordinalStart = 0;
};

static_assert(sizeof(DiffChangedLineRun) == 12);

struct DiffChangedLineBlock {
  uint32_t rowStart = 0;
  uint32_t rowEnd = 0;
  int32_t fileIndex = -1;
  int32_t hunkIndex = -1;
  uint32_t addedRunStart = 0;
  uint32_t addedRunCount = 0;
  uint32_t removedRunStart = 0;
  uint32_t removedRunCount = 0;
};

static_assert(sizeof(DiffChangedLineBlock) == 32);

struct DiffChangedLinePair {
  DiffRenderRow addedRow;
  DiffRenderRow removedRow;
  bool balanced = false;
};

class HybridDiffDocument final : public HybridDiffDocumentSpec {
public:
  HybridDiffDocument(
      std::vector<DiffFileSummary> files,
      std::vector<DiffRenderRow> rows,
      std::vector<DiffFileSources> fileSources,
      std::string repositoryPath,
      std::string workdirPath,
      std::string headTreeOid,
      std::shared_ptr<DiffBackingStore> backingStore,
      DiffLoadTiming timing);
  ~HybridDiffDocument() override;

  double getRowCount() override;
  double getFileCount() override;
  double getTokenizedMaxRow() override;
  double getScopeCount() override;
  double getDocumentId() override;
  DiffCachedRow getRow(double index) override;
  std::vector<DiffRenderRow> getPlainRows(double start, double count) override;
  std::vector<DiffRenderRow> getRows(double start, double count) override;
  std::vector<double> getHunkRowIndexes() override;
  std::shared_ptr<HybridDiffSideBySideProjectionSpec> createSideBySideProjection(
      const std::vector<double>& collapsedFileIndexes) override;
  double getSideBySideRowCount(const std::vector<double>& collapsedFileIndexes) override;
  std::vector<DiffSideBySideFileHeader> getSideBySideFileHeaders(const std::vector<double>& collapsedFileIndexes) override;
  double getSideBySideListIndexForSourceRow(double sourceRowIndex, const std::vector<double>& collapsedFileIndexes) override;
  DiffSideBySideRenderRow getPlainSideBySideRow(double index, const std::vector<double>& collapsedFileIndexes) override;
  DiffSideBySideRenderRow getSideBySideRow(double index, const std::vector<double>& collapsedFileIndexes) override;
  std::vector<DiffSideBySideRenderRow> getPlainSideBySideRows(double start, double count, const std::vector<double>& collapsedFileIndexes) override;
  std::vector<DiffSideBySideRenderRow> getSideBySideRows(double start, double count, const std::vector<double>& collapsedFileIndexes) override;
  double getTokenizedRowVersion() override;
  std::vector<DiffTokenizedRowRange> consumeTokenizedRowRanges() override;
  std::vector<DiffFileSummary> getFiles() override;
  std::vector<DiffSyntaxScope> getScopes() override;
  std::vector<DiffSyntaxStyle> getScopeStyles(const std::string& themeName, double fromScopeId) override;
  DiffSyntaxStyle getNativeScopeStyle(const std::string& themeName, double scopeId);
  std::optional<DiffChangedLinePair> getChangedLinePair(double rowIndex);
  DiffLoadTiming getTiming() override;
  double requestTokenizedRows(double start, double count, const std::string& reason) override;
  double requestTokenizedSideBySideRows(
      double start,
      double count,
      const std::vector<double>& collapsedFileIndexes,
      const std::string& reason) override;
  double requestTokenizedFiles(const std::vector<double>& fileIndexes, const std::string& reason) override;
  double cancelTokenizationRequests(const std::string& reason) override;
  double releaseNativeResources() override;
  double startBackgroundTokenization(double chunkRowCount, double chunkBudgetMs, double maxRowCount, double maxSourceLineCount) override;
  double stopBackgroundTokenization() override;
  double startDefaultBackgroundTokenization();
  void appendProgressFile(
      DiffFileSummary file,
      DiffFileSources fileSources,
      DiffRenderRow headerRow);
  void setProgressFiles(
      std::vector<DiffFileSummary> files,
      std::vector<DiffFileSources> fileSources);
  void appendProgressRow(DiffRenderRow row);
  void updateProgressFile(const DiffFileSummary& file);
  void setProgressRepositoryMetadata(
      std::string repositoryPath,
      std::string workdirPath,
      std::string headTreeOid);
  void setProgressTiming(const DiffLoadTiming& timing);

  DiffSideBySideIndex getSideBySideIndexSnapshot();
  std::optional<size_t> findSideBySideItemIdForSourceRow(double sourceRowIndex);
  std::optional<DiffSideBySideLine> getSideBySideLineForItem(size_t itemId);
  DiffSideBySideRenderRow getSideBySideRowForItem(
      size_t itemId,
      double listIndex,
      bool tokenizeRows);
  std::vector<DiffSideBySideRenderRow> getSideBySideRowsForItems(
      const std::vector<size_t>& itemIds,
      size_t listStart,
      bool tokenizeRows);
  double requestTokenizedSideBySideItems(
      const std::vector<size_t>& itemIds,
      const std::string& reason);

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  size_t getExternalMemorySizeLocked() const noexcept;
  void appendStoredRowLocked(DiffRenderRow row);
  void appendChangedLineRunLocked(const DiffStoredRow& row, size_t rowIndex);
  DiffRenderRow renderRowLocked(size_t index) const;
  std::vector<DiffRenderRow> renderRowsLocked(size_t start, size_t end) const;
  void ensureSideBySideLinesLocked(size_t minLineCount = std::numeric_limits<size_t>::max());
  void enqueueTokenizationRangeLocked(
      size_t start,
      size_t end,
      bool highPriority = false,
      size_t sourceLineBudget = std::numeric_limits<size_t>::max());
  bool enqueueTokenizationRangeIfNeededLocked(size_t start, size_t end);
  void startQueuedTokenizationLocked(
      uint64_t generation,
      size_t chunkRowCount,
      std::chrono::steady_clock::duration chunkBudget);
  void advanceTokenizedMaxRowLocked();
  void markTokenizedRangeLocked(size_t start, size_t end);
  void clearTokenizedRowRangeLocked(size_t start, size_t end);
  void retainTokenizedRowsNearLocked(size_t start, size_t end);
  void releaseSourceCachesOutsideRowWindowLocked(size_t start, size_t end);
  void releaseAllSourceCachesLocked();
  DiffSideBySideRenderRow createSideBySideRenderRow(
      const DiffSideBySideLine& line,
      double index,
      double sourceFallbackIndex,
      bool tokenizeRows);
  DiffSideBySideRenderRow getSideBySideRowForIndex(
      double index,
      const std::vector<double>& collapsedFileIndexes,
      bool tokenizeRows);
  std::vector<DiffSideBySideRenderRow> getSideBySideRowsForRange(
      double start,
      double count,
      const std::vector<double>& collapsedFileIndexes,
      bool tokenizeRows);
  std::vector<DiffSyntaxTokenRun> cachedTokensForRowLocked(const DiffRenderRow& row);
  bool ensureRowTokens(size_t rowIndex);
  bool tokenizeRowOutsideDocumentLock(
      const DiffRenderRow& row,
      size_t lineBudget = std::numeric_limits<size_t>::max(),
      size_t* tokenizedLineDelta = nullptr);
  bool ensureNextBackgroundTokenChunk(
      std::unique_lock<std::mutex>& lock,
      size_t chunkRowCount,
      std::chrono::steady_clock::duration chunkBudget);
  DiffTokenizedSource& ensureSourceLoaded(DiffFileSources& sources, bool oldSource);
  DiffTokenizedSource makeUnifiedDiffSource(const DiffFileSources& sources, bool oldSource);
  bool ensureTokenized(DiffTokenizedSource& source, size_t lineIndexExclusive, size_t lineBudget);
  std::optional<std::vector<DiffSyntaxTokenRun>> tokensForLine(
      DiffTokenizedSource& source,
      double lineNumber,
      size_t lineBudget = std::numeric_limits<size_t>::max(),
      size_t* tokenizedLineDelta = nullptr);
  void releaseCompletedSourceCaches();

  uint64_t documentId_;
  std::vector<DiffFileSummary> files_;
  std::vector<DiffStoredRow> rows_;
  std::string rowText_;
  std::vector<double> hunkRowIndexes_;
  std::vector<DiffChangedLineBlock> changedLineBlocks_;
  std::vector<DiffChangedLineRun> changedAddedLineRuns_;
  std::vector<DiffChangedLineRun> changedRemovedLineRuns_;
  std::vector<uint8_t> rowTokenized_;
  std::vector<DiffSideBySideLine> sideBySideLines_;
  DiffSideBySideIndex sideBySideIndex_;
  uint64_t sideBySideIndexGeneration_ = 0;
  bool sideBySideLinesReady_ = false;
  size_t sideBySideSourceRowCount_ = 0;
  std::vector<DiffFileSources> fileSources_;
  std::string repositoryPath_;
  std::string workdirPath_;
  std::string headTreeOid_;
  std::shared_ptr<DiffSyntaxState> syntaxState_;
  std::shared_ptr<DiffBackingStore> backingStore_;
  std::map<std::string, std::vector<DiffSyntaxStyle>> nativeScopeStyleCache_;
  DiffLoadTiming timing_;
  size_t backgroundTokenizeRowIndex_ = 0;
  size_t backgroundTokenizeNextRowIndex_ = 0;
  std::deque<DiffTokenizationRange> backgroundTokenizeRanges_;
  std::vector<DiffTokenizedRowRange> tokenizedRowRanges_;
  bool retainedTokenizedRowWindowReady_ = false;
  size_t retainedTokenizedRowWindowStart_ = 0;
  size_t retainedTokenizedRowWindowEnd_ = 0;
  bool disposed_ = false;
  std::atomic<uint64_t> backgroundGeneration_{0};
  std::atomic<uint64_t> tokenizedRowVersion_{0};
  std::atomic<bool> backgroundTokenizationRunning_{false};
  std::thread backgroundThread_;
  mutable std::mutex mutex_;
  mutable std::mutex syntaxMutex_;
};

std::shared_ptr<HybridDiffDocument> getRegisteredDiffDocument(double documentId);

} // namespace margelo::nitro::legendapps::diffparser

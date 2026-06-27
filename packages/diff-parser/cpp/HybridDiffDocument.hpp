#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffDocumentSpec.hpp"

#include <atomic>
#include <chrono>
#include <mutex>
#include <memory>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace margelo::nitro::legenddesktop::diffparser {

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

struct DiffSideBySideLine {
  double index = 0;
  double kind = 0;
  double fileIndex = -1;
  double hunkIndex = -1;
  double sourceStart = 0;
  double sourceEnd = 0;
  double oldRowIndex = -1;
  double newRowIndex = -1;
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
      DiffLoadTiming timing);
  ~HybridDiffDocument() override;

  double getRowCount() override;
  double getFileCount() override;
  double getTokenizedMaxRow() override;
  double getScopeCount() override;
  DiffCachedRow getRow(double index) override;
  std::vector<DiffRenderRow> getPlainRows(double start, double count) override;
  std::vector<DiffRenderRow> getRows(double start, double count) override;
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
  DiffLoadTiming getTiming() override;
  double startBackgroundTokenization(double chunkRowCount, double chunkBudgetMs) override;
  double stopBackgroundTokenization() override;
  double startDefaultBackgroundTokenization();
  void logMemorySnapshot(const std::string& reason) noexcept;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  size_t getExternalMemorySizeLocked() const noexcept;
  void ensureSideBySideLinesLocked();
  DiffSideBySideRenderRow createSideBySideRenderRow(const DiffSideBySideLine& line, double index, bool tokenizeRows);
  DiffSideBySideRenderRow getSideBySideRowForIndex(
      double index,
      const std::vector<double>& collapsedFileIndexes,
      bool tokenizeRows);
  std::vector<DiffSideBySideRenderRow> getSideBySideRowsForRange(
      double start,
      double count,
      const std::vector<double>& collapsedFileIndexes,
      bool tokenizeRows);
  void ensureRowTokens(size_t rowIndex);
  std::vector<DiffSyntaxTokenRun> tokenizeRowOutsideDocumentLock(const DiffRenderRow& row);
  bool ensureNextBackgroundTokenChunk(
      std::unique_lock<std::mutex>& lock,
      size_t chunkRowCount,
      std::chrono::steady_clock::duration chunkBudget);
  DiffTokenizedSource& ensureSourceLoaded(DiffFileSources& sources, bool oldSource);
  DiffTokenizedSource makeUnifiedDiffSource(const DiffFileSources& sources, bool oldSource);
  void ensureTokenized(DiffTokenizedSource& source, size_t lineIndexExclusive);
  std::vector<DiffSyntaxTokenRun> tokensForLine(DiffTokenizedSource& source, double lineNumber);
  void releaseCompletedSourceCaches();

  std::vector<DiffFileSummary> files_;
  std::vector<DiffRenderRow> rows_;
  std::vector<DiffSideBySideLine> sideBySideLines_;
  bool sideBySideLinesReady_ = false;
  std::vector<DiffFileSources> fileSources_;
  std::string repositoryPath_;
  std::string workdirPath_;
  std::string headTreeOid_;
  std::shared_ptr<DiffSyntaxState> syntaxState_;
  DiffLoadTiming timing_;
  size_t backgroundTokenizeRowIndex_ = 0;
  size_t backgroundTokenizeNextRowIndex_ = 0;
  std::vector<DiffTokenizedRowRange> tokenizedRowRanges_;
  std::atomic<uint64_t> backgroundGeneration_{0};
  std::atomic<uint64_t> tokenizedRowVersion_{0};
  std::atomic<bool> backgroundTokenizationRunning_{false};
  std::thread backgroundThread_;
  mutable std::mutex mutex_;
  mutable std::mutex syntaxMutex_;
};

} // namespace margelo::nitro::legenddesktop::diffparser

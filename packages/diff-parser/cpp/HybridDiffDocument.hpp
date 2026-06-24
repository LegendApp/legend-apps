#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffDocumentSpec.hpp"

#include <atomic>
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
  std::string oldPath;
  std::string newPath;
  std::string status;
  bool isBinary = false;
  bool oldSourceLoaded = false;
  bool newSourceLoaded = false;
  DiffTokenizedSource oldSource;
  DiffTokenizedSource newSource;
};

struct DiffSideBySideLine {
  double index = 0;
  std::string kind;
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
      std::string theme,
      DiffLoadTiming timing);
  ~HybridDiffDocument() override;

  double getRowCount() override;
  double getFileCount() override;
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
  std::vector<DiffFileSummary> getFiles() override;
  std::vector<DiffSyntaxStyle> getStyles() override;
  DiffLoadTiming getTiming() override;
  double startBackgroundTokenization(double chunkRowCount) override;
  double stopBackgroundTokenization() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
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
  bool ensureNextBackgroundTokenChunk(size_t chunkRowCount);
  DiffTokenizedSource& ensureSourceLoaded(DiffFileSources& sources, bool oldSource);
  void ensureTokenized(DiffTokenizedSource& source, size_t lineIndexExclusive);
  std::vector<DiffSyntaxTokenRun> tokensForLine(DiffTokenizedSource& source, double lineNumber);

  std::vector<DiffFileSummary> files_;
  std::vector<DiffRenderRow> rows_;
  std::vector<DiffSideBySideLine> sideBySideLines_;
  std::vector<DiffFileSources> fileSources_;
  std::string repositoryPath_;
  std::string workdirPath_;
  std::string headTreeOid_;
  std::string theme_;
  std::shared_ptr<DiffSyntaxState> syntaxState_;
  DiffLoadTiming timing_;
  size_t backgroundTokenizeRowIndex_ = 0;
  std::atomic<uint64_t> backgroundGeneration_{0};
  std::atomic<uint64_t> tokenizedRowVersion_{0};
  std::atomic<bool> backgroundTokenizationRunning_{false};
  std::thread backgroundThread_;
  mutable std::mutex mutex_;
};

} // namespace margelo::nitro::legenddesktop::diffparser

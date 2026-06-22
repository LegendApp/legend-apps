#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffDocumentSpec.hpp"

#include <mutex>
#include <memory>
#include <optional>
#include <string>
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
  std::string oldText;
  std::string newText;
  DiffTokenizedSource oldSource;
  DiffTokenizedSource newSource;
};

class HybridDiffDocument final : public HybridDiffDocumentSpec {
public:
  HybridDiffDocument(
      std::vector<DiffFileSummary> files,
      std::vector<DiffRenderRow> rows,
      std::vector<DiffFileSources> fileSources,
      std::string theme,
      DiffLoadTiming timing);

  double getRowCount() override;
  double getFileCount() override;
  std::vector<DiffRenderRow> getRows(double start, double count) override;
  std::vector<DiffFileSummary> getFiles() override;
  std::vector<DiffSyntaxStyle> getStyles() override;
  DiffLoadTiming getTiming() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  void ensureRowTokens(size_t rowIndex);
  void ensureTokenized(DiffTokenizedSource& source, size_t lineIndexExclusive);
  std::vector<DiffSyntaxTokenRun> tokensForLine(DiffTokenizedSource& source, double lineNumber);

  std::vector<DiffFileSummary> files_;
  std::vector<DiffRenderRow> rows_;
  std::vector<DiffFileSources> fileSources_;
  std::string theme_;
  std::shared_ptr<DiffSyntaxState> syntaxState_;
  DiffLoadTiming timing_;
  mutable std::mutex mutex_;
};

} // namespace margelo::nitro::legenddesktop::diffparser

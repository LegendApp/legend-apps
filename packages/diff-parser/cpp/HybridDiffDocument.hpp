#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffDocumentSpec.hpp"

#include <mutex>
#include <string>
#include <vector>

namespace margelo::nitro::legenddesktop::diffparser {

class HybridDiffDocument final : public HybridDiffDocumentSpec {
public:
  HybridDiffDocument(
      std::vector<DiffFileSummary> files,
      std::vector<DiffRenderRow> rows,
      DiffLoadTiming timing);

  double getRowCount() override;
  double getFileCount() override;
  std::vector<DiffRenderRow> getRows(double start, double count) override;
  std::vector<DiffFileSummary> getFiles() override;
  DiffLoadTiming getTiming() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  std::vector<DiffFileSummary> files_;
  std::vector<DiffRenderRow> rows_;
  DiffLoadTiming timing_;
  mutable std::mutex mutex_;
};

} // namespace margelo::nitro::legenddesktop::diffparser

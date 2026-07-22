#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffSideBySideProjectionSpec.hpp"
#include "DiffSideBySideProjection.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <optional>
#include <vector>

namespace margelo::nitro::legendapps::diffparser {

class HybridDiffDocument;

class HybridDiffSideBySideProjection final : public HybridDiffSideBySideProjectionSpec {
public:
  HybridDiffSideBySideProjection(
      std::shared_ptr<HybridDiffDocument> document,
      const DiffSideBySideIndex& index,
      const std::vector<double>& collapsedFileIndexes);
  ~HybridDiffSideBySideProjection() override;

  double getProjectionId() override;
  double getRevision() override;
  double getRowCount() override;
  double getDocumentGeneration() override;
  DiffSideBySideProjectionCommit setFileCollapsed(double fileIndex, bool collapsed) override;
  DiffSideBySideProjectionCommit refresh() override;
  bool isFileCollapsed(double fileIndex) override;
  double getItemId(double index) override;
  DiffSideBySideProjectionItem getItem(double itemId) override;
  DiffSideBySideProjectionLocation getFileLocation(double fileIndex) override;
  DiffSideBySideProjectionLocation getItemLocation(double itemId) override;
  DiffSideBySideProjectionLocation getSourceLocation(double sourceRowIndex) override;
  std::vector<DiffSideBySideProjectionLocation> getHunkLocations() override;
  DiffSideBySideRenderRow getPlainRowForItem(double itemId, double listIndex) override;
  DiffSideBySideRenderRow getRowForItem(double itemId, double listIndex) override;
  std::vector<DiffSideBySideRenderRow> getPlainRows(double start, double count) override;
  std::vector<DiffSideBySideRenderRow> getRows(double start, double count) override;
  double requestTokenizedRows(double start, double count, const std::string& reason) override;
  double releaseNativeResources() override;

private:
  DiffSideBySideProjectionCommit convertCommit(const DiffSideBySideCoreCommit& commit) const;
  DiffSideBySideProjectionLocation createLocation(
      const std::optional<DiffSideBySideCoreLocation>& location) const;
  std::vector<size_t> itemIdsForRange(double start, double count) const;
  std::shared_ptr<HybridDiffDocument> documentSnapshot() const;
  void registerProjection();
  void unregisterProjection();

  uint64_t projectionId_;
  std::shared_ptr<HybridDiffDocument> document_;
  DiffSideBySideProjection projection_;
  bool disposed_ = false;
  mutable std::mutex mutex_;
};

std::shared_ptr<HybridDiffSideBySideProjection> getRegisteredDiffSideBySideProjection(
    double projectionId);

} // namespace margelo::nitro::legendapps::diffparser

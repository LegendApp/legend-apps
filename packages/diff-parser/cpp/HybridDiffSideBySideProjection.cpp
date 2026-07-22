#include "HybridDiffSideBySideProjection.hpp"

#include "HybridDiffDocument.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>

namespace margelo::nitro::legendapps::diffparser {

namespace {

std::atomic<uint64_t> nextDiffSideBySideProjectionId{1};
std::mutex diffSideBySideProjectionRegistryMutex;
std::map<uint64_t, std::weak_ptr<HybridDiffSideBySideProjection>> diffSideBySideProjectionRegistry;

size_t safeSize(double value) {
  return static_cast<size_t>(std::max(0.0, std::floor(value)));
}

int32_t safeInt32(double value) {
  return static_cast<int32_t>(std::max(
      static_cast<double>(std::numeric_limits<int32_t>::min()),
      std::min(static_cast<double>(std::numeric_limits<int32_t>::max()), std::floor(value))));
}

DiffSideBySideRenderRow emptySideBySideRow() {
  return DiffSideBySideRenderRow();
}

} // namespace

HybridDiffSideBySideProjection::HybridDiffSideBySideProjection(
    std::shared_ptr<HybridDiffDocument> document,
    const DiffSideBySideIndex& index,
    const std::vector<double>& collapsedFileIndexes)
    : HybridObject(TAG),
      projectionId_(nextDiffSideBySideProjectionId.fetch_add(1)),
      document_(std::move(document)),
      projection_(index) {
  for (const auto fileIndex : collapsedFileIndexes) {
    const auto safeFileIndex = safeInt32(fileIndex);
    if (index.fileForIndex(safeFileIndex) != nullptr) {
      projection_.setFileCollapsed(safeFileIndex, true);
    }
  }
}

HybridDiffSideBySideProjection::~HybridDiffSideBySideProjection() {
  unregisterProjection();
}

double HybridDiffSideBySideProjection::getProjectionId() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!disposed_) {
    registerProjection();
    return static_cast<double>(projectionId_);
  }
  return 0;
}

double HybridDiffSideBySideProjection::getRevision() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(projection_.revision());
}

double HybridDiffSideBySideProjection::getRowCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return disposed_ ? 0 : static_cast<double>(projection_.length());
}

double HybridDiffSideBySideProjection::getDocumentGeneration() {
  std::lock_guard<std::mutex> lock(mutex_);
  return disposed_ ? 0 : static_cast<double>(projection_.documentGeneration());
}

DiffSideBySideProjectionCommit HybridDiffSideBySideProjection::setFileCollapsed(
    double fileIndex,
    bool collapsed) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (disposed_) {
    return convertCommit(DiffSideBySideCoreCommit());
  }
  return convertCommit(projection_.setFileCollapsed(safeInt32(fileIndex), collapsed));
}

DiffSideBySideProjectionCommit HybridDiffSideBySideProjection::refresh() {
  auto document = documentSnapshot();
  auto index = document ? document->getSideBySideIndexSnapshot() : DiffSideBySideIndex();
  std::lock_guard<std::mutex> lock(mutex_);
  if (disposed_) {
    return convertCommit(DiffSideBySideCoreCommit());
  }
  return convertCommit(projection_.refresh(index));
}

bool HybridDiffSideBySideProjection::isFileCollapsed(double fileIndex) {
  std::lock_guard<std::mutex> lock(mutex_);
  return !disposed_ && projection_.isFileCollapsed(safeInt32(fileIndex));
}

double HybridDiffSideBySideProjection::getItemId(double index) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto itemId = disposed_ ? std::nullopt : projection_.itemIdAt(safeSize(index));
  return itemId.has_value() ? static_cast<double>(*itemId) : -1;
}

DiffSideBySideProjectionItem HybridDiffSideBySideProjection::getItem(double itemId) {
  const auto safeItemId = safeSize(itemId);
  auto document = documentSnapshot();
  const auto line = document ? document->getSideBySideLineForItem(safeItemId) : std::nullopt;
  if (!line.has_value()) {
    return DiffSideBySideProjectionItem(-1, "", -1, -1, -1, -1, false);
  }
  bool isHunkStart = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    isHunkStart = !disposed_ && projection_.indexSnapshot().isHunkStart(safeItemId);
  }
  const auto sourceStartCandidate = line->oldRowIndex >= 0 && line->newRowIndex >= 0
      ? std::min(line->oldRowIndex, line->newRowIndex)
      : std::max(line->oldRowIndex, line->newRowIndex);
  const auto sourceStart = sourceStartCandidate >= 0
      ? sourceStartCandidate
      : static_cast<int32_t>(std::min<size_t>(safeItemId, std::numeric_limits<int32_t>::max()));
  const auto sourceEnd = line->oldRowIndex >= 0 && line->newRowIndex >= 0
      ? std::max(line->oldRowIndex, line->newRowIndex) + 1
      : sourceStart + 1;
  return DiffSideBySideProjectionItem(
      static_cast<double>(safeItemId),
      line->kind == 0 ? "file-header" : line->kind == 1 ? "context" : line->kind == 2 ? "change" : "line",
      line->fileIndex,
      line->hunkIndex,
      sourceStart,
      sourceEnd,
      isHunkStart);
}

DiffSideBySideProjectionLocation HybridDiffSideBySideProjection::getFileLocation(double fileIndex) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto safeFileIndex = safeInt32(fileIndex);
  const auto visibleIndex = disposed_ ? std::nullopt : projection_.visibleIndexForFile(safeFileIndex);
  if (!visibleIndex.has_value()) {
    return DiffSideBySideProjectionLocation(-1, -1, safeFileIndex, false, false);
  }
  const auto itemId = projection_.itemIdAt(*visibleIndex);
  return DiffSideBySideProjectionLocation(
      static_cast<double>(*visibleIndex),
      itemId.has_value() ? static_cast<double>(*itemId) : -1,
      safeFileIndex,
      projection_.isFileCollapsed(safeFileIndex),
      true);
}

DiffSideBySideProjectionLocation HybridDiffSideBySideProjection::getItemLocation(double itemId) {
  std::lock_guard<std::mutex> lock(mutex_);
  return createLocation(disposed_ ? std::nullopt : projection_.locateItem(safeSize(itemId)));
}

DiffSideBySideProjectionLocation HybridDiffSideBySideProjection::getSourceLocation(double sourceRowIndex) {
  auto document = documentSnapshot();
  const auto itemId = document ? document->findSideBySideItemIdForSourceRow(sourceRowIndex) : std::nullopt;
  std::lock_guard<std::mutex> lock(mutex_);
  return createLocation(itemId.has_value() && !disposed_ ? projection_.locateItem(*itemId) : std::nullopt);
}

std::vector<DiffSideBySideProjectionLocation> HybridDiffSideBySideProjection::getHunkLocations() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<DiffSideBySideProjectionLocation> locations;
  if (!disposed_) {
    const auto& itemIds = projection_.indexSnapshot().hunkStartItemIds();
    locations.reserve(itemIds.size());
    for (const auto itemId : itemIds) {
      const auto location = projection_.locateItem(itemId);
      if (location.has_value() && location->exact) {
        locations.push_back(createLocation(location));
      }
    }
  }
  return locations;
}

DiffSideBySideRenderRow HybridDiffSideBySideProjection::getPlainRowForItem(
    double itemId,
    double listIndex) {
  auto document = documentSnapshot();
  return document ? document->getSideBySideRowForItem(safeSize(itemId), listIndex, false) : emptySideBySideRow();
}

DiffSideBySideRenderRow HybridDiffSideBySideProjection::getRowForItem(
    double itemId,
    double listIndex) {
  auto document = documentSnapshot();
  return document ? document->getSideBySideRowForItem(safeSize(itemId), listIndex, true) : emptySideBySideRow();
}

std::vector<DiffSideBySideRenderRow> HybridDiffSideBySideProjection::getPlainRows(
    double start,
    double count) {
  const auto itemIds = itemIdsForRange(start, count);
  auto document = documentSnapshot();
  return document ? document->getSideBySideRowsForItems(itemIds, safeSize(start), false) : std::vector<DiffSideBySideRenderRow>();
}

std::vector<DiffSideBySideRenderRow> HybridDiffSideBySideProjection::getRows(
    double start,
    double count) {
  const auto itemIds = itemIdsForRange(start, count);
  auto document = documentSnapshot();
  return document ? document->getSideBySideRowsForItems(itemIds, safeSize(start), true) : std::vector<DiffSideBySideRenderRow>();
}

double HybridDiffSideBySideProjection::requestTokenizedRows(
    double start,
    double count,
    const std::string& reason) {
  const auto itemIds = itemIdsForRange(start, count);
  auto document = documentSnapshot();
  return document ? document->requestTokenizedSideBySideItems(itemIds, reason) : 0;
}

double HybridDiffSideBySideProjection::releaseNativeResources() {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    disposed_ = true;
    document_.reset();
  }
  unregisterProjection();
  return 1;
}

DiffSideBySideProjectionCommit HybridDiffSideBySideProjection::convertCommit(
    const DiffSideBySideCoreCommit& commit) const {
  std::vector<DiffSideBySideProjectionSplice> splices;
  splices.reserve(commit.splices.size());
  for (const auto& splice : commit.splices) {
    splices.emplace_back(splice.index, splice.deleteCount, splice.insertCount);
  }
  return DiffSideBySideProjectionCommit(
      commit.changed,
      commit.previousRevision,
      commit.revision,
      commit.previousLength,
      commit.length,
      std::move(splices));
}

DiffSideBySideProjectionLocation HybridDiffSideBySideProjection::createLocation(
    const std::optional<DiffSideBySideCoreLocation>& location) const {
  if (!location.has_value()) {
    return DiffSideBySideProjectionLocation(-1, -1, -1, false, false);
  }
  return DiffSideBySideProjectionLocation(
      location->visibleIndex,
      location->itemId,
      location->fileIndex,
      location->collapsed,
      location->exact);
}

std::vector<size_t> HybridDiffSideBySideProjection::itemIdsForRange(
    double start,
    double count) const {
  const auto safeStart = safeSize(start);
  const auto safeCount = safeSize(count);
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<size_t> itemIds;
  if (!disposed_) {
    itemIds.reserve(safeCount);
    for (size_t index = safeStart; index < safeStart + safeCount; index += 1) {
      const auto itemId = projection_.itemIdAt(index);
      if (itemId.has_value()) {
        itemIds.push_back(*itemId);
      }
    }
  }
  return itemIds;
}

std::shared_ptr<HybridDiffDocument> HybridDiffSideBySideProjection::documentSnapshot() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return disposed_ ? nullptr : document_;
}

void HybridDiffSideBySideProjection::registerProjection() {
  std::lock_guard<std::mutex> registryLock(diffSideBySideProjectionRegistryMutex);
  diffSideBySideProjectionRegistry[projectionId_] = shared_cast<HybridDiffSideBySideProjection>();
}

void HybridDiffSideBySideProjection::unregisterProjection() {
  std::lock_guard<std::mutex> registryLock(diffSideBySideProjectionRegistryMutex);
  diffSideBySideProjectionRegistry.erase(projectionId_);
}

std::shared_ptr<HybridDiffSideBySideProjection> getRegisteredDiffSideBySideProjection(
    double projectionId) {
  const auto safeProjectionId = static_cast<uint64_t>(std::max(0.0, std::floor(projectionId)));
  std::lock_guard<std::mutex> lock(diffSideBySideProjectionRegistryMutex);
  const auto entry = diffSideBySideProjectionRegistry.find(safeProjectionId);
  if (entry == diffSideBySideProjectionRegistry.end()) {
    return nullptr;
  }
  auto projection = entry->second.lock();
  if (!projection) {
    diffSideBySideProjectionRegistry.erase(entry);
  }
  return projection;
}

} // namespace margelo::nitro::legendapps::diffparser

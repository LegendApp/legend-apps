#include "DiffSideBySideProjection.hpp"

#include "HybridDiffDocument.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>

namespace margelo::nitro::legendapps::diffparser {

namespace {

constexpr uint8_t sideBySideKindFileHeader = 0;

int32_t sourceStartForLine(const DiffSideBySideLine& line, size_t fallback) {
  if (line.oldRowIndex >= 0 && line.newRowIndex >= 0) {
    return std::min(line.oldRowIndex, line.newRowIndex);
  }
  if (line.oldRowIndex >= 0) {
    return line.oldRowIndex;
  }
  if (line.newRowIndex >= 0) {
    return line.newRowIndex;
  }
  return fallback <= static_cast<size_t>(std::numeric_limits<int32_t>::max())
      ? static_cast<int32_t>(fallback)
      : std::numeric_limits<int32_t>::max();
}

int32_t sourceEndForLine(const DiffSideBySideLine& line, size_t fallback) {
  if (line.oldRowIndex >= 0 || line.newRowIndex >= 0) {
    return std::max(line.oldRowIndex, line.newRowIndex) + 1;
  }
  const auto start = sourceStartForLine(line, fallback);
  return start < std::numeric_limits<int32_t>::max() ? start + 1 : start;
}

} // namespace

void DiffSideBySideIndex::rebuild(
    const std::vector<DiffSideBySideLine>& lines,
    uint64_t generation,
    int32_t firstChangedFileIndex) {
  generation_ = generation;
  lineCount_ = lines.size();
  firstChangedFileIndex_ = std::max(0, firstChangedFileIndex);
  files_.clear();
  fileOrdinalByIndex_.clear();
  hunkStartItemIds_.clear();

  int32_t previousFileIndex = -1;
  int32_t previousHunkIndex = -1;
  for (size_t itemId = 0; itemId < lines.size(); itemId += 1) {
    const auto& line = lines[itemId];
    if (line.kind == sideBySideKindFileHeader) {
      if (!files_.empty()) {
        auto& previousFile = files_.back();
        previousFile.baseCount = itemId - previousFile.baseStart;
      }
      files_.push_back(DiffSideBySideFileSpan{
          .fileIndex = line.fileIndex,
          .baseStart = itemId,
          .baseCount = 0,
          .sourceStart = sourceStartForLine(line, itemId),
          .sourceEnd = sourceEndForLine(line, itemId),
      });
    }

    if (!files_.empty()) {
      auto& file = files_.back();
      const auto sourceStart = sourceStartForLine(line, itemId);
      file.sourceStart = file.sourceStart < 0 ? sourceStart : std::min(file.sourceStart, sourceStart);
      file.sourceEnd = std::max(file.sourceEnd, sourceEndForLine(line, itemId));
    }

    const bool isHunkStart =
        line.kind != sideBySideKindFileHeader &&
        line.hunkIndex >= 0 &&
        (line.fileIndex != previousFileIndex || line.hunkIndex != previousHunkIndex);
    if (isHunkStart) {
      hunkStartItemIds_.push_back(itemId);
    }
    previousFileIndex = line.fileIndex;
    previousHunkIndex = line.hunkIndex;
  }

  if (!files_.empty()) {
    auto& finalFile = files_.back();
    finalFile.baseCount = lines.size() - finalFile.baseStart;
  }

  int32_t maximumFileIndex = -1;
  for (const auto& file : files_) {
    maximumFileIndex = std::max(maximumFileIndex, file.fileIndex);
  }
  if (maximumFileIndex >= 0) {
    fileOrdinalByIndex_.assign(static_cast<size_t>(maximumFileIndex) + 1, -1);
    for (size_t ordinal = 0; ordinal < files_.size(); ordinal += 1) {
      const auto fileIndex = files_[ordinal].fileIndex;
      if (fileIndex >= 0) {
        fileOrdinalByIndex_[static_cast<size_t>(fileIndex)] = static_cast<int32_t>(ordinal);
      }
    }
  }
}

uint64_t DiffSideBySideIndex::generation() const noexcept {
  return generation_;
}

size_t DiffSideBySideIndex::lineCount() const noexcept {
  return lineCount_;
}

int32_t DiffSideBySideIndex::firstChangedFileIndex() const noexcept {
  return firstChangedFileIndex_;
}

const std::vector<DiffSideBySideFileSpan>& DiffSideBySideIndex::files() const noexcept {
  return files_;
}

const DiffSideBySideFileSpan* DiffSideBySideIndex::fileForIndex(int32_t fileIndex) const noexcept {
  if (fileIndex < 0 || static_cast<size_t>(fileIndex) >= fileOrdinalByIndex_.size()) {
    return nullptr;
  }
  const auto ordinal = fileOrdinalByIndex_[static_cast<size_t>(fileIndex)];
  return ordinal >= 0 ? &files_[static_cast<size_t>(ordinal)] : nullptr;
}

const DiffSideBySideFileSpan* DiffSideBySideIndex::fileForItem(size_t itemId) const noexcept {
  const auto after = std::upper_bound(
      files_.begin(),
      files_.end(),
      itemId,
      [](size_t value, const DiffSideBySideFileSpan& file) {
        return value < file.baseStart;
      });
  if (after == files_.begin()) {
    return nullptr;
  }
  const auto& file = *std::prev(after);
  return itemId < file.baseStart + file.baseCount ? &file : nullptr;
}

const DiffSideBySideFileSpan* DiffSideBySideIndex::fileForSourceRow(int32_t sourceRow) const noexcept {
  const auto after = std::upper_bound(
      files_.begin(),
      files_.end(),
      sourceRow,
      [](int32_t value, const DiffSideBySideFileSpan& file) {
        return value < file.sourceStart;
      });
  if (after == files_.begin()) {
    return nullptr;
  }
  const auto& file = *std::prev(after);
  return sourceRow < file.sourceEnd ? &file : nullptr;
}

bool DiffSideBySideIndex::isHunkStart(size_t itemId) const noexcept {
  return std::binary_search(hunkStartItemIds_.begin(), hunkStartItemIds_.end(), itemId);
}

const std::vector<size_t>& DiffSideBySideIndex::hunkStartItemIds() const noexcept {
  return hunkStartItemIds_;
}

DiffSideBySideProjection::DiffSideBySideProjection(const DiffSideBySideIndex& index) {
  rebuildFileState(index);
}

uint64_t DiffSideBySideProjection::revision() const noexcept {
  return revision_;
}

uint64_t DiffSideBySideProjection::documentGeneration() const noexcept {
  return hasIndex_ ? index_.generation() : 0;
}

size_t DiffSideBySideProjection::length() const noexcept {
  return prefixLength(visibleCountByFileOrdinal_.size());
}

bool DiffSideBySideProjection::isFileCollapsed(int32_t fileIndex) const noexcept {
  const auto ordinal = fileOrdinalForIndex(fileIndex);
  return ordinal.has_value() && collapsedByFileOrdinal_[*ordinal] != 0;
}

DiffSideBySideCoreCommit DiffSideBySideProjection::setFileCollapsed(
    int32_t fileIndex,
    bool collapsed) {
  const auto ordinal = fileOrdinalForIndex(fileIndex);
  if (!ordinal.has_value()) {
    throw std::out_of_range("Side-by-side projection file index is out of range");
  }

  DiffSideBySideCoreCommit commit{
      .changed = false,
      .previousRevision = revision_,
      .revision = revision_,
      .previousLength = length(),
      .length = length(),
      .splices = {},
  };
  const bool wasCollapsed = collapsedByFileOrdinal_[*ordinal] != 0;
  if (wasCollapsed != collapsed) {
    const auto& file = index_.files()[*ordinal];
    const size_t previousVisibleCount = visibleCountByFileOrdinal_[*ordinal];
    const size_t nextVisibleCount = collapsed ? std::min<size_t>(1, file.baseCount) : file.baseCount;
    const size_t fileHeaderIndex = prefixLength(*ordinal);
    collapsedByFileOrdinal_[*ordinal] = collapsed ? 1 : 0;
    visibleCountByFileOrdinal_[*ordinal] = nextVisibleCount;
    addFenwick(*ordinal, static_cast<int64_t>(nextVisibleCount) - static_cast<int64_t>(previousVisibleCount));
    revision_ += 1;
    commit.changed = true;
    commit.revision = revision_;
    commit.length = length();
    commit.splices.push_back(DiffSideBySideCoreSplice{
        .index = fileHeaderIndex + std::min<size_t>(1, previousVisibleCount),
        .deleteCount = collapsed ? previousVisibleCount - std::min<size_t>(1, previousVisibleCount) : 0,
        .insertCount = collapsed ? 0 : nextVisibleCount - std::min<size_t>(1, nextVisibleCount),
    });
  }
  return commit;
}

DiffSideBySideCoreCommit DiffSideBySideProjection::refresh(const DiffSideBySideIndex& index) {
  const size_t previousLength = length();
  const uint64_t previousRevision = revision_;
  if (hasIndex_ && index_.generation() == index.generation()) {
    return DiffSideBySideCoreCommit{
        .changed = false,
        .previousRevision = previousRevision,
        .revision = previousRevision,
        .previousLength = previousLength,
        .length = previousLength,
        .splices = {},
    };
  }

  std::vector<int32_t> collapsedFileIndexes;
  if (hasIndex_) {
    const auto& previousFiles = index_.files();
    for (size_t ordinal = 0; ordinal < previousFiles.size(); ordinal += 1) {
      if (collapsedByFileOrdinal_[ordinal] != 0) {
        collapsedFileIndexes.push_back(previousFiles[ordinal].fileIndex);
      }
    }
  }
  const int32_t firstChangedFileIndex = index.firstChangedFileIndex();
  size_t spliceIndex = previousLength;
  if (const auto previousOrdinal = fileOrdinalForIndex(firstChangedFileIndex)) {
    spliceIndex = prefixLength(*previousOrdinal);
  }
  rebuildFileState(index);
  for (const auto fileIndex : collapsedFileIndexes) {
    const auto ordinal = fileOrdinalForIndex(fileIndex);
    if (ordinal.has_value()) {
      const auto expandedCount = visibleCountByFileOrdinal_[*ordinal];
      const auto collapsedCount = std::min<size_t>(1, expandedCount);
      collapsedByFileOrdinal_[*ordinal] = 1;
      visibleCountByFileOrdinal_[*ordinal] = collapsedCount;
      addFenwick(*ordinal, static_cast<int64_t>(collapsedCount) - static_cast<int64_t>(expandedCount));
    }
  }

  const size_t nextLength = length();
  const auto nextOrdinal = fileOrdinalForIndex(firstChangedFileIndex);
  const size_t nextSpliceIndex = nextOrdinal.has_value() ? prefixLength(*nextOrdinal) : nextLength;
  spliceIndex = std::min(spliceIndex, nextSpliceIndex);
  revision_ = previousRevision + 1;
  return DiffSideBySideCoreCommit{
      .changed = true,
      .previousRevision = previousRevision,
      .revision = revision_,
      .previousLength = previousLength,
      .length = nextLength,
      .splices = {DiffSideBySideCoreSplice{
          .index = spliceIndex,
          .deleteCount = previousLength - spliceIndex,
          .insertCount = nextLength - spliceIndex,
      }},
  };
}

std::optional<size_t> DiffSideBySideProjection::itemIdAt(size_t visibleIndex) const noexcept {
  if (!hasIndex_ || visibleIndex >= length()) {
    return std::nullopt;
  }
  const size_t ordinal = fileOrdinalAtVisibleIndex(visibleIndex);
  const auto& file = index_.files()[ordinal];
  const size_t localIndex = visibleIndex - prefixLength(ordinal);
  return file.baseStart + localIndex;
}

std::optional<size_t> DiffSideBySideProjection::visibleIndexForFile(int32_t fileIndex) const noexcept {
  const auto ordinal = fileOrdinalForIndex(fileIndex);
  return ordinal.has_value() ? std::optional<size_t>(prefixLength(*ordinal)) : std::nullopt;
}

std::optional<DiffSideBySideCoreLocation> DiffSideBySideProjection::locateItem(size_t itemId) const noexcept {
  if (!hasIndex_) {
    return std::nullopt;
  }
  const auto* file = index_.fileForItem(itemId);
  const auto ordinal = file ? fileOrdinalForIndex(file->fileIndex) : std::nullopt;
  if (!file || !ordinal.has_value()) {
    return std::nullopt;
  }
  const bool collapsed = collapsedByFileOrdinal_[*ordinal] != 0;
  const bool exact = !collapsed || itemId == file->baseStart;
  return DiffSideBySideCoreLocation{
      .visibleIndex = prefixLength(*ordinal) + (exact ? itemId - file->baseStart : 0),
      .itemId = exact ? itemId : file->baseStart,
      .fileIndex = file->fileIndex,
      .collapsed = collapsed,
      .exact = exact,
  };
}

const DiffSideBySideIndex& DiffSideBySideProjection::indexSnapshot() const noexcept {
  return index_;
}

void DiffSideBySideProjection::rebuildFileState(const DiffSideBySideIndex& index) {
  index_ = index;
  hasIndex_ = true;
  collapsedByFileOrdinal_.assign(index.files().size(), 0);
  visibleCountByFileOrdinal_.clear();
  visibleCountByFileOrdinal_.reserve(index.files().size());
  fenwick_.assign(index.files().size() + 1, 0);
  for (const auto& file : index.files()) {
    visibleCountByFileOrdinal_.push_back(file.baseCount);
  }
  for (size_t ordinal = 0; ordinal < visibleCountByFileOrdinal_.size(); ordinal += 1) {
    addFenwick(ordinal, static_cast<int64_t>(visibleCountByFileOrdinal_[ordinal]));
  }
}

void DiffSideBySideProjection::addFenwick(size_t ordinal, int64_t delta) noexcept {
  size_t index = ordinal + 1;
  while (index < fenwick_.size()) {
    if (delta >= 0) {
      fenwick_[index] += static_cast<size_t>(delta);
    } else {
      fenwick_[index] -= static_cast<size_t>(-delta);
    }
    index += index & (~index + 1);
  }
}

size_t DiffSideBySideProjection::prefixLength(size_t fileOrdinalExclusive) const noexcept {
  size_t result = 0;
  size_t index = std::min(fileOrdinalExclusive, visibleCountByFileOrdinal_.size());
  while (index > 0) {
    result += fenwick_[index];
    index -= index & (~index + 1);
  }
  return result;
}

size_t DiffSideBySideProjection::fileOrdinalAtVisibleIndex(size_t visibleIndex) const noexcept {
  size_t ordinal = 0;
  size_t accumulated = 0;
  size_t step = 1;
  while (step < fenwick_.size()) {
    step <<= 1;
  }
  for (step >>= 1; step > 0; step >>= 1) {
    const size_t next = ordinal + step;
    if (next < fenwick_.size() && accumulated + fenwick_[next] <= visibleIndex) {
      ordinal = next;
      accumulated += fenwick_[next];
    }
  }
  return std::min(ordinal, visibleCountByFileOrdinal_.size() - 1);
}

std::optional<size_t> DiffSideBySideProjection::fileOrdinalForIndex(int32_t fileIndex) const noexcept {
  if (!hasIndex_) {
    return std::nullopt;
  }
  const auto* file = index_.fileForIndex(fileIndex);
  if (!file) {
    return std::nullopt;
  }
  return static_cast<size_t>(file - index_.files().data());
}

} // namespace margelo::nitro::legendapps::diffparser

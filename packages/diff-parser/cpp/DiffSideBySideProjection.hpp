#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <vector>

namespace margelo::nitro::legendapps::diffparser {

struct DiffSideBySideLine;

struct DiffSideBySideFileSpan {
  int32_t fileIndex = -1;
  size_t baseStart = 0;
  size_t baseCount = 0;
  int32_t sourceStart = -1;
  int32_t sourceEnd = -1;
};

struct DiffSideBySideCoreLocation {
  size_t visibleIndex = 0;
  size_t itemId = 0;
  int32_t fileIndex = -1;
  bool collapsed = false;
  bool exact = false;
};

struct DiffSideBySideCoreSplice {
  size_t index = 0;
  size_t deleteCount = 0;
  size_t insertCount = 0;
};

struct DiffSideBySideCoreCommit {
  bool changed = false;
  uint64_t previousRevision = 0;
  uint64_t revision = 0;
  size_t previousLength = 0;
  size_t length = 0;
  std::vector<DiffSideBySideCoreSplice> splices;
};

class DiffSideBySideIndex {
public:
  void rebuild(
      const std::vector<DiffSideBySideLine>& lines,
      uint64_t generation,
      int32_t firstChangedFileIndex);

  uint64_t generation() const noexcept;
  size_t lineCount() const noexcept;
  int32_t firstChangedFileIndex() const noexcept;
  const std::vector<DiffSideBySideFileSpan>& files() const noexcept;
  const DiffSideBySideFileSpan* fileForIndex(int32_t fileIndex) const noexcept;
  const DiffSideBySideFileSpan* fileForItem(size_t itemId) const noexcept;
  const DiffSideBySideFileSpan* fileForSourceRow(int32_t sourceRow) const noexcept;
  bool isHunkStart(size_t itemId) const noexcept;
  const std::vector<size_t>& hunkStartItemIds() const noexcept;

private:
  uint64_t generation_ = 0;
  size_t lineCount_ = 0;
  int32_t firstChangedFileIndex_ = 0;
  std::vector<DiffSideBySideFileSpan> files_;
  std::vector<int32_t> fileOrdinalByIndex_;
  std::vector<size_t> hunkStartItemIds_;
};

class DiffSideBySideProjection {
public:
  explicit DiffSideBySideProjection(const DiffSideBySideIndex& index);

  uint64_t revision() const noexcept;
  uint64_t documentGeneration() const noexcept;
  size_t length() const noexcept;
  bool isFileCollapsed(int32_t fileIndex) const noexcept;

  DiffSideBySideCoreCommit setFileCollapsed(int32_t fileIndex, bool collapsed);
  DiffSideBySideCoreCommit refresh(const DiffSideBySideIndex& index);

  std::optional<size_t> itemIdAt(size_t visibleIndex) const noexcept;
  std::optional<size_t> visibleIndexForFile(int32_t fileIndex) const noexcept;
  std::optional<DiffSideBySideCoreLocation> locateItem(size_t itemId) const noexcept;
  const DiffSideBySideIndex& indexSnapshot() const noexcept;

private:
  void rebuildFileState(const DiffSideBySideIndex& index);
  void addFenwick(size_t ordinal, int64_t delta) noexcept;
  size_t prefixLength(size_t fileOrdinalExclusive) const noexcept;
  size_t fileOrdinalAtVisibleIndex(size_t visibleIndex) const noexcept;
  std::optional<size_t> fileOrdinalForIndex(int32_t fileIndex) const noexcept;

  DiffSideBySideIndex index_;
  bool hasIndex_ = false;
  uint64_t revision_ = 0;
  std::vector<uint8_t> collapsedByFileOrdinal_;
  std::vector<size_t> visibleCountByFileOrdinal_;
  std::vector<size_t> fenwick_;
};

} // namespace margelo::nitro::legendapps::diffparser

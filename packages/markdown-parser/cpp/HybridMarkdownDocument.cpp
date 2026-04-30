#include "HybridMarkdownDocument.hpp"

#include <algorithm>
#include <stdexcept>

namespace margelo::nitro::legenddesktop::markdownparser {

HybridMarkdownDocument::HybridMarkdownDocument(
    std::shared_ptr<const MarkdownSource> source,
    std::vector<MarkdownBlockRange> blocks,
    MarkdownDocumentTiming timing)
    : HybridObject(TAG),
      source_(std::move(source)),
      blocks_(std::move(blocks)),
      markdownCache_(blocks_.size()),
      timing_(timing) {}

void HybridMarkdownDocument::setDocumentDurationMs(double durationMs) {
  timing_.documentMs = durationMs;
}

double HybridMarkdownDocument::getBlockCount() {
  return static_cast<double>(blocks_.size());
}

double HybridMarkdownDocument::getSourceSize() {
  return static_cast<double>(source_->size());
}

MarkdownBlockSnapshot HybridMarkdownDocument::getBlock(double index, bool includeText) {
  const auto safeIndex = static_cast<size_t>(std::max(0.0, index));
  if (safeIndex >= blocks_.size()) {
    throw std::out_of_range("Markdown block index out of range");
  }
  return snapshotForBlock(safeIndex, blocks_[safeIndex], includeText);
}

std::vector<MarkdownBlockSnapshot> HybridMarkdownDocument::getBlocks(double start, double count, bool includeText) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blocks_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blocks_.size(), safeStart + safeCount);
  std::vector<MarkdownBlockSnapshot> snapshots;
  snapshots.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    snapshots.push_back(snapshotForBlock(index, blocks_[index], includeText));
  }
  return snapshots;
}

std::string HybridMarkdownDocument::getBlockMarkdown(double index) {
  const auto safeIndex = static_cast<size_t>(std::max(0.0, index));
  if (safeIndex >= blocks_.size()) {
    return "";
  }
  return markdownForBlock(safeIndex, blocks_[safeIndex]);
}

MarkdownDocumentTiming HybridMarkdownDocument::getTiming() {
  return timing_;
}

size_t HybridMarkdownDocument::getExternalMemorySize() noexcept {
  size_t size = source_->externalMemorySize() + blocks_.capacity() * sizeof(MarkdownBlockRange);
  for (const auto& block : blocks_) {
    size += block.type.capacity();
  }
  return size;
}

MarkdownBlockSnapshot HybridMarkdownDocument::snapshotForBlock(
    size_t storageIndex,
    const MarkdownBlockRange& block,
    bool includeText) const {
  const std::string& markdown = markdownForBlock(storageIndex, block);
  return MarkdownBlockSnapshot(
      std::to_string(block.index),
      static_cast<double>(block.index),
      block.type,
      static_cast<double>(block.depth),
      includeText ? markdown : "",
      markdown);
}

const std::string& HybridMarkdownDocument::markdownForBlock(size_t storageIndex, const MarkdownBlockRange& block) const {
  if (storageIndex >= markdownCache_.size()) {
    static const std::string empty;
    return empty;
  }

  auto& cached = markdownCache_[storageIndex];
  if (!cached.has_value()) {
    cached = sourceString(block.markdownStart, block.markdownEnd);
  }
  return *cached;
}

std::string HybridMarkdownDocument::sourceString(size_t start, size_t end) const {
  const size_t sourceSize = source_->size();
  if (start >= end || start >= sourceSize) {
    return "";
  }
  end = std::min(end, sourceSize);
  return std::string(source_->data() + start, end - start);
}

} // namespace margelo::nitro::legenddesktop::markdownparser

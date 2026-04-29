#include "HybridMarkdownDocument.hpp"

#include <algorithm>

namespace margelo::nitro::legenddesktop::markdownparser {

HybridMarkdownDocument::HybridMarkdownDocument(std::vector<MarkdownBlockSnapshot> blocks)
    : HybridObject(TAG), blocks_(std::move(blocks)) {}

double HybridMarkdownDocument::getBlockCount() {
  return static_cast<double>(blocks_.size());
}

std::vector<MarkdownBlockSnapshot> HybridMarkdownDocument::getBlocks(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blocks_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blocks_.size(), safeStart + safeCount);
  return std::vector<MarkdownBlockSnapshot>(blocks_.begin() + safeStart, blocks_.begin() + end);
}

size_t HybridMarkdownDocument::getExternalMemorySize() noexcept {
  size_t size = blocks_.capacity() * sizeof(MarkdownBlockSnapshot);
  for (const auto& block : blocks_) {
    size += block.id.capacity();
    size += block.type.capacity();
    size += block.text.capacity();
    size += block.markdown.capacity();
  }
  return size;
}

} // namespace margelo::nitro::legenddesktop::markdownparser

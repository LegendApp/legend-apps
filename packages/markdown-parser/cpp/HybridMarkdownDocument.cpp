#include "HybridMarkdownDocument.hpp"

#include <algorithm>
#include <stdexcept>

namespace margelo::nitro::legenddesktop::markdownparser {

namespace {

std::string markdownBlockTypeName(MarkdownBlockType type) {
  switch (type) {
    case MarkdownBlockType::Document:
      return "document";
    case MarkdownBlockType::Quote:
      return "quote";
    case MarkdownBlockType::UnorderedList:
      return "unorderedList";
    case MarkdownBlockType::OrderedList:
      return "orderedList";
    case MarkdownBlockType::ListItem:
      return "listItem";
    case MarkdownBlockType::ThematicBreak:
      return "thematicBreak";
    case MarkdownBlockType::Heading:
      return "heading";
    case MarkdownBlockType::CodeBlock:
      return "codeBlock";
    case MarkdownBlockType::HtmlBlock:
      return "htmlBlock";
    case MarkdownBlockType::Paragraph:
      return "paragraph";
    case MarkdownBlockType::Table:
      return "table";
    case MarkdownBlockType::TableHead:
      return "tableHead";
    case MarkdownBlockType::TableBody:
      return "tableBody";
    case MarkdownBlockType::TableRow:
      return "tableRow";
    case MarkdownBlockType::TableHeaderCell:
      return "tableHeaderCell";
    case MarkdownBlockType::TableCell:
      return "tableCell";
  }
}

} // namespace

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

std::vector<MarkdownRenderBlock> HybridMarkdownDocument::getRenderBlocks(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blocks_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blocks_.size(), safeStart + safeCount);
  std::vector<MarkdownRenderBlock> renderBlocks;
  renderBlocks.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    renderBlocks.push_back(renderBlockForBlock(index, blocks_[index]));
  }
  return renderBlocks;
}

MarkdownDocumentTiming HybridMarkdownDocument::getTiming() {
  return timing_;
}

size_t HybridMarkdownDocument::getExternalMemorySize() noexcept {
  return source_->externalMemorySize() + blocks_.capacity() * sizeof(MarkdownBlockRange);
}

MarkdownRenderBlock HybridMarkdownDocument::renderBlockForBlock(
    size_t storageIndex,
    const MarkdownBlockRange& block) const {
  return MarkdownRenderBlock(
      static_cast<double>(block.index),
      markdownBlockTypeName(block.type),
      static_cast<double>(block.depth),
      markdownForBlock(storageIndex, block));
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

#include "HybridMarkdownDocument.hpp"

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <fstream>
#include <stdexcept>
#include <string>

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

std::string nextDocumentId() {
  static std::atomic<size_t> nextId = 1;
  return "d" + std::to_string(nextId.fetch_add(1, std::memory_order_relaxed));
}

std::string detectLineEnding(const std::string& source) {
  size_t crlfCount = 0;
  size_t lfCount = 0;
  for (size_t index = 0; index < source.size(); index += 1) {
    if (source[index] == '\r' && index + 1 < source.size() && source[index + 1] == '\n') {
      crlfCount += 1;
      index += 1;
    } else if (source[index] == '\n') {
      lfCount += 1;
    }
  }
  return crlfCount > lfCount ? "\r\n" : "\n";
}

HybridMarkdownDocument::HybridMarkdownDocument(
    std::string filePath,
    std::shared_ptr<const MarkdownSource> source,
    std::vector<MarkdownBlockRange> blocks,
    MarkdownDocumentTiming timing)
    : HybridObject(TAG),
      filePath_(std::move(filePath)),
      sourceText_(source ? std::string(source->data(), source->size()) : ""),
      lineEnding_(detectLineEnding(sourceText_)),
      blocks_(std::move(blocks)),
      markdownCache_(blocks_.size()),
      timing_(timing),
      documentId_(nextDocumentId()),
      nextBlockNumber_(blocks_.size()) {
  for (auto& block : blocks_) {
    if (block.id.empty()) {
      block.id = documentId_ + ":b" + std::to_string(block.index);
    }
  }
}

void HybridMarkdownDocument::setDocumentDurationMs(double durationMs) {
  timing_.documentMs = durationMs;
}

double HybridMarkdownDocument::getBlockCount() {
  return static_cast<double>(blocks_.size());
}

double HybridMarkdownDocument::getSourceSize() {
  return static_cast<double>(sourceText_.size());
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

MarkdownTransactionResult HybridMarkdownDocument::applyTransaction(const MarkdownTransaction& transaction) {
  if (transaction.type == "updateBlockMarkdown") {
    return updateBlockMarkdown(transaction);
  }
  if (transaction.type == "splitBlock") {
    return splitBlock(transaction);
  }
  throw std::runtime_error("Unsupported markdown transaction: " + transaction.type);
}

void HybridMarkdownDocument::save() {
  if (filePath_.empty()) {
    throw std::runtime_error("Cannot save markdown document without a file path.");
  }

  const std::string temporaryPath = filePath_ + ".tmp";
  {
    std::ofstream output(temporaryPath, std::ios::binary | std::ios::trunc);
    if (!output) {
      throw std::runtime_error("Failed to open temporary markdown file for save: " + temporaryPath);
    }
    output.write(sourceText_.data(), static_cast<std::streamsize>(sourceText_.size()));
    if (!output) {
      throw std::runtime_error("Failed to write markdown file: " + temporaryPath);
    }
  }

  if (std::rename(temporaryPath.c_str(), filePath_.c_str()) != 0) {
    std::remove(temporaryPath.c_str());
    throw std::runtime_error("Failed to replace markdown file: " + filePath_);
  }
}

size_t HybridMarkdownDocument::getExternalMemorySize() noexcept {
  return sourceText_.capacity() + blocks_.capacity() * sizeof(MarkdownBlockRange);
}

MarkdownRenderBlock HybridMarkdownDocument::renderBlockForBlock(
    size_t storageIndex,
    const MarkdownBlockRange& block) const {
  return MarkdownRenderBlock(
      block.id,
      static_cast<double>(block.index),
      markdownBlockTypeName(block.type),
      static_cast<double>(block.depth),
      markdownForBlock(storageIndex, block),
      static_cast<double>(block.markdownStart),
      static_cast<double>(block.markdownEnd),
      static_cast<double>(block.contentStart),
      static_cast<double>(block.contentEnd),
      static_cast<double>(block.textRevision));
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
  const size_t sourceSize = sourceText_.size();
  if (start >= end || start >= sourceSize) {
    return "";
  }
  end = std::min(end, sourceSize);
  return sourceText_.substr(start, end - start);
}

size_t HybridMarkdownDocument::findBlockIndex(const std::string& blockId) const {
  const auto it = std::find_if(blocks_.begin(), blocks_.end(), [&](const auto& block) {
    return block.id == blockId;
  });
  if (it == blocks_.end()) {
    throw std::runtime_error("Markdown block not found: " + blockId);
  }
  return static_cast<size_t>(std::distance(blocks_.begin(), it));
}

MarkdownTransactionResult HybridMarkdownDocument::updateBlockMarkdown(const MarkdownTransaction& transaction) {
  if (!transaction.markdown.has_value()) {
    throw std::runtime_error("updateBlockMarkdown requires markdown.");
  }

  const size_t blockIndex = findBlockIndex(transaction.blockId);
  auto& block = blocks_[blockIndex];
  const size_t oldEnd = block.markdownEnd;
  replaceSourceRange(block.markdownStart, block.markdownEnd, *transaction.markdown);
  const long long delta = static_cast<long long>(transaction.markdown->size()) -
      static_cast<long long>(oldEnd - block.markdownStart);
  block.markdownEnd = block.markdownStart + transaction.markdown->size();
  block.contentStart = block.markdownStart;
  block.contentEnd = block.markdownEnd;
  block.textRevision += 1;
  shiftBlocksAfter(blockIndex + 1, delta);
  markdownCache_[blockIndex] = *transaction.markdown;
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(sourceText_.size());
  return makeTransactionResult(blockIndex, 1, {blockIndex});
}

MarkdownTransactionResult HybridMarkdownDocument::splitBlock(const MarkdownTransaction& transaction) {
  if (!transaction.beforeMarkdown.has_value() || !transaction.afterMarkdown.has_value()) {
    throw std::runtime_error("splitBlock requires beforeMarkdown and afterMarkdown.");
  }

  const size_t blockIndex = findBlockIndex(transaction.blockId);
  auto& block = blocks_[blockIndex];
  const std::string replacement = *transaction.beforeMarkdown + lineEnding_ + *transaction.afterMarkdown;
  const size_t oldEnd = block.markdownEnd;
  const size_t secondStart = block.markdownStart + transaction.beforeMarkdown->size() + lineEnding_.size();
  replaceSourceRange(block.markdownStart, block.markdownEnd, replacement);
  const long long delta = static_cast<long long>(replacement.size()) -
      static_cast<long long>(oldEnd - block.markdownStart);

  block.markdownEnd = block.markdownStart + transaction.beforeMarkdown->size();
  block.contentStart = block.markdownStart;
  block.contentEnd = block.markdownEnd;
  block.textRevision += 1;

  MarkdownBlockRange newBlock;
  newBlock.id = nextBlockId();
  newBlock.index = block.index + 1;
  newBlock.depth = block.depth;
  newBlock.markdownStart = secondStart;
  newBlock.markdownEnd = secondStart + transaction.afterMarkdown->size();
  newBlock.contentStart = newBlock.markdownStart;
  newBlock.contentEnd = newBlock.markdownEnd;
  newBlock.type = MarkdownBlockType::Paragraph;

  blocks_.insert(blocks_.begin() + static_cast<long long>(blockIndex + 1), newBlock);
  markdownCache_.insert(markdownCache_.begin() + static_cast<long long>(blockIndex + 1), *transaction.afterMarkdown);
  markdownCache_[blockIndex] = *transaction.beforeMarkdown;
  shiftBlocksAfter(blockIndex + 2, delta);
  renumberBlocks(blockIndex);
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(sourceText_.size());
  return makeTransactionResult(blockIndex, 1, {blockIndex, blockIndex + 1});
}

MarkdownTransactionResult HybridMarkdownDocument::makeTransactionResult(
    size_t startBlockIndex,
    size_t deleteCount,
    const std::vector<size_t>& changedBlockIndices,
    std::vector<std::string> retiredBlockIds) const {
  std::vector<std::string> blockIds;
  std::vector<MarkdownRenderBlock> changedBlocks;
  blockIds.reserve(changedBlockIndices.size());
  changedBlocks.reserve(changedBlockIndices.size());
  for (const size_t index : changedBlockIndices) {
    if (index < blocks_.size()) {
      blockIds.push_back(blocks_[index].id);
      changedBlocks.push_back(renderBlockForBlock(index, blocks_[index]));
    }
  }

  return MarkdownTransactionResult(
      static_cast<double>(revision_),
      static_cast<double>(sourceText_.size()),
      MarkdownChangedRange(static_cast<double>(startBlockIndex), static_cast<double>(deleteCount), std::move(blockIds)),
      std::move(changedBlocks),
      std::move(retiredBlockIds));
}

void HybridMarkdownDocument::replaceSourceRange(size_t start, size_t end, const std::string& markdown) {
  if (start > end || end > sourceText_.size()) {
    throw std::runtime_error("Invalid markdown source range.");
  }
  sourceText_.replace(start, end - start, markdown);
}

void HybridMarkdownDocument::shiftBlocksAfter(size_t startIndex, long long delta) {
  if (delta == 0) {
    return;
  }
  for (size_t index = startIndex; index < blocks_.size(); index += 1) {
    auto& block = blocks_[index];
    block.markdownStart = static_cast<size_t>(static_cast<long long>(block.markdownStart) + delta);
    block.markdownEnd = static_cast<size_t>(static_cast<long long>(block.markdownEnd) + delta);
    block.contentStart = static_cast<size_t>(static_cast<long long>(block.contentStart) + delta);
    block.contentEnd = static_cast<size_t>(static_cast<long long>(block.contentEnd) + delta);
  }
}

void HybridMarkdownDocument::renumberBlocks(size_t startIndex) {
  for (size_t index = startIndex; index < blocks_.size(); index += 1) {
    blocks_[index].index = index;
  }
}

std::string HybridMarkdownDocument::nextBlockId() {
  const size_t blockNumber = nextBlockNumber_;
  nextBlockNumber_ += 1;
  return documentId_ + ":b" + std::to_string(blockNumber);
}

} // namespace margelo::nitro::legenddesktop::markdownparser

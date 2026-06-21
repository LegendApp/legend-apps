#include "HybridMarkdownDocument.hpp"

#include "MarkdownBlockParser.hpp"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <iterator>
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

size_t firstContentIndex(const std::string& markdown) {
  size_t index = 0;
  size_t spaces = 0;
  while (index < markdown.size() && markdown[index] == ' ' && spaces < 4) {
    index += 1;
    spaces += 1;
  }
  return spaces < 4 ? index : 0;
}

size_t headingLevelForMarkdown(const std::string& markdown) {
  const size_t start = firstContentIndex(markdown);
  if (start >= markdown.size() || markdown[start] != '#') {
    return 0;
  }

  size_t level = 0;
  while (start + level < markdown.size() && markdown[start + level] == '#') {
    level += 1;
  }

  if (level == 0 || level > 6 || start + level >= markdown.size()) {
    return 0;
  }

  const unsigned char next = static_cast<unsigned char>(markdown[start + level]);
  return std::isspace(next) ? level : 0;
}

bool isWhitespaceOnly(const std::string& markdown) {
  return std::all_of(markdown.begin(), markdown.end(), [](unsigned char character) {
    return std::isspace(character);
  });
}

MarkdownBlockType blockTypeForMarkdown(const std::string& markdown) {
  const size_t start = firstContentIndex(markdown);
  if (start >= markdown.size()) {
    return MarkdownBlockType::Paragraph;
  }

  const char first = markdown[start];
  if (headingLevelForMarkdown(markdown) > 0) {
    return MarkdownBlockType::Heading;
  }
  if (first == '-' || first == '*' || first == '_') {
    size_t markerCount = 0;
    bool onlyMarkersAndSpaces = true;
    for (size_t index = start; index < markdown.size(); index += 1) {
      if (markdown[index] == first) {
        markerCount += 1;
      } else if (!std::isspace(static_cast<unsigned char>(markdown[index]))) {
        onlyMarkersAndSpaces = false;
        break;
      }
    }
    if (onlyMarkersAndSpaces && markerCount >= 3) {
      return MarkdownBlockType::ThematicBreak;
    }
  }
  if (
      (first == '`' || first == '~') &&
      start + 2 < markdown.size() &&
      markdown[start + 1] == first &&
      markdown[start + 2] == first) {
    return MarkdownBlockType::CodeBlock;
  }
  if (first == '>') {
    return MarkdownBlockType::Quote;
  }
  if (
      (first == '-' || first == '*' || first == '+') &&
      start + 1 < markdown.size() &&
      std::isspace(static_cast<unsigned char>(markdown[start + 1]))) {
    return MarkdownBlockType::UnorderedList;
  }
  if (first >= '0' && first <= '9') {
    size_t markerEnd = start;
    while (markerEnd < markdown.size() && markdown[markerEnd] >= '0' && markdown[markerEnd] <= '9') {
      markerEnd += 1;
    }
    if (
        markerEnd + 1 < markdown.size() &&
        (markdown[markerEnd] == '.' || markdown[markerEnd] == ')') &&
        std::isspace(static_cast<unsigned char>(markdown[markerEnd + 1]))) {
      return MarkdownBlockType::OrderedList;
    }
  }
  return MarkdownBlockType::Paragraph;
}

void updateBlockSyntax(MarkdownBlockRange& block, const std::string& markdown) {
  block.type = blockTypeForMarkdown(markdown);
  block.headingLevel = block.type == MarkdownBlockType::Heading ? headingLevelForMarkdown(markdown) : 0;
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
  rebuildBlockIndex();
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

std::vector<std::string> HybridMarkdownDocument::getBlockIds(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blocks_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blocks_.size(), safeStart + safeCount);
  std::vector<std::string> blockIds;
  blockIds.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    blockIds.push_back(blocks_[index].id);
  }
  return blockIds;
}

std::string HybridMarkdownDocument::getBlockKey(double index) {
  if (index < 0) {
    return "";
  }
  const auto safeIndex = static_cast<size_t>(index);
  return safeIndex < blocks_.size() ? blocks_[safeIndex].id : "";
}

double HybridMarkdownDocument::getIndexForBlockId(const std::string& blockId) {
  const auto it = blockIndexById_.find(blockId);
  return it == blockIndexById_.end() ? -1.0 : static_cast<double>(it->second);
}

MarkdownRenderBlock HybridMarkdownDocument::getRenderBlockById(const std::string& blockId) {
  const size_t index = findBlockIndex(blockId);
  return renderBlockForBlock(index, blocks_[index]);
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
  if (transaction.type == "replaceBlockRange") {
    return replaceBlockRange(transaction);
  }
  if (transaction.type == "moveBlockRange") {
    return moveBlockRange(transaction);
  }
  throw std::runtime_error("Unsupported markdown transaction: " + transaction.type);
}

void HybridMarkdownDocument::save() {
  if (filePath_.empty()) {
    throw std::runtime_error("Cannot save markdown document without a file path.");
  }

  writeToFilePath(filePath_);
}

void HybridMarkdownDocument::saveAs(const std::string& filePath) {
  if (filePath.empty()) {
    throw std::runtime_error("Cannot save markdown document without a file path.");
  }

  writeToFilePath(filePath);
  filePath_ = filePath;
}

void HybridMarkdownDocument::writeToFilePath(const std::string& filePath) const {
  const std::string temporaryPath = filePath + ".tmp";
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

  if (std::rename(temporaryPath.c_str(), filePath.c_str()) != 0) {
    std::remove(temporaryPath.c_str());
    throw std::runtime_error("Failed to replace markdown file: " + filePath);
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
      static_cast<double>(block.headingLevel),
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
  const auto it = blockIndexById_.find(blockId);
  if (it == blockIndexById_.end()) {
    throw std::runtime_error("Markdown block not found: " + blockId);
  }
  return it->second;
}

MarkdownTransactionResult HybridMarkdownDocument::updateBlockMarkdown(const MarkdownTransaction& transaction) {
  if (!transaction.markdown.has_value()) {
    throw std::runtime_error("updateBlockMarkdown requires markdown.");
  }

  const size_t blockIndex = findBlockIndex(transaction.blockId);
  const std::vector<MarkdownBlockRange> oldBlocks = blocks_;
  std::vector<std::string> oldMarkdown;
  oldMarkdown.reserve(oldBlocks.size());
  for (size_t index = 0; index < oldBlocks.size(); index += 1) {
    oldMarkdown.push_back(markdownForBlock(index, oldBlocks[index]));
  }

  const size_t sourceStart = oldBlocks[blockIndex].markdownStart;
  const size_t sourceEnd = oldBlocks[blockIndex].markdownEnd;
  replaceSourceRange(sourceStart, sourceEnd, *transaction.markdown);

  std::vector<MarkdownBlockRange> newBlocks = parseMarkdownBlocks(sourceText_);
  std::vector<std::string> newMarkdown;
  newMarkdown.reserve(newBlocks.size());
  for (const auto& block : newBlocks) {
    newMarkdown.push_back(sourceString(block.markdownStart, block.markdownEnd));
  }
  if (isWhitespaceOnly(*transaction.markdown)) {
    MarkdownBlockRange emptyBlock;
    emptyBlock.index = blockIndex;
    emptyBlock.markdownStart = sourceStart;
    emptyBlock.markdownEnd = sourceStart;
    emptyBlock.contentStart = sourceStart;
    emptyBlock.contentEnd = sourceStart;
    updateBlockSyntax(emptyBlock, "");
    const size_t insertIndex = std::min(blockIndex, newBlocks.size());
    newBlocks.insert(newBlocks.begin() + static_cast<long long>(insertIndex), emptyBlock);
    newMarkdown.insert(newMarkdown.begin() + static_cast<long long>(insertIndex), "");
  }

  size_t prefixCount = 0;
  while (
      prefixCount < blockIndex &&
      prefixCount < oldBlocks.size() &&
      prefixCount < newBlocks.size() &&
      oldMarkdown[prefixCount] == newMarkdown[prefixCount]) {
    newBlocks[prefixCount].id = oldBlocks[prefixCount].id;
    newBlocks[prefixCount].textRevision = oldBlocks[prefixCount].textRevision;
    prefixCount += 1;
  }

  size_t suffixCount = 0;
  while (
      oldBlocks.size() > prefixCount + suffixCount &&
      newBlocks.size() > prefixCount + suffixCount &&
      oldBlocks.size() - suffixCount - 1 > blockIndex &&
      oldMarkdown[oldBlocks.size() - suffixCount - 1] == newMarkdown[newBlocks.size() - suffixCount - 1]) {
    const size_t oldIndex = oldBlocks.size() - suffixCount - 1;
    const size_t newIndex = newBlocks.size() - suffixCount - 1;
    newBlocks[newIndex].id = oldBlocks[oldIndex].id;
    newBlocks[newIndex].textRevision = oldBlocks[oldIndex].textRevision;
    suffixCount += 1;
  }

  const size_t deleteCount = oldBlocks.size() - prefixCount - suffixCount;
  const size_t insertCount = newBlocks.size() - prefixCount - suffixCount;
  const bool preservesEditedBlockId = deleteCount > 0 && insertCount > 0;
  std::vector<std::string> retiredBlockIds;
  retiredBlockIds.reserve(deleteCount);

  for (size_t index = prefixCount; index < oldBlocks.size() - suffixCount; index += 1) {
    if (preservesEditedBlockId && index == blockIndex) {
      continue;
    }
    retiredBlockIds.push_back(oldBlocks[index].id);
  }

  for (size_t offset = 0; offset < insertCount; offset += 1) {
    auto& block = newBlocks[prefixCount + offset];
    if (offset == 0 && preservesEditedBlockId) {
      block.id = oldBlocks[blockIndex].id;
      block.textRevision = oldBlocks[blockIndex].textRevision + 1;
    } else {
      block.id = nextBlockId();
      block.textRevision = revision_ + 1;
    }
  }

  blocks_ = std::move(newBlocks);
  markdownCache_.assign(blocks_.size(), std::nullopt);
  renumberBlocks(prefixCount);
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(sourceText_.size());

  std::vector<size_t> changedBlockIndices;
  changedBlockIndices.reserve(insertCount);
  for (size_t offset = 0; offset < insertCount; offset += 1) {
    changedBlockIndices.push_back(prefixCount + offset);
  }
  return makeTransactionResult(prefixCount, deleteCount, changedBlockIndices, std::move(retiredBlockIds));
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
  updateBlockSyntax(block, *transaction.beforeMarkdown);
  block.textRevision += 1;

  MarkdownBlockRange newBlock;
  newBlock.id = nextBlockId();
  newBlock.index = block.index + 1;
  newBlock.depth = block.depth;
  newBlock.markdownStart = secondStart;
  newBlock.markdownEnd = secondStart + transaction.afterMarkdown->size();
  newBlock.contentStart = newBlock.markdownStart;
  newBlock.contentEnd = newBlock.markdownEnd;
  updateBlockSyntax(newBlock, *transaction.afterMarkdown);

  blocks_.insert(blocks_.begin() + static_cast<long long>(blockIndex + 1), newBlock);
  markdownCache_.insert(markdownCache_.begin() + static_cast<long long>(blockIndex + 1), *transaction.afterMarkdown);
  markdownCache_[blockIndex] = *transaction.beforeMarkdown;
  shiftBlocksAfter(blockIndex + 2, delta);
  renumberBlocks(blockIndex);
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(sourceText_.size());
  return makeTransactionResult(blockIndex, 1, {blockIndex, blockIndex + 1});
}

MarkdownTransactionResult HybridMarkdownDocument::replaceBlockRange(const MarkdownTransaction& transaction) {
  if (!transaction.beforeMarkdown.has_value()) {
    throw std::runtime_error("replaceBlockRange requires an end block id.");
  }

  const size_t firstIndex = findBlockIndex(transaction.blockId);
  const size_t secondIndex = findBlockIndex(*transaction.beforeMarkdown);
  const size_t rangeStartIndex = std::min(firstIndex, secondIndex);
  const size_t rangeEndIndex = std::max(firstIndex, secondIndex);
  const bool hasReplacement = transaction.markdown.has_value();
  const bool hasPreviousBlock = rangeStartIndex > 0;
  const bool hasNextBlock = rangeEndIndex + 1 < blocks_.size();
  const std::vector<MarkdownBlockRange> oldBlocks = blocks_;
  std::vector<std::string> oldMarkdown;
  oldMarkdown.reserve(oldBlocks.size());
  for (size_t index = 0; index < oldBlocks.size(); index += 1) {
    oldMarkdown.push_back(markdownForBlock(index, oldBlocks[index]));
  }

  size_t sourceStart = blocks_[rangeStartIndex].markdownStart;
  size_t sourceEnd = blocks_[rangeEndIndex].markdownEnd;
  std::string replacementSource;
  if (hasReplacement) {
    replacementSource = *transaction.markdown;
    if (hasNextBlock) {
      sourceEnd = std::min(sourceText_.size(), sourceEnd + lineEnding_.size());
      replacementSource += lineEnding_;
    }
  } else if (hasNextBlock) {
    sourceEnd = std::min(sourceText_.size(), sourceEnd + lineEnding_.size());
  } else if (hasPreviousBlock) {
    sourceStart = sourceStart >= lineEnding_.size() ? sourceStart - lineEnding_.size() : 0;
  }

  replaceSourceRange(sourceStart, sourceEnd, replacementSource);

  std::vector<MarkdownBlockRange> newBlocks = parseMarkdownBlocks(sourceText_);
  std::vector<std::string> newMarkdown;
  newMarkdown.reserve(newBlocks.size());
  for (const auto& block : newBlocks) {
    newMarkdown.push_back(sourceString(block.markdownStart, block.markdownEnd));
  }
  if (hasReplacement && !transaction.markdown->empty() && isWhitespaceOnly(*transaction.markdown)) {
    MarkdownBlockRange emptyBlock;
    emptyBlock.index = rangeStartIndex;
    emptyBlock.markdownStart = sourceStart;
    emptyBlock.markdownEnd = sourceStart;
    emptyBlock.contentStart = sourceStart;
    emptyBlock.contentEnd = sourceStart;
    updateBlockSyntax(emptyBlock, "");
    const size_t insertIndex = std::min(rangeStartIndex, newBlocks.size());
    newBlocks.insert(newBlocks.begin() + static_cast<long long>(insertIndex), emptyBlock);
    newMarkdown.insert(newMarkdown.begin() + static_cast<long long>(insertIndex), "");
  }

  size_t prefixCount = 0;
  while (
      prefixCount < rangeStartIndex &&
      prefixCount < oldBlocks.size() &&
      prefixCount < newBlocks.size() &&
      oldMarkdown[prefixCount] == newMarkdown[prefixCount]) {
    newBlocks[prefixCount].id = oldBlocks[prefixCount].id;
    newBlocks[prefixCount].textRevision = oldBlocks[prefixCount].textRevision;
    prefixCount += 1;
  }

  size_t suffixCount = 0;
  while (
      oldBlocks.size() > prefixCount + suffixCount &&
      newBlocks.size() > prefixCount + suffixCount &&
      oldBlocks.size() - suffixCount - 1 > rangeEndIndex &&
      oldMarkdown[oldBlocks.size() - suffixCount - 1] == newMarkdown[newBlocks.size() - suffixCount - 1]) {
    const size_t oldIndex = oldBlocks.size() - suffixCount - 1;
    const size_t newIndex = newBlocks.size() - suffixCount - 1;
    newBlocks[newIndex].id = oldBlocks[oldIndex].id;
    newBlocks[newIndex].textRevision = oldBlocks[oldIndex].textRevision;
    suffixCount += 1;
  }

  const size_t deleteCount = oldBlocks.size() - prefixCount - suffixCount;
  const size_t insertCount = newBlocks.size() - prefixCount - suffixCount;
  const bool preservesFirstSelectedBlockId = deleteCount > 0 && insertCount > 0;
  std::vector<std::string> retiredBlockIds;
  retiredBlockIds.reserve(deleteCount);

  for (size_t index = prefixCount; index < oldBlocks.size() - suffixCount; index += 1) {
    if (preservesFirstSelectedBlockId && index == rangeStartIndex) {
      continue;
    }
    retiredBlockIds.push_back(oldBlocks[index].id);
  }

  for (size_t offset = 0; offset < insertCount; offset += 1) {
    auto& block = newBlocks[prefixCount + offset];
    if (offset == 0 && preservesFirstSelectedBlockId) {
      block.id = oldBlocks[rangeStartIndex].id;
      block.textRevision = oldBlocks[rangeStartIndex].textRevision + 1;
    } else {
      block.id = nextBlockId();
      block.textRevision = revision_ + 1;
    }
  }

  blocks_ = std::move(newBlocks);
  markdownCache_.assign(blocks_.size(), std::nullopt);
  renumberBlocks(prefixCount);
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(sourceText_.size());

  std::vector<size_t> changedBlockIndices;
  changedBlockIndices.reserve(insertCount);
  for (size_t offset = 0; offset < insertCount; offset += 1) {
    changedBlockIndices.push_back(prefixCount + offset);
  }
  return makeTransactionResult(prefixCount, deleteCount, changedBlockIndices, std::move(retiredBlockIds));
}

MarkdownTransactionResult HybridMarkdownDocument::moveBlockRange(const MarkdownTransaction& transaction) {
  if (!transaction.beforeMarkdown.has_value() || !transaction.markdown.has_value() || !transaction.afterMarkdown.has_value()) {
    throw std::runtime_error("moveBlockRange requires end block id, target block id, and placement.");
  }

  const std::string& targetBlockId = *transaction.markdown;
  const std::string& placement = *transaction.afterMarkdown;
  if (placement != "before" && placement != "after") {
    throw std::runtime_error("moveBlockRange placement must be before or after.");
  }

  const size_t firstIndex = findBlockIndex(transaction.blockId);
  const size_t secondIndex = findBlockIndex(*transaction.beforeMarkdown);
  const size_t targetIndex = findBlockIndex(targetBlockId);
  const size_t rangeStartIndex = std::min(firstIndex, secondIndex);
  const size_t rangeEndIndex = std::max(firstIndex, secondIndex);
  if (targetIndex >= rangeStartIndex && targetIndex <= rangeEndIndex) {
    throw std::runtime_error("moveBlockRange target must be outside the moved range.");
  }

  std::vector<MarkdownBlockRange> oldBlocks = blocks_;
  std::vector<std::string> oldMarkdown;
  oldMarkdown.reserve(oldBlocks.size());
  for (size_t index = 0; index < oldBlocks.size(); index += 1) {
    oldMarkdown.push_back(markdownForBlock(index, oldBlocks[index]));
  }

  const size_t movedBlockCount = rangeEndIndex - rangeStartIndex + 1;
  std::vector<MarkdownBlockRange> movedBlocks;
  movedBlocks.reserve(movedBlockCount);
  std::vector<std::string> movedMarkdown;
  movedMarkdown.reserve(movedBlockCount);
  for (size_t index = rangeStartIndex; index <= rangeEndIndex; index += 1) {
    movedBlocks.push_back(oldBlocks[index]);
    movedMarkdown.push_back(oldMarkdown[index]);
  }

  std::vector<MarkdownBlockRange> reorderedBlocks;
  std::vector<std::string> reorderedMarkdown;
  reorderedBlocks.reserve(oldBlocks.size());
  reorderedMarkdown.reserve(oldMarkdown.size());
  for (size_t index = 0; index < oldBlocks.size(); index += 1) {
    if (index < rangeStartIndex || index > rangeEndIndex) {
      reorderedBlocks.push_back(oldBlocks[index]);
      reorderedMarkdown.push_back(oldMarkdown[index]);
    }
  }

  size_t insertionIndex = targetIndex;
  if (targetIndex > rangeEndIndex) {
    insertionIndex -= movedBlockCount;
  }
  if (placement == "after") {
    insertionIndex += 1;
  }

  reorderedBlocks.insert(
      reorderedBlocks.begin() + static_cast<long long>(insertionIndex),
      movedBlocks.begin(),
      movedBlocks.end());
  reorderedMarkdown.insert(
      reorderedMarkdown.begin() + static_cast<long long>(insertionIndex),
      movedMarkdown.begin(),
      movedMarkdown.end());

  std::string nextSource;
  for (size_t index = 0; index < reorderedMarkdown.size(); index += 1) {
    if (index > 0) {
      nextSource += lineEnding_;
      nextSource += lineEnding_;
    }
    nextSource += reorderedMarkdown[index];
  }
  const bool hadTrailingLineEnding =
      sourceText_.size() >= lineEnding_.size() &&
      sourceText_.compare(sourceText_.size() - lineEnding_.size(), lineEnding_.size(), lineEnding_) == 0;
  if (hadTrailingLineEnding) {
    nextSource += lineEnding_;
  }

  std::vector<MarkdownBlockRange> newBlocks = parseMarkdownBlocks(nextSource);
  if (newBlocks.size() != reorderedBlocks.size()) {
    throw std::runtime_error("moveBlockRange could not preserve markdown block boundaries.");
  }

  for (size_t index = 0; index < newBlocks.size(); index += 1) {
    newBlocks[index].id = reorderedBlocks[index].id;
    newBlocks[index].textRevision = reorderedBlocks[index].textRevision;
  }

  sourceText_ = std::move(nextSource);
  blocks_ = std::move(newBlocks);
  markdownCache_.assign(blocks_.size(), std::nullopt);
  renumberBlocks(0);
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(sourceText_.size());

  const size_t changedStartIndex = std::min(rangeStartIndex, targetIndex);
  const size_t changedEndIndex = std::max(rangeEndIndex, targetIndex);
  std::vector<size_t> changedBlockIndices;
  changedBlockIndices.reserve(changedEndIndex - changedStartIndex + 1);
  for (size_t index = changedStartIndex; index <= changedEndIndex; index += 1) {
    changedBlockIndices.push_back(index);
  }
  return makeTransactionResult(changedStartIndex, changedBlockIndices.size(), changedBlockIndices);
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
  rebuildBlockIndex();
}

void HybridMarkdownDocument::rebuildBlockIndex() {
  blockIndexById_.clear();
  blockIndexById_.reserve(blocks_.size());
  for (size_t index = 0; index < blocks_.size(); index += 1) {
    blockIndexById_[blocks_[index].id] = index;
  }
}

std::string HybridMarkdownDocument::nextBlockId() {
  const size_t blockNumber = nextBlockNumber_;
  nextBlockNumber_ += 1;
  return documentId_ + ":b" + std::to_string(blockNumber);
}

} // namespace margelo::nitro::legenddesktop::markdownparser

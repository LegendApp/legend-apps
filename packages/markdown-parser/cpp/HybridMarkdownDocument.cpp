#include "HybridMarkdownDocument.hpp"

#include "MarkdownBlockParser.hpp"
#include "MarkdownDocumentRegistry.hpp"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <unordered_map>

namespace margelo::nitro::legendapps::markdownparser {

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

std::mutex registryMutex;
std::unordered_map<std::string, std::weak_ptr<HybridMarkdownDocument>> documentRegistry;

std::string documentIdForBlockId(const std::string& blockId) {
  const size_t separator = blockId.find(":");
  return separator == std::string::npos ? "" : blockId.substr(0, separator);
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

// An implicit sequence tree keeps logical ranks and source offsets as subtree aggregates.
// Each block retains exact source slices until edited, so insertion does not rewrite or renumber its suffix.
class MarkdownBlockSequence {
  struct TextSegment {
    static TextSegment slice(size_t start, size_t length) {
      TextSegment segment;
      segment.sourceStart = start;
      segment.sourceLength = length;
      return segment;
    }

    static TextSegment owned(std::string value) {
      TextSegment segment;
      segment.ownedValue = std::move(value);
      segment.ownsValue = true;
      return segment;
    }

    size_t size() const noexcept {
      return ownsValue ? ownedValue.size() : sourceLength;
    }

    const std::string& value(const std::string& source) const {
      if (ownsValue) {
        return ownedValue;
      }
      if (!cachedValue.has_value()) {
        cachedValue = source.substr(sourceStart, sourceLength);
      }
      return *cachedValue;
    }

    void appendTo(std::string& target, const std::string& source) const {
      if (ownsValue) {
        target += ownedValue;
      } else if (sourceLength > 0) {
        target.append(source, sourceStart, sourceLength);
      }
    }

    size_t externalMemorySize() const noexcept {
      return ownedValue.capacity() + (cachedValue ? cachedValue->capacity() : 0);
    }

    size_t sourceStart = 0;
    size_t sourceLength = 0;
    std::string ownedValue;
    mutable std::optional<std::string> cachedValue;
    bool ownsValue = false;
  };

public:
  MarkdownBlockSequence(std::string source, std::vector<MarkdownBlockRange> blocks) {
    reset(std::move(source), std::move(blocks));
  }

  size_t size() const noexcept {
    return nodeCount(root_.get());
  }

  size_t sourceSize() const noexcept {
    return sourcePrefix_.size() + sourceBytes(root_.get());
  }

  const MarkdownBlockRange& blockAt(size_t index) const {
    return nodeAt(index)->block;
  }

  const std::string& markdownAt(size_t index) const {
    return nodeAt(index)->markdown.value(backingSource_);
  }

  size_t sourceSpanSizeAt(size_t index) const {
    const Node* node = nodeAt(index);
    return node->markdown.size() + node->separatorAfter.size();
  }

  std::string sourceForRange(size_t startIndex, size_t count) const {
    if (startIndex > size() || count > size() - startIndex) {
      throw std::out_of_range("Markdown source range is out of bounds.");
    }

    std::string source;
    for (size_t index = startIndex; index < startIndex + count; index += 1) {
      const Node* node = nodeAt(index);
      node->markdown.appendTo(source, backingSource_);
      node->separatorAfter.appendTo(source, backingSource_);
    }
    return source;
  }

  size_t sourceStartAt(size_t index) const {
    return sourcePrefix_.size() + sourceBytesBefore(nodeAt(index));
  }

  size_t indexForId(const std::string& blockId) const {
    const auto it = nodeById_.find(blockId);
    if (it == nodeById_.end()) {
      throw std::runtime_error("Markdown block not found: " + blockId);
    }
    return indexOf(it->second);
  }

  bool containsId(const std::string& blockId) const {
    return nodeById_.contains(blockId);
  }

  const std::string& markdownForId(const std::string& blockId) const {
    const auto it = nodeById_.find(blockId);
    if (it == nodeById_.end()) {
      static const std::string empty;
      return empty;
    }
    return it->second->markdown.value(backingSource_);
  }

  void splitBlock(
      size_t index,
      std::string beforeMarkdown,
      std::string afterMarkdown,
      MarkdownBlockRange newBlock,
      const std::string& separator) {
    Node* blockNode = nodeAt(index);
    TextSegment trailingSeparator = std::move(blockNode->separatorAfter);
    blockNode->markdown = TextSegment::owned(std::move(beforeMarkdown));
    blockNode->separatorAfter = TextSegment::owned(separator);
    blockNode->block.markdownStart = 0;
    blockNode->block.markdownEnd = blockNode->markdown.size();
    blockNode->block.contentStart = 0;
    blockNode->block.contentEnd = blockNode->markdown.size();
    updateBlockSyntax(blockNode->block, blockNode->markdown.value(backingSource_));
    blockNode->block.textRevision += 1;
    updateAncestors(blockNode);

    newBlock.index = 0;
    newBlock.markdownStart = 0;
    newBlock.markdownEnd = afterMarkdown.size();
    newBlock.contentStart = 0;
    newBlock.contentEnd = afterMarkdown.size();
    insert(
        index + 1,
        std::move(newBlock),
        TextSegment::owned(std::move(afterMarkdown)),
        std::move(trailingSeparator));
  }

  void replaceRange(
      size_t startIndex,
      size_t deleteCount,
      const std::string& replacementSource,
      std::vector<MarkdownBlockRange> replacementBlocks) {
    if (startIndex > size() || deleteCount > size() - startIndex) {
      throw std::out_of_range("Markdown replacement range is out of bounds.");
    }

    auto [before, rangeAndAfter] = split(std::move(root_), startIndex);
    auto [removed, after] = split(std::move(rangeAndAfter), deleteCount);
    eraseNodeIds(removed.get());
    root_ = merge(std::move(before), std::move(after));

    const size_t leadingLength = replacementBlocks.empty()
        ? replacementSource.size()
        : std::min(replacementBlocks.front().markdownStart, replacementSource.size());
    const std::string leadingSource = replacementSource.substr(0, leadingLength);
    if (startIndex == 0) {
      std::string prefix = sourcePrefix_.value(backingSource_);
      prefix += leadingSource;
      sourcePrefix_ = TextSegment::owned(std::move(prefix));
    } else {
      Node* previousNode = nodeAt(startIndex - 1);
      std::string separator = previousNode->separatorAfter.value(backingSource_);
      separator += leadingSource;
      previousNode->separatorAfter = TextSegment::owned(std::move(separator));
      updateAncestors(previousNode);
    }

    for (size_t offset = 0; offset < replacementBlocks.size(); offset += 1) {
      MarkdownBlockRange block = std::move(replacementBlocks[offset]);
      const size_t markdownStart = std::min(block.markdownStart, replacementSource.size());
      const size_t markdownEnd = std::min(std::max(markdownStart, block.markdownEnd), replacementSource.size());
      const size_t nextStart = offset + 1 < replacementBlocks.size()
          ? std::min(std::max(markdownEnd, replacementBlocks[offset + 1].markdownStart), replacementSource.size())
          : replacementSource.size();
      const size_t contentStart = std::min(std::max(markdownStart, block.contentStart), markdownEnd);
      const size_t contentEnd = std::min(std::max(contentStart, block.contentEnd), markdownEnd);
      block.index = 0;
      block.markdownStart = 0;
      block.markdownEnd = markdownEnd - markdownStart;
      block.contentStart = contentStart - markdownStart;
      block.contentEnd = contentEnd - markdownStart;
      insert(
          startIndex + offset,
          std::move(block),
          TextSegment::owned(replacementSource.substr(markdownStart, markdownEnd - markdownStart)),
          TextSegment::owned(replacementSource.substr(markdownEnd, nextStart - markdownEnd)));
    }
  }

  std::vector<MarkdownBlockRange> materializeBlocks() const {
    std::vector<MarkdownBlockRange> blocks;
    blocks.reserve(size());
    size_t sourceOffset = sourcePrefix_.size();
    forEachNode([&](const Node& node, size_t index) {
      MarkdownBlockRange block = node.block;
      block.index = index;
      block.markdownStart = sourceOffset;
      block.markdownEnd = sourceOffset + node.markdown.size();
      block.contentStart = block.markdownStart + node.block.contentStart;
      block.contentEnd = block.markdownStart + node.block.contentEnd;
      blocks.push_back(std::move(block));
      sourceOffset += node.markdown.size() + node.separatorAfter.size();
    });
    return blocks;
  }

  std::vector<std::string> materializeMarkdown() const {
    std::vector<std::string> markdown;
    markdown.reserve(size());
    forEachNode([&](const Node& node, size_t) {
      markdown.push_back(node.markdown.value(backingSource_));
    });
    return markdown;
  }

  std::string materializeSource() const {
    std::string source;
    source.reserve(sourceSize());
    sourcePrefix_.appendTo(source, backingSource_);
    forEachNode([&](const Node& node, size_t) {
      node.markdown.appendTo(source, backingSource_);
      node.separatorAfter.appendTo(source, backingSource_);
    });
    return source;
  }

  size_t externalMemorySize() const noexcept {
    // Keep GC memory accounting constant-time. String and cache capacities are
    // intentionally approximate, matching the document's previous accounting.
    return backingSource_.capacity() + sourcePrefix_.externalMemorySize() + size() * sizeof(Node);
  }

  void reset(std::string source, std::vector<MarkdownBlockRange> blocks) {
    root_.reset();
    nodeById_.clear();
    nextPriority_ = 0x9e3779b9U;
    backingSource_ = std::move(source);
    if (blocks.empty()) {
      sourcePrefix_ = TextSegment::slice(0, backingSource_.size());
    } else {
      const size_t firstStart = std::min(blocks.front().markdownStart, backingSource_.size());
      sourcePrefix_ = TextSegment::slice(0, firstStart);
      for (size_t index = 0; index < blocks.size(); index += 1) {
        MarkdownBlockRange block = std::move(blocks[index]);
        const size_t markdownStart = std::min(block.markdownStart, backingSource_.size());
        const size_t markdownEnd = std::min(std::max(markdownStart, block.markdownEnd), backingSource_.size());
        const size_t nextStart = index + 1 < blocks.size()
            ? std::min(std::max(markdownEnd, blocks[index + 1].markdownStart), backingSource_.size())
            : backingSource_.size();
        const size_t contentStart = std::min(std::max(markdownStart, block.contentStart), markdownEnd);
        const size_t contentEnd = std::min(std::max(contentStart, block.contentEnd), markdownEnd);
        block.index = 0;
        block.markdownStart = 0;
        block.markdownEnd = markdownEnd - markdownStart;
        block.contentStart = contentStart - markdownStart;
        block.contentEnd = contentEnd - markdownStart;
        insert(
            index,
            std::move(block),
            TextSegment::slice(markdownStart, markdownEnd - markdownStart),
            TextSegment::slice(markdownEnd, nextStart - markdownEnd));
      }
    }
  }

private:
  struct Node {
    Node(MarkdownBlockRange blockValue, TextSegment markdownValue, TextSegment separatorValue, uint32_t priorityValue)
        : block(std::move(blockValue)),
          markdown(std::move(markdownValue)),
          separatorAfter(std::move(separatorValue)),
          priority(priorityValue) {
      subtreeSourceBytes = markdown.size() + separatorAfter.size();
    }

    MarkdownBlockRange block;
    TextSegment markdown;
    TextSegment separatorAfter;
    uint32_t priority;
    size_t subtreeCount = 1;
    size_t subtreeSourceBytes = 0;
    Node* parent = nullptr;
    std::unique_ptr<Node> left;
    std::unique_ptr<Node> right;
  };

  static size_t nodeCount(const Node* node) noexcept {
    return node ? node->subtreeCount : 0;
  }

  static size_t sourceBytes(const Node* node) noexcept {
    return node ? node->subtreeSourceBytes : 0;
  }

  void eraseNodeIds(const Node* node) {
    if (node) {
      eraseNodeIds(node->left.get());
      nodeById_.erase(node->block.id);
      eraseNodeIds(node->right.get());
    }
  }

  static void updateNode(Node* node) noexcept {
    if (node) {
      node->subtreeCount = 1 + nodeCount(node->left.get()) + nodeCount(node->right.get());
      node->subtreeSourceBytes =
          node->markdown.size() + node->separatorAfter.size() +
          sourceBytes(node->left.get()) + sourceBytes(node->right.get());
      if (node->left) {
        node->left->parent = node;
      }
      if (node->right) {
        node->right->parent = node;
      }
    }
  }

  static std::unique_ptr<Node> merge(std::unique_ptr<Node> left, std::unique_ptr<Node> right) {
    if (!left) {
      if (right) {
        right->parent = nullptr;
      }
      return right;
    }
    if (!right) {
      left->parent = nullptr;
      return left;
    }
    if (left->priority < right->priority) {
      left->right = merge(std::move(left->right), std::move(right));
      updateNode(left.get());
      left->parent = nullptr;
      return left;
    }
    right->left = merge(std::move(left), std::move(right->left));
    updateNode(right.get());
    right->parent = nullptr;
    return right;
  }

  static std::pair<std::unique_ptr<Node>, std::unique_ptr<Node>> split(
      std::unique_ptr<Node> root,
      size_t leftCount) {
    if (!root) {
      return {};
    }
    if (nodeCount(root->left.get()) >= leftCount) {
      auto [before, after] = split(std::move(root->left), leftCount);
      root->left = std::move(after);
      updateNode(root.get());
      root->parent = nullptr;
      if (before) {
        before->parent = nullptr;
      }
      return {std::move(before), std::move(root)};
    }
    const size_t remainingLeftCount = leftCount - nodeCount(root->left.get()) - 1;
    auto [before, after] = split(std::move(root->right), remainingLeftCount);
    root->right = std::move(before);
    updateNode(root.get());
    root->parent = nullptr;
    if (after) {
      after->parent = nullptr;
    }
    return {std::move(root), std::move(after)};
  }

  Node* nodeAt(size_t index) const {
    if (index >= size()) {
      throw std::out_of_range("Markdown block index is out of bounds.");
    }
    Node* node = root_.get();
    size_t remaining = index;
    while (node) {
      const size_t leftCount = nodeCount(node->left.get());
      if (remaining < leftCount) {
        node = node->left.get();
      } else if (remaining == leftCount) {
        return node;
      } else {
        remaining -= leftCount + 1;
        node = node->right.get();
      }
    }
    throw std::out_of_range("Markdown block index is out of bounds.");
  }

  static size_t indexOf(const Node* node) noexcept {
    size_t index = nodeCount(node->left.get());
    while (node->parent) {
      if (node == node->parent->right.get()) {
        index += nodeCount(node->parent->left.get()) + 1;
      }
      node = node->parent;
    }
    return index;
  }

  static size_t sourceBytesBefore(const Node* node) noexcept {
    size_t bytes = sourceBytes(node->left.get());
    while (node->parent) {
      if (node == node->parent->right.get()) {
        bytes += sourceBytes(node->parent->left.get());
        bytes += node->parent->markdown.size() + node->parent->separatorAfter.size();
      }
      node = node->parent;
    }
    return bytes;
  }

  void updateAncestors(Node* node) noexcept {
    while (node) {
      updateNode(node);
      node = node->parent;
    }
  }

  uint32_t nextPriority() noexcept {
    nextPriority_ ^= nextPriority_ << 13;
    nextPriority_ ^= nextPriority_ >> 17;
    nextPriority_ ^= nextPriority_ << 5;
    return nextPriority_;
  }

  void insert(size_t index, MarkdownBlockRange block, TextSegment markdown, TextSegment separatorAfter) {
    auto node = std::make_unique<Node>(
        std::move(block),
        std::move(markdown),
        std::move(separatorAfter),
        nextPriority());
    Node* nodePointer = node.get();
    auto [before, after] = split(std::move(root_), index);
    root_ = merge(merge(std::move(before), std::move(node)), std::move(after));
    nodeById_[nodePointer->block.id] = nodePointer;
  }

  template <typename Callback>
  void forEachNode(Callback&& callback) const {
    size_t index = 0;
    const auto visit = [&](const auto& self, const Node* node) -> void {
      if (node) {
        self(self, node->left.get());
        callback(*node, index);
        index += 1;
        self(self, node->right.get());
      }
    };
    visit(visit, root_.get());
  }

  std::string backingSource_;
  TextSegment sourcePrefix_;
  std::unique_ptr<Node> root_;
  std::unordered_map<std::string, Node*> nodeById_;
  uint32_t nextPriority_ = 0x9e3779b9U;
};

void registerMarkdownDocument(std::shared_ptr<HybridMarkdownDocument> document) {
  if (document) {
    std::lock_guard<std::mutex> lock(registryMutex);
    documentRegistry[document->documentId()] = document;
  }
}

std::shared_ptr<HybridMarkdownDocument> registeredDocumentForBlockId(const std::string& blockId) {
  const std::string documentId = documentIdForBlockId(blockId);
  if (documentId.empty()) {
    return nullptr;
  }

  std::shared_ptr<HybridMarkdownDocument> document;
  {
    std::lock_guard<std::mutex> lock(registryMutex);
    const auto it = documentRegistry.find(documentId);
    if (it != documentRegistry.end()) {
      document = it->second.lock();
      if (!document) {
        documentRegistry.erase(it);
      }
    }
  }
  return document;
}

RegisteredMarkdownBlockMetadata metadataForRegisteredBlockId(const std::string& blockId) {
  std::shared_ptr<HybridMarkdownDocument> document = registeredDocumentForBlockId(blockId);
  if (!document) {
    return RegisteredMarkdownBlockMetadata();
  }

  try {
    const MarkdownBlockMetadata metadata = document->getBlockMetadataById(blockId);
    return RegisteredMarkdownBlockMetadata{
      .id = metadata.id,
      .type = metadata.type,
      .headingLevel = metadata.headingLevel,
    };
  } catch (...) {
    return RegisteredMarkdownBlockMetadata();
  }
}

std::string markdownForRegisteredBlockId(const std::string& blockId) {
  std::shared_ptr<HybridMarkdownDocument> document = registeredDocumentForBlockId(blockId);
  return document ? document->markdownForBlockId(blockId) : "";
}

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
      timing_(timing),
      documentId_(nextDocumentId()),
      nextBlockNumber_(blocks.size()) {
  for (auto& block : blocks) {
    if (block.id.empty()) {
      block.id = documentId_ + ":b" + std::to_string(block.index);
    }
  }
  std::string sourceText = source ? std::string(source->data(), source->size()) : "";
  lineEnding_ = detectLineEnding(sourceText);
  blockSequence_ = std::make_unique<MarkdownBlockSequence>(
      std::move(sourceText),
      std::move(blocks));
}

HybridMarkdownDocument::~HybridMarkdownDocument() = default;

void HybridMarkdownDocument::setDocumentDurationMs(double durationMs) {
  timing_.documentMs = durationMs;
}

double HybridMarkdownDocument::getBlockCount() {
  return static_cast<double>(blockSequence_->size());
}

double HybridMarkdownDocument::getSourceSize() {
  return static_cast<double>(blockSequence_->sourceSize());
}

std::vector<std::string> HybridMarkdownDocument::getBlockIds(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blockSequence_->size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blockSequence_->size(), safeStart + safeCount);
  std::vector<std::string> blockIds;
  blockIds.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    blockIds.push_back(blockSequence_->blockAt(index).id);
  }
  return blockIds;
}

std::string HybridMarkdownDocument::getBlockKey(double index) {
  if (index < 0) {
    return "";
  }
  const auto safeIndex = static_cast<size_t>(index);
  return safeIndex < blockSequence_->size() ? blockSequence_->blockAt(safeIndex).id : "";
}

double HybridMarkdownDocument::getIndexForBlockId(const std::string& blockId) {
  return blockSequence_->containsId(blockId)
      ? static_cast<double>(blockSequence_->indexForId(blockId))
      : -1.0;
}

MarkdownBlockMetadata HybridMarkdownDocument::getBlockMetadataById(const std::string& blockId) {
  return metadataForBlock(findBlockIndex(blockId));
}

std::vector<MarkdownBlockMetadata> HybridMarkdownDocument::getBlockMetadata(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blockSequence_->size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blockSequence_->size(), safeStart + safeCount);
  std::vector<MarkdownBlockMetadata> metadata;
  metadata.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    metadata.push_back(metadataForBlock(index));
  }
  return metadata;
}

MarkdownRenderBlock HybridMarkdownDocument::getRenderBlockById(const std::string& blockId) {
  return renderBlockForBlock(findBlockIndex(blockId));
}

std::vector<MarkdownRenderBlock> HybridMarkdownDocument::getRenderBlocks(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));
  if (safeStart >= blockSequence_->size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(blockSequence_->size(), safeStart + safeCount);
  std::vector<MarkdownRenderBlock> renderBlocks;
  renderBlocks.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    renderBlocks.push_back(renderBlockForBlock(index));
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

const std::string& HybridMarkdownDocument::documentId() const noexcept {
  return documentId_;
}

std::string HybridMarkdownDocument::markdownForBlockId(const std::string& blockId) const {
  return blockSequence_->markdownForId(blockId);
}

void HybridMarkdownDocument::writeToFilePath(const std::string& filePath) const {
  const std::string temporaryPath = filePath + ".tmp";
  {
    std::ofstream output(temporaryPath, std::ios::binary | std::ios::trunc);
    if (!output) {
      throw std::runtime_error("Failed to open temporary markdown file for save: " + temporaryPath);
    }
    const std::string source = blockSequence_->materializeSource();
    output.write(source.data(), static_cast<std::streamsize>(source.size()));
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
  return blockSequence_->externalMemorySize();
}

MarkdownBlockMetadata HybridMarkdownDocument::metadataForBlock(size_t index) const {
  const auto& block = blockSequence_->blockAt(index);
  const size_t sourceStart = blockSequence_->sourceStartAt(index);
  const size_t sourceEnd = sourceStart + blockSequence_->markdownAt(index).size();
  return MarkdownBlockMetadata(
      block.id,
      static_cast<double>(index),
      markdownBlockTypeName(block.type),
      static_cast<double>(block.depth),
      static_cast<double>(block.headingLevel),
      static_cast<double>(sourceEnd - sourceStart),
      static_cast<double>(sourceStart),
      static_cast<double>(sourceEnd),
      static_cast<double>(sourceStart + block.contentStart),
      static_cast<double>(sourceStart + block.contentEnd),
      static_cast<double>(block.textRevision));
}

MarkdownRenderBlock HybridMarkdownDocument::renderBlockForBlock(size_t index) const {
  const auto& block = blockSequence_->blockAt(index);
  const auto& markdown = blockSequence_->markdownAt(index);
  const size_t sourceStart = blockSequence_->sourceStartAt(index);
  const size_t sourceEnd = sourceStart + markdown.size();
  return MarkdownRenderBlock(
      block.id,
      static_cast<double>(index),
      markdownBlockTypeName(block.type),
      static_cast<double>(block.depth),
      static_cast<double>(block.headingLevel),
      markdown,
      static_cast<double>(sourceStart),
      static_cast<double>(sourceEnd),
      static_cast<double>(sourceStart + block.contentStart),
      static_cast<double>(sourceStart + block.contentEnd),
      static_cast<double>(block.textRevision));
}

size_t HybridMarkdownDocument::findBlockIndex(const std::string& blockId) const {
  return blockSequence_->indexForId(blockId);
}

MarkdownTransactionResult HybridMarkdownDocument::updateBlockMarkdown(const MarkdownTransaction& transaction) {
  if (!transaction.markdown.has_value()) {
    throw std::runtime_error("updateBlockMarkdown requires markdown.");
  }

  const size_t blockIndex = findBlockIndex(transaction.blockId);
  return replaceBlockRangeIncrementally(blockIndex, blockIndex, transaction.markdown, true);
}

MarkdownTransactionResult HybridMarkdownDocument::splitBlock(const MarkdownTransaction& transaction) {
  if (!transaction.beforeMarkdown.has_value() || !transaction.afterMarkdown.has_value()) {
    throw std::runtime_error("splitBlock requires beforeMarkdown and afterMarkdown.");
  }

  const size_t blockIndex = findBlockIndex(transaction.blockId);
  const auto block = blockSequence_->blockAt(blockIndex);

  MarkdownBlockRange newBlock;
  newBlock.id = nextBlockId();
  newBlock.depth = block.depth;
  updateBlockSyntax(newBlock, *transaction.afterMarkdown);

  blockSequence_->splitBlock(
      blockIndex,
      *transaction.beforeMarkdown,
      *transaction.afterMarkdown,
      std::move(newBlock),
      lineEnding_);
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(blockSequence_->sourceSize());
  return makeTransactionResult(blockIndex, 1, {blockIndex, blockIndex + 1}, {}, true);
}

MarkdownTransactionResult HybridMarkdownDocument::replaceBlockRange(const MarkdownTransaction& transaction) {
  if (!transaction.beforeMarkdown.has_value()) {
    throw std::runtime_error("replaceBlockRange requires an end block id.");
  }

  const size_t firstIndex = findBlockIndex(transaction.blockId);
  const size_t secondIndex = findBlockIndex(*transaction.beforeMarkdown);
  const size_t rangeStartIndex = std::min(firstIndex, secondIndex);
  const size_t rangeEndIndex = std::max(firstIndex, secondIndex);
  return replaceBlockRangeIncrementally(rangeStartIndex, rangeEndIndex, transaction.markdown, false);
}

MarkdownTransactionResult HybridMarkdownDocument::replaceBlockRangeIncrementally(
    size_t rangeStartIndex,
    size_t rangeEndIndex,
    const std::optional<std::string>& replacementMarkdown,
    bool preservesEmptyReplacementBlock) {
  const size_t blockCount = blockSequence_->size();
  const bool hasReplacement = replacementMarkdown.has_value();
  const bool hasPreviousBlock = rangeStartIndex > 0;
  const bool hasNextBlock = rangeEndIndex + 1 < blockCount;
  // Include the previous block because a removed separator can join it to the
  // replacement. Two following blocks are enough to prove the scanner has
  // re-entered the unchanged suffix for lookahead constructs such as tables.
  const size_t parseStartIndex = hasPreviousBlock ? rangeStartIndex - 1 : rangeStartIndex;
  size_t parseEndIndex = std::min(blockCount - 1, rangeEndIndex + 2);

  std::vector<MarkdownBlockRange> oldWindowBlocks;
  std::vector<std::string> oldWindowMarkdown;
  std::vector<MarkdownBlockRange> newWindowBlocks;
  std::vector<std::string> newWindowMarkdown;
  std::string newWindowSource;

  while (true) {
    const size_t windowBlockCount = parseEndIndex - parseStartIndex + 1;
    oldWindowBlocks.clear();
    oldWindowMarkdown.clear();
    oldWindowBlocks.reserve(windowBlockCount);
    oldWindowMarkdown.reserve(windowBlockCount);
    for (size_t index = parseStartIndex; index <= parseEndIndex; index += 1) {
      oldWindowBlocks.push_back(blockSequence_->blockAt(index));
      oldWindowMarkdown.push_back(blockSequence_->markdownAt(index));
    }

    newWindowSource = blockSequence_->sourceForRange(parseStartIndex, windowBlockCount);
    size_t sourceStart = 0;
    for (size_t index = parseStartIndex; index < rangeStartIndex; index += 1) {
      sourceStart += blockSequence_->sourceSpanSizeAt(index);
    }
    size_t sourceEnd = sourceStart;
    for (size_t index = rangeStartIndex; index < rangeEndIndex; index += 1) {
      sourceEnd += blockSequence_->sourceSpanSizeAt(index);
    }
    sourceEnd += blockSequence_->markdownAt(rangeEndIndex).size();

    std::string replacementSource;
    if (hasReplacement) {
      replacementSource = *replacementMarkdown;
      if (hasNextBlock) {
        sourceEnd = std::min(newWindowSource.size(), sourceEnd + lineEnding_.size());
        replacementSource += lineEnding_;
      }
    } else if (hasNextBlock) {
      sourceEnd = std::min(newWindowSource.size(), sourceEnd + lineEnding_.size());
    } else if (hasPreviousBlock) {
      sourceStart = sourceStart >= lineEnding_.size() ? sourceStart - lineEnding_.size() : 0;
    }
    newWindowSource.replace(sourceStart, sourceEnd - sourceStart, replacementSource);

    newWindowBlocks = parseMarkdownBlocks(newWindowSource);
    newWindowMarkdown.clear();
    newWindowMarkdown.reserve(newWindowBlocks.size());
    for (const auto& block : newWindowBlocks) {
      newWindowMarkdown.push_back(newWindowSource.substr(block.markdownStart, block.markdownEnd - block.markdownStart));
    }

    if (
        hasReplacement &&
        isWhitespaceOnly(*replacementMarkdown) &&
        (preservesEmptyReplacementBlock || !replacementMarkdown->empty())) {
      MarkdownBlockRange emptyBlock;
      emptyBlock.markdownStart = sourceStart;
      emptyBlock.markdownEnd = sourceStart;
      emptyBlock.contentStart = sourceStart;
      emptyBlock.contentEnd = sourceStart;
      updateBlockSyntax(emptyBlock, "");
      const size_t targetOffset = rangeStartIndex - parseStartIndex;
      const size_t insertIndex = std::min(targetOffset, newWindowBlocks.size());
      newWindowBlocks.insert(newWindowBlocks.begin() + static_cast<long long>(insertIndex), emptyBlock);
      newWindowMarkdown.insert(newWindowMarkdown.begin() + static_cast<long long>(insertIndex), "");
    }

    size_t stableSuffixCount = 0;
    while (
        stableSuffixCount < oldWindowBlocks.size() &&
        stableSuffixCount < newWindowBlocks.size()) {
      const size_t oldIndex = oldWindowBlocks.size() - stableSuffixCount - 1;
      const size_t newIndex = newWindowBlocks.size() - stableSuffixCount - 1;
      if (
          parseStartIndex + oldIndex <= rangeEndIndex ||
          oldWindowMarkdown[oldIndex] != newWindowMarkdown[newIndex] ||
          oldWindowBlocks[oldIndex].type != newWindowBlocks[newIndex].type) {
        break;
      }
      stableSuffixCount += 1;
    }

    const size_t availableSuffixCount = parseEndIndex - rangeEndIndex;
    const size_t requiredStableSuffixCount = std::min<size_t>(2, availableSuffixCount);
    if (parseEndIndex + 1 == blockCount || stableSuffixCount >= requiredStableSuffixCount) {
      break;
    }

    // An opened fence or a changed paragraph boundary can consume the initial
    // suffix. Grow geometrically so contextual edits stay correct without
    // making ordinary edits depend on total document size.
    const size_t expandedWindowBlockCount = parseEndIndex - parseStartIndex + 1;
    parseEndIndex = std::min(blockCount - 1, parseStartIndex + expandedWindowBlockCount * 2 - 1);
  }

  const size_t editedWindowStart = rangeStartIndex - parseStartIndex;
  const size_t editedWindowEnd = rangeEndIndex - parseStartIndex;
  size_t prefixCount = 0;
  while (
      prefixCount < editedWindowStart &&
      prefixCount < oldWindowBlocks.size() &&
      prefixCount < newWindowBlocks.size() &&
      oldWindowMarkdown[prefixCount] == newWindowMarkdown[prefixCount] &&
      oldWindowBlocks[prefixCount].type == newWindowBlocks[prefixCount].type) {
    newWindowBlocks[prefixCount].id = oldWindowBlocks[prefixCount].id;
    newWindowBlocks[prefixCount].textRevision = oldWindowBlocks[prefixCount].textRevision;
    prefixCount += 1;
  }

  size_t suffixCount = 0;
  while (
      oldWindowBlocks.size() > prefixCount + suffixCount &&
      newWindowBlocks.size() > prefixCount + suffixCount &&
      oldWindowBlocks.size() - suffixCount - 1 > editedWindowEnd) {
    const size_t oldIndex = oldWindowBlocks.size() - suffixCount - 1;
    const size_t newIndex = newWindowBlocks.size() - suffixCount - 1;
    if (
        oldWindowMarkdown[oldIndex] != newWindowMarkdown[newIndex] ||
        oldWindowBlocks[oldIndex].type != newWindowBlocks[newIndex].type) {
      break;
    }
    newWindowBlocks[newIndex].id = oldWindowBlocks[oldIndex].id;
    newWindowBlocks[newIndex].textRevision = oldWindowBlocks[oldIndex].textRevision;
    suffixCount += 1;
  }

  const size_t deleteCount = oldWindowBlocks.size() - prefixCount - suffixCount;
  const size_t insertCount = newWindowBlocks.size() - prefixCount - suffixCount;
  const bool preservesFirstEditedBlockId = deleteCount > 0 && insertCount > 0;
  const size_t preservedOldIndex = rangeStartIndex - parseStartIndex;
  std::vector<std::string> retiredBlockIds;
  retiredBlockIds.reserve(deleteCount);

  for (size_t index = prefixCount; index < oldWindowBlocks.size() - suffixCount; index += 1) {
    if (preservesFirstEditedBlockId && index == preservedOldIndex) {
      continue;
    }
    retiredBlockIds.push_back(oldWindowBlocks[index].id);
  }

  for (size_t offset = 0; offset < insertCount; offset += 1) {
    auto& block = newWindowBlocks[prefixCount + offset];
    if (offset == 0 && preservesFirstEditedBlockId) {
      block.id = oldWindowBlocks[preservedOldIndex].id;
      block.textRevision = oldWindowBlocks[preservedOldIndex].textRevision + 1;
    } else {
      block.id = nextBlockId();
      block.textRevision = revision_ + 1;
    }
  }

  blockSequence_->replaceRange(
      parseStartIndex,
      oldWindowBlocks.size(),
      newWindowSource,
      std::move(newWindowBlocks));
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(blockSequence_->sourceSize());

  const size_t changedStartIndex = parseStartIndex + prefixCount;
  std::vector<size_t> changedBlockIndices;
  changedBlockIndices.reserve(insertCount);
  for (size_t offset = 0; offset < insertCount; offset += 1) {
    changedBlockIndices.push_back(changedStartIndex + offset);
  }
  const bool retainsFirstChangedBlock = preservesFirstEditedBlockId && preservedOldIndex == prefixCount;
  return makeTransactionResult(
      changedStartIndex,
      deleteCount,
      changedBlockIndices,
      std::move(retiredBlockIds),
      retainsFirstChangedBlock);
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

  std::vector<MarkdownBlockRange> oldBlocks = blockSequence_->materializeBlocks();
  std::vector<std::string> oldMarkdown = blockSequence_->materializeMarkdown();
  const std::string sourceText = blockSequence_->materializeSource();

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
      sourceText.size() >= lineEnding_.size() &&
      sourceText.compare(sourceText.size() - lineEnding_.size(), lineEnding_.size(), lineEnding_) == 0;
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

  resetDocument(std::move(nextSource), std::move(newBlocks));
  revision_ += 1;
  timing_.sourceBytes = static_cast<double>(blockSequence_->sourceSize());

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
    std::vector<std::string> retiredBlockIds,
    bool retainsFirstChangedBlock) const {
  std::vector<std::string> blockIds;
  std::vector<MarkdownRenderBlock> changedBlocks;
  blockIds.reserve(changedBlockIndices.size());
  changedBlocks.reserve(changedBlockIndices.size());
  for (const size_t index : changedBlockIndices) {
    if (index < blockSequence_->size()) {
      blockIds.push_back(blockSequence_->blockAt(index).id);
      changedBlocks.push_back(renderBlockForBlock(index));
    }
  }

  return MarkdownTransactionResult(
      static_cast<double>(revision_),
      static_cast<double>(blockSequence_->sourceSize()),
      MarkdownChangedRange(
          static_cast<double>(startBlockIndex),
          static_cast<double>(deleteCount),
          std::move(blockIds),
          retainsFirstChangedBlock),
      std::move(changedBlocks),
      std::move(retiredBlockIds));
}

void HybridMarkdownDocument::resetDocument(std::string source, std::vector<MarkdownBlockRange> blocks) {
  blockSequence_->reset(std::move(source), std::move(blocks));
}

std::string HybridMarkdownDocument::nextBlockId() {
  const size_t blockNumber = nextBlockNumber_;
  nextBlockNumber_ += 1;
  return documentId_ + ":b" + std::to_string(blockNumber);
}

} // namespace margelo::nitro::legendapps::markdownparser

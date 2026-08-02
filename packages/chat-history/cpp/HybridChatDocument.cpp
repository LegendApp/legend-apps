#include "HybridChatDocument.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace margelo::nitro::legendapps::chathistory {

HybridChatDocument::HybridChatDocument(
    std::string documentId,
    ChatParseResult result,
    ChatDocumentTiming timing)
    : HybridObject(TAG),
      documentId_(std::move(documentId)),
      source_(std::move(result.source)),
      rows_(std::move(result.rows)),
      warningCount_(result.warningCount),
      timing_(timing) {}

HybridChatDocument::~HybridChatDocument() {
  ChatDocumentRegistry::shared().unregisterDocument(documentId_);
}

std::string HybridChatDocument::getDocumentId() {
  return documentId_;
}

double HybridChatDocument::getRowCount() {
  return static_cast<double>(rows_.size());
}

double HybridChatDocument::getWarningCount() {
  return static_cast<double>(warningCount_);
}

size_t HybridChatDocument::checkedIndex(double index) const {
  if (!std::isfinite(index) || index < 0 || std::floor(index) != index || static_cast<size_t>(index) >= rows_.size()) {
    throw std::out_of_range("Chat row index is out of range");
  }
  return static_cast<size_t>(index);
}

ChatRowMetadata HybridChatDocument::getRowMetadata(double index) {
  const size_t rowIndex = checkedIndex(index);
  const ChatRow& row = rows_[rowIndex];
  const bool hasMarkdown = !row.markdownRanges.empty();
  return ChatRowMetadata(
      index,
      row.kind,
      hasMarkdown ? std::optional<std::string>(markdownBlockId(documentId_, rowIndex)) : std::nullopt,
      row.toolName.empty() ? std::nullopt : std::optional<std::string>(row.toolName),
      row.toolStatus.empty() ? std::nullopt : std::optional<std::string>(row.toolStatus),
      !row.previewRanges.empty(),
      row.hasImagePlaceholder);
}

std::string HybridChatDocument::decodeRanges(const std::vector<JsonRange>& ranges, size_t maximumBytes) const {
  std::shared_ptr<const ChatSource> source;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    source = source_;
  }

  std::string output;
  if (source) {
    const ChatJson json(source->data(), source->size());
    for (const JsonRange& range : ranges) {
      std::string part = json.stringValue(range);
      if (!part.empty()) {
        if (!output.empty()) {
          output.append("\n\n");
        }
        const size_t available = maximumBytes == 0 || output.size() < maximumBytes ? maximumBytes - std::min(maximumBytes, output.size()) : 0;
        if (maximumBytes == 0 || part.size() <= available) {
          output.append(part);
        } else {
          output.append(part.data(), available);
          break;
        }
      }
      if (maximumBytes > 0 && output.size() >= maximumBytes) {
        break;
      }
    }
  }
  return output;
}

std::string HybridChatDocument::markdownForRow(size_t index) {
  return index < rows_.size() ? decodeRanges(rows_[index].markdownRanges) : std::string();
}

void HybridChatDocument::setTiming(ChatDocumentTiming timing) {
  timing_ = timing;
}

std::string HybridChatDocument::getToolPreview(double index, double maximumBytes) {
  const size_t rowIndex = checkedIndex(index);
  const size_t boundedBytes = std::clamp<size_t>(
      std::isfinite(maximumBytes) && maximumBytes > 0 ? static_cast<size_t>(maximumBytes) : 0,
      0,
      64 * 1024);
  return boundedBytes > 0 ? decodeRanges(rows_[rowIndex].previewRanges, boundedBytes) : std::string();
}

ChatDocumentTiming HybridChatDocument::getTiming() {
  return timing_;
}

double HybridChatDocument::releaseNativeResources() {
  std::lock_guard<std::mutex> lock(mutex_);
  const size_t releasedBytes = source_ ? source_->externalMemorySize() : 0;
  source_.reset();
  ChatDocumentRegistry::shared().unregisterDocument(documentId_);
  return static_cast<double>(releasedBytes);
}

size_t HybridChatDocument::getExternalMemorySize() noexcept {
  std::lock_guard<std::mutex> lock(mutex_);
  return (source_ ? source_->externalMemorySize() : 0) + rows_.capacity() * sizeof(ChatRow);
}

} // namespace margelo::nitro::legendapps::chathistory

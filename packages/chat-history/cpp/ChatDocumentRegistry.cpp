#include "ChatDocument.hpp"

#include "HybridChatDocument.hpp"

#include <atomic>
#include <charconv>

namespace margelo::nitro::legendapps::chathistory {

namespace {

std::atomic<uint64_t> nextDocumentId{1};

} // namespace

std::string makeChatDocumentId() {
  return std::to_string(nextDocumentId.fetch_add(1, std::memory_order_relaxed));
}

std::string markdownBlockId(const std::string& documentId, size_t rowIndex) {
  return "chat:" + documentId + ":" + std::to_string(rowIndex);
}

ChatDocumentRegistry& ChatDocumentRegistry::shared() {
  static ChatDocumentRegistry registry;
  return registry;
}

void ChatDocumentRegistry::registerDocument(
    const std::string& documentId,
    std::weak_ptr<HybridChatDocument> document) {
  std::lock_guard<std::mutex> lock(mutex_);
  documents_[documentId] = std::move(document);
}

void ChatDocumentRegistry::unregisterDocument(const std::string& documentId) {
  std::lock_guard<std::mutex> lock(mutex_);
  documents_.erase(documentId);
}

std::string ChatDocumentRegistry::markdownForBlockId(const std::string& blockId) {
  constexpr std::string_view prefix = "chat:";
  std::shared_ptr<HybridChatDocument> document;
  size_t rowIndex = 0;
  if (blockId.starts_with(prefix)) {
    const size_t separator = blockId.find(':', prefix.size());
    if (separator != std::string::npos) {
      const std::string documentId = blockId.substr(prefix.size(), separator - prefix.size());
      const std::string_view rowText(blockId.data() + separator + 1, blockId.size() - separator - 1);
      const auto conversion = std::from_chars(rowText.data(), rowText.data() + rowText.size(), rowIndex);
      if (conversion.ec == std::errc() && conversion.ptr == rowText.data() + rowText.size()) {
        std::lock_guard<std::mutex> lock(mutex_);
        const auto found = documents_.find(documentId);
        if (found != documents_.end()) {
          document = found->second.lock();
          if (!document) {
            documents_.erase(found);
          }
        }
      }
    }
  }
  return document ? document->markdownForRow(rowIndex) : std::string();
}

} // namespace margelo::nitro::legendapps::chathistory

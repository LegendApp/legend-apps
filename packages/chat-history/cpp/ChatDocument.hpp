#pragma once

#include "ChatJson.hpp"

#include "../nitrogen/generated/shared/c++/ChatDocumentTiming.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace margelo::nitro::legendapps::chathistory {

class ChatSource {
public:
  virtual ~ChatSource() = default;
  virtual const char* data() const noexcept = 0;
  virtual size_t size() const noexcept = 0;
  virtual size_t externalMemorySize() const noexcept = 0;
};

struct ChatRow {
  std::string kind;
  std::vector<JsonRange> markdownRanges;
  std::vector<JsonRange> previewRanges;
  std::string toolName;
  std::string toolStatus;
  std::string callId;
  bool hasImagePlaceholder = false;
};

struct ChatParseResult {
  std::shared_ptr<const ChatSource> source;
  std::vector<ChatRow> rows;
  size_t recordCount = 0;
  size_t warningCount = 0;
  double mappedMs = 0;
  double scannedMs = 0;
  double normalizedMs = 0;
};

std::shared_ptr<const ChatSource> mapChatFile(const std::string& filePath);
ChatParseResult parseChatFile(
    const std::string& provider,
    const std::string& filePath,
    uint64_t generation,
    const std::atomic<uint64_t>& activeGeneration);

std::string makeChatDocumentId();
std::string markdownBlockId(const std::string& documentId, size_t rowIndex);

class ChatDocumentRegistry {
public:
  static ChatDocumentRegistry& shared();

  void registerDocument(const std::string& documentId, std::weak_ptr<class HybridChatDocument> document);
  void unregisterDocument(const std::string& documentId);
  std::string markdownForBlockId(const std::string& blockId);

private:
  std::mutex mutex_;
  std::unordered_map<std::string, std::weak_ptr<class HybridChatDocument>> documents_;
};

} // namespace margelo::nitro::legendapps::chathistory

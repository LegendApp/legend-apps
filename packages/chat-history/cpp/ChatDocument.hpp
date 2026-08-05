#pragma once

#include "ChatJson.hpp"
#include "NativeTextSource.hpp"

#include "../nitrogen/generated/shared/c++/ChatDocumentTiming.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace margelo::nitro::legendapps::chathistory {

using ChatSource = ::legendapps::nativetextsource::NativeTextSource;

struct ChatRow {
  struct FileChange {
    std::string path;
    size_t additions = 0;
    size_t deletions = 0;
  };

  std::string kind;
  std::vector<JsonRange> markdownRanges;
  std::vector<JsonRange> previewRanges;
  std::string toolName;
  std::string toolStatus;
  std::string callId;
  std::vector<std::string> imageSources;
  std::vector<FileChange> fileChanges;
  bool hasImagePlaceholder = false;
  double startedAtMs = 0;
  double endedAtMs = 0;
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

#include "HybridChatHistory.hpp"

#include "ChatCatalog.hpp"
#include "ChatDocument.hpp"
#include "HybridChatDocument.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <stdexcept>

namespace margelo::nitro::legendapps::chathistory {

namespace {

using Clock = std::chrono::steady_clock;

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

} // namespace

HybridChatHistory::HybridChatHistory() : HybridObject(TAG) {}

std::shared_ptr<Promise<std::vector<ChatSummary>>> HybridChatHistory::getRecentChats(double limit) {
  const size_t boundedLimit = std::clamp<size_t>(
      std::isfinite(limit) && limit > 0 ? static_cast<size_t>(limit) : 0,
      0,
      100);
  return Promise<std::vector<ChatSummary>>::async([boundedLimit]() {
    return getRecentChatCatalog(boundedLimit);
  });
}

std::shared_ptr<Promise<std::shared_ptr<HybridChatDocumentSpec>>> HybridChatHistory::openChat(
    const std::string& provider,
    const std::string& path) {
  const uint64_t generation = openGeneration_.fetch_add(1, std::memory_order_relaxed) + 1;
  return Promise<std::shared_ptr<HybridChatDocumentSpec>>::async([this, provider, path, generation]() {
    const auto startedAt = Clock::now();
    ChatParseResult result = parseChatFile(provider, path, generation, openGeneration_);
    const auto parsedAt = Clock::now();
    if (openGeneration_.load(std::memory_order_relaxed) != generation) {
      throw std::runtime_error("Chat open cancelled");
    }
    const std::string documentId = makeChatDocumentId();
    const double sourceBytes = static_cast<double>(result.source ? result.source->size() : 0);
    const double recordCount = static_cast<double>(result.recordCount);
    const double mappedMs = result.mappedMs;
    const double scannedMs = result.scannedMs;
    const double normalizedMs = result.normalizedMs;
    auto document = std::make_shared<HybridChatDocument>(
        documentId,
        std::move(result),
        ChatDocumentTiming(sourceBytes, recordCount, 0, 0, 0, 0, 0, 0));
    const double rowCount = document->getRowCount();
    ChatDocumentRegistry::shared().registerDocument(documentId, document);
    const auto finishedAt = Clock::now();
    document->setTiming(ChatDocumentTiming(
        sourceBytes,
        recordCount,
        rowCount,
        mappedMs,
        scannedMs,
        normalizedMs,
        elapsedMs(parsedAt, finishedAt),
        elapsedMs(startedAt, finishedAt)));
    return std::static_pointer_cast<HybridChatDocumentSpec>(document);
  });
}

double HybridChatHistory::cancelPendingOpen() {
  return static_cast<double>(openGeneration_.fetch_add(1, std::memory_order_relaxed) + 1);
}

} // namespace margelo::nitro::legendapps::chathistory

#include "HybridChatHistory.hpp"

#include "ChatCatalog.hpp"
#include "ChatDocument.hpp"
#include "HybridChatDocument.hpp"

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

HybridChatHistory::~HybridChatHistory() {
  cancelPendingOpen();
}

std::shared_ptr<Promise<std::vector<ChatSummary>>> HybridChatHistory::getRecentChats(double limit) {
  const size_t boundedLimit =
      std::isfinite(limit) && limit > 0 ? static_cast<size_t>(limit) : 0;
  return Promise<std::vector<ChatSummary>>::async([boundedLimit]() {
    return getRecentChatCatalog(boundedLimit);
  });
}

std::shared_ptr<Promise<std::shared_ptr<HybridChatDocumentSpec>>> HybridChatHistory::openChat(
    const std::string& provider,
    const std::string& path) {
  cancelPendingOpen();
  const auto activeGeneration = openGeneration_;
  const uint64_t generation = activeGeneration->load(std::memory_order_relaxed);
  startupLoad_ = takeChatStartupLoad(provider, path);
  return Promise<std::shared_ptr<HybridChatDocumentSpec>>::async([
      provider, path, generation, activeGeneration, startupLoad = startupLoad_]() {
    ChatParseResult result = startupLoad
        ? startupLoad->takeResult()
        : parseChatFile(provider, path, generation, *activeGeneration);
    const auto parsedAt = Clock::now();
    if (activeGeneration->load(std::memory_order_relaxed) != generation) {
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
        // Include work performed before JS adopted the startup request. The
        // async open's own latency can be shorter than the native parse stages.
        mappedMs + scannedMs + normalizedMs + elapsedMs(parsedAt, finishedAt)));
    return std::static_pointer_cast<HybridChatDocumentSpec>(document);
  });
}

double HybridChatHistory::cancelPendingOpen() {
  // An unclaimed startup read belongs to the host, so the app's initial
  // cancel-before-open does not discard it. After adoption, cancel it normally.
  if (startupLoad_) {
    startupLoad_->cancel();
    startupLoad_.reset();
  }
  return static_cast<double>(openGeneration_->fetch_add(1, std::memory_order_relaxed) + 1);
}

} // namespace margelo::nitro::legendapps::chathistory

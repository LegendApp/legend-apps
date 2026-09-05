#include "ChatPrefetch.hpp"

#include <atomic>
#include <future>
#include <memory>
#include <mutex>

namespace margelo::nitro::legendapps::chathistory {

namespace {

struct PrefetchedChat {
  std::string provider;
  std::string path;
  std::shared_future<std::shared_ptr<ChatParseResult>> result;
};

std::atomic<uint64_t> prefetchGeneration{0};
std::mutex prefetchMutex;
std::optional<PrefetchedChat> prefetchedChat;

} // namespace

void prefetchChatFile(const std::string& provider, const std::string& path) {
  if (provider.empty() || path.empty()) {
    return;
  }
  const uint64_t generation = prefetchGeneration.fetch_add(1, std::memory_order_relaxed) + 1;
  auto result = std::async(std::launch::async, [provider, path, generation]() {
    return std::make_shared<ChatParseResult>(
        parseChatFile(provider, path, generation, prefetchGeneration));
  }).share();
  std::lock_guard<std::mutex> lock(prefetchMutex);
  prefetchedChat = PrefetchedChat{provider, path, std::move(result)};
}

std::optional<ChatParseResult> takePrefetchedChatFile(
    const std::string& provider,
    const std::string& path) {
  std::shared_future<std::shared_ptr<ChatParseResult>> result;
  {
    std::lock_guard<std::mutex> lock(prefetchMutex);
    if (!prefetchedChat || prefetchedChat->provider != provider || prefetchedChat->path != path) {
      return std::nullopt;
    }
    result = prefetchedChat->result;
    prefetchedChat.reset();
  }
  return std::move(*result.get());
}

} // namespace margelo::nitro::legendapps::chathistory

#include "ChatStartupLoad.hpp"

#include <algorithm>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <utility>

namespace margelo::nitro::legendapps::chathistory {
namespace {

struct StartupLoad {
  std::string provider;
  std::string path;
  std::shared_ptr<ChatStartupLoad> load;
};

std::mutex startupMutex;
StartupLoad startup;
size_t startupCatalogLimit = 0;
std::shared_ptr<ChatStartupCatalog> startupCatalog;

} // namespace

ChatStartupCatalog::ChatStartupCatalog(size_t limit, const std::string& initialId, bool preloadDocument, bool requireInitialId) {
  std::packaged_task<Result()> task([limit, initialId, preloadDocument, requireInitialId]() {
    Result result;
    result.summaries = getRecentChatCatalog(limit);
    auto selected = initialId.empty()
        ? result.summaries.begin()
        : std::find_if(result.summaries.begin(), result.summaries.end(), [&](const ChatSummary& item) {
            return item.id == initialId;
          });
    if (selected == result.summaries.end() && !requireInitialId) selected = result.summaries.begin();
    if (preloadDocument && selected != result.summaries.end()) {
      result.provider = selected->provider;
      result.path = selected->path;
      result.document = std::make_shared<ChatStartupLoad>(result.provider, result.path);
    }
    return result;
  });
  result_ = task.get_future();
  std::thread(std::move(task)).detach();
}

std::vector<ChatSummary> ChatStartupCatalog::takeResult() {
  Result result = result_.get();
  if (result.document) {
    std::lock_guard<std::mutex> lock(startupMutex);
    if (startup.load) startup.load->cancel();
    startup = {std::move(result.provider), std::move(result.path), std::move(result.document)};
  }
  return std::move(result.summaries);
}

void startChatStartupCatalog(size_t limit, const std::string& initialId, bool preloadDocument, bool requireInitialId) {
  auto catalog = std::make_shared<ChatStartupCatalog>(limit, initialId, preloadDocument, requireInitialId);
  std::lock_guard<std::mutex> lock(startupMutex);
  startupCatalogLimit = limit;
  startupCatalog = std::move(catalog);
}

std::shared_ptr<ChatStartupCatalog> takeChatStartupCatalog(size_t limit) {
  std::lock_guard<std::mutex> lock(startupMutex);
  auto pending = std::exchange(startupCatalog, nullptr);
  return limit == startupCatalogLimit ? std::move(pending) : nullptr;
}

ChatStartupLoad::ChatStartupLoad(const std::string& provider, const std::string& path)
    : generation_(std::make_shared<std::atomic<uint64_t>>(1)) {
  std::packaged_task<ChatParseResult()> task([provider, path, generation = generation_]() {
    return parseChatFile(provider, path, 1, *generation);
  });
  result_ = task.get_future();
  // A packaged-task future does not join its worker when discarded. Switching
  // away must never wait for file I/O on the JS or main thread.
  std::thread(std::move(task)).detach();
}

ChatStartupLoad::~ChatStartupLoad() {
  cancel();
}

void ChatStartupLoad::cancel() {
  generation_->store(0, std::memory_order_relaxed);
}

ChatParseResult ChatStartupLoad::takeResult() {
  ChatParseResult result = result_.get();
  if (generation_->load(std::memory_order_relaxed) != 1) {
    throw std::runtime_error("Chat open cancelled");
  }
  return result;
}

void startChatStartupLoad(const std::string& provider, const std::string& path) {
  std::lock_guard<std::mutex> lock(startupMutex);
  if (startup.load) {
    startup.load->cancel();
  }
  startup = {provider, path, std::make_shared<ChatStartupLoad>(provider, path)};
}

std::shared_ptr<ChatStartupLoad> takeChatStartupLoad(const std::string& provider, const std::string& path) {
  std::lock_guard<std::mutex> lock(startupMutex);
  StartupLoad pending = std::exchange(startup, {});
  if (pending.provider == provider && pending.path == path) {
    return std::move(pending.load);
  }
  if (pending.load) {
    pending.load->cancel();
  }
  return nullptr;
}

} // namespace margelo::nitro::legendapps::chathistory

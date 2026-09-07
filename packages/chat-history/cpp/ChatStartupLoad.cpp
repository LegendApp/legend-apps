#include "ChatStartupLoad.hpp"

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

} // namespace

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

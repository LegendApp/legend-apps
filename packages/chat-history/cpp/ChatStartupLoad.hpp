#pragma once

#include "ChatDocument.hpp"

#include <future>
#include <memory>
#include <string>

namespace margelo::nitro::legendapps::chathistory {

// A single launch-time read, transferred to the first matching open. Never reused
// for subsequent opens or retained after the document has been handed to JS.
class ChatStartupLoad final {
public:
  ChatStartupLoad(const std::string& provider, const std::string& path);
  ~ChatStartupLoad();
  ChatParseResult takeResult();
  void cancel();

private:
  std::shared_ptr<std::atomic<uint64_t>> generation_;
  std::future<ChatParseResult> result_;
};

void startChatStartupLoad(const std::string& provider, const std::string& path);
std::shared_ptr<ChatStartupLoad> takeChatStartupLoad(const std::string& provider, const std::string& path);

} // namespace margelo::nitro::legendapps::chathistory

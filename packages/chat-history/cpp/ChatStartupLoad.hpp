#pragma once

#include "ChatDocument.hpp"
#include "ChatCatalog.hpp"

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

// Catalog discovery begins at native application launch. Its result and optional
// initial document are adopted once; reopen/refresh always performs fresh work.
class ChatStartupCatalog final {
public:
  ChatStartupCatalog(size_t limit, const std::string& initialId, bool preloadDocument, bool requireInitialId);
  std::vector<ChatSummary> takeResult();

private:
  struct Result {
    std::vector<ChatSummary> summaries;
    std::string provider;
    std::string path;
    std::shared_ptr<ChatStartupLoad> document;
  };
  std::future<Result> result_;
};

void startChatStartupCatalog(size_t limit, const std::string& initialId, bool preloadDocument = true, bool requireInitialId = false);
std::shared_ptr<ChatStartupCatalog> takeChatStartupCatalog(size_t limit);

void startChatStartupLoad(const std::string& provider, const std::string& path);
std::shared_ptr<ChatStartupLoad> takeChatStartupLoad(const std::string& provider, const std::string& path);

} // namespace margelo::nitro::legendapps::chathistory

#pragma once

#include "../nitrogen/generated/shared/c++/HybridChatHistorySpec.hpp"

#include "ChatStartupLoad.hpp"

#include <atomic>

namespace margelo::nitro::legendapps::chathistory {

class HybridChatHistory final : public HybridChatHistorySpec {
public:
  HybridChatHistory();
  ~HybridChatHistory() override;

  std::shared_ptr<Promise<std::vector<ChatSummary>>> getRecentChats(double limit) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridChatDocumentSpec>>> openChat(
      const std::string& provider,
      const std::string& path) override;
  double cancelPendingOpen() override;

private:
  std::shared_ptr<std::atomic<uint64_t>> openGeneration_ = std::make_shared<std::atomic<uint64_t>>(0);
  std::shared_ptr<ChatStartupLoad> startupLoad_;
};

} // namespace margelo::nitro::legendapps::chathistory

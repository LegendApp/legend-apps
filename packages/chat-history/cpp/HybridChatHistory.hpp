#pragma once

#include "../nitrogen/generated/shared/c++/HybridChatHistorySpec.hpp"

#include <atomic>

namespace margelo::nitro::legendapps::chathistory {

class HybridChatHistory final : public HybridChatHistorySpec {
public:
  HybridChatHistory();

  std::shared_ptr<Promise<std::vector<ChatSummary>>> getRecentChats(double limit) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridChatDocumentSpec>>> openChat(
      const std::string& provider,
      const std::string& path) override;
  double cancelPendingOpen() override;

private:
  std::atomic<uint64_t> openGeneration_{0};
};

} // namespace margelo::nitro::legendapps::chathistory

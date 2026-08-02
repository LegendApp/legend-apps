#pragma once

#include "ChatDocument.hpp"

#include "../nitrogen/generated/shared/c++/HybridChatDocumentSpec.hpp"

#include <mutex>

namespace margelo::nitro::legendapps::chathistory {

class HybridChatDocument final : public HybridChatDocumentSpec {
public:
  HybridChatDocument(std::string documentId, ChatParseResult result, ChatDocumentTiming timing);
  ~HybridChatDocument() override;

  std::string getDocumentId() override;
  double getRowCount() override;
  double getWarningCount() override;
  ChatRowMetadata getRowMetadata(double index) override;
  std::string getToolPreview(double index, double maximumBytes) override;
  ChatDocumentTiming getTiming() override;
  double releaseNativeResources() override;

  std::string markdownForRow(size_t index);
  void setTiming(ChatDocumentTiming timing);

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  std::string decodeRanges(const std::vector<JsonRange>& ranges, size_t maximumBytes = 0) const;
  size_t checkedIndex(double index) const;

  std::string documentId_;
  mutable std::mutex mutex_;
  std::shared_ptr<const ChatSource> source_;
  std::vector<ChatRow> rows_;
  size_t warningCount_ = 0;
  ChatDocumentTiming timing_;
};

} // namespace margelo::nitro::legendapps::chathistory

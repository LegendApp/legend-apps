#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownDocumentSpec.hpp"

#include <string>
#include <vector>

namespace margelo::nitro::legenddesktop::markdownparser {

struct MarkdownBlockRange {
  size_t index = 0;
  size_t depth = 0;
  size_t markdownStart = 0;
  size_t markdownEnd = 0;
  std::string type;
};

class HybridMarkdownDocument final : public HybridMarkdownDocumentSpec {
public:
  HybridMarkdownDocument(std::string source, std::vector<MarkdownBlockRange> blocks, MarkdownDocumentTiming timing);

  void setDocumentDurationMs(double durationMs);

  double getBlockCount() override;
  double getSourceSize() override;
  MarkdownBlockSnapshot getBlock(double index, bool includeText) override;
  std::vector<MarkdownBlockSnapshot> getBlocks(double start, double count, bool includeText) override;
  std::string getBlockMarkdown(double index) override;
  MarkdownDocumentTiming getTiming() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  MarkdownBlockSnapshot snapshotForBlock(const MarkdownBlockRange& block, bool includeText) const;
  std::string sourceString(size_t start, size_t end) const;

  std::string source_;
  std::vector<MarkdownBlockRange> blocks_;
  MarkdownDocumentTiming timing_;
};

} // namespace margelo::nitro::legenddesktop::markdownparser

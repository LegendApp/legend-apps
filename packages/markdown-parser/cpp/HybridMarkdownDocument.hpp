#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownDocumentSpec.hpp"

#include <vector>

namespace margelo::nitro::legenddesktop::markdownparser {

class HybridMarkdownDocument final : public HybridMarkdownDocumentSpec {
public:
  explicit HybridMarkdownDocument(std::vector<MarkdownBlockSnapshot> blocks);

  double getBlockCount() override;
  std::vector<MarkdownBlockSnapshot> getBlocks(double start, double count) override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  std::vector<MarkdownBlockSnapshot> blocks_;
};

} // namespace margelo::nitro::legenddesktop::markdownparser

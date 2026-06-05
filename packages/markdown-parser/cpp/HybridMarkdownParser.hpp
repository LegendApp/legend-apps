#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownParserSpec.hpp"

namespace margelo::nitro::legenddesktop::markdownparser {

class HybridMarkdownParser final : public HybridMarkdownParserSpec {
public:
  HybridMarkdownParser();

  std::shared_ptr<Promise<MarkdownFileLoadResult>> createMarkdownDocument(
      const std::string& markdown,
      double initialBlockCount) override;

  std::shared_ptr<Promise<MarkdownFileLoadResult>> loadMarkdownFile(
      const std::string& filePath,
      double initialBlockCount) override;
};

} // namespace margelo::nitro::legenddesktop::markdownparser

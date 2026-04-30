#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownParserSpec.hpp"

namespace margelo::nitro::legenddesktop::markdownparser {

class HybridMarkdownParser final : public HybridMarkdownParserSpec {
public:
  HybridMarkdownParser();

  std::shared_ptr<HybridMarkdownDocumentSpec> scanMarkdown(const std::string& markdown) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> scanMarkdownFile(
      const std::string& filePath) override;
  std::shared_ptr<HybridMarkdownDocumentSpec> parseMarkdown(const std::string& markdown, double flags) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> parseMarkdownFile(
      const std::string& filePath,
      double flags) override;
};

} // namespace margelo::nitro::legenddesktop::markdownparser

#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownParserSpec.hpp"

namespace margelo::nitro::legenddesktop::markdownparser {

class HybridMarkdownParser final : public HybridMarkdownParserSpec {
public:
  HybridMarkdownParser();

  std::shared_ptr<HybridMarkdownDocumentSpec> scanMarkdown(const std::string& markdown) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> scanMarkdownFile(
      const std::string& filePath) override;
  std::shared_ptr<Promise<MarkdownFileWindowResult>> scanMarkdownFileWindow(const std::string& filePath, double count) override;
  std::shared_ptr<Promise<MarkdownFileRenderWindowResult>> scanMarkdownFileRenderWindow(
      const std::string& filePath,
      double count) override;
  std::shared_ptr<Promise<MarkdownFileRenderWindowResult>> scanMarkdownFileLegacyRenderWindow(
      const std::string& filePath,
      double count) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> streamMarkdownFile(
      const std::string& filePath) override;
  std::shared_ptr<Promise<MarkdownFileWindowResult>> streamMarkdownFileWindow(const std::string& filePath, double count) override;
  std::shared_ptr<Promise<MarkdownFileRenderWindowResult>> streamMarkdownFileRenderWindow(
      const std::string& filePath,
      double count) override;
  std::shared_ptr<Promise<MarkdownBenchmarkSuiteResult>> benchmarkMarkdownFile(
      const std::string& filePath,
      const std::vector<std::string>& modes,
      double iterations,
      double warmups,
      double windowSize,
      double flags) override;
  std::shared_ptr<HybridMarkdownDocumentSpec> parseMarkdown(const std::string& markdown, double flags) override;
  std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> parseMarkdownFile(
      const std::string& filePath,
      double flags) override;
};

} // namespace margelo::nitro::legenddesktop::markdownparser

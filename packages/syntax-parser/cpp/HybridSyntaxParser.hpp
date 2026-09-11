#pragma once

#include "../nitrogen/generated/shared/c++/HybridSyntaxParserSpec.hpp"

namespace margelo::nitro::legendapps::syntaxparser {

class HybridSyntaxParser final : public HybridSyntaxParserSpec {
public:
  HybridSyntaxParser();
  bool isTreeGrammarLoaded(const std::string& language) override;
  std::string getGrammarPlatform() override;
  std::shared_ptr<Promise<std::string>> installTreeGrammar(const std::string& name, const std::string& url,
    const std::string& sha256, double bytes, const std::function<void(double, double)>& progress) override;

  std::shared_ptr<Promise<SyntaxHighlightResult>> highlightString(
      const std::string& source,
      const std::string& language,
      const std::string& theme) override;
  std::shared_ptr<Promise<SyntaxFileLoadResult>> loadCodeFile(
      const std::string& filePath,
      const std::string& language,
      const std::string& theme,
      double initialLineCount) override;
  std::shared_ptr<Promise<SyntaxHighlightResult>> highlightTreeString(
      const std::string& source,
      const std::string& language,
      const std::string& theme) override;
};

} // namespace margelo::nitro::legendapps::syntaxparser

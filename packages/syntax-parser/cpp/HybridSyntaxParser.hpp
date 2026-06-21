#pragma once

#include "../nitrogen/generated/shared/c++/HybridSyntaxParserSpec.hpp"

namespace margelo::nitro::legenddesktop::syntaxparser {

class HybridSyntaxParser final : public HybridSyntaxParserSpec {
public:
  HybridSyntaxParser();

  std::shared_ptr<Promise<SyntaxHighlightResult>> highlightString(
      const std::string& source,
      const std::string& language,
      const std::string& theme) override;
};

} // namespace margelo::nitro::legenddesktop::syntaxparser

#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffParserSpec.hpp"

namespace margelo::nitro::legenddesktop::diffparser {

class HybridDiffParser final : public HybridDiffParserSpec {
public:
  HybridDiffParser();

  std::shared_ptr<Promise<DiffLoadResult>> loadGitFolderDiff(
      const std::string& folderPath,
      const std::string& theme,
      double initialRowCount) override;
};

} // namespace margelo::nitro::legenddesktop::diffparser

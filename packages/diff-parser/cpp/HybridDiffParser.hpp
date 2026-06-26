#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffParserSpec.hpp"

namespace margelo::nitro::legenddesktop::diffparser {

class HybridDiffParser final : public HybridDiffParserSpec {
public:
  HybridDiffParser();

  std::shared_ptr<Promise<DiffLoadResult>> loadGitFolderDiff(
      const std::string& folderPath,
      double initialRowCount) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiff(
      const std::string& diffText,
      const std::string& sourceLabel,
      double initialRowCount) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiffFromUrl(
      const std::string& diffUrl,
      const std::string& sourceLabel,
      double initialRowCount) override;
};

} // namespace margelo::nitro::legenddesktop::diffparser

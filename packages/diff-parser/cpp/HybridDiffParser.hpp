#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffParserSpec.hpp"

namespace margelo::nitro::legendapps::diffparser {

class HybridDiffParser final : public HybridDiffParserSpec {
public:
  HybridDiffParser();

  double logTimingMark(const std::string& message) override;
  std::shared_ptr<HybridDiffLoadSessionSpec> startGitFolderDiff(
      const std::string& folderPath,
      bool showOnlyHunks,
      const std::string& compareBaseKind,
      const std::string& compareBaseRef,
      bool compareUseMergeBase,
      bool ignoreWhitespaceChanges) override;
  std::shared_ptr<HybridDiffLoadSessionSpec> startUnifiedDiffFromUrl(
      const std::string& diffUrl,
      const std::string& sourceLabel) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadGitFolderDiff(
      const std::string& folderPath,
      double initialRowCount,
      bool showOnlyHunks,
      const std::string& compareBaseKind,
      const std::string& compareBaseRef,
      bool compareUseMergeBase,
      bool ignoreWhitespaceChanges) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiff(
      const std::string& diffText,
      const std::string& sourceLabel,
      double initialRowCount,
      bool ignoreWhitespaceChanges) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiffFromUrl(
      const std::string& diffUrl,
      const std::string& sourceLabel,
      double initialRowCount,
      bool ignoreWhitespaceChanges) override;
};

} // namespace margelo::nitro::legendapps::diffparser

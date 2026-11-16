#pragma once

#include "../nitrogen/generated/shared/c++/HybridDiffParserSpec.hpp"

namespace margelo::nitro::legendapps::diffparser {

class HybridDiffParser final : public HybridDiffParserSpec {
public:
  HybridDiffParser();

  std::shared_ptr<HybridDiffLoadSessionSpec> startGitFolderDiff(
      const std::string& folderPath,
      bool showOnlyHunks,
      const std::string& compareBaseKind,
      const std::string& compareBaseRef,
      bool compareUseMergeBase,
      bool ignoreWhitespaceChanges,
      const std::vector<std::string>& excludePaths) override;
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
      bool ignoreWhitespaceChanges,
      const std::vector<std::string>& excludePaths) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiff(
      const std::string& diffText,
      const std::string& sourceLabel,
      double initialRowCount,
      bool ignoreWhitespaceChanges) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiffFile(
      const std::string& filePath,
      const std::string& sourceLabel,
      double initialRowCount,
      bool ignoreWhitespaceChanges) override;
  std::shared_ptr<Promise<DiffLoadResult>> loadUnifiedDiffFromUrl(
      const std::string& diffUrl,
      const std::string& sourceLabel,
      double initialRowCount,
      bool ignoreWhitespaceChanges) override;
  std::shared_ptr<Promise<GitHistoryHead>> openGitHistory(const std::string& folderPath, const std::string& startRef) override;
  std::shared_ptr<Promise<GitHistoryPage>> readGitHistoryPage(double handle, double offset, double count) override;
  void closeGitHistory(double handle) override;
  std::shared_ptr<Promise<double>> openGitBlame(const std::string& folderPath, const std::string& path, const std::string& source) override;
  std::shared_ptr<Promise<std::vector<GitBlameHunk>>> readGitBlame(double handle, double startLine, double lineCount) override;
  void closeGitBlame(double handle) override;
};

} // namespace margelo::nitro::legendapps::diffparser

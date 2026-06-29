#pragma once

#include "HybridDiffDocument.hpp"

#include <functional>
#include <string>
#include <vector>

namespace margelo::nitro::legenddesktop::diffparser {

struct DiffParsedDocument {
  std::vector<DiffFileSummary> files;
  std::vector<DiffRenderRow> rows;
  std::vector<DiffFileSources> fileSources;
  std::string repositoryPath;
  std::string workdirPath;
  std::string headTreeOid;
  DiffLoadTiming timing;
};

struct DiffRepositoryMetadata {
  std::string repositoryPath;
  std::string workdirPath;
  std::string headTreeOid;
};

struct DiffProgressiveCallbacks {
  std::function<bool()> shouldCancel;
  std::function<void(const std::string& phase)> onPhase;
  std::function<void(DiffRepositoryMetadata metadata)> onRepositoryMetadata;
  std::function<void(std::vector<DiffFileSummary> files, std::vector<DiffFileSources> fileSources)> onFilesDiscovered;
  std::function<void(const DiffFileSummary& file, const DiffFileSources& fileSources, const DiffRenderRow& headerRow)> onFile;
  std::function<void(const DiffRenderRow& row)> onRow;
  std::function<void(const DiffFileSummary& file)> onFileFinished;
};

DiffParsedDocument parseUnifiedDiffText(const std::string& diffText);
DiffParsedDocument parseGitRepositoryDiff(const std::string& folderPath, bool showOnlyHunks = true);
DiffLoadTiming parseGitRepositoryDiffProgressive(
    const std::string& folderPath,
    const DiffProgressiveCallbacks& callbacks,
    bool showOnlyHunks = true);
DiffLoadTiming parseGitRepositoryDiffProgressiveByFile(
    const std::string& folderPath,
    const DiffProgressiveCallbacks& callbacks,
    bool showOnlyHunks = true);
std::vector<DiffSideBySideLine> createDiffSideBySideLines(const std::vector<DiffRenderRow>& rows);

} // namespace margelo::nitro::legenddesktop::diffparser

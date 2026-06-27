#pragma once

#include "HybridDiffDocument.hpp"

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

DiffParsedDocument parseUnifiedDiffText(const std::string& diffText);
DiffParsedDocument parseGitRepositoryDiff(const std::string& folderPath);
std::vector<DiffSideBySideLine> createDiffSideBySideLines(const std::vector<DiffRenderRow>& rows);

} // namespace margelo::nitro::legenddesktop::diffparser

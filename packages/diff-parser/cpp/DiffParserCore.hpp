#pragma once

#include "HybridDiffDocument.hpp"

#include <vector>

namespace margelo::nitro::legenddesktop::diffparser {

struct DiffParsedDocument {
  std::vector<DiffFileSummary> files;
  std::vector<DiffRenderRow> rows;
  std::vector<DiffFileSources> fileSources;
  DiffLoadTiming timing;
};

DiffParsedDocument parseUnifiedDiffText(const std::string& diffText);
std::vector<DiffSideBySideLine> createDiffSideBySideLines(const std::vector<DiffRenderRow>& rows);

} // namespace margelo::nitro::legenddesktop::diffparser

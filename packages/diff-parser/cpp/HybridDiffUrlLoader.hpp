#pragma once

#include <string>

namespace margelo::nitro::legenddesktop::diffparser {

struct DiffUrlLoadResult {
  std::string text;
  double fetchMs = 0;
};

DiffUrlLoadResult loadDiffUrlText(const std::string& diffUrl);

} // namespace margelo::nitro::legenddesktop::diffparser

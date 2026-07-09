#pragma once

#include <string>
#include <functional>
#include <string_view>

namespace margelo::nitro::legendapps::diffparser {

struct DiffUrlLoadResult {
  std::string text;
  double fetchMs = 0;
};

DiffUrlLoadResult loadDiffUrlText(const std::string& diffUrl);

double loadDiffUrlChunks(
    const std::string& diffUrl,
    const std::function<void(std::string_view)>& onChunk,
    const std::function<bool()>& shouldCancel);

} // namespace margelo::nitro::legendapps::diffparser

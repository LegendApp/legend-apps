#pragma once

#include "ChatDocument.hpp"

#include <optional>
#include <string>

namespace margelo::nitro::legendapps::chathistory {

void prefetchChatFile(const std::string& provider, const std::string& path);
std::optional<ChatParseResult> takePrefetchedChatFile(const std::string& provider, const std::string& path);

} // namespace margelo::nitro::legendapps::chathistory

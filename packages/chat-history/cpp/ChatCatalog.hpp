#pragma once

#include "../nitrogen/generated/shared/c++/ChatSummary.hpp"

#include <vector>

namespace margelo::nitro::legendapps::chathistory {

std::vector<ChatSummary> getRecentChatCatalog(size_t limit);

} // namespace margelo::nitro::legendapps::chathistory

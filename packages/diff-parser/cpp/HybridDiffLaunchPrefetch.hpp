#pragma once

#include "HybridDiffLoadSession.hpp"

#include <memory>
#include <string>

namespace margelo::nitro::legendapps::diffparser {

std::shared_ptr<HybridDiffLoadSession> claimLaunchPrefetchedUnifiedDiffUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel);

void startLaunchPrefetchedUnifiedDiffUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel);

} // namespace margelo::nitro::legendapps::diffparser

#pragma once

#include <optional>
#include <string>

namespace margelo::nitro::legendapps::chathistory {

struct ChatImageDimensions {
  double width;
  double height;
};

// Reads metadata only, never pixels or network URLs. Called lazily for images
// requested by mounted rows, not while scanning the transcript.
std::optional<ChatImageDimensions> readChatImageDimensions(const std::string& source);

} // namespace margelo::nitro::legendapps::chathistory

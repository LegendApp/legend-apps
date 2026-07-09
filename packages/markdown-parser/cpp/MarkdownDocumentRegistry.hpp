#pragma once

#include <string>

namespace margelo::nitro::legendapps::markdownparser {

struct RegisteredMarkdownBlockMetadata {
  std::string id;
  std::string type;
  double headingLevel = 0;
};

RegisteredMarkdownBlockMetadata metadataForRegisteredBlockId(const std::string& blockId);
std::string markdownForRegisteredBlockId(const std::string& blockId);

} // namespace margelo::nitro::legendapps::markdownparser

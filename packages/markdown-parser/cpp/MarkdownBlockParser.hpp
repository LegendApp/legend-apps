#pragma once

#include "HybridMarkdownDocument.hpp"

#include <memory>
#include <string>
#include <vector>

namespace margelo::nitro::legenddesktop::markdownparser {

struct MarkdownParseResult {
  std::shared_ptr<const MarkdownSource> source;
  std::vector<MarkdownBlockRange> blocks;
  double readMs = 0;
  double mdParseMs = 0;
  double blockRangeMs = 0;
  double parseMs = 0;
};

std::vector<MarkdownBlockRange> parseMarkdownBlocks(const char* bytes, size_t length);
std::vector<MarkdownBlockRange> parseMarkdownBlocks(const std::string& source);
MarkdownParseResult streamMarkdownSource(std::shared_ptr<const MarkdownSource> source, double readMs);

} // namespace margelo::nitro::legenddesktop::markdownparser

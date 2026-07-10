#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace margelo::nitro::legendapps::diffparser {

struct DiffInlineChangeRange {
  size_t start = 0;
  size_t length = 0;
};

struct DiffInlineChangeResult {
  std::vector<DiffInlineChangeRange> addedRanges;
  std::vector<DiffInlineChangeRange> removedRanges;
};

DiffInlineChangeResult createDiffInlineChangeRanges(
    const std::u16string& removedText,
    const std::u16string& addedText);

double getDiffInlineLineSimilarity(
    const std::u16string& leftText,
    const std::u16string& rightText);

} // namespace margelo::nitro::legendapps::diffparser

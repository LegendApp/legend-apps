#pragma once
#include "TreeSitterHighlighter.hpp"
#include <algorithm>
#include <chrono>
#include <stdexcept>
#include <optional>

namespace margelo::nitro::legendapps::syntaxparser {
namespace tree = margelo::nitro::legendapps::syntaxparser;
struct TreeLineToken { uint32_t start, length, capture; };
struct TreeLine { size_t index; std::vector<TreeLineToken> tokens; };

// One immutable side of a diff, owned by its serial tokenization worker. Source
// preparation and parsing yield between slices; only requested rows are queried.
// No dependency on React/Nitro, so benchmarks exercise the production adapter.
class TreeSitterLineHighlighter {
  std::unique_ptr<tree::TreeSitterHighlighter> parser_;
  std::u16string text_;
  std::vector<uint32_t> starts_;
  std::vector<uint32_t> lengths_;
  size_t prepared_ = 0, byteOffset_ = 0;
  bool parsed_ = false;
  static std::u16string decode(const std::string& input, size_t& offset) {
    std::u16string output;
    const auto end = std::min(input.size(), offset + 32768);
    output.reserve(end - offset);
    while (offset < end) {
      const auto lead = static_cast<unsigned char>(input[offset]);
      const size_t width = lead < 0x80 ? 1 : lead >= 0xc2 && lead <= 0xdf ? 2
        : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
      if (!width || offset + width > input.size()) throw std::runtime_error("Invalid UTF-8 diff source");
      uint32_t scalar = lead & (width == 1 ? 0x7f : (1 << (7 - width)) - 1);
      for (size_t i = 1; i < width; ++i) {
        const auto byte = static_cast<unsigned char>(input[offset + i]);
        if ((byte & 0xc0) != 0x80) throw std::runtime_error("Invalid UTF-8 diff source");
        scalar = (scalar << 6) | (byte & 0x3f);
      }
      if ((width == 2 && scalar < 0x80) || (width == 3 && scalar < 0x800)
        || (width == 4 && scalar < 0x10000) || scalar > 0x10ffff || (scalar >= 0xd800 && scalar <= 0xdfff))
        throw std::runtime_error("Invalid UTF-8 diff source");
      offset += width;
      if (scalar < 0x10000) output.push_back(scalar);
      else { scalar -= 0x10000; output.push_back(0xd800 + (scalar >> 10)); output.push_back(0xdc00 + (scalar & 0x3ff)); }
    }
    return output;
  }
public:
  explicit TreeSitterLineHighlighter(const std::string& language)
    : parser_(std::make_unique<tree::TreeSitterHighlighter>(language)) {}
  size_t preparedLines() const { return prepared_; }
  bool ready() const { return parsed_; }
  // A provisional first screen. Callers MUST schedule the full parse and replace
  // these tokens afterward: declarations below this prefix can change captures.
  static std::optional<std::vector<TreeLine>> preview(const std::string& language,
      const std::vector<std::string>& lines, size_t requestedLine) {
    if (requestedLine >= 128 || lines.size() <= 128) return std::nullopt;
    size_t bytes = 0;
    for (size_t i = 0; i < 128; ++i) bytes += lines[i].size();
    if (bytes > 65536) return std::nullopt;
    const std::vector<std::string> prefix(lines.begin(), lines.begin() + 128);
    TreeSitterLineHighlighter highlighter(language);
    while (!highlighter.prepare(prefix, 128)) {}
    return highlighter.highlight(0, 128);
  }
  bool prepare(const std::vector<std::string>& lines, size_t budget) {
    if (parsed_) return true;
    const auto end = std::min(lines.size(), prepared_ + budget);
    const auto began = std::chrono::steady_clock::now();
    while (prepared_ < end) {
      if (byteOffset_ == 0) starts_.push_back(text_.size());
      const auto line = decode(lines[prepared_], byteOffset_);
      if (text_.size() + line.size() + 1 > UINT32_MAX / 2) throw std::length_error("Diff source exceeds Tree-sitter coordinate limit");
      text_ += line;
      if (byteOffset_ == lines[prepared_].size()) {
        lengths_.push_back(text_.size() - starts_.back()); text_ += u'\n';
        ++prepared_; byteOffset_ = 0;
      }
      if (std::chrono::steady_clock::now() - began >= std::chrono::milliseconds(2)) break;
    }
    if (prepared_ != lines.size()) return false;
    const tree::TreeSitterInput input{static_cast<uint32_t>(text_.size()), [this](uint32_t offset) {
      return std::u16string_view(text_).substr(offset, 4096);
    }};
    parsed_ = parser_->parseSlice(input, 2);
    return parsed_;
  }
  std::vector<TreeLine> highlight(size_t start, size_t count) {
    if (!parsed_) throw std::logic_error("Diff syntax is not parsed");
    const auto end = std::min(starts_.size(), start + count);
    if (start >= end) return {};
    const auto finish = end == starts_.size() ? text_.size() : starts_[end];
    const auto spans = parser_->highlight(starts_[start], finish);
    std::vector<TreeLine> rows;
    size_t cursor = 0;
    for (auto index = start; index < end; ++index) {
      const auto offset = starts_[index], limit = offset + lengths_[index];
      while (cursor < spans.size() && spans[cursor].start + spans[cursor].length <= offset) ++cursor;
      TreeLine row{index, {}};
      for (auto i = cursor; i < spans.size() && spans[i].start < limit; ++i) {
        const auto a = std::max(offset, spans[i].start), b = std::min(limit, spans[i].start + spans[i].length);
        if (a < b) row.tokens.push_back({a - offset, b - a, spans[i].captureId});
      }
      rows.push_back(std::move(row));
    }
    return rows;
  }
  std::vector<std::string> captures() const { return parser_->captures(); }
  std::vector<std::string> missingLanguages() const { return parser_->missingLanguages(); }
};
}

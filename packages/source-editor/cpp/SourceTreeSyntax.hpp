#pragma once

#include "SourceDocument.hpp"
#include "../../syntax-parser/cpp/TreeSitterHighlighter.hpp"
#include <atomic>
#include <thread>

namespace legend::source {
namespace tree = margelo::nitro::legendapps::syntaxparser;

struct SourceSyntaxToken {
  uint32_t start, length, capture;
  bool operator==(const SourceSyntaxToken&) const = default;
};
struct SourceSyntaxRow {
  size_t index;
  std::vector<SourceSyntaxToken> tokens;
};

// Owned by one serial worker. Only cancellation is accessed concurrently. Text
// arrives in bounded UTF-16 chunks or ordered edits, never via a live UI pointer.
class SourceTreeSyntax {
  SourceDocument document_;
  std::unique_ptr<tree::TreeSitterHighlighter> parser_;
  std::string language_;
  bool parsed_ = false, dirty_ = true;
  std::u16string readBuffer_;
  size_t readStart_ = 0;
  uint64_t nextChunkId_ = 1;
  std::pair<size_t, size_t> invalidated_{0, 0};
public:
  std::atomic_bool cancelled{false};
  explicit SourceTreeSyntax(std::string language) : language_(std::move(language)) {}
  size_t length() const { return document_.length(); }
  size_t lineCount() const { return document_.lineCount(); }
  void replace(size_t start, size_t removed, const std::u16string& inserted) {
    if (cancelled) return;
    auto a = document_.syntaxPosition(start), b = document_.syntaxPosition(start + removed);
    if (start == document_.length() && removed == 0) {
      // Reusing the default seed for every chunk creates equal treap priorities
      // and a deep spine. Distinct line IDs also seed independently balanced chunks.
      SourceDocument chunk(inserted, nextChunkId_);
      nextChunkId_ += chunk.lineCount();
      document_.appendLoaded(std::move(chunk));
    } else document_.replace(start, removed, inserted);
    readBuffer_.clear();
    auto c = document_.syntaxPosition(start + inserted.size());
    if (parsed_) parser_->edit({static_cast<uint32_t>(start), static_cast<uint32_t>(start + removed),
      static_cast<uint32_t>(start + inserted.size()),
      {static_cast<uint32_t>(a.line), static_cast<uint32_t>(a.column)},
      {static_cast<uint32_t>(b.line), static_cast<uint32_t>(b.column)},
      {static_cast<uint32_t>(c.line), static_cast<uint32_t>(c.column)}});
    dirty_ = true;
  }
  bool parse() {
    if (cancelled) return false;
    if (!dirty_) return true;
    if (!parser_) parser_ = std::make_unique<tree::TreeSitterHighlighter>(language_);
    if (document_.length() > UINT32_MAX / 2) throw std::length_error("Source exceeds Tree-sitter's coordinate limit");
    const tree::TreeSitterInput input{static_cast<uint32_t>(document_.length()), [this](uint32_t offset) {
      // Predicates often reread adjacent identifiers. Reuse this immutable read
      // window instead of allocating/copying 4K units for each tiny identifier.
      if (offset < readStart_ || offset >= readStart_ + readBuffer_.size()) {
        readStart_ = offset;
        readBuffer_ = document_.slice(offset, std::min<size_t>(4096, document_.length() - offset));
      }
      return std::u16string_view(readBuffer_).substr(offset - readStart_);
    }};
    // The serial job owns this snapshot until completion: queued mutations cannot
    // change it between slices. Yield CPU without restarting on every keystroke.
    bool ok = false;
    while (!cancelled && !(ok = parser_->parseSlice(input, 4, &cancelled))) std::this_thread::yield();
    if (ok) {
      parsed_ = true; dirty_ = false;
      const auto range = parser_->invalidatedRange();
      invalidated_ = {document_.position(range.first).line, document_.position(range.second).line + 1};
    }
    return ok;
  }
  std::vector<SourceSyntaxRow> highlight(size_t start, size_t count) {
    if (dirty_) throw std::logic_error("Source syntax is not parsed");
    const auto end = std::min(start + count, document_.lineCount());
    const auto first = document_.lineOffset(start);
    const auto last = end == document_.lineCount() ? document_.length() : document_.lineOffset(end);
    const auto spans = parser_->highlight(static_cast<uint32_t>(first), static_cast<uint32_t>(last), &cancelled);
    std::vector<SourceSyntaxRow> rows;
    size_t token = 0;
    for (auto index = start; index < end; ++index) {
      const auto offset = document_.lineOffset(index), finish = offset + document_.line(index).text.size();
      SourceSyntaxRow row{index, {}};
      while (token < spans.size() && spans[token].start + spans[token].length <= offset) ++token;
      for (auto i = token; i < spans.size() && spans[i].start < finish; ++i) {
        const auto from = std::max<size_t>(offset, spans[i].start);
        row.tokens.push_back({static_cast<uint32_t>(from - offset),
          static_cast<uint32_t>(std::min<size_t>(finish, spans[i].start + spans[i].length) - from),
          spans[i].captureId});
      }
      rows.push_back(std::move(row));
    }
    return rows;
  }
  const std::vector<std::string>& captures() const { return parser_->captures(); }
  std::string rootScope() const { return parser_->rootScope(); }
  std::pair<size_t, size_t> takeInvalidatedLines() {
    auto range = invalidated_; invalidated_ = {0, 0}; return range;
  }
};
}

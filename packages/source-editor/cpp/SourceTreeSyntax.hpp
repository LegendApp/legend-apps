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
  uint32_t from = 0, to = UINT32_MAX;
};
struct SourceSyntaxWindow {
  std::vector<SourceSyntaxRow> rows;
  size_t nextOffset = 0;
};

// Replace only the queried interval, including unstyled gaps. Binary searches
// avoid rescanning a long row on every background append. Coalesce boundary
// tokens so windowed results are identical to a whole-row query.
inline bool mergeSyntaxRow(std::vector<SourceSyntaxToken>& tokens, const SourceSyntaxRow& row) {
  if (row.from == 0 && row.to == UINT32_MAX) {
    if (tokens == row.tokens) return false;
    tokens = row.tokens;
    return true;
  }
  auto first = std::lower_bound(tokens.begin(), tokens.end(), row.from,
    [](const auto& token, uint32_t at) { return token.start + token.length <= at; });
  auto last = std::lower_bound(first, tokens.end(), row.to,
    [](const auto& token, uint32_t at) { return token.start < at; });
  std::vector<SourceSyntaxToken> patch;
  patch.reserve(row.tokens.size() + 2);
  const auto append = [&](SourceSyntaxToken token) {
    if (!token.length) return;
    if (!patch.empty() && patch.back().capture == token.capture && patch.back().start + patch.back().length == token.start)
      patch.back().length += token.length;
    else patch.push_back(token);
  };
  if (first != tokens.begin()) --first;
  for (auto i = first; i != last && i->start < row.from; ++i)
    append({i->start, std::min(i->length, row.from - i->start), i->capture});
  for (const auto& token : row.tokens) append(token);
  if (last != first) {
    const auto& tail = *std::prev(last);
    if (tail.start + tail.length > row.to) append({row.to, tail.start + tail.length - row.to, tail.capture});
  }
  if (last != tokens.end()) append(*last++);
  if (static_cast<size_t>(last - first) == patch.size() && std::equal(first, last, patch.begin())) return false;
  const auto at = first - tokens.begin();
  tokens.erase(first, last);
  tokens.insert(tokens.begin() + at, patch.begin(), patch.end());
  return true;
}

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
    else if (parser_) parser_->reset(); // Abandon a suspended first parse before mutating its snapshot.
    dirty_ = true;
  }
  bool parse() {
    while (!cancelled) { if (parseSlice()) return true; std::this_thread::yield(); }
    return false;
  }
  // Return to the owner's serial queue between slices. replace() abandons any
  // suspended parse before the next slice observes its new snapshot.
  bool parseSlice(double milliseconds = 4, const std::atomic_bool* interrupted = nullptr) {
    if (cancelled) return false;
    if (interrupted && interrupted->load()) return false;
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
    const bool ok = parser_->parseSlice(input, milliseconds, interrupted ? interrupted : &cancelled);
    if (ok) {
      parsed_ = true; dirty_ = false;
      const auto range = parser_->invalidatedRange();
      invalidated_ = {document_.position(range.first).line, document_.position(range.second).line + 1};
    }
    return ok;
  }
  std::vector<SourceSyntaxRow> highlight(size_t start, size_t count, const std::atomic_bool* interrupted = nullptr) {
    if (dirty_) throw std::logic_error("Source syntax is not parsed");
    const auto end = std::min(start + count, document_.lineCount());
    const auto first = document_.lineOffset(start);
    const auto last = end == document_.lineCount() ? document_.length() : document_.lineOffset(end);
    return highlightRange(start, end, first, last, interrupted);
  }
  SourceSyntaxWindow highlightWindow(size_t first, size_t last, size_t maxUnits = 8192, const std::atomic_bool* interrupted = nullptr) {
    if (dirty_) throw std::logic_error("Source syntax is not parsed");
    if (first > last || first > document_.length() || maxUnits < 2) throw std::out_of_range("Invalid syntax window");
    last = std::min(last, first + std::min(maxUnits, document_.length() - first));
    // Keep UTF-16 pairs intact at the budget boundary, including a viewport
    // that begins in the low half of a pair.
    if (first && first < last) {
      const auto c = document_.slice(first, 1)[0];
      if (c >= 0xdc00 && c <= 0xdfff) --first;
    }
    if (last < document_.length() && last > first) {
      const auto c = document_.slice(last - 1, 1)[0];
      if (c >= 0xd800 && c <= 0xdbff) --last;
    }
    const auto start = document_.position(first), finish = document_.position(last);
    const auto endLine = last == document_.length() ? document_.lineCount() : finish.line + (finish.column != 0);
    return {highlightRange(start.line, endLine, first, last, interrupted), last};
  }
private:
  std::vector<SourceSyntaxRow> highlightRange(size_t start, size_t end, size_t first, size_t last, const std::atomic_bool* interrupted) {
    const auto spans = parser_->highlight(static_cast<uint32_t>(first), static_cast<uint32_t>(last), interrupted ? interrupted : &cancelled);
    std::vector<SourceSyntaxRow> rows;
    rows.reserve(end - start);
    size_t token = 0;
    document_.forEachLine(start, end - start, [&](size_t index, size_t offset, const Line& line) {
      const auto finish = offset + line.text.size();
      SourceSyntaxRow row{index, {}, static_cast<uint32_t>(first > offset ? std::min(first - offset, line.text.size()) : 0),
        last >= finish ? UINT32_MAX : static_cast<uint32_t>(last - offset)};
      while (token < spans.size() && spans[token].start + spans[token].length <= offset) ++token;
      for (auto i = token; i < spans.size() && spans[i].start < finish; ++i) {
        const auto from = std::max<size_t>(offset, spans[i].start);
        if (from >= finish) continue; // Multiline captures can cross an empty row.
        row.tokens.push_back({static_cast<uint32_t>(from - offset),
          static_cast<uint32_t>(std::min<size_t>(finish, spans[i].start + spans[i].length) - from),
          spans[i].captureId});
      }
      rows.push_back(std::move(row));
    });
    return rows;
  }
public:
  std::vector<std::string> captures() const { return parser_->captures(); }
  size_t captureCount() const { return tree::TreeSitterHighlighter::captureCount(); }
  std::vector<std::string> missingLanguages() const { return parser_ ? parser_->missingLanguages() : std::vector<std::string>{}; }
  std::string rootScope() const { return parser_->rootScope(); }
  std::pair<size_t, size_t> takeInvalidatedLines() {
    auto range = invalidated_; invalidated_ = {0, 0}; return range;
  }
};
}

#pragma once
#include "SourceDocument.hpp"

namespace legend::source {
struct EditingPlan {
  size_t offset, removed;
  std::u16string text;
  size_t anchor, head;
};
inline std::u16string preferredEnding(const SourceDocument& doc, size_t line) {
  if (!doc.line(line).ending.empty()) return doc.line(line).ending;
  for (size_t i = 0; i < std::min<size_t>(doc.lineCount(), 128); ++i)
    if (!doc.line(i).ending.empty()) return doc.line(i).ending;
  return u"\n";
}
inline std::pair<size_t, size_t> selectedLines(const SourceDocument& doc, size_t anchor, size_t head) {
  const auto from = std::min(anchor, head), to = std::max(anchor, head);
  const auto first = doc.position(from).line;
  auto last = doc.position(to).line;
  if (to > from && last > first && doc.lineOffset(last) == to) --last;
  return {first, last};
}
inline EditingPlan indentLines(const SourceDocument& doc, size_t anchor, size_t head, const std::u16string& unit, bool outdent) {
  const auto [first, last] = selectedLines(doc, anchor, head);
  const auto start = doc.lineOffset(first), end = doc.lineOffset(last) + doc.line(last).size();
  EditingPlan result{start, end - start, {}, anchor, head};
  int64_t delta = 0;
  for (size_t i = first; i <= last; ++i) {
    const auto& line = doc.line(i);
    size_t removed = 0;
    if (outdent) {
      if (line.text.starts_with(u"\t")) removed = 1;
      else while (removed < std::max<size_t>(unit.size(), 1) && removed < line.text.size() && line.text[removed] == u' ') ++removed;
    }
    const auto added = outdent ? std::u16string() : unit;
    const auto position = doc.lineOffset(i);
    const auto adjust = [&](size_t original, size_t& mapped) {
      if (original >= position) mapped = static_cast<size_t>(static_cast<int64_t>(original) + delta - std::min(removed, original - position) + added.size());
    };
    adjust(anchor, result.anchor); adjust(head, result.head);
    result.text += added + line.text.substr(removed) + line.ending;
    delta += static_cast<int64_t>(added.size()) - removed;
  }
  return result;
}
inline EditingPlan newline(const SourceDocument& doc, size_t anchor, size_t head, const std::u16string& unit) {
  const auto start = std::min(anchor, head), end = std::max(anchor, head);
  const auto position = doc.position(start);
  const auto& line = doc.line(position.line);
  size_t count = 0;
  while (count < std::min(position.column, line.text.size()) && (line.text[count] == u' ' || line.text[count] == u'\t')) ++count;
  const auto indent = line.text.substr(0, count), ending = preferredEnding(doc, position.line);
  auto text = ending + indent;
  const auto before = std::min(position.column, line.text.size());
  const char16_t previous = before ? line.text[before - 1] : 0;
  if (previous == u'{' || previous == u'[' || previous == u'(') text += unit;
  const auto caret = start + text.size();
  const auto next = end < doc.length() ? doc.slice(end, 1)[0] : 0;
  if ((previous == u'{' && next == u'}') || (previous == u'[' && next == u']') || (previous == u'(' && next == u')')) text += ending + indent;
  return {start, end - start, text, caret, caret};
}
inline EditingPlan duplicateLines(const SourceDocument& doc, size_t anchor, size_t head) {
  const auto [first, last] = selectedLines(doc, anchor, head);
  const auto start = doc.lineOffset(first), end = doc.lineOffset(last) + doc.line(last).size();
  auto text = doc.slice(start, end - start);
  size_t shift = end - start;
  if (doc.line(last).ending.empty()) { auto ending = preferredEnding(doc, last); text = ending + text; shift += ending.size(); }
  return {end, 0, text, anchor + shift, head + shift};
}
inline EditingPlan moveLines(const SourceDocument& doc, size_t anchor, size_t head, bool down) {
  const auto [first, last] = selectedLines(doc, anchor, head);
  if ((!down && first == 0) || (down && last + 1 == doc.lineCount())) return {0, 0, {}, anchor, head};
  const auto begin = down ? first : first - 1, finish = down ? last + 1 : last;
  std::vector<size_t> order;
  if (down) order.push_back(last + 1);
  for (size_t i = first; i <= last; ++i) order.push_back(i);
  if (!down) order.push_back(first - 1);
  std::u16string text;
  const auto start = doc.lineOffset(begin), end = doc.lineOffset(finish) + doc.line(finish).size();
  size_t mappedAnchor = anchor, mappedHead = head;
  const auto blockEnd = doc.lineOffset(last) + doc.line(last).size();
  for (size_t i = 0; i < order.size(); ++i) {
    const auto original = order[i], oldStart = doc.lineOffset(original), newStart = start + text.size();
    // Keep newline separators at their positions, including mixed CRLF/LF and EOF.
    text += doc.line(original).text + doc.line(begin + i).ending;
    if (original < first || original > last) continue;
    const auto map = [&](size_t offset, size_t& mapped) {
      if (original == last && offset == blockEnd && !doc.line(last).ending.empty()) mapped = start + text.size();
      else if (offset >= oldStart && offset <= oldStart + doc.line(original).text.size()) mapped = newStart + offset - oldStart;
    };
    map(anchor, mappedAnchor); map(head, mappedHead);
  }
  return {start, end - start, text, mappedAnchor, mappedHead};
}
inline EditingPlan toggleComments(const SourceDocument& doc, size_t anchor, size_t head, const std::u16string& marker) {
  const auto [first, last] = selectedLines(doc, anchor, head);
  bool remove = true;
  for (size_t i = first; i <= last; ++i) {
    const auto& text = doc.line(i).text;
    const auto offset = text.find_first_not_of(u" \t");
    if (offset != std::u16string::npos && text.substr(offset, marker.size()) != marker) remove = false;
  }
  const auto start = doc.lineOffset(first), end = doc.lineOffset(last) + doc.line(last).size();
  std::u16string text;
  size_t mappedAnchor = anchor, mappedHead = head;
  int64_t delta = 0;
  for (size_t i = first; i <= last; ++i) {
    auto value = doc.line(i).text;
    const auto at = value.find_first_not_of(u" \t");
    if (at != std::u16string::npos) {
      size_t removed = 0, added = 0;
      if (remove) { removed = marker.size(); if (at + removed < value.size() && value[at + removed] == u' ') ++removed; value.erase(at, removed); }
      else { added = marker.size() + 1; value.insert(at, marker + u" "); }
      const auto position = doc.lineOffset(i) + at;
      const auto map = [&](size_t offset, size_t& mapped) {
        if (offset >= position) mapped = static_cast<size_t>(static_cast<int64_t>(offset) + delta - std::min(removed, offset - position) + added);
      };
      map(anchor, mappedAnchor); map(head, mappedHead);
      delta += static_cast<int64_t>(added) - removed;
    }
    text += value + doc.line(i).ending;
  }
  return {start, end - start, text, mappedAnchor, mappedHead};
}
} // namespace legend::source

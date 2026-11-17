#include "../cpp/DiffRowSelection.hpp"

#include <iostream>
#include <map>
#include <stdexcept>
#include <string>

namespace diffparser = margelo::nitro::legendapps::diffparser;
using diffparser::DiffSelectionPoint;
using diffparser::DiffSelectionRowText;

namespace {

int failures = 0;

void expect(bool condition, const std::string& message)
{
  if (!condition) {
    failures += 1;
    std::cerr << "FAIL: " << message << "\n";
  }
}

std::string utf8(const std::u16string& text)
{
  std::string out;
  for (size_t index = 0; index < text.size(); index += 1) {
    char32_t code = text[index];
    if (diffparser::isDiffHighSurrogate(text[index]) && index + 1 < text.size()) {
      code = 0x10000 + ((code - 0xD800) << 10) + (text[index + 1] - 0xDC00);
      index += 1;
    }
    if (code < 0x80) {
      out.push_back(static_cast<char>(code));
    } else if (code < 0x800) {
      out.push_back(static_cast<char>(0xC0 | (code >> 6)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    } else if (code < 0x10000) {
      out.push_back(static_cast<char>(0xE0 | (code >> 12)));
      out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xF0 | (code >> 18)));
      out.push_back(static_cast<char>(0x80 | ((code >> 12) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
    }
  }
  return out;
}

// Rows without an entry have no text on the selected side (headers, the other side's rows).
diffparser::DiffSelectionRowTextProvider rows(const std::map<double, DiffSelectionRowText>& byRow)
{
  return [byRow](double row) -> std::optional<DiffSelectionRowText> {
    const auto found = byRow.find(row);
    if (found == byRow.end()) {
      return std::nullopt;
    }
    return found->second;
  };
}

void expectPayload(
    const std::optional<diffparser::DiffSelectionPayload>& payload,
    double anchorRow,
    size_t anchorColumn,
    double focusRow,
    size_t focusColumn,
    const std::u16string& text,
    const std::string& label)
{
  expect(payload.has_value(), label + ": payload exists");
  if (!payload) {
    return;
  }
  expect(payload->anchorRowIndex == anchorRow, label + ": anchor row " + std::to_string(payload->anchorRowIndex));
  expect(payload->anchorColumn == anchorColumn, label + ": anchor column " + std::to_string(payload->anchorColumn));
  expect(payload->focusRowIndex == focusRow, label + ": focus row " + std::to_string(payload->focusRowIndex));
  expect(payload->focusColumn == focusColumn, label + ": focus column " + std::to_string(payload->focusColumn));
  expect(payload->selectedText == text, label + ": text \"" + utf8(payload->selectedText) + "\"");
}

void expectRange(const std::optional<diffparser::DiffTextRange>& range, size_t start, size_t end, const std::string& label)
{
  expect(range.has_value(), label + ": range exists");
  if (range) {
    expect(range->start == start && range->end == end,
        label + ": got " + std::to_string(range->start) + ".." + std::to_string(range->end));
  }
}

void testPayloads()
{
  const auto twoRows = rows({
    {4, {u"const a = 1;", 4}},
    {5, {u"const b = 2;", 5}},
  });
  expectPayload(buildDiffSelectionPayload({4, 6}, {5, 7}, twoRows), 4, 6, 5, 7, u"a = 1;\nconst b", "across rows");
  expectPayload(buildDiffSelectionPayload({5, 7}, {4, 6}, twoRows), 5, 7, 4, 6, u"a = 1;\nconst b", "backwards across rows");
  expectPayload(buildDiffSelectionPayload({4, 9}, {4, 3}, twoRows), 4, 9, 4, 3, u"st a =", "backwards in one row");
  expect(!buildDiffSelectionPayload({4, 3}, {4, 3}, twoRows).has_value(), "caret has no payload");
  expect(!buildDiffSelectionPayload({-1, 0}, {4, 3}, twoRows).has_value(), "cleared selection has no payload");

  expectPayload(buildDiffSelectionPayload({4, 40}, {5, 400}, twoRows), 4, 12, 5, 12, u"\nconst b = 2;", "columns past row end clip");

  // Select all: unbounded focus column and endpoints on rows without text (file and hunk headers).
  const auto withHeaders = rows({
    {1, {u"x", 11}},
    {2, {u"", 12}},
    {4, {u"y\tz", 14}},
  });
  expectPayload(buildDiffSelectionPayload({0, 0}, {5, static_cast<size_t>(-1)}, withHeaders), 11, 0, 14, 3, u"x\n\ny\tz",
      "select all moves endpoints onto text rows and maps source rows");
  expectPayload(buildDiffSelectionPayload({5, static_cast<size_t>(-1)}, {0, 0}, withHeaders), 14, 3, 11, 0, u"x\n\ny\tz",
      "backwards select all keeps direction");
  expectPayload(buildDiffSelectionPayload({2, 0}, {4, 2}, withHeaders), 12, 0, 14, 2, u"\ny\t", "empty row and tab");
  expect(!buildDiffSelectionPayload({2, 0}, {3, 0}, withHeaders).has_value(), "only an empty row has no payload");

  const std::u16string emoji = u"a\U0001F600b";  // a, U+1F600 (two code units), b
  const auto emojiRows = rows({{0, {emoji, 0}}, {1, {u"éx", 1}}});
  expectPayload(buildDiffSelectionPayload({0, 1}, {0, 3}, emojiRows), 0, 1, 0, 3, u"\U0001F600", "emoji columns are UTF-16");
  expectPayload(buildDiffSelectionPayload({0, 3}, {1, 2}, emojiRows), 0, 3, 1, 2, u"b\né", "combining mark kept");
}

void testRowRanges()
{
  using diffparser::diffSelectionRangeForRow;
  expectRange(diffSelectionRangeForRow({2, 3}, {4, 1}, 2, 10), 3, 10, "start row runs to end");
  expectRange(diffSelectionRangeForRow({2, 3}, {4, 1}, 3, 10), 0, 10, "middle row is whole");
  expectRange(diffSelectionRangeForRow({2, 3}, {4, 1}, 4, 10), 0, 1, "end row runs from start");
  expectRange(diffSelectionRangeForRow({4, 1}, {2, 3}, 2, 10), 3, 10, "backwards start row");
  expectRange(diffSelectionRangeForRow({2, 30}, {2, 40}, 2, 10), 10, 10, "past end clips to empty");
  expect(!diffSelectionRangeForRow({2, 3}, {4, 1}, 5, 10).has_value(), "row after the selection");
  expect(!diffSelectionRangeForRow({2, 3}, {4, 1}, 1, 10).has_value(), "row before the selection");
}

void testHighlightClipping()
{
  using diffparser::clipDiffTextRange;
  expectRange(clipDiffTextRange(u"hello", 1, 3), 1, 3, "plain");
  expectRange(clipDiffTextRange(u"hello", 2, 400), 2, 5, "past row end");
  expectRange(clipDiffTextRange(u"hello", -4, 2), 0, 2, "negative start");
  expect(!clipDiffTextRange(u"hello", 5, 9).has_value(), "starts at row end");
  expect(!clipDiffTextRange(u"hello", 3, 3).has_value(), "empty range");
  expect(!clipDiffTextRange(u"hello", 4, 2).has_value(), "reversed range");
  expect(!clipDiffTextRange(u"", 0, 3).has_value(), "empty row");
  expect(!clipDiffTextRange(u"hello", std::nan(""), 3).has_value(), "NaN start");

  const std::u16string emoji = u"a\U0001F600b";
  expectRange(clipDiffTextRange(emoji, 1, 3), 1, 3, "whole emoji");
  expectRange(clipDiffTextRange(emoji, 2, 4), 1, 4, "start inside a surrogate pair widens back");
  expectRange(clipDiffTextRange(emoji, 0, 2), 0, 3, "end inside a surrogate pair widens forward");
  expectRange(clipDiffTextRange(u"\U0001F44D\U0001F3FD", 0, 2), 0, 2, "emoji modifier is its own code point");

  const std::u16string combining = u"café!";  // e + U+0301
  expectRange(clipDiffTextRange(combining, 3, 4), 3, 5, "end before a combining mark keeps it");
  expectRange(clipDiffTextRange(combining, 4, 6), 3, 6, "start on a combining mark moves to its base");
  expectRange(clipDiffTextRange(u"a️‍❤b", 0, 1), 0, 3, "variation selector and ZWJ");

  expectRange(clipDiffTextRange(u"\tx\ty", 0, 1), 0, 1, "tab is one column");
  expectRange(clipDiffTextRange(u"\tx\ty", 1.2, 2.5), 1, 3, "fractional columns widen");
}

} // namespace

int main()
{
  testPayloads();
  testRowRanges();
  testHighlightClipping();
  if (failures > 0) {
    std::cerr << failures << " diff row selection checks failed\n";
    return 1;
  }
  std::cout << "diff row selection checks passed\n";
  return 0;
}

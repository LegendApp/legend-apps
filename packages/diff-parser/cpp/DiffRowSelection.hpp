#pragma once

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <functional>
#include <optional>
#include <string>
#include <utility>

namespace margelo::nitro::legendapps::diffparser {

// Rows are view row indexes (document rows in unified, projection rows in blocks); columns are UTF-16
// offsets in a row's text and may exceed it (select-all stores an unbounded focus column).
struct DiffSelectionPoint {
  double row = -1;
  size_t column = 0;
};

struct DiffSelectionRowText {
  std::u16string text;
  double sourceRowIndex = -1;
};

using DiffSelectionRowTextProvider = std::function<std::optional<DiffSelectionRowText>(double row)>;

struct DiffSelectionPayload {
  double anchorRowIndex = -1;
  size_t anchorColumn = 0;
  double focusRowIndex = -1;
  size_t focusColumn = 0;
  std::u16string selectedText;
};

struct DiffTextRange {
  size_t start = 0;
  size_t end = 0;
};

inline bool diffSelectionIsBackwards(const DiffSelectionPoint& anchor, const DiffSelectionPoint& focus)
{
  return anchor.row > focus.row || (anchor.row == focus.row && anchor.column > focus.column);
}

// The selected part of one row, or nothing when the row is outside the selection.
inline std::optional<DiffTextRange> diffSelectionRangeForRow(
    DiffSelectionPoint anchor,
    DiffSelectionPoint focus,
    double row,
    size_t textLength)
{
  if (diffSelectionIsBackwards(anchor, focus)) {
    std::swap(anchor, focus);
  }
  const double safeRow = std::floor(row);
  if (safeRow < anchor.row || safeRow > focus.row) {
    return std::nullopt;
  }
  const size_t start = safeRow == anchor.row ? std::min(anchor.column, textLength) : 0;
  const size_t end = safeRow == focus.row ? std::min(focus.column, textLength) : textLength;
  return DiffTextRange{start, std::max(start, end)};
}

inline bool isDiffLowSurrogate(char16_t unit)
{
  return unit >= 0xDC00 && unit <= 0xDFFF;
}

inline bool isDiffHighSurrogate(char16_t unit)
{
  return unit >= 0xD800 && unit <= 0xDBFF;
}

// Code units that continue the character before them: combining marks, variation selectors and ZWJ.
inline bool isDiffClusterExtender(char16_t unit)
{
  return (unit >= 0x0300 && unit <= 0x036F)
    || (unit >= 0x1AB0 && unit <= 0x1AFF)
    || (unit >= 0x1DC0 && unit <= 0x1DFF)
    || (unit >= 0x20D0 && unit <= 0x20FF)
    || (unit >= 0xFE00 && unit <= 0xFE0F)
    || (unit >= 0xFE20 && unit <= 0xFE2F)
    || unit == 0x200D;
}

inline bool isDiffInsideCharacter(const std::u16string& text, size_t offset)
{
  if (offset == 0 || offset >= text.size()) {
    return false;
  }
  const char16_t unit = text[offset];
  return (isDiffLowSurrogate(unit) && isDiffHighSurrogate(text[offset - 1])) || isDiffClusterExtender(unit);
}

// Clips a host range to the row text and widens it so it never splits a surrogate pair or strips a
// combining mark from its base. Returns nothing for an empty, reversed or fully out-of-row range.
inline std::optional<DiffTextRange> clipDiffTextRange(const std::u16string& text, double start, double end)
{
  if (!std::isfinite(start) || !std::isfinite(end)) {
    return std::nullopt;
  }
  const double length = static_cast<double>(text.size());
  const double clippedStart = std::clamp(std::floor(start), 0.0, length);
  const double clippedEnd = std::clamp(std::ceil(end), 0.0, length);
  if (clippedEnd <= clippedStart) {
    return std::nullopt;
  }
  size_t safeStart = static_cast<size_t>(clippedStart);
  size_t safeEnd = static_cast<size_t>(clippedEnd);
  while (isDiffInsideCharacter(text, safeStart)) {
    safeStart -= 1;
  }
  while (isDiffInsideCharacter(text, safeEnd)) {
    safeEnd += 1;
  }
  return DiffTextRange{safeStart, safeEnd};
}

// Builds what the host receives for the current selection: endpoints moved onto the first and last rows
// that have text on the selected side, columns clipped to those rows, direction kept, rows mapped to
// source row indexes, and the selected text joined with "\n" exactly as Copy builds it.
inline std::optional<DiffSelectionPayload> buildDiffSelectionPayload(
    const DiffSelectionPoint& anchor,
    const DiffSelectionPoint& focus,
    const DiffSelectionRowTextProvider& rowText)
{
  if (anchor.row < 0 || focus.row < 0) {
    return std::nullopt;
  }
  const bool backwards = diffSelectionIsBackwards(anchor, focus);
  const DiffSelectionPoint& first = backwards ? focus : anchor;
  const DiffSelectionPoint& last = backwards ? anchor : focus;

  std::optional<DiffSelectionPoint> start;
  std::optional<DiffSelectionPoint> end;
  std::optional<DiffSelectionRowText> startRow;
  std::optional<DiffSelectionRowText> endRow;
  std::u16string selectedText;
  bool hasLine = false;
  for (double row = std::floor(first.row); row <= std::floor(last.row); row += 1) {
    auto line = rowText(row);
    if (!line.has_value()) {
      continue;
    }
    const auto range = diffSelectionRangeForRow(first, last, row, line->text.size());
    if (!range.has_value()) {
      continue;
    }
    if (hasLine) {
      selectedText.push_back(u'\n');
    }
    hasLine = true;
    selectedText.append(line->text, range->start, range->end - range->start);
    if (!start.has_value()) {
      start = DiffSelectionPoint{row, range->start};
      startRow = line;
    }
    end = DiffSelectionPoint{row, range->end};
    endRow = std::move(line);
  }
  if (!start.has_value() || selectedText.empty()) {
    return std::nullopt;
  }

  const DiffSelectionPoint& payloadAnchor = backwards ? *end : *start;
  const DiffSelectionPoint& payloadFocus = backwards ? *start : *end;
  return DiffSelectionPayload{
    backwards ? endRow->sourceRowIndex : startRow->sourceRowIndex,
    payloadAnchor.column,
    backwards ? startRow->sourceRowIndex : endRow->sourceRowIndex,
    payloadFocus.column,
    std::move(selectedText),
  };
}

} // namespace margelo::nitro::legendapps::diffparser

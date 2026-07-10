#include "DiffInlineChange.hpp"

#include <algorithm>
#include <cstdint>
#include <set>

namespace margelo::nitro::legendapps::diffparser {
namespace {

constexpr size_t maxInlineTokenMatrixSize = 20'000;

struct DiffInlineToken {
  size_t start = 0;
  size_t length = 0;
  std::u16string text;
  bool word = false;
};

bool isInlineWordCharacter(char16_t value) {
  return (value >= u'a' && value <= u'z')
      || (value >= u'A' && value <= u'Z')
      || (value >= u'0' && value <= u'9')
      || value == u'_'
      || value == u'$';
}

bool isInlineWhitespace(char16_t value) {
  return value == u' '
      || (value >= u'\t' && value <= u'\r')
      || value == u'\u0085'
      || value == u'\u00a0'
      || value == u'\u1680'
      || (value >= u'\u2000' && value <= u'\u200a')
      || value == u'\u2028'
      || value == u'\u2029'
      || value == u'\u202f'
      || value == u'\u205f'
      || value == u'\u3000'
      || value == u'\ufeff';
}

std::vector<DiffInlineToken> tokenizeInlineText(const std::u16string& text) {
  std::vector<DiffInlineToken> tokens;
  tokens.reserve(std::min<size_t>(text.size(), 128));
  size_t index = 0;
  while (index < text.size()) {
    const auto start = index;
    const bool word = isInlineWordCharacter(text[index]);
    const bool whitespace = isInlineWhitespace(text[index]);
    index += 1;
    if (word) {
      while (index < text.size() && isInlineWordCharacter(text[index])) {
        index += 1;
      }
    } else if (whitespace) {
      while (index < text.size() && isInlineWhitespace(text[index])) {
        index += 1;
      }
    }
    tokens.push_back(DiffInlineToken{
        .start = start,
        .length = index - start,
        .text = text.substr(start, index - start),
        .word = word,
    });
  }
  return tokens;
}

void appendInlineRange(std::vector<DiffInlineChangeRange>& ranges, size_t start, size_t end) {
  if (end > start) {
    if (!ranges.empty() && ranges.back().start + ranges.back().length == start) {
      ranges.back().length = end - ranges.back().start;
    } else {
      ranges.push_back(DiffInlineChangeRange{
          .start = start,
          .length = end - start,
      });
    }
  }
}

void appendInlineTextRange(
    std::vector<DiffInlineChangeRange>& ranges,
    const std::u16string& text,
    size_t start,
    size_t end) {
  while (start < end && isInlineWhitespace(text[start])) {
    start += 1;
  }
  while (end > start && isInlineWhitespace(text[end - 1])) {
    end -= 1;
  }
  appendInlineRange(ranges, start, end);
}

void appendInlineReplacementRanges(
    std::vector<DiffInlineChangeRange>& removedRanges,
    std::vector<DiffInlineChangeRange>& addedRanges,
    const std::u16string& removedText,
    size_t removedStart,
    size_t removedEnd,
    const std::u16string& addedText,
    size_t addedStart,
    size_t addedEnd) {
  size_t commonPrefixLength = 0;
  const auto maxPrefixLength = std::min(removedEnd - removedStart, addedEnd - addedStart);
  while (
      commonPrefixLength < maxPrefixLength
      && removedText[removedStart + commonPrefixLength] == addedText[addedStart + commonPrefixLength]) {
    commonPrefixLength += 1;
  }

  size_t commonSuffixLength = 0;
  const auto maxSuffixLength = maxPrefixLength - commonPrefixLength;
  while (
      commonSuffixLength < maxSuffixLength
      && removedText[removedEnd - commonSuffixLength - 1] == addedText[addedEnd - commonSuffixLength - 1]) {
    commonSuffixLength += 1;
  }
  if (commonPrefixLength == 1 && isInlineWordCharacter(removedText[removedStart])) {
    commonPrefixLength = 0;
  }
  if (commonSuffixLength == 1 && isInlineWordCharacter(removedText[removedEnd - 1])) {
    commonSuffixLength = 0;
  }

  appendInlineTextRange(
      removedRanges,
      removedText,
      removedStart + commonPrefixLength,
      removedEnd - commonSuffixLength);
  appendInlineTextRange(
      addedRanges,
      addedText,
      addedStart + commonPrefixLength,
      addedEnd - commonSuffixLength);
}

void appendInlineTokenReplacementRanges(
    std::vector<DiffInlineChangeRange>& removedRanges,
    std::vector<DiffInlineChangeRange>& addedRanges,
    const std::u16string& removedText,
    const std::vector<DiffInlineToken>& removedTokens,
    size_t removedStartToken,
    size_t removedEndToken,
    const std::u16string& addedText,
    const std::vector<DiffInlineToken>& addedTokens,
    size_t addedStartToken,
    size_t addedEndToken) {
  const bool hasRemovedRange = removedStartToken < removedEndToken;
  const bool hasAddedRange = addedStartToken < addedEndToken;
  if (hasRemovedRange && hasAddedRange) {
    appendInlineReplacementRanges(
        removedRanges,
        addedRanges,
        removedText,
        removedTokens[removedStartToken].start,
        removedTokens[removedEndToken - 1].start + removedTokens[removedEndToken - 1].length,
        addedText,
        addedTokens[addedStartToken].start,
        addedTokens[addedEndToken - 1].start + addedTokens[addedEndToken - 1].length);
  } else if (hasRemovedRange) {
    appendInlineTextRange(
        removedRanges,
        removedText,
        removedTokens[removedStartToken].start,
        removedTokens[removedEndToken - 1].start + removedTokens[removedEndToken - 1].length);
  } else if (hasAddedRange) {
    appendInlineTextRange(
        addedRanges,
        addedText,
        addedTokens[addedStartToken].start,
        addedTokens[addedEndToken - 1].start + addedTokens[addedEndToken - 1].length);
  }
}

} // namespace

DiffInlineChangeResult createDiffInlineChangeRanges(
    const std::u16string& removedText,
    const std::u16string& addedText) {
  DiffInlineChangeResult result;
  if (removedText == addedText) {
    return result;
  }

  const auto removedTokens = tokenizeInlineText(removedText);
  const auto addedTokens = tokenizeInlineText(addedText);
  if (removedTokens.empty() || addedTokens.empty() || removedTokens.size() * addedTokens.size() > maxInlineTokenMatrixSize) {
    appendInlineReplacementRanges(
        result.removedRanges,
        result.addedRanges,
        removedText,
        0,
        removedText.size(),
        addedText,
        0,
        addedText.size());
    return result;
  }

  const auto columnCount = addedTokens.size() + 1;
  std::vector<uint32_t> commonTokenMatrix((removedTokens.size() + 1) * columnCount, 0);
  auto matrixAt = [&](size_t removedIndex, size_t addedIndex) -> uint32_t& {
    return commonTokenMatrix[removedIndex * columnCount + addedIndex];
  };
  for (size_t removedIndex = removedTokens.size(); removedIndex-- > 0;) {
    for (size_t addedIndex = addedTokens.size(); addedIndex-- > 0;) {
      matrixAt(removedIndex, addedIndex) = removedTokens[removedIndex].text == addedTokens[addedIndex].text
        ? matrixAt(removedIndex + 1, addedIndex + 1) + 1
        : std::max(matrixAt(removedIndex + 1, addedIndex), matrixAt(removedIndex, addedIndex + 1));
    }
  }

  size_t removedTokenIndex = 0;
  size_t addedTokenIndex = 0;
  size_t pendingRemovedStart = 0;
  size_t pendingAddedStart = 0;
  while (removedTokenIndex < removedTokens.size() && addedTokenIndex < addedTokens.size()) {
    if (removedTokens[removedTokenIndex].text == addedTokens[addedTokenIndex].text) {
      appendInlineTokenReplacementRanges(
          result.removedRanges,
          result.addedRanges,
          removedText,
          removedTokens,
          pendingRemovedStart,
          removedTokenIndex,
          addedText,
          addedTokens,
          pendingAddedStart,
          addedTokenIndex);
      removedTokenIndex += 1;
      addedTokenIndex += 1;
      pendingRemovedStart = removedTokenIndex;
      pendingAddedStart = addedTokenIndex;
    } else if (matrixAt(removedTokenIndex + 1, addedTokenIndex) >= matrixAt(removedTokenIndex, addedTokenIndex + 1)) {
      removedTokenIndex += 1;
    } else {
      addedTokenIndex += 1;
    }
  }
  appendInlineTokenReplacementRanges(
      result.removedRanges,
      result.addedRanges,
      removedText,
      removedTokens,
      pendingRemovedStart,
      removedTokens.size(),
      addedText,
      addedTokens,
      pendingAddedStart,
      addedTokens.size());
  return result;
}

double getDiffInlineLineSimilarity(
    const std::u16string& leftText,
    const std::u16string& rightText) {
  const auto leftTokens = tokenizeInlineText(leftText);
  const auto rightTokens = tokenizeInlineText(rightText);
  std::set<std::u16string> leftWords;
  std::set<std::u16string> rightWords;
  auto collectWords = [](const std::vector<DiffInlineToken>& tokens, std::set<std::u16string>& words) {
    for (const auto& token : tokens) {
      if (token.word) {
        auto word = token.text;
        std::transform(word.begin(), word.end(), word.begin(), [](char16_t character) {
          return character >= u'A' && character <= u'Z'
            ? static_cast<char16_t>(character + (u'a' - u'A'))
            : character;
        });
        words.insert(std::move(word));
      }
    }
  };
  collectWords(leftTokens, leftWords);
  collectWords(rightTokens, rightWords);
  if (leftWords.empty() || rightWords.empty()) {
    return 0;
  }

  size_t commonCount = 0;
  for (const auto& word : leftWords) {
    commonCount += rightWords.contains(word) ? 1 : 0;
  }
  return static_cast<double>(commonCount)
      / static_cast<double>(leftWords.size() + rightWords.size() - commonCount);
}

} // namespace margelo::nitro::legendapps::diffparser

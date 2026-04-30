#include "HybridMarkdownParser.hpp"

#include "HybridMarkdownDocument.hpp"

extern "C" {
#include "../vendor/md4c/src/md4c.h"
}

#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#if defined(__unix__) || defined(__APPLE__)
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace margelo::nitro::legenddesktop::markdownparser {

namespace {

struct BlockBuilder {
  MarkdownBlockType type = MarkdownBlockType::Paragraph;
  size_t index = 0;
  size_t depth = 0;
  size_t sourceStart = std::string::npos;
  size_t sourceEnd = 0;
  size_t markdownStart = 0;
  size_t markdownEnd = 0;
  char fenceChar = 0;
};

struct StackEntry {
  MarkdownBlockType type = MarkdownBlockType::Document;
  size_t depth = 0;
  size_t topLevelIndex = std::string::npos;
};

struct ParserState {
  const char* source = nullptr;
  size_t sourceLength = 0;
  std::vector<BlockBuilder> blocks;
  std::vector<StackEntry> stack;
};

struct ParseResult {
  std::shared_ptr<const MarkdownSource> source;
  std::vector<MarkdownBlockRange> blocks;
  double readMs = 0;
  double mdParseMs = 0;
  double blockRangeMs = 0;
  double parseMs = 0;
};

struct BenchmarkSample {
  double elapsedMs = 0;
  double blockCount = 0;
  double extractedBlockCount = 0;
};

struct LineInfo {
  size_t start = 0;
  size_t end = 0;
  size_t contentStart = 0;
  char first = 0;
  bool blank = false;
  bool hasPipe = false;
};

using Clock = std::chrono::steady_clock;

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

class StringMarkdownSource final : public MarkdownSource {
public:
  explicit StringMarkdownSource(std::string source) : source_(std::move(source)) {}

  const char* data() const noexcept override {
    return source_.data();
  }

  size_t size() const noexcept override {
    return source_.size();
  }

  size_t externalMemorySize() const noexcept override {
    return source_.capacity();
  }

private:
  std::string source_;
};

#if defined(__unix__) || defined(__APPLE__)
class MappedMarkdownSource final : public MarkdownSource {
public:
  MappedMarkdownSource(int fd, const char* data, size_t size) : fd_(fd), data_(data), size_(size) {}

  ~MappedMarkdownSource() override {
    if (data_ != nullptr && size_ > 0) {
      munmap(const_cast<char*>(data_), size_);
    }
    if (fd_ >= 0) {
      close(fd_);
    }
  }

  const char* data() const noexcept override {
    return data_;
  }

  size_t size() const noexcept override {
    return size_;
  }

  size_t externalMemorySize() const noexcept override {
    return size_;
  }

private:
  int fd_ = -1;
  const char* data_ = nullptr;
  size_t size_ = 0;
};
#endif

std::shared_ptr<const MarkdownSource> makeStringSource(std::string source) {
  return std::make_shared<StringMarkdownSource>(std::move(source));
}

bool isLineBreak(char value) {
  return value == '\n' || value == '\r';
}

bool isWhitespace(char value) {
  return value == ' ' || value == '\t' || value == '\n' || value == '\r';
}

size_t lineStart(const char* bytes, size_t offset) {
  while (offset > 0 && bytes[offset - 1] != '\n' && bytes[offset - 1] != '\r') {
    offset -= 1;
  }
  return offset;
}

size_t lineEnd(const char* bytes, size_t length, size_t offset) {
  while (offset < length && !isLineBreak(bytes[offset])) {
    offset += 1;
  }
  return offset;
}

bool lineIsBlank(const char* bytes, size_t start, size_t end) {
  for (size_t index = start; index < end; index += 1) {
    if (!isWhitespace(bytes[index])) {
      return false;
    }
  }
  return true;
}

size_t trimLinePrefix(const char* bytes, size_t start, size_t end) {
  while (start < end && (bytes[start] == ' ' || bytes[start] == '\t')) {
    start += 1;
  }
  return start;
}

LineInfo lineInfo(const char* bytes, size_t start, size_t end) {
  const size_t contentStart = trimLinePrefix(bytes, start, end);
  const bool blank = contentStart >= end;
  bool hasPipe = false;
  for (size_t index = contentStart; index < end; index += 1) {
    if (bytes[index] == '|') {
      hasPipe = true;
      break;
    }
  }
  return LineInfo{
      start,
      end,
      contentStart,
      blank ? '\0' : bytes[contentStart],
      blank,
      hasPipe,
  };
}

LineInfo lineInfoAt(const char* bytes, size_t length, size_t start) {
  return lineInfo(bytes, start, lineEnd(bytes, length, start));
}

bool lineStartsHeading(const char* bytes, const LineInfo& line) {
  size_t start = line.contentStart;
  const size_t end = line.end;
  if (line.first != '#') {
    return false;
  }

  size_t hashCount = 0;
  while (start + hashCount < end && bytes[start + hashCount] == '#') {
    hashCount += 1;
  }
  return hashCount > 0 && hashCount <= 6 && start + hashCount < end && isWhitespace(bytes[start + hashCount]);
}

bool lineStartsHeading(const char* bytes, size_t start, size_t end) {
  return lineStartsHeading(bytes, lineInfo(bytes, start, end));
}

bool lineStartsFence(const char* bytes, const LineInfo& line, char fenceChar) {
  size_t start = line.contentStart;
  const size_t end = line.end;
  size_t fenceCount = 0;
  while (start + fenceCount < end && bytes[start + fenceCount] == fenceChar) {
    fenceCount += 1;
  }
  return fenceCount >= 3;
}

bool lineStartsFence(const char* bytes, size_t start, size_t end, char fenceChar) {
  return lineStartsFence(bytes, lineInfo(bytes, start, end), fenceChar);
}

char lineFenceChar(const char* bytes, const LineInfo& line) {
  if (line.first != '`' && line.first != '~') {
    return 0;
  }
  return lineStartsFence(bytes, line, line.first) ? line.first : 0;
}

bool lineStartsBlockquote(const LineInfo& line) {
  return line.first == '>';
}

bool lineStartsUnorderedList(const char* bytes, const LineInfo& line) {
  const size_t start = line.contentStart;
  const size_t end = line.end;
  return start + 1 < end && (bytes[start] == '-' || bytes[start] == '*' || bytes[start] == '+') && isWhitespace(bytes[start + 1]);
}

bool lineStartsOrderedList(const char* bytes, const LineInfo& line) {
  size_t index = line.contentStart;
  const size_t start = index;
  const size_t end = line.end;
  if (line.first < '0' || line.first > '9') {
    return false;
  }
  while (index < end && bytes[index] >= '0' && bytes[index] <= '9') {
    index += 1;
  }
  return index > start && index + 1 < end && (bytes[index] == '.' || bytes[index] == ')') && isWhitespace(bytes[index + 1]);
}

bool lineStartsOrderedListAtOne(const char* bytes, const LineInfo& line) {
  size_t index = line.contentStart;
  const size_t start = index;
  const size_t end = line.end;
  if (line.first < '0' || line.first > '9') {
    return false;
  }
  size_t value = 0;
  while (index < end && bytes[index] >= '0' && bytes[index] <= '9') {
    value = value * 10 + static_cast<size_t>(bytes[index] - '0');
    index += 1;
  }
  return value == 1 && index > start && index + 1 < end && (bytes[index] == '.' || bytes[index] == ')') &&
      isWhitespace(bytes[index + 1]);
}

bool lineStartsThematicBreak(const char* bytes, const LineInfo& line) {
  const size_t start = line.contentStart;
  const size_t end = line.end;
  if (line.first != '-' && line.first != '*' && line.first != '_') {
    return false;
  }

  const char marker = line.first;
  size_t count = 0;
  size_t index = start;
  for (; index < end; index += 1) {
    if (bytes[index] == marker) {
      count += 1;
    } else if (!isWhitespace(bytes[index])) {
      return false;
    }
  }
  return count >= 3;
}

bool lineLooksLikeTableDelimiter(const char* bytes, const LineInfo& line) {
  bool hasDash = false;
  bool hasPipe = false;
  for (size_t index = line.contentStart; index < line.end; index += 1) {
    const char value = bytes[index];
    if (value == '-') {
      hasDash = true;
    } else if (value == '|') {
      hasPipe = true;
    } else if (value != ':' && !isWhitespace(value)) {
      return false;
    }
  }
  return hasDash && hasPipe;
}

size_t nextPhysicalLineStart(const char* bytes, size_t length, size_t end) {
  if (end < length && bytes[end] == '\r') {
    end += 1;
  }
  if (end < length && bytes[end] == '\n') {
    end += 1;
  }
  return end;
}

std::vector<LineInfo> buildLineTable(const char* bytes, size_t length) {
  std::vector<LineInfo> lines;
  if (length > 0) {
    lines.reserve(std::max<size_t>(16, length / 80));
  }

  size_t start = 0;
  while (start < length) {
    const LineInfo line = lineInfoAt(bytes, length, start);
    lines.push_back(line);
    start = nextPhysicalLineStart(bytes, length, line.end);
  }
  return lines;
}

bool lineStartsBoundaryBlock(const char* bytes, const LineInfo& line) {
  return lineStartsHeading(bytes, line) ||
      lineFenceChar(bytes, line) != 0 ||
      lineStartsThematicBreak(bytes, line);
}

bool lineInterruptsParagraph(const char* bytes, const LineInfo& line) {
  return lineStartsBoundaryBlock(bytes, line) ||
      lineStartsUnorderedList(bytes, line) ||
      lineStartsOrderedListAtOne(bytes, line);
}

MarkdownBlockType scannedBlockType(const char* bytes, const std::vector<LineInfo>& lines, size_t lineIndex) {
  const LineInfo& line = lines[lineIndex];
  switch (line.first) {
    case '#':
      if (lineStartsHeading(bytes, line)) {
        return MarkdownBlockType::Heading;
      }
      break;
    case '`':
    case '~':
      if (lineFenceChar(bytes, line) != 0) {
        return MarkdownBlockType::CodeBlock;
      }
      break;
    case '-':
    case '*':
      if (lineStartsThematicBreak(bytes, line)) {
        return MarkdownBlockType::ThematicBreak;
      }
      if (lineStartsUnorderedList(bytes, line)) {
        return MarkdownBlockType::UnorderedList;
      }
      break;
    case '_':
      if (lineStartsThematicBreak(bytes, line)) {
        return MarkdownBlockType::ThematicBreak;
      }
      break;
    case '>':
      if (lineStartsBlockquote(line)) {
        return MarkdownBlockType::Quote;
      }
      break;
    case '+':
      if (lineStartsUnorderedList(bytes, line)) {
        return MarkdownBlockType::UnorderedList;
      }
      break;
    default:
      if (line.first >= '0' && line.first <= '9' && lineStartsOrderedList(bytes, line)) {
        return MarkdownBlockType::OrderedList;
      }
      break;
  }

  if (line.hasPipe && lineIndex + 1 < lines.size() && lineLooksLikeTableDelimiter(bytes, lines[lineIndex + 1])) {
    return MarkdownBlockType::Table;
  }

  return MarkdownBlockType::Paragraph;
}

size_t fencedCodeBlockEnd(const char* bytes, size_t length, size_t offset, char fenceChar);

size_t scannedBlockEnd(
    const char* bytes,
    size_t length,
    const std::vector<LineInfo>& lines,
    size_t lineIndex,
    MarkdownBlockType type) {
  const LineInfo& line = lines[lineIndex];
  size_t end = line.end;
  if (type == MarkdownBlockType::Heading || type == MarkdownBlockType::ThematicBreak) {
    return end;
  }

  if (type == MarkdownBlockType::CodeBlock) {
    return fencedCodeBlockEnd(bytes, length, end, lineFenceChar(bytes, line));
  }

  for (size_t nextIndex = lineIndex + 1; nextIndex < lines.size(); nextIndex += 1) {
    const LineInfo& nextLine = lines[nextIndex];
    if (nextLine.blank) {
      break;
    }
    if (type == MarkdownBlockType::Paragraph && lineInterruptsParagraph(bytes, nextLine)) {
      break;
    }
    end = nextLine.end;
  }
  return end;
}

MarkdownBlockType scannedStreamingBlockType(const char* bytes, size_t length, const LineInfo& line) {
  switch (line.first) {
    case '#':
      if (lineStartsHeading(bytes, line)) {
        return MarkdownBlockType::Heading;
      }
      break;
    case '`':
    case '~':
      if (lineFenceChar(bytes, line) != 0) {
        return MarkdownBlockType::CodeBlock;
      }
      break;
    case '-':
    case '*':
      if (lineStartsThematicBreak(bytes, line)) {
        return MarkdownBlockType::ThematicBreak;
      }
      if (lineStartsUnorderedList(bytes, line)) {
        return MarkdownBlockType::UnorderedList;
      }
      break;
    case '_':
      if (lineStartsThematicBreak(bytes, line)) {
        return MarkdownBlockType::ThematicBreak;
      }
      break;
    case '>':
      if (lineStartsBlockquote(line)) {
        return MarkdownBlockType::Quote;
      }
      break;
    case '+':
      if (lineStartsUnorderedList(bytes, line)) {
        return MarkdownBlockType::UnorderedList;
      }
      break;
    default:
      if (line.first >= '0' && line.first <= '9' && lineStartsOrderedList(bytes, line)) {
        return MarkdownBlockType::OrderedList;
      }
      break;
  }

  const size_t nextStart = nextPhysicalLineStart(bytes, length, line.end);
  if (line.hasPipe && nextStart < length) {
    const LineInfo nextLine = lineInfoAt(bytes, length, nextStart);
    if (lineLooksLikeTableDelimiter(bytes, nextLine)) {
      return MarkdownBlockType::Table;
    }
  }

  return MarkdownBlockType::Paragraph;
}

size_t scannedStreamingBlockEnd(
    const char* bytes,
    size_t length,
    const LineInfo& line,
    MarkdownBlockType type) {
  size_t end = line.end;
  if (type == MarkdownBlockType::Heading || type == MarkdownBlockType::ThematicBreak) {
    return end;
  }

  if (type == MarkdownBlockType::CodeBlock) {
    return fencedCodeBlockEnd(bytes, length, end, lineFenceChar(bytes, line));
  }

  size_t nextStart = nextPhysicalLineStart(bytes, length, end);
  while (nextStart < length) {
    const LineInfo nextLine = lineInfoAt(bytes, length, nextStart);
    if (nextLine.blank) {
      break;
    }
    if (type == MarkdownBlockType::Paragraph && lineInterruptsParagraph(bytes, nextLine)) {
      break;
    }
    end = nextLine.end;
    nextStart = nextPhysicalLineStart(bytes, length, end);
  }
  return end;
}

size_t blockStartForText(const char* bytes, size_t length, size_t offset) {
  size_t start = lineStart(bytes, std::min(offset, length));
  const size_t end = lineEnd(bytes, length, start);
  if (lineStartsHeading(bytes, start, end)) {
    return start;
  }

  while (start > 0) {
    size_t previousEnd = start;
    while (previousEnd > 0 && isLineBreak(bytes[previousEnd - 1])) {
      previousEnd -= 1;
    }
    const size_t previousStart = lineStart(bytes, previousEnd);
    if (lineIsBlank(bytes, previousStart, previousEnd) || lineStartsHeading(bytes, previousStart, previousEnd)) {
      break;
    }
    start = previousStart;
  }
  return start;
}

size_t blockEndForText(const char* bytes, size_t length, size_t offset) {
  const size_t start = lineStart(bytes, std::min(offset, length));
  size_t end = lineEnd(bytes, length, start);
  if (lineStartsHeading(bytes, start, end)) {
    return end;
  }

  while (end < length) {
    size_t nextStart = end;
    while (nextStart < length && isLineBreak(bytes[nextStart])) {
      nextStart += 1;
    }
    const size_t nextEnd = lineEnd(bytes, length, nextStart);
    if (nextStart >= length || lineIsBlank(bytes, nextStart, nextEnd) || lineStartsHeading(bytes, nextStart, nextEnd)) {
      break;
    }
    end = nextEnd;
  }

  while (end > 0 && isLineBreak(bytes[end - 1])) {
    end -= 1;
  }
  return end;
}

size_t fencedCodeBlockStart(const char* bytes, size_t length, size_t offset, char fenceChar) {
  size_t start = lineStart(bytes, std::min(offset, length));
  while (start > 0) {
    const size_t end = lineEnd(bytes, length, start);
    if (lineStartsFence(bytes, start, end, fenceChar)) {
      return start;
    }

    size_t previousEnd = start;
    while (previousEnd > 0 && isLineBreak(bytes[previousEnd - 1])) {
      previousEnd -= 1;
    }
    start = lineStart(bytes, previousEnd);
  }
  return blockStartForText(bytes, length, offset);
}

size_t fencedCodeBlockEnd(const char* bytes, size_t length, size_t offset, char fenceChar) {
  size_t start = lineEnd(bytes, length, std::min(offset, length));
  while (start < length) {
    while (start < length && isLineBreak(bytes[start])) {
      start += 1;
    }
    const size_t end = lineEnd(bytes, length, start);
    if (lineStartsFence(bytes, start, end, fenceChar)) {
      return end;
    }
    start = end;
  }
  return blockEndForText(bytes, length, offset);
}

MarkdownBlockType blockType(MD_BLOCKTYPE type) {
  switch (type) {
    case MD_BLOCK_DOC:
      return MarkdownBlockType::Document;
    case MD_BLOCK_QUOTE:
      return MarkdownBlockType::Quote;
    case MD_BLOCK_UL:
      return MarkdownBlockType::UnorderedList;
    case MD_BLOCK_OL:
      return MarkdownBlockType::OrderedList;
    case MD_BLOCK_LI:
      return MarkdownBlockType::ListItem;
    case MD_BLOCK_HR:
      return MarkdownBlockType::ThematicBreak;
    case MD_BLOCK_H:
      return MarkdownBlockType::Heading;
    case MD_BLOCK_CODE:
      return MarkdownBlockType::CodeBlock;
    case MD_BLOCK_HTML:
      return MarkdownBlockType::HtmlBlock;
    case MD_BLOCK_P:
      return MarkdownBlockType::Paragraph;
    case MD_BLOCK_TABLE:
      return MarkdownBlockType::Table;
    case MD_BLOCK_THEAD:
      return MarkdownBlockType::TableHead;
    case MD_BLOCK_TBODY:
      return MarkdownBlockType::TableBody;
    case MD_BLOCK_TR:
      return MarkdownBlockType::TableRow;
    case MD_BLOCK_TH:
      return MarkdownBlockType::TableHeaderCell;
    case MD_BLOCK_TD:
      return MarkdownBlockType::TableCell;
  }
}

void recordSourceText(ParserState& state, const MD_CHAR* text, MD_SIZE size) {
  if (state.stack.size() <= 1 || state.source == nullptr || text == nullptr || size == 0) {
    return;
  }

  const size_t topLevelIndex = state.stack[1].topLevelIndex;
  if (topLevelIndex == std::string::npos || topLevelIndex >= state.blocks.size()) {
    return;
  }

  const char* sourceStart = state.source;
  const char* sourceEnd = state.source + state.sourceLength;
  const char* textStart = text;
  const char* textEnd = text + size;
  if (textStart < sourceStart || textEnd > sourceEnd) {
    return;
  }

  BlockBuilder& block = state.blocks[topLevelIndex];
  const size_t start = static_cast<size_t>(textStart - sourceStart);
  const size_t end = static_cast<size_t>(textEnd - sourceStart);
  block.sourceStart = std::min(block.sourceStart, start);
  block.sourceEnd = std::max(block.sourceEnd, end);
}

void attachSourceRange(ParserState& state, BlockBuilder& block) {
  if (block.sourceStart == std::string::npos || state.source == nullptr) {
    return;
  }

  size_t start = block.sourceStart;
  size_t end = block.sourceEnd;
  if (block.type == MarkdownBlockType::CodeBlock && block.fenceChar != 0) {
    start = fencedCodeBlockStart(state.source, state.sourceLength, start, block.fenceChar);
    end = fencedCodeBlockEnd(state.source, state.sourceLength, end, block.fenceChar);
  } else {
    start = blockStartForText(state.source, state.sourceLength, start);
    end = blockEndForText(state.source, state.sourceLength, end);
  }
  block.markdownStart = start;
  block.markdownEnd = std::min(end, state.sourceLength);
}

int enterBlock(MD_BLOCKTYPE type, void* detail, void* userdata) {
  auto& state = *static_cast<ParserState*>(userdata);
  const size_t depth = state.stack.size();
  const MarkdownBlockType typeName = blockType(type);
  size_t topLevelIndex = state.stack.empty() ? std::string::npos : state.stack.back().topLevelIndex;

  if (depth == 1 && typeName != MarkdownBlockType::Document) {
    topLevelIndex = state.blocks.size();
    BlockBuilder block;
    block.index = topLevelIndex;
    block.depth = depth;
    block.type = typeName;
    if (type == MD_BLOCK_CODE) {
      auto* code = static_cast<MD_BLOCK_CODE_DETAIL*>(detail);
      block.fenceChar = code ? code->fence_char : 0;
    }
    state.blocks.push_back(std::move(block));
  }

  state.stack.push_back(StackEntry{typeName, depth, topLevelIndex});
  return 0;
}

int leaveBlock(MD_BLOCKTYPE, void*, void* userdata) {
  auto& state = *static_cast<ParserState*>(userdata);
  if (!state.stack.empty()) {
    const StackEntry entry = state.stack.back();
    if (entry.depth == 1 && entry.topLevelIndex != std::string::npos && entry.topLevelIndex < state.blocks.size()) {
      attachSourceRange(state, state.blocks[entry.topLevelIndex]);
    }
    state.stack.pop_back();
  }
  return 0;
}

int enterSpan(MD_SPANTYPE, void*, void*) {
  return 0;
}

int leaveSpan(MD_SPANTYPE, void*, void*) {
  return 0;
}

int textCallback(MD_TEXTTYPE type, const MD_CHAR* text, MD_SIZE size, void* userdata) {
  auto& state = *static_cast<ParserState*>(userdata);
  recordSourceText(state, text, size);
  return 0;
}

ParseResult parseMarkdownSource(std::shared_ptr<const MarkdownSource> source, double flags, double readMs) {
  ParserState state;
  state.source = source->data();
  state.sourceLength = source->size();

  MD_PARSER parser = {};
  parser.abi_version = 0;
  parser.flags = static_cast<unsigned>(std::max(0.0, flags));
  parser.enter_block = enterBlock;
  parser.leave_block = leaveBlock;
  parser.enter_span = enterSpan;
  parser.leave_span = leaveSpan;
  parser.text = textCallback;

  const auto parseStartedAt = Clock::now();
  const int result = md_parse(source->data(), static_cast<MD_SIZE>(source->size()), &parser, &state);
  const auto parseFinishedAt = Clock::now();
  if (result != 0) {
    throw std::runtime_error("Markdown parse failed with code " + std::to_string(result));
  }

  const auto blockRangeStartedAt = Clock::now();
  std::vector<MarkdownBlockRange> blocks;
  blocks.reserve(state.blocks.size());
  for (const auto& block : state.blocks) {
    if (block.markdownEnd > block.markdownStart) {
      blocks.push_back(MarkdownBlockRange{
          block.index,
          block.depth,
          block.markdownStart,
          block.markdownEnd,
          block.type,
      });
    }
  }
  const auto blockRangeFinishedAt = Clock::now();
  const double mdParseMs = elapsedMs(parseStartedAt, parseFinishedAt);
  const double blockRangeMs = elapsedMs(blockRangeStartedAt, blockRangeFinishedAt);
  return ParseResult{
      std::move(source),
      std::move(blocks),
      readMs,
      mdParseMs,
      blockRangeMs,
      mdParseMs + blockRangeMs,
  };
}

ParseResult scanMarkdownSource(std::shared_ptr<const MarkdownSource> source, double readMs) {
  const auto scanStartedAt = Clock::now();
  const char* bytes = source->data();
  const size_t length = source->size();
  const std::vector<LineInfo> lines = buildLineTable(bytes, length);
  std::vector<MarkdownBlockRange> blocks;
  if (length > 0) {
    blocks.reserve(std::max<size_t>(16, length / 128));
  }
  size_t lineIndex = 0;

  while (lineIndex < lines.size()) {
    const LineInfo& line = lines[lineIndex];
    if (line.blank) {
      lineIndex += 1;
      continue;
    }

    const MarkdownBlockType type = scannedBlockType(bytes, lines, lineIndex);
    const size_t end = scannedBlockEnd(bytes, length, lines, lineIndex, type);
    blocks.push_back(MarkdownBlockRange{
        blocks.size(),
        1,
        line.start,
        std::min(end, length),
        type,
    });
    lineIndex += 1;
    while (lineIndex < lines.size() && lines[lineIndex].start <= end) {
      lineIndex += 1;
    }
  }

  const double blockRangeMs = elapsedMs(scanStartedAt, Clock::now());
  return ParseResult{
      std::move(source),
      std::move(blocks),
      readMs,
      0,
      blockRangeMs,
      blockRangeMs,
  };
}

ParseResult streamMarkdownSource(std::shared_ptr<const MarkdownSource> source, double readMs) {
  const auto scanStartedAt = Clock::now();
  const char* bytes = source->data();
  const size_t length = source->size();
  std::vector<MarkdownBlockRange> blocks;
  if (length > 0) {
    blocks.reserve(std::max<size_t>(16, length / 128));
  }

  size_t lineStartOffset = 0;
  while (lineStartOffset < length) {
    const LineInfo line = lineInfoAt(bytes, length, lineStartOffset);
    if (line.blank) {
      lineStartOffset = nextPhysicalLineStart(bytes, length, line.end);
      continue;
    }

    const MarkdownBlockType type = scannedStreamingBlockType(bytes, length, line);
    const size_t end = scannedStreamingBlockEnd(bytes, length, line, type);
    blocks.push_back(MarkdownBlockRange{
        blocks.size(),
        1,
        line.start,
        std::min(end, length),
        type,
    });
    lineStartOffset = nextPhysicalLineStart(bytes, length, end);
  }

  const double blockRangeMs = elapsedMs(scanStartedAt, Clock::now());
  return ParseResult{
      std::move(source),
      std::move(blocks),
      readMs,
      0,
      blockRangeMs,
      blockRangeMs,
  };
}

std::string normalizeFilePath(const std::string& filePath) {
  constexpr auto prefix = std::string_view("file://");
  if (filePath.starts_with(prefix)) {
    return filePath.substr(prefix.size());
  }
  return filePath;
}

#if !defined(__unix__) && !defined(__APPLE__)
std::string readFile(const std::string& filePath) {
  std::ifstream input(normalizeFilePath(filePath), std::ios::binary);
  if (!input) {
    throw std::runtime_error("Failed to read markdown file: " + filePath);
  }
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}
#endif

#if defined(__unix__) || defined(__APPLE__)
std::shared_ptr<const MarkdownSource> mapFileSource(const std::string& filePath) {
  const std::string normalizedPath = normalizeFilePath(filePath);
  const int fd = open(normalizedPath.c_str(), O_RDONLY);
  if (fd < 0) {
    throw std::runtime_error("Failed to read markdown file: " + filePath);
  }

  struct stat fileStat {};
  if (fstat(fd, &fileStat) != 0) {
    close(fd);
    throw std::runtime_error("Failed to stat markdown file: " + filePath);
  }

  if (fileStat.st_size <= 0) {
    close(fd);
    return makeStringSource("");
  }

  void* data = mmap(nullptr, static_cast<size_t>(fileStat.st_size), PROT_READ, MAP_PRIVATE, fd, 0);
  if (data == MAP_FAILED) {
    close(fd);
    throw std::runtime_error("Failed to map markdown file: " + filePath);
  }

  return std::make_shared<MappedMarkdownSource>(fd, static_cast<const char*>(data), static_cast<size_t>(fileStat.st_size));
}
#endif

std::shared_ptr<const MarkdownSource> readFileSource(const std::string& filePath) {
#if defined(__unix__) || defined(__APPLE__)
  return mapFileSource(filePath);
#else
  return makeStringSource(readFile(filePath));
#endif
}

std::shared_ptr<HybridMarkdownDocument> createDocument(ParseResult result) {
  const auto documentStartedAt = Clock::now();
  auto timing = MarkdownDocumentTiming(
      static_cast<double>(result.source->size()),
      result.readMs,
      result.mdParseMs,
      result.blockRangeMs,
      result.parseMs,
      0);
  auto document = std::make_shared<HybridMarkdownDocument>(std::move(result.source), std::move(result.blocks), timing);
  const auto documentFinishedAt = Clock::now();
  document->setDocumentDurationMs(elapsedMs(documentStartedAt, documentFinishedAt));
  return document;
}

double percentileValue(const std::vector<double>& sortedSamples, double percentile) {
  if (sortedSamples.empty()) {
    return 0;
  }
  const double rawIndex = percentile * static_cast<double>(sortedSamples.size() - 1);
  const size_t lowerIndex = static_cast<size_t>(std::floor(rawIndex));
  const size_t upperIndex = std::min(sortedSamples.size() - 1, lowerIndex + 1);
  const double fraction = rawIndex - static_cast<double>(lowerIndex);
  return sortedSamples[lowerIndex] + (sortedSamples[upperIndex] - sortedSamples[lowerIndex]) * fraction;
}

MarkdownBenchmarkStats benchmarkStats(
    const std::string& mode,
    const std::vector<BenchmarkSample>& samples,
    size_t warmups,
    size_t windowSize,
    size_t sourceBytes) {
  std::vector<double> sampleTimes;
  sampleTimes.reserve(samples.size());
  double totalMs = 0;
  double blockCount = 0;
  double extractedBlockCount = 0;

  for (const auto& sample : samples) {
    sampleTimes.push_back(sample.elapsedMs);
    totalMs += sample.elapsedMs;
    blockCount = sample.blockCount;
    extractedBlockCount = sample.extractedBlockCount;
  }

  std::vector<double> sortedTimes = sampleTimes;
  std::sort(sortedTimes.begin(), sortedTimes.end());
  const double meanMs = sampleTimes.empty() ? 0 : totalMs / static_cast<double>(sampleTimes.size());
  double variance = 0;
  for (const double sampleMs : sampleTimes) {
    const double delta = sampleMs - meanMs;
    variance += delta * delta;
  }
  if (!sampleTimes.empty()) {
    variance /= static_cast<double>(sampleTimes.size());
  }

  return MarkdownBenchmarkStats(
      mode,
      blockCount,
      extractedBlockCount,
      static_cast<double>(samples.size()),
      static_cast<double>(warmups),
      static_cast<double>(windowSize),
      static_cast<double>(sourceBytes),
      sortedTimes.empty() ? 0 : sortedTimes.front(),
      percentileValue(sortedTimes, 0.5),
      meanMs,
      percentileValue(sortedTimes, 0.9),
      percentileValue(sortedTimes, 0.95),
      sortedTimes.empty() ? 0 : sortedTimes.back(),
      std::sqrt(variance),
      std::move(sampleTimes));
}

BenchmarkSample runBenchmarkMode(
    const std::shared_ptr<const MarkdownSource>& source,
    const std::string& mode,
    size_t windowSize,
    double flags) {
  const auto startedAt = Clock::now();
  double blockCount = 0;
  double extractedBlockCount = 0;

  if (mode == "scan-window" || mode == "scan-window-combined") {
    auto document = createDocument(scanMarkdownSource(source, 0));
    auto blocks = document->getBlocks(0, static_cast<double>(windowSize), false);
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "scan-render-shape") {
    auto document = createDocument(scanMarkdownSource(source, 0));
    auto blocks = document->getRenderBlocks(0, static_cast<double>(windowSize));
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "scan-full") {
    auto document = createDocument(scanMarkdownSource(source, 0));
    auto blocks = document->getBlocks(0, document->getBlockCount(), false);
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "stream-window" || mode == "stream-window-combined") {
    auto document = createDocument(streamMarkdownSource(source, 0));
    auto blocks = document->getBlocks(0, static_cast<double>(windowSize), false);
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "stream-render-shape") {
    auto document = createDocument(streamMarkdownSource(source, 0));
    auto blocks = document->getRenderBlocks(0, static_cast<double>(windowSize));
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "stream-full") {
    auto document = createDocument(streamMarkdownSource(source, 0));
    auto blocks = document->getBlocks(0, document->getBlockCount(), false);
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "md4c-window") {
    auto document = createDocument(parseMarkdownSource(source, flags, 0));
    auto blocks = document->getBlocks(0, static_cast<double>(windowSize), false);
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else if (mode == "md4c-full") {
    auto document = createDocument(parseMarkdownSource(source, flags, 0));
    auto blocks = document->getBlocks(0, document->getBlockCount(), false);
    blockCount = document->getBlockCount();
    extractedBlockCount = static_cast<double>(blocks.size());
  } else {
    throw std::invalid_argument("Unknown markdown benchmark mode: " + mode);
  }

  return BenchmarkSample{
      elapsedMs(startedAt, Clock::now()),
      blockCount,
      extractedBlockCount,
  };
}

} // namespace

HybridMarkdownParser::HybridMarkdownParser() : HybridObject(TAG) {}

std::shared_ptr<HybridMarkdownDocumentSpec> HybridMarkdownParser::scanMarkdown(const std::string& markdown) {
  return createDocument(scanMarkdownSource(makeStringSource(markdown), 0));
}

std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> HybridMarkdownParser::scanMarkdownFile(
    const std::string& filePath) {
  return Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>::async([filePath]() -> std::shared_ptr<HybridMarkdownDocumentSpec> {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    return createDocument(scanMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
  });
}

std::shared_ptr<Promise<MarkdownFileWindowResult>> HybridMarkdownParser::scanMarkdownFileWindow(
    const std::string& filePath,
    double count) {
  return Promise<MarkdownFileWindowResult>::async([filePath, count]() -> MarkdownFileWindowResult {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    auto document = createDocument(streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
    MarkdownFileWindowResult result;
    result.document = document;
    result.blocks = document->getBlocks(0, count, false);
    return result;
  });
}

std::shared_ptr<Promise<MarkdownFileRenderWindowResult>> HybridMarkdownParser::scanMarkdownFileRenderWindow(
    const std::string& filePath,
    double count) {
  return Promise<MarkdownFileRenderWindowResult>::async([filePath, count]() -> MarkdownFileRenderWindowResult {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    auto document = createDocument(streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
    MarkdownFileRenderWindowResult result;
    result.document = document;
    result.blocks = document->getRenderBlocks(0, count);
    return result;
  });
}

std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> HybridMarkdownParser::streamMarkdownFile(
    const std::string& filePath) {
  return Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>::async([filePath]() -> std::shared_ptr<HybridMarkdownDocumentSpec> {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    return createDocument(streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
  });
}

std::shared_ptr<Promise<MarkdownFileWindowResult>> HybridMarkdownParser::streamMarkdownFileWindow(
    const std::string& filePath,
    double count) {
  return Promise<MarkdownFileWindowResult>::async([filePath, count]() -> MarkdownFileWindowResult {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    auto document = createDocument(streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
    MarkdownFileWindowResult result;
    result.document = document;
    result.blocks = document->getBlocks(0, count, false);
    return result;
  });
}

std::shared_ptr<Promise<MarkdownFileRenderWindowResult>> HybridMarkdownParser::streamMarkdownFileRenderWindow(
    const std::string& filePath,
    double count) {
  return Promise<MarkdownFileRenderWindowResult>::async([filePath, count]() -> MarkdownFileRenderWindowResult {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    auto document = createDocument(streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
    MarkdownFileRenderWindowResult result;
    result.document = document;
    result.blocks = document->getRenderBlocks(0, count);
    return result;
  });
}

std::shared_ptr<Promise<MarkdownBenchmarkSuiteResult>> HybridMarkdownParser::benchmarkMarkdownFile(
    const std::string& filePath,
    const std::vector<std::string>& modes,
    double iterations,
    double warmups,
    double windowSize,
    double flags) {
  return Promise<MarkdownBenchmarkSuiteResult>::async(
      [filePath, modes, iterations, warmups, windowSize, flags]() -> MarkdownBenchmarkSuiteResult {
        auto source = readFileSource(filePath);
        const size_t safeIterations = static_cast<size_t>(std::max(1.0, iterations));
        const size_t safeWarmups = static_cast<size_t>(std::max(0.0, warmups));
        const size_t safeWindowSize = static_cast<size_t>(std::max(0.0, windowSize));
        const std::vector<std::string> safeModes = modes.empty()
            ? std::vector<std::string>{"scan-render-shape"}
            : modes;

        for (size_t index = 0; index < safeWarmups; index += 1) {
          for (const auto& mode : safeModes) {
            runBenchmarkMode(source, mode, safeWindowSize, flags);
          }
        }

        std::vector<std::vector<BenchmarkSample>> samplesByMode(safeModes.size());
        for (size_t index = 0; index < safeIterations; index += 1) {
          for (size_t modeIndex = 0; modeIndex < safeModes.size(); modeIndex += 1) {
            samplesByMode[modeIndex].push_back(runBenchmarkMode(source, safeModes[modeIndex], safeWindowSize, flags));
          }
        }

        std::vector<MarkdownBenchmarkStats> results;
        results.reserve(safeModes.size());
        for (size_t modeIndex = 0; modeIndex < safeModes.size(); modeIndex += 1) {
          results.push_back(benchmarkStats(
              safeModes[modeIndex],
              samplesByMode[modeIndex],
              safeWarmups,
              safeWindowSize,
              source->size()));
        }

        return MarkdownBenchmarkSuiteResult(static_cast<double>(source->size()), std::move(results));
      });
}

std::shared_ptr<HybridMarkdownDocumentSpec> HybridMarkdownParser::parseMarkdown(
    const std::string& markdown,
    double flags) {
  return createDocument(parseMarkdownSource(makeStringSource(markdown), flags, 0));
}

std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> HybridMarkdownParser::parseMarkdownFile(
    const std::string& filePath,
    double flags) {
  return Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>::async([filePath, flags]() -> std::shared_ptr<HybridMarkdownDocumentSpec> {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    return createDocument(parseMarkdownSource(std::move(source), flags, elapsedMs(readStartedAt, readFinishedAt)));
  });
}

} // namespace margelo::nitro::legenddesktop::markdownparser

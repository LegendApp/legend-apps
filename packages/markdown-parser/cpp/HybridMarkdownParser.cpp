#include "HybridMarkdownParser.hpp"

#include "HybridMarkdownDocument.hpp"

extern "C" {
#include "../vendor/md4c/src/md4c.h"
}

#include <algorithm>
#include <chrono>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace margelo::nitro::legenddesktop::markdownparser {

namespace {

struct BlockBuilder {
  std::string type;
  size_t index = 0;
  size_t depth = 0;
  size_t sourceStart = std::string::npos;
  size_t sourceEnd = 0;
  size_t markdownStart = 0;
  size_t markdownEnd = 0;
  char fenceChar = 0;
};

struct StackEntry {
  std::string type;
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
  std::string source;
  std::vector<MarkdownBlockRange> blocks;
  double readMs = 0;
  double mdParseMs = 0;
  double blockRangeMs = 0;
  double parseMs = 0;
};

using Clock = std::chrono::steady_clock;

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
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

bool lineStartsHeading(const char* bytes, size_t start, size_t end) {
  start = trimLinePrefix(bytes, start, end);
  if (start >= end || bytes[start] != '#') {
    return false;
  }

  size_t hashCount = 0;
  while (start + hashCount < end && bytes[start + hashCount] == '#') {
    hashCount += 1;
  }
  return hashCount > 0 && hashCount <= 6 && start + hashCount < end && isWhitespace(bytes[start + hashCount]);
}

bool lineStartsFence(const char* bytes, size_t start, size_t end, char fenceChar) {
  start = trimLinePrefix(bytes, start, end);
  size_t fenceCount = 0;
  while (start + fenceCount < end && bytes[start + fenceCount] == fenceChar) {
    fenceCount += 1;
  }
  return fenceCount >= 3;
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

std::string blockType(MD_BLOCKTYPE type) {
  switch (type) {
    case MD_BLOCK_DOC:
      return "document";
    case MD_BLOCK_QUOTE:
      return "quote";
    case MD_BLOCK_UL:
      return "unorderedList";
    case MD_BLOCK_OL:
      return "orderedList";
    case MD_BLOCK_LI:
      return "listItem";
    case MD_BLOCK_HR:
      return "thematicBreak";
    case MD_BLOCK_H:
      return "heading";
    case MD_BLOCK_CODE:
      return "codeBlock";
    case MD_BLOCK_HTML:
      return "htmlBlock";
    case MD_BLOCK_P:
      return "paragraph";
    case MD_BLOCK_TABLE:
      return "table";
    case MD_BLOCK_THEAD:
      return "tableHead";
    case MD_BLOCK_TBODY:
      return "tableBody";
    case MD_BLOCK_TR:
      return "tableRow";
    case MD_BLOCK_TH:
      return "tableHeaderCell";
    case MD_BLOCK_TD:
      return "tableCell";
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
  if (block.type == "codeBlock" && block.fenceChar != 0) {
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
  const std::string typeName = blockType(type);
  size_t topLevelIndex = state.stack.empty() ? std::string::npos : state.stack.back().topLevelIndex;

  if (depth == 1 && typeName != "document") {
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

ParseResult parseMarkdownSource(std::string markdown, double flags, double readMs) {
  ParserState state;
  state.source = markdown.data();
  state.sourceLength = markdown.size();

  MD_PARSER parser = {};
  parser.abi_version = 0;
  parser.flags = static_cast<unsigned>(std::max(0.0, flags));
  parser.enter_block = enterBlock;
  parser.leave_block = leaveBlock;
  parser.enter_span = enterSpan;
  parser.leave_span = leaveSpan;
  parser.text = textCallback;

  const auto parseStartedAt = Clock::now();
  const int result = md_parse(markdown.data(), static_cast<MD_SIZE>(markdown.size()), &parser, &state);
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
      std::move(markdown),
      std::move(blocks),
      readMs,
      mdParseMs,
      blockRangeMs,
      mdParseMs + blockRangeMs,
  };
}

std::string normalizeFilePath(const std::string& filePath) {
  constexpr auto prefix = std::string_view("file://");
  if (filePath.starts_with(prefix)) {
    return filePath.substr(prefix.size());
  }
  return filePath;
}

std::string readFile(const std::string& filePath) {
  std::ifstream input(normalizeFilePath(filePath), std::ios::binary);
  if (!input) {
    throw std::runtime_error("Failed to read markdown file: " + filePath);
  }
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

std::shared_ptr<HybridMarkdownDocumentSpec> createDocument(ParseResult result) {
  const auto documentStartedAt = Clock::now();
  auto timing = MarkdownDocumentTiming(
      static_cast<double>(result.source.size()),
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

} // namespace

HybridMarkdownParser::HybridMarkdownParser() : HybridObject(TAG) {}

std::shared_ptr<HybridMarkdownDocumentSpec> HybridMarkdownParser::parseMarkdown(
    const std::string& markdown,
    double flags) {
  return createDocument(parseMarkdownSource(markdown, flags, 0));
}

std::shared_ptr<Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>> HybridMarkdownParser::parseMarkdownFile(
    const std::string& filePath,
    double flags) {
  return Promise<std::shared_ptr<HybridMarkdownDocumentSpec>>::async([filePath, flags]() -> std::shared_ptr<HybridMarkdownDocumentSpec> {
    const auto readStartedAt = Clock::now();
    std::string source = readFile(filePath);
    const auto readFinishedAt = Clock::now();
    return createDocument(parseMarkdownSource(std::move(source), flags, elapsedMs(readStartedAt, readFinishedAt)));
  });
}

} // namespace margelo::nitro::legenddesktop::markdownparser

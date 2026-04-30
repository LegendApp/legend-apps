#include "HybridMarkdownParser.hpp"

#include "HybridMarkdownDocument.hpp"

#include <algorithm>
#include <chrono>
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

struct ParseResult {
  std::shared_ptr<const MarkdownSource> source;
  std::vector<MarkdownBlockRange> blocks;
  double readMs = 0;
  double mdParseMs = 0;
  double blockRangeMs = 0;
  double parseMs = 0;
};

struct LineInfo {
  size_t start = 0;
  size_t end = 0;
  size_t contentStart = 0;
  char first = 0;
  bool blank = false;
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
  return LineInfo{
      start,
      end,
      contentStart,
      blank ? '\0' : bytes[contentStart],
      blank,
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

bool lineHasPipe(const char* bytes, const LineInfo& line) {
  for (size_t index = line.contentStart; index < line.end; index += 1) {
    if (bytes[index] == '|') {
      return true;
    }
  }
  return false;
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

size_t fencedCodeBlockEnd(const char* bytes, size_t length, size_t offset, char fenceChar);

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
  if (nextStart < length && lineHasPipe(bytes, line)) {
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

} // namespace

HybridMarkdownParser::HybridMarkdownParser() : HybridObject(TAG) {}

std::shared_ptr<Promise<MarkdownFileLoadResult>> HybridMarkdownParser::loadMarkdownFile(
    const std::string& filePath,
    double initialBlockCount) {
  return Promise<MarkdownFileLoadResult>::async([filePath, initialBlockCount]() -> MarkdownFileLoadResult {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    auto document = createDocument(streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
    MarkdownFileLoadResult result;
    result.document = document;
    result.initialBlocks = document->getRenderBlocks(0, initialBlockCount);
    return result;
  });
}

} // namespace margelo::nitro::legenddesktop::markdownparser

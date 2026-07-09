#include "HybridMarkdownParser.hpp"

#include "HybridMarkdownDocument.hpp"
#include "MarkdownBlockParser.hpp"

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

namespace margelo::nitro::legendapps::markdownparser {

namespace {

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

std::shared_ptr<HybridMarkdownDocument> createDocument(std::string filePath, MarkdownParseResult result) {
  const auto documentStartedAt = Clock::now();
  auto timing = MarkdownDocumentTiming(
      static_cast<double>(result.source->size()),
      result.readMs,
      result.mdParseMs,
      result.blockRangeMs,
      result.parseMs,
      0);
  auto document = std::make_shared<HybridMarkdownDocument>(
      std::move(filePath),
      std::move(result.source),
      std::move(result.blocks),
      timing);
  const auto documentFinishedAt = Clock::now();
  document->setDocumentDurationMs(elapsedMs(documentStartedAt, documentFinishedAt));
  registerMarkdownDocument(document);
  return document;
}

} // namespace

HybridMarkdownParser::HybridMarkdownParser() : HybridObject(TAG) {}

std::shared_ptr<Promise<MarkdownFileLoadResult>> HybridMarkdownParser::createMarkdownDocument(
    const std::string& markdown,
    double initialBlockCount) {
  return Promise<MarkdownFileLoadResult>::async([markdown, initialBlockCount]() -> MarkdownFileLoadResult {
    auto document = createDocument(
        "",
        streamMarkdownSource(makeStringSource(markdown), 0));
    MarkdownFileLoadResult result;
    result.document = document;
    result.initialBlocks = document->getBlockMetadata(0, initialBlockCount);
    return result;
  });
}

std::shared_ptr<Promise<MarkdownFileLoadResult>> HybridMarkdownParser::loadMarkdownFile(
    const std::string& filePath,
    double initialBlockCount) {
  return Promise<MarkdownFileLoadResult>::async([filePath, initialBlockCount]() -> MarkdownFileLoadResult {
    const auto readStartedAt = Clock::now();
    auto source = readFileSource(filePath);
    const auto readFinishedAt = Clock::now();
    auto document = createDocument(
        normalizeFilePath(filePath),
        streamMarkdownSource(std::move(source), elapsedMs(readStartedAt, readFinishedAt)));
    MarkdownFileLoadResult result;
    result.document = document;
    result.initialBlocks = document->getBlockMetadata(0, initialBlockCount);
    return result;
  });
}

} // namespace margelo::nitro::legendapps::markdownparser

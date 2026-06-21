#include "HybridSyntaxDocument.hpp"

#include <algorithm>
#include <chrono>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string_view>
#include <thread>

#if defined(__unix__) || defined(__APPLE__)
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace margelo::nitro::legenddesktop::syntaxparser {

namespace {

class StringSyntaxSource final : public SyntaxSource {
public:
  explicit StringSyntaxSource(std::string source) : source_(std::move(source)) {}

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
class MappedSyntaxSource final : public SyntaxSource {
public:
  MappedSyntaxSource(int fd, const char* data, size_t size) : fd_(fd), data_(data), size_(size) {}

  ~MappedSyntaxSource() override {
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

std::shared_ptr<const SyntaxSource> makeStringSource(std::string source) {
  return std::make_shared<StringSyntaxSource>(std::move(source));
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
    throw std::runtime_error("Failed to read syntax file: " + filePath);
  }
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}
#endif

#if defined(__unix__) || defined(__APPLE__)
std::shared_ptr<const SyntaxSource> mapFileSource(const std::string& filePath) {
  const std::string normalizedPath = normalizeFilePath(filePath);
  const int fd = open(normalizedPath.c_str(), O_RDONLY);
  if (fd < 0) {
    throw std::runtime_error("Failed to read syntax file: " + filePath);
  }

  struct stat fileStat {};
  if (fstat(fd, &fileStat) != 0) {
    close(fd);
    throw std::runtime_error("Failed to stat syntax file: " + filePath);
  }

  if (fileStat.st_size <= 0) {
    close(fd);
    return makeStringSource("");
  }

  void* data = mmap(nullptr, static_cast<size_t>(fileStat.st_size), PROT_READ, MAP_PRIVATE, fd, 0);
  if (data == MAP_FAILED) {
    close(fd);
    throw std::runtime_error("Failed to map syntax file: " + filePath);
  }

  return std::make_shared<MappedSyntaxSource>(fd, static_cast<const char*>(data), static_cast<size_t>(fileStat.st_size));
}
#endif

std::shared_ptr<const SyntaxSource> readFileSource(const std::string& filePath) {
#if defined(__unix__) || defined(__APPLE__)
  return mapFileSource(filePath);
#else
  return makeStringSource(readFile(filePath));
#endif
}

std::vector<SyntaxLineRange> indexLines(const SyntaxSource& source) {
  const char* data = source.data();
  const size_t size = source.size();
  std::vector<SyntaxLineRange> lines;
  size_t lineStart = 0;

  for (size_t index = 0; index < size; index += 1) {
    if (data[index] == '\n') {
      size_t lineEnd = index;
      if (lineEnd > lineStart && data[lineEnd - 1] == '\r') {
        lineEnd -= 1;
      }
      lines.push_back({lineStart, lineEnd});
      lineStart = index + 1;
    }
  }

  size_t lineEnd = size;
  if (lineEnd > lineStart && data[lineEnd - 1] == '\r') {
    lineEnd -= 1;
  }
  lines.push_back({lineStart, lineEnd});
  return lines;
}

} // namespace

HybridSyntaxDocument::HybridSyntaxDocument(
    std::string filePath,
    std::shared_ptr<const SyntaxSource> source,
    std::shared_ptr<TextMateHighlighterContext> context,
    std::vector<SyntaxLineRange> lines,
    double mapFileMs,
    double indexLinesMs,
    double contextMs)
    : HybridObject(TAG),
      filePath_(std::move(filePath)),
      source_(std::move(source)),
      context_(std::move(context)),
      lines_(std::move(lines)),
      tokenCache_(lines_.size()),
      nextState_(textmate_get_initial_state()),
      mapFileMs_(mapFileMs),
      indexLinesMs_(indexLinesMs),
      contextMs_(contextMs),
      totalMs_(mapFileMs + indexLinesMs + contextMs) {}

HybridSyntaxDocument::~HybridSyntaxDocument() {
  stopBackgroundTokenization();
}

std::shared_ptr<HybridSyntaxDocument> HybridSyntaxDocument::loadFile(
    const std::string& filePath,
    const std::string& language,
    const std::string& theme) {
  const auto startedAt = SyntaxClock::now();
  auto source = readFileSource(filePath);
  const auto mappedAt = SyntaxClock::now();
  auto lines = indexLines(*source);
  const auto indexedAt = SyntaxClock::now();
  auto context = getHighlighterContext(language, theme);
  const auto contextReadyAt = SyntaxClock::now();
  return std::make_shared<HybridSyntaxDocument>(
      normalizeFilePath(filePath),
      std::move(source),
      std::move(context),
      std::move(lines),
      elapsedSyntaxMs(startedAt, mappedAt),
      elapsedSyntaxMs(mappedAt, indexedAt),
      elapsedSyntaxMs(indexedAt, contextReadyAt));
}

double HybridSyntaxDocument::getLineCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(lines_.size());
}

double HybridSyntaxDocument::getSourceSize() {
  return static_cast<double>(source_->size());
}

std::vector<SyntaxRenderLine> HybridSyntaxDocument::getPlainLines(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));

  std::lock_guard<std::mutex> lock(mutex_);
  if (safeStart >= lines_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(lines_.size(), safeStart + safeCount);
  std::vector<SyntaxRenderLine> renderLines;
  renderLines.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    renderLines.push_back(SyntaxRenderLine(
        static_cast<double>(index),
        lineText(index),
        {}));
  }
  return renderLines;
}

std::vector<SyntaxRenderLine> HybridSyntaxDocument::getRenderLines(double start, double count) {
  const auto safeStart = static_cast<size_t>(std::max(0.0, start));
  const auto safeCount = static_cast<size_t>(std::max(0.0, count));

  std::lock_guard<std::mutex> lock(mutex_);
  if (safeStart >= lines_.size() || safeCount == 0) {
    return {};
  }

  const auto end = std::min(lines_.size(), safeStart + safeCount);
  ensureTokenized(end);

  std::vector<SyntaxRenderLine> renderLines;
  renderLines.reserve(end - safeStart);
  for (size_t index = safeStart; index < end; index += 1) {
    renderLines.push_back(SyntaxRenderLine(
        static_cast<double>(index),
        lineText(index),
        tokenCache_[index]->tokens));
  }
  return renderLines;
}

double HybridSyntaxDocument::getTokenizedLineCount() {
  std::lock_guard<std::mutex> lock(mutex_);
  return static_cast<double>(tokenizedLineCount_);
}

std::vector<SyntaxStyle> HybridSyntaxDocument::getStyles() {
  std::lock_guard<std::mutex> lock(mutex_);
  return styleState_.styles;
}

SyntaxHighlightTiming HybridSyntaxDocument::getTiming() {
  std::lock_guard<std::mutex> lock(mutex_);
  return SyntaxHighlightTiming(
      static_cast<double>(lines_.size()),
      tokenCount_,
      static_cast<double>(styleState_.styles.size()),
      mapFileMs_,
      indexLinesMs_,
      contextMs_,
      initialLinesMs_,
      tokenizeMs_,
      totalMs_);
}

void HybridSyntaxDocument::setInitialLoadTiming(double initialLinesMs, double totalMs) {
  std::lock_guard<std::mutex> lock(mutex_);
  initialLinesMs_ = initialLinesMs;
  totalMs_ = totalMs;
}

double HybridSyntaxDocument::startBackgroundTokenization(double chunkLineCount) {
  stopBackgroundTokenization();

  const auto safeChunkLineCount = static_cast<size_t>(std::max(1.0, chunkLineCount));
  const auto generation = backgroundGeneration_.fetch_add(1) + 1;
  backgroundTokenizationRunning_.store(true);
  auto document = shared_cast<HybridSyntaxDocument>();

  backgroundThread_ = std::thread([document, generation, safeChunkLineCount]() {
    bool shouldContinue = true;

    while (shouldContinue && document->backgroundGeneration_.load() == generation) {
      bool didTokenizeChunk = false;
      {
        std::lock_guard<std::mutex> lock(document->mutex_);
        if (document->tokenizedLineCount_ < document->lines_.size()) {
          const auto nextEnd = std::min(
              document->lines_.size(),
              document->tokenizedLineCount_ + safeChunkLineCount);
          document->ensureTokenized(nextEnd);
          didTokenizeChunk = true;
        } else {
          shouldContinue = false;
        }
      }

      if (shouldContinue && didTokenizeChunk) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    }

    if (document->backgroundGeneration_.load() == generation) {
      document->backgroundTokenizationRunning_.store(false);
    }
  });

  return getTokenizedLineCount();
}

double HybridSyntaxDocument::stopBackgroundTokenization() {
  backgroundGeneration_.fetch_add(1);
  backgroundTokenizationRunning_.store(false);

  if (backgroundThread_.joinable()) {
    if (backgroundThread_.get_id() == std::this_thread::get_id()) {
      backgroundThread_.detach();
    } else {
      backgroundThread_.join();
    }
  }

  return getTokenizedLineCount();
}

size_t HybridSyntaxDocument::getExternalMemorySize() noexcept {
  return source_->externalMemorySize() +
      lines_.capacity() * sizeof(SyntaxLineRange) +
      tokenCache_.capacity() * sizeof(std::optional<CachedSyntaxLine>) +
      styleState_.styles.capacity() * sizeof(SyntaxStyle);
}

void HybridSyntaxDocument::ensureTokenized(size_t endExclusive) {
  const auto end = std::min(lines_.size(), endExclusive);
  if (tokenizedLineCount_ < end) {
    const auto startedAt = SyntaxClock::now();
    std::lock_guard<std::mutex> contextLock(context_->mutex);

    while (tokenizedLineCount_ < end) {
      auto tokenizedLine = tokenizeSyntaxLine(
          *context_,
          lineText(tokenizedLineCount_),
          nextState_,
          styleState_);
      tokenCount_ += tokenizedLine.tokenCount;
      tokenCache_[tokenizedLineCount_] = CachedSyntaxLine{std::move(tokenizedLine.tokens)};
      tokenizedLineCount_ += 1;
    }

    tokenizeMs_ += elapsedSyntaxMs(startedAt, SyntaxClock::now());
  }
}

std::string HybridSyntaxDocument::lineText(size_t index) const {
  const auto& range = lines_[index];
  return std::string(source_->data() + range.start, range.end - range.start);
}

} // namespace margelo::nitro::legenddesktop::syntaxparser

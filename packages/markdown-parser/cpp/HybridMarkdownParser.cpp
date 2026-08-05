#include "HybridMarkdownParser.hpp"

#include "HybridMarkdownDocument.hpp"
#include "MarkdownBlockParser.hpp"

#include <chrono>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace margelo::nitro::legendapps::markdownparser {

namespace {

using Clock = std::chrono::steady_clock;

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::shared_ptr<const MarkdownSource> makeStringSource(std::string source) {
  return ::legendapps::nativetextsource::makeStringTextSource(std::move(source));
}

std::string normalizeFilePath(const std::string& filePath) {
  return ::legendapps::nativetextsource::normalizeTextFilePath(filePath);
}

std::shared_ptr<const MarkdownSource> readFileSource(const std::string& filePath) {
  return ::legendapps::nativetextsource::readTextFileSource(
      filePath,
      {
          "Failed to read markdown file: " + filePath,
          "Failed to stat markdown file: " + filePath,
          "Failed to map markdown file: " + filePath,
      });
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

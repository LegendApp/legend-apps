#include "HybridDiffParser.hpp"

#include "DiffParserCore.hpp"
#include "HybridDiffDocument.hpp"
#include "HybridDiffUrlLoader.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <chrono>
#include <string>

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

using DiffClock = std::chrono::steady_clock;

double elapsedDiffMs(DiffClock::time_point start, DiffClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::shared_ptr<HybridDiffDocument> loadUnifiedDiffDocument(
    const std::string& diffText,
    const std::string& sourceLabel) {
  auto parsed = parseUnifiedDiffText(diffText);

  return std::make_shared<HybridDiffDocument>(
      std::move(parsed.files),
      std::move(parsed.rows),
      std::move(parsed.fileSources),
      "",
      "",
      sourceLabel,
      parsed.timing);
}

std::shared_ptr<HybridDiffDocument> loadGitDiffDocument(const std::string& folderPath) {
  auto parsed = parseGitRepositoryDiff(folderPath);

  return std::make_shared<HybridDiffDocument>(
      std::move(parsed.files),
      std::move(parsed.rows),
      std::move(parsed.fileSources),
      std::move(parsed.repositoryPath),
      std::move(parsed.workdirPath),
      std::move(parsed.headTreeOid),
      parsed.timing);
}

} // namespace

HybridDiffParser::HybridDiffParser() : HybridObject(TAG) {}

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadGitFolderDiff(
    const std::string& folderPath,
    double initialRowCount) {
  return Promise<DiffLoadResult>::async([folderPath, initialRowCount]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadGitDiffDocument(folderPath);
    document->logMemorySnapshot("loadGitFolderDiff.afterDocument");
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
    document->logMemorySnapshot("loadGitFolderDiff.afterInitialRows");
    document->startDefaultBackgroundTokenization();
    document->logMemorySnapshot("loadGitFolderDiff.afterBackgroundStart");
    const auto rowsFinishedAt = DiffClock::now();
    result.scopes = document->getScopes();
    auto timing = document->getTiming();
    timing.documentMs = elapsedDiffMs(startedAt, documentCreatedAt);
    timing.copyFilesMs = elapsedDiffMs(filesStartedAt, filesFinishedAt);
    timing.copyInitialRowsMs = elapsedDiffMs(rowsStartedAt, rowsFinishedAt);
    timing.nativeTotalMs = elapsedDiffMs(startedAt, rowsFinishedAt);
    result.timing = timing;
    return result;
  });
}

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadUnifiedDiff(
    const std::string& diffText,
    const std::string& sourceLabel,
    double initialRowCount) {
  return Promise<DiffLoadResult>::async([diffText, sourceLabel, initialRowCount]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadUnifiedDiffDocument(diffText, sourceLabel);
    document->logMemorySnapshot("loadUnifiedDiff.afterDocument");
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
    document->logMemorySnapshot("loadUnifiedDiff.afterInitialRows");
    document->startDefaultBackgroundTokenization();
    document->logMemorySnapshot("loadUnifiedDiff.afterBackgroundStart");
    const auto rowsFinishedAt = DiffClock::now();
    result.scopes = document->getScopes();
    auto timing = document->getTiming();
    timing.documentMs = elapsedDiffMs(startedAt, documentCreatedAt);
    timing.copyFilesMs = elapsedDiffMs(filesStartedAt, filesFinishedAt);
    timing.copyInitialRowsMs = elapsedDiffMs(rowsStartedAt, rowsFinishedAt);
    timing.nativeTotalMs = elapsedDiffMs(startedAt, rowsFinishedAt);
    result.timing = timing;
    return result;
  });
}

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadUnifiedDiffFromUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel,
    double initialRowCount) {
  return Promise<DiffLoadResult>::async([diffUrl, sourceLabel, initialRowCount]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    const auto diff = loadDiffUrlText(diffUrl);
    auto document = loadUnifiedDiffDocument(diff.text, sourceLabel);
    document->logMemorySnapshot("loadUnifiedDiffFromUrl.afterDocument");
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
    document->logMemorySnapshot("loadUnifiedDiffFromUrl.afterInitialRows");
    document->startDefaultBackgroundTokenization();
    document->logMemorySnapshot("loadUnifiedDiffFromUrl.afterBackgroundStart");
    const auto rowsFinishedAt = DiffClock::now();
    result.scopes = document->getScopes();
    auto timing = document->getTiming();
    timing.fetchMs = diff.fetchMs;
    timing.documentMs = elapsedDiffMs(startedAt, documentCreatedAt);
    timing.copyFilesMs = elapsedDiffMs(filesStartedAt, filesFinishedAt);
    timing.copyInitialRowsMs = elapsedDiffMs(rowsStartedAt, rowsFinishedAt);
    timing.nativeTotalMs = elapsedDiffMs(startedAt, rowsFinishedAt);
    result.timing = timing;
    return result;
  });
}

} // namespace margelo::nitro::legenddesktop::diffparser

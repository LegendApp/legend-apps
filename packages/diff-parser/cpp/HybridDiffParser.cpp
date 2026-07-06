#include "HybridDiffParser.hpp"

#include "DiffParserCore.hpp"
#include "HybridDiffDocument.hpp"
#include "HybridDiffLaunchPrefetch.hpp"
#include "HybridDiffLoadSession.hpp"
#include "HybridDiffUrlLoader.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <chrono>
#include <cstdio>
#include <string>

#ifdef __APPLE__
#include <os/log.h>
#endif

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

using DiffClock = std::chrono::steady_clock;

#ifdef __APPLE__
os_log_t diffTimingLog() {
  static os_log_t log = os_log_create("app.legend.diff.macos", "memory");
  return log;
}
#endif

void logDiffTimingMessage(const std::string& message) {
  (void)message;
#if DEBUG
#ifdef __APPLE__
  os_log_with_type(diffTimingLog(), OS_LOG_TYPE_DEFAULT, "%{public}s", message.c_str());
#else
  std::fprintf(stderr, "%s\n", message.c_str());
#endif
#endif
}

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

std::shared_ptr<HybridDiffDocument> loadGitDiffDocument(const std::string& folderPath, bool showOnlyHunks) {
  auto parsed = parseGitRepositoryDiff(folderPath, showOnlyHunks);

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

double HybridDiffParser::logTimingMark(const std::string& message) {
  logDiffTimingMessage(message);
  return 1;
}

std::shared_ptr<HybridDiffLoadSessionSpec> HybridDiffParser::startGitFolderDiff(
    const std::string& folderPath,
    bool showOnlyHunks) {
  return HybridDiffLoadSession::create(folderPath, showOnlyHunks);
}

std::shared_ptr<HybridDiffLoadSessionSpec> HybridDiffParser::startUnifiedDiffFromUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel) {
  auto prefetchedSession = claimLaunchPrefetchedUnifiedDiffUrl(diffUrl, sourceLabel);
  if (prefetchedSession) {
    return prefetchedSession;
  }
  return HybridDiffLoadSession::createUnifiedDiffUrl(diffUrl, sourceLabel);
}

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadGitFolderDiff(
    const std::string& folderPath,
    double initialRowCount,
    bool showOnlyHunks) {
  return Promise<DiffLoadResult>::async([folderPath, initialRowCount, showOnlyHunks]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadGitDiffDocument(folderPath, showOnlyHunks);
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
    const auto rowsFinishedAt = DiffClock::now();
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
    const auto rowsFinishedAt = DiffClock::now();
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
    const auto rowsFinishedAt = DiffClock::now();
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

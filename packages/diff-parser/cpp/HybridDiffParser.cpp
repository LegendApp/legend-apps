#include "HybridDiffParser.hpp"

#include "DiffParserCore.hpp"
#include "HybridDiffDocument.hpp"
#include "HybridDiffLaunchPrefetch.hpp"
#include "HybridDiffLoadSession.hpp"
#include "HybridDiffUrlLoader.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>
#include <map>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>

namespace margelo::nitro::legendapps::diffparser {

namespace {

using DiffClock = std::chrono::steady_clock;

double elapsedDiffMs(DiffClock::time_point start, DiffClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::string readDiffFile(const std::string& filePath) {
  std::ifstream input(filePath, std::ios::binary);
  if (!input) {
    throw std::runtime_error("Unable to open diff file: " + filePath);
  }
  std::ostringstream contents;
  contents << input.rdbuf();
  if (input.bad()) {
    throw std::runtime_error("Unable to read diff file: " + filePath);
  }
  return contents.str();
}

std::shared_ptr<HybridDiffDocument> loadUnifiedDiffDocument(
    const std::string& diffText,
    const std::string& sourceLabel,
    bool ignoreWhitespaceChanges) {
  auto parsed = parseUnifiedDiffText(diffText, ignoreWhitespaceChanges);

  return std::make_shared<HybridDiffDocument>(
      std::move(parsed.files),
      std::move(parsed.rows),
      std::move(parsed.fileSources),
      "",
      "",
      sourceLabel,
      createUnifiedDiffBackingStore(),
      parsed.timing);
}

DiffGitCompareOptions createCompareOptions(
    const std::string& compareBaseKind,
    const std::string& compareBaseRef,
    bool compareUseMergeBase,
    bool ignoreWhitespaceChanges,
    const std::vector<std::string>& excludePaths) {
  return DiffGitCompareOptions{
      .baseKind = compareBaseKind,
      .baseRef = compareBaseRef,
      .useMergeBase = compareUseMergeBase,
      .ignoreWhitespace = ignoreWhitespaceChanges,
      .excludePaths = excludePaths,
  };
}

std::shared_ptr<HybridDiffDocument> loadGitDiffDocument(
    const std::string& folderPath,
    bool showOnlyHunks,
    DiffGitCompareOptions compareOptions) {
  auto parsed = parseGitRepositoryDiff(folderPath, showOnlyHunks, std::move(compareOptions));
  auto backingStore = createLocalRepoDiffBackingStore(parsed.repositoryPath, parsed.workdirPath, parsed.headTreeOid);

  return std::make_shared<HybridDiffDocument>(
      std::move(parsed.files),
      std::move(parsed.rows),
      std::move(parsed.fileSources),
      std::move(parsed.repositoryPath),
      std::move(parsed.workdirPath),
      std::move(parsed.headTreeOid),
      std::move(backingStore),
      parsed.timing);
}

struct GitHistoryEntry {
  std::shared_ptr<GitHistoryWalker> walker;
  std::shared_ptr<std::atomic<bool>> closed;
};

std::mutex gitHistoryMutex;
std::map<double, GitHistoryEntry> gitHistories;
double nextGitHistoryHandle = 1;

GitHistoryEntry findGitHistory(double handle) {
  std::lock_guard<std::mutex> lock(gitHistoryMutex);
  const auto found = gitHistories.find(handle);
  if (found == gitHistories.end()) throw std::runtime_error("History read was cancelled.");
  return found->second;
}

} // namespace

HybridDiffParser::HybridDiffParser() : HybridObject(TAG) {}

std::shared_ptr<HybridDiffLoadSessionSpec> HybridDiffParser::startGitFolderDiff(
    const std::string& folderPath,
    bool showOnlyHunks,
    const std::string& compareBaseKind,
    const std::string& compareBaseRef,
    bool compareUseMergeBase,
    bool ignoreWhitespaceChanges,
    const std::vector<std::string>& excludePaths) {
  return HybridDiffLoadSession::create(
      folderPath,
      showOnlyHunks,
      createCompareOptions(compareBaseKind, compareBaseRef, compareUseMergeBase, ignoreWhitespaceChanges, excludePaths));
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
    bool showOnlyHunks,
    const std::string& compareBaseKind,
    const std::string& compareBaseRef,
    bool compareUseMergeBase,
    bool ignoreWhitespaceChanges,
    const std::vector<std::string>& excludePaths) {
  return Promise<DiffLoadResult>::async([folderPath, initialRowCount, showOnlyHunks, compareOptions = createCompareOptions(compareBaseKind, compareBaseRef, compareUseMergeBase, ignoreWhitespaceChanges, excludePaths)]() mutable -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadGitDiffDocument(folderPath, showOnlyHunks, std::move(compareOptions));
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
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
    double initialRowCount,
    bool ignoreWhitespaceChanges) {
  return Promise<DiffLoadResult>::async([diffText, sourceLabel, initialRowCount, ignoreWhitespaceChanges]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadUnifiedDiffDocument(diffText, sourceLabel, ignoreWhitespaceChanges);
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
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

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadUnifiedDiffFile(
    const std::string& filePath,
    const std::string& sourceLabel,
    double initialRowCount,
    bool ignoreWhitespaceChanges) {
  return Promise<DiffLoadResult>::async([filePath, sourceLabel, initialRowCount, ignoreWhitespaceChanges]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    const auto diffText = readDiffFile(filePath);
    const auto fileReadAt = DiffClock::now();
    auto document = loadUnifiedDiffDocument(diffText, sourceLabel, ignoreWhitespaceChanges);
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
    const auto rowsFinishedAt = DiffClock::now();
    auto timing = document->getTiming();
    timing.fetchMs = elapsedDiffMs(startedAt, fileReadAt);
    timing.documentMs = elapsedDiffMs(fileReadAt, documentCreatedAt);
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
    double initialRowCount,
    bool ignoreWhitespaceChanges) {
  return Promise<DiffLoadResult>::async([diffUrl, sourceLabel, initialRowCount, ignoreWhitespaceChanges]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    const auto diff = loadDiffUrlText(diffUrl);
    auto document = loadUnifiedDiffDocument(diff.text, sourceLabel, ignoreWhitespaceChanges);
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
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

std::shared_ptr<Promise<GitHistoryHead>> HybridDiffParser::openGitHistory(const std::string& folderPath) {
  return Promise<GitHistoryHead>::async([folderPath]() -> GitHistoryHead {
    auto walker = std::make_shared<GitHistoryWalker>(folderPath);
    GitHistoryHead head;
    head.headOid = walker->headOid();
    head.unborn = walker->unborn();
    head.detached = walker->detached();
    std::lock_guard<std::mutex> lock(gitHistoryMutex);
    head.handle = nextGitHistoryHandle++;
    gitHistories.emplace(head.handle, GitHistoryEntry{std::move(walker), std::make_shared<std::atomic<bool>>(false)});
    return head;
  });
}

std::shared_ptr<Promise<GitHistoryPage>> HybridDiffParser::readGitHistoryPage(double handle, double offset, double count) {
  return Promise<GitHistoryPage>::async([handle, offset, count]() -> GitHistoryPage {
    if (!(offset >= 0) || !(count >= 0) || std::floor(offset) != offset || std::floor(count) != count) {
      throw std::runtime_error("History pages need a whole, non-negative offset and count.");
    }
    const auto entry = findGitHistory(handle);
    const auto start = static_cast<size_t>(offset);
    const auto rows = entry.walker->page(start, static_cast<size_t>(count), [closed = entry.closed] { return closed->load(); });
    if (entry.closed->load()) throw std::runtime_error("History read was cancelled.");
    GitHistoryPage page;
    page.offset = offset;
    page.done = rows.size() < static_cast<size_t>(count);
    page.commits.reserve(rows.size());
    for (const auto& row : rows) {
      page.commits.push_back(GitHistoryCommit(row.oid, row.parents, row.authorName, row.authorEmail, row.time, row.summary));
    }
    return page;
  });
}

void HybridDiffParser::closeGitHistory(double handle) {
  std::lock_guard<std::mutex> lock(gitHistoryMutex);
  const auto found = gitHistories.find(handle);
  if (found == gitHistories.end()) return;
  found->second.closed->store(true);
  gitHistories.erase(found);
}

} // namespace margelo::nitro::legendapps::diffparser

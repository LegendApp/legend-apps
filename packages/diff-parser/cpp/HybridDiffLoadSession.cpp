#include "HybridDiffLoadSession.hpp"

#include "DiffParserCore.hpp"
#include "HybridDiffUrlLoader.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <exception>
#include <utility>

namespace margelo::nitro::legendapps::diffparser {

namespace {

using DiffClock = std::chrono::steady_clock;

double elapsedSessionMs(DiffClock::time_point start, DiffClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}


DiffLoadTiming createEmptyTiming() {
  DiffLoadTiming timing;
  timing.diffMs = 0;
  timing.fetchMs = 0;
  timing.openRepoMs = 0;
  timing.createDiffMs = 0;
  timing.walkDiffMs = 0;
  timing.documentMs = 0;
  timing.copyFilesMs = 0;
  timing.copyInitialRowsMs = 0;
  timing.nativeTotalMs = 0;
  timing.rowCount = 0;
  timing.fileCount = 0;
  return timing;
}

} // namespace

std::shared_ptr<HybridDiffLoadSession> HybridDiffLoadSession::create(
    const std::string& folderPath,
    bool showOnlyHunks,
    DiffGitCompareOptions compareOptions) {
  auto session = std::make_shared<HybridDiffLoadSession>(folderPath, showOnlyHunks, std::move(compareOptions));
  session->start();
  return session;
}

std::shared_ptr<HybridDiffLoadSession> HybridDiffLoadSession::createUnifiedDiffUrl(
    const std::string& diffUrl,
    const std::string& sourceLabel) {
  auto session = std::make_shared<HybridDiffLoadSession>(diffUrl, sourceLabel);
  session->start();
  return session;
}

HybridDiffLoadSession::HybridDiffLoadSession(std::string folderPath, bool showOnlyHunks, DiffGitCompareOptions compareOptions)
    : HybridObject(TAG),
      kind_(Kind::GitFolder),
      folderPath_(std::move(folderPath)),
      showOnlyHunks_(showOnlyHunks),
      compareOptions_(std::move(compareOptions)),
      document_(std::make_shared<HybridDiffDocument>(
          std::vector<DiffFileSummary>(),
          std::vector<DiffRenderRow>(),
          std::vector<DiffFileSources>(),
          "",
          "",
          "",
          createLocalRepoDiffBackingStore("", "", ""),
          createEmptyTiming())) {}

HybridDiffLoadSession::HybridDiffLoadSession(std::string diffUrl, std::string sourceLabel)
    : HybridObject(TAG),
      kind_(Kind::UnifiedDiffUrl),
      diffUrl_(std::move(diffUrl)),
      sourceLabel_(std::move(sourceLabel)),
      showOnlyHunks_(true),
      document_(std::make_shared<HybridDiffDocument>(
          std::vector<DiffFileSummary>(),
          std::vector<DiffRenderRow>(),
          std::vector<DiffFileSources>(),
          "",
          "",
          sourceLabel_,
          createUnifiedDiffBackingStore(),
          createEmptyTiming())) {}

HybridDiffLoadSession::~HybridDiffLoadSession() {
  cancel();
  joinWorker();
}

std::shared_ptr<HybridDiffDocumentSpec> HybridDiffLoadSession::getDocument() {
  return document_;
}

DiffLoadStatus HybridDiffLoadSession::getProgress() {
  std::string error;
  {
    std::lock_guard<std::mutex> lock(errorMutex_);
    error = error_;
  }

  return DiffLoadStatus(
      document_->getRowCount(),
      document_->getFileCount(),
      static_cast<double>(rowVersion_.load()),
      static_cast<double>(fileVersion_.load()),
      complete_.load(),
      cancelled_.load(),
      std::move(error));
}

DiffLoadProgress HybridDiffLoadSession::consumeChanges(double initialRowCount) {
  std::string error;
  {
    std::lock_guard<std::mutex> lock(errorMutex_);
    error = error_;
  }

  const auto safeInitialRowCount = std::max(0.0, initialRowCount);
  return DiffLoadProgress(
      document_,
      document_->getFiles(),
      document_->getPlainRows(0, safeInitialRowCount),
      std::vector<DiffSyntaxScope>(),
      document_->getTiming(),
      document_->getRowCount(),
      document_->getFileCount(),
      static_cast<double>(rowVersion_.load()),
      static_cast<double>(fileVersion_.load()),
      complete_.load(),
      cancelled_.load(),
      std::move(error));
}

double HybridDiffLoadSession::cancel() {
  cancelled_.store(true);
  return 1;
}

size_t HybridDiffLoadSession::getExternalMemorySize() noexcept {
  return 0;
}

void HybridDiffLoadSession::start() {
  workerThread_ = std::thread([this] {
    run();
  });
}

void HybridDiffLoadSession::run() {
  if (kind_ == Kind::UnifiedDiffUrl) {
    runUnifiedDiffUrl();
  } else {
    runGitFolder();
  }
}

void HybridDiffLoadSession::runGitFolder() {
  const auto startedAt = DiffClock::now();
  try {
    DiffLoadTiming timing;
    if (compareOptions_.ignoreWhitespace) {
      auto parsed = parseGitRepositoryDiff(
          folderPath_,
          showOnlyHunks_,
          compareOptions_,
          [this] {
            return cancelled_.load();
          });
      document_->setProgressRepositoryMetadata(
          std::move(parsed.repositoryPath),
          std::move(parsed.workdirPath),
          std::move(parsed.headTreeOid));
      for (size_t fileIndex = 0; fileIndex < parsed.files.size() && !cancelled_.load(); fileIndex += 1) {
        const auto& file = parsed.files[fileIndex];
        const size_t rowStart = static_cast<size_t>(std::max(0.0, std::floor(file.rowStart)));
        const size_t rowEnd = std::min(
            parsed.rows.size(),
            rowStart + static_cast<size_t>(std::max(0.0, std::floor(file.rowCount))));
        if (rowStart < rowEnd && fileIndex < parsed.fileSources.size()) {
          document_->appendProgressFile(file, parsed.fileSources[fileIndex], parsed.rows[rowStart]);
          for (size_t rowIndex = rowStart + 1; rowIndex < rowEnd; rowIndex += 1) {
            document_->appendProgressRow(parsed.rows[rowIndex]);
          }
          rowVersion_.fetch_add(rowEnd - rowStart);
          fileVersion_.fetch_add(1);
        }
      }
      timing = parsed.timing;
    } else {
      timing = parseGitRepositoryDiffProgressiveByFile(folderPath_, DiffProgressiveCallbacks{
        .shouldCancel = [this] {
          return cancelled_.load();
        },
        .onRepositoryMetadata = [this](DiffRepositoryMetadata metadata) {
          document_->setProgressRepositoryMetadata(
              std::move(metadata.repositoryPath),
              std::move(metadata.workdirPath),
              std::move(metadata.headTreeOid));
        },
        .onFilesDiscovered = [this](std::vector<DiffFileSummary> files, std::vector<DiffFileSources> fileSources) {
          document_->setProgressFiles(std::move(files), std::move(fileSources));
          fileVersion_.fetch_add(1);
        },
        .onFile = [this](const DiffFileSummary& file, const DiffFileSources& fileSources, const DiffRenderRow& headerRow) {
          if (file.index < document_->getFileCount()) {
            document_->updateProgressFile(file);
            document_->appendProgressRow(headerRow);
          } else {
            document_->appendProgressFile(file, fileSources, headerRow);
          }
          rowVersion_.fetch_add(1);
          fileVersion_.fetch_add(1);
        },
        .onRow = [this](const DiffRenderRow& row) {
          document_->appendProgressRow(row);
          rowVersion_.fetch_add(1);
        },
        .onFileFinished = [this](const DiffFileSummary& file) {
          document_->updateProgressFile(file);
          fileVersion_.fetch_add(1);
        },
      }, showOnlyHunks_, compareOptions_);
    }
    timing.documentMs = elapsedSessionMs(startedAt, DiffClock::now());
    timing.nativeTotalMs = timing.documentMs;
    document_->setProgressTiming(timing);
  } catch (const std::exception& error) {
    setError(error.what());
  } catch (...) {
    setError("Failed to load git diff");
  }

  complete_.store(true);
  rowVersion_.fetch_add(1);
  fileVersion_.fetch_add(1);
}

void HybridDiffLoadSession::runUnifiedDiffUrl() {
  const auto startedAt = DiffClock::now();
  try {
    UnifiedDiffStreamParser parser(DiffProgressiveCallbacks{
        .shouldCancel = [this] {
          return cancelled_.load();
        },
        .onFile = [this](const DiffFileSummary& file, const DiffFileSources& fileSources, const DiffRenderRow& headerRow) {
          document_->appendProgressFile(file, fileSources, headerRow);
          rowVersion_.fetch_add(1);
          fileVersion_.fetch_add(1);
        },
        .onRow = [this](const DiffRenderRow& row) {
          document_->appendProgressRow(row);
          rowVersion_.fetch_add(1);
        },
        .onFileFinished = [this](const DiffFileSummary& file) {
          document_->updateProgressFile(file);
          fileVersion_.fetch_add(1);
        },
    });
    const auto fetchMs = loadDiffUrlChunks(
        diffUrl_,
        [&parser](std::string_view chunk) {
          parser.append(chunk);
        },
        [this] {
          return cancelled_.load();
        });
    auto timing = parser.finish();
    timing.fetchMs = fetchMs;
    timing.documentMs = elapsedSessionMs(startedAt, DiffClock::now());
    timing.nativeTotalMs = timing.documentMs;
    document_->setProgressTiming(timing);
  } catch (const std::exception& error) {
    setError(error.what());
  } catch (...) {
    setError("Failed to load diff URL");
  }

  complete_.store(true);
  rowVersion_.fetch_add(1);
  fileVersion_.fetch_add(1);
}

void HybridDiffLoadSession::joinWorker() {
  if (workerThread_.joinable()) {
    if (workerThread_.get_id() == std::this_thread::get_id()) {
      workerThread_.detach();
    } else {
      workerThread_.join();
    }
  }
}

void HybridDiffLoadSession::setError(std::string error) {
  std::lock_guard<std::mutex> lock(errorMutex_);
  error_ = std::move(error);
}

} // namespace margelo::nitro::legendapps::diffparser

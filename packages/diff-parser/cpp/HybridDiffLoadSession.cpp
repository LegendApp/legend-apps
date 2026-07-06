#include "HybridDiffLoadSession.hpp"

#include "DiffParserCore.hpp"
#include "HybridDiffUrlLoader.hpp"

#include <algorithm>
#include <chrono>
#include <exception>
#include <utility>

namespace margelo::nitro::legenddesktop::diffparser {

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

std::shared_ptr<HybridDiffLoadSession> HybridDiffLoadSession::create(const std::string& folderPath, bool showOnlyHunks) {
  auto session = std::make_shared<HybridDiffLoadSession>(folderPath, showOnlyHunks);
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

HybridDiffLoadSession::HybridDiffLoadSession(std::string folderPath, bool showOnlyHunks)
    : HybridObject(TAG),
      kind_(Kind::GitFolder),
      folderPath_(std::move(folderPath)),
      showOnlyHunks_(showOnlyHunks),
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
  document_->logMemorySnapshot("progressive.runStart");
  try {
    auto timing = parseGitRepositoryDiffProgressiveByFile(folderPath_, DiffProgressiveCallbacks{
        .shouldCancel = [this] {
          return cancelled_.load();
        },
        .onPhase = [this](const std::string& phase) {
          document_->logMemorySnapshot("progressive." + phase);
        },
        .onRepositoryMetadata = [this](DiffRepositoryMetadata metadata) {
          document_->setProgressRepositoryMetadata(
              std::move(metadata.repositoryPath),
              std::move(metadata.workdirPath),
              std::move(metadata.headTreeOid));
          document_->logMemorySnapshot("progressive.repositoryMetadata");
        },
        .onFilesDiscovered = [this](std::vector<DiffFileSummary> files, std::vector<DiffFileSources> fileSources) {
          document_->setProgressFiles(std::move(files), std::move(fileSources));
          fileVersion_.fetch_add(1);
          if (!firstFilesLogged_.load() && document_->getFileCount() > 0 && !firstFilesLogged_.exchange(true)) {
            document_->logMemorySnapshot("progressive.firstFiles");
          }
        },
        .onFile = [this](const DiffFileSummary& file, const DiffFileSources& fileSources, const DiffRenderRow& headerRow) {
          (void)fileSources;
          document_->updateProgressFile(file);
          document_->appendProgressRow(headerRow);
          rowVersion_.fetch_add(1);
          fileVersion_.fetch_add(1);
          noteRowsAvailable();
        },
        .onRow = [this](const DiffRenderRow& row) {
          document_->appendProgressRow(row);
          rowVersion_.fetch_add(1);
          noteRowsAvailable();
        },
        .onFileFinished = [this](const DiffFileSummary& file) {
          document_->updateProgressFile(file);
          fileVersion_.fetch_add(1);
        },
    }, showOnlyHunks_);
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
  document_->logMemorySnapshot("progressive.complete");
}

void HybridDiffLoadSession::runUnifiedDiffUrl() {
  const auto startedAt = DiffClock::now();
  document_->logMemorySnapshot("progressiveUrl.runStart");
  try {
    UnifiedDiffStreamParser parser(DiffProgressiveCallbacks{
        .shouldCancel = [this] {
          return cancelled_.load();
        },
        .onFile = [this](const DiffFileSummary& file, const DiffFileSources& fileSources, const DiffRenderRow& headerRow) {
          document_->appendProgressFile(file, fileSources, headerRow);
          rowVersion_.fetch_add(1);
          fileVersion_.fetch_add(1);
          if (!firstFilesLogged_.load() && document_->getFileCount() > 0 && !firstFilesLogged_.exchange(true)) {
            document_->logMemorySnapshot("progressiveUrl.firstFiles");
          }
          noteRowsAvailable();
        },
        .onRow = [this](const DiffRenderRow& row) {
          document_->appendProgressRow(row);
          rowVersion_.fetch_add(1);
          noteRowsAvailable();
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
  document_->logMemorySnapshot("progressiveUrl.complete");
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

void HybridDiffLoadSession::noteRowsAvailable() {
  if (!firstRowsLogged_.load() && document_->getRowCount() > 0 && !firstRowsLogged_.exchange(true)) {
    document_->logMemorySnapshot("progressive.firstRows");
  }
  if (!initialRowsLogged_.load() && document_->getRowCount() >= 160 && !initialRowsLogged_.exchange(true)) {
    document_->logMemorySnapshot("progressive.initialRows");
  }
}

void HybridDiffLoadSession::setError(std::string error) {
  std::lock_guard<std::mutex> lock(errorMutex_);
  error_ = std::move(error);
}

} // namespace margelo::nitro::legenddesktop::diffparser

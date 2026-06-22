#include "HybridDiffParser.hpp"

#include "HybridDiffDocument.hpp"

#include <algorithm>
#include <chrono>
#include "git2.h"
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

constexpr double diffRowKindFileHeader = 0;
constexpr double diffRowKindLine = 2;

constexpr double diffChangeTypeContext = 0;
constexpr double diffChangeTypeAdd = 1;
constexpr double diffChangeTypeRemove = 2;
constexpr double diffChangeTypeMeta = 3;

using DiffClock = std::chrono::steady_clock;

double elapsedDiffMs(DiffClock::time_point start, DiffClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::string normalizeFolderPath(const std::string& folderPath) {
  constexpr auto prefix = std::string_view("file://");
  if (folderPath.starts_with(prefix)) {
    return folderPath.substr(prefix.size());
  }
  return folderPath;
}

std::string gitErrorMessage(const std::string& fallback) {
  const git_error* error = giterr_last();
  if (error == nullptr || error->message == nullptr) {
    return fallback;
  }
  return fallback + ": " + error->message;
}

struct GitRepositoryDeleter {
  void operator()(git_repository* repo) const {
    git_repository_free(repo);
  }
};

struct GitDiffDeleter {
  void operator()(git_diff_list* diff) const {
    git_diff_list_free(diff);
  }
};

std::string deltaPath(const git_diff_delta* delta) {
  const char* path = delta->new_file.path != nullptr ? delta->new_file.path : delta->old_file.path;
  return path != nullptr ? std::string(path) : std::string();
}

std::string oldDeltaPath(const git_diff_delta* delta) {
  const char* path = delta->old_file.path != nullptr ? delta->old_file.path : delta->new_file.path;
  return path != nullptr ? std::string(path) : std::string();
}

std::string deltaStatus(const git_diff_delta* delta) {
  switch (delta->status) {
    case GIT_DELTA_ADDED:
      return "added";
    case GIT_DELTA_DELETED:
      return "deleted";
    case GIT_DELTA_MODIFIED:
      return "modified";
    case GIT_DELTA_RENAMED:
      return "renamed";
    case GIT_DELTA_COPIED:
      return "copied";
    case GIT_DELTA_UNTRACKED:
      return "untracked";
    default:
      return "unknown";
  }
}

std::string trimDiffLine(const char* content, size_t contentLength) {
  if (content == nullptr || contentLength <= 0) {
    return "";
  }

  size_t length = contentLength;
  while (length > 0 && (content[length - 1] == '\n' || content[length - 1] == '\r')) {
    length -= 1;
  }
  return std::string(content, length);
}

struct DiffBuildState {
  std::vector<DiffFileSummary> files;
  std::vector<DiffRenderRow> rows;
  int currentFileIndex = -1;
  int currentHunkIndex = -1;
  int currentOldLine = -1;
  int currentNewLine = -1;

  void finishCurrentFile() {
    if (currentFileIndex >= 0 && static_cast<size_t>(currentFileIndex) < files.size()) {
      auto& file = files[static_cast<size_t>(currentFileIndex)];
      file.rowCount = static_cast<double>(rows.size()) - file.rowStart;
    }
  }
};

int onFile(void* payload, git_diff_delta* delta, float) {
  auto* state = static_cast<DiffBuildState*>(payload);
  state->finishCurrentFile();

  const double fileIndex = static_cast<double>(state->files.size());
  state->currentFileIndex = static_cast<int>(state->files.size());
  state->currentHunkIndex = -1;

  DiffFileSummary file;
  file.index = fileIndex;
  file.path = deltaPath(delta);
  file.oldPath = oldDeltaPath(delta);
  file.status = deltaStatus(delta);
  file.additions = 0;
  file.deletions = 0;
  file.rowStart = static_cast<double>(state->rows.size());
  file.rowCount = 0;
  file.isBinary = delta->binary != 0;
  state->files.push_back(std::move(file));

  DiffRenderRow row;
  row.index = static_cast<double>(state->rows.size());
  row.kind = diffRowKindFileHeader;
  row.fileIndex = fileIndex;
  row.hunkIndex = -1;
  row.oldLineNumber = -1;
  row.newLineNumber = -1;
  row.changeType = diffChangeTypeMeta;
  row.text = state->files.back().path;
  state->rows.push_back(std::move(row));
  return 0;
}

int onHunk(void* payload, git_diff_delta*, git_diff_range* range, const char*, size_t) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex < 0) {
    return 0;
  }

  state->currentHunkIndex += 1;
  state->currentOldLine = range->old_start;
  state->currentNewLine = range->new_start;
  return 0;
}

int onLine(
    void* payload,
    git_diff_delta*,
    git_diff_range*,
    char lineOrigin,
    const char* content,
    size_t contentLength) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex < 0) {
    return 0;
  }

  double changeType = diffChangeTypeContext;
  double oldLineNumber = -1;
  double newLineNumber = -1;
  if (lineOrigin == GIT_DIFF_LINE_ADDITION) {
    changeType = diffChangeTypeAdd;
    newLineNumber = static_cast<double>(state->currentNewLine);
    state->currentNewLine += 1;
    state->files[static_cast<size_t>(state->currentFileIndex)].additions += 1;
  } else if (lineOrigin == GIT_DIFF_LINE_DELETION) {
    changeType = diffChangeTypeRemove;
    oldLineNumber = static_cast<double>(state->currentOldLine);
    state->currentOldLine += 1;
    state->files[static_cast<size_t>(state->currentFileIndex)].deletions += 1;
  } else if (lineOrigin == GIT_DIFF_LINE_ADD_EOFNL) {
    changeType = diffChangeTypeAdd;
  } else if (lineOrigin == GIT_DIFF_LINE_DEL_EOFNL) {
    changeType = diffChangeTypeRemove;
  } else {
    oldLineNumber = static_cast<double>(state->currentOldLine);
    newLineNumber = static_cast<double>(state->currentNewLine);
    state->currentOldLine += 1;
    state->currentNewLine += 1;
  }

  DiffRenderRow row;
  row.index = static_cast<double>(state->rows.size());
  row.kind = diffRowKindLine;
  row.fileIndex = static_cast<double>(state->currentFileIndex);
  row.hunkIndex = static_cast<double>(state->currentHunkIndex);
  row.oldLineNumber = oldLineNumber;
  row.newLineNumber = newLineNumber;
  row.changeType = changeType;
  row.text = trimDiffLine(content, contentLength);
  state->rows.push_back(std::move(row));
  return 0;
}

std::shared_ptr<HybridDiffDocument> loadGitDiffDocument(const std::string& folderPath) {
  const auto loadStartedAt = DiffClock::now();
  git_repository* rawRepo = nullptr;
  const std::string normalizedPath = normalizeFolderPath(folderPath);
  if (git_repository_open_ext(&rawRepo, normalizedPath.c_str(), 0, nullptr) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to open git repository"));
  }
  const auto repoOpenedAt = DiffClock::now();
  std::unique_ptr<git_repository, GitRepositoryDeleter> repo(rawRepo);

  git_diff_options options = {};
  options.flags = GIT_DIFF_INCLUDE_UNTRACKED | GIT_DIFF_RECURSE_UNTRACKED_DIRS;
  git_diff_list* rawDiff = nullptr;
  if (git_diff_workdir_to_index(repo.get(), &options, &rawDiff) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to create git diff"));
  }
  const auto diffCreatedAt = DiffClock::now();
  std::unique_ptr<git_diff_list, GitDiffDeleter> diff(rawDiff);

  DiffBuildState state;
  if (git_diff_foreach(diff.get(), &state, onFile, onHunk, onLine) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to read git diff"));
  }
  state.finishCurrentFile();
  const auto diffWalkedAt = DiffClock::now();

  DiffLoadTiming timing;
  timing.openRepoMs = elapsedDiffMs(loadStartedAt, repoOpenedAt);
  timing.createDiffMs = elapsedDiffMs(repoOpenedAt, diffCreatedAt);
  timing.walkDiffMs = elapsedDiffMs(diffCreatedAt, diffWalkedAt);
  timing.diffMs = timing.walkDiffMs;
  timing.documentMs = 0;
  timing.copyFilesMs = 0;
  timing.copyInitialRowsMs = 0;
  timing.nativeTotalMs = elapsedDiffMs(loadStartedAt, diffWalkedAt);
  timing.rowCount = static_cast<double>(state.rows.size());
  timing.fileCount = static_cast<double>(state.files.size());

  return std::make_shared<HybridDiffDocument>(std::move(state.files), std::move(state.rows), timing);
}

} // namespace

HybridDiffParser::HybridDiffParser() : HybridObject(TAG) {}

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadGitFolderDiff(
    const std::string& folderPath,
    double initialRowCount) {
  return Promise<DiffLoadResult>::async([folderPath, initialRowCount]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadGitDiffDocument(folderPath);
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getRows(0, initialRowCount);
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

} // namespace margelo::nitro::legenddesktop::diffparser

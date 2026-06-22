#include "HybridDiffParser.hpp"

#include "HybridDiffDocument.hpp"

#include <algorithm>
#include <chrono>
#include <git2.h>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

constexpr double diffRowKindFileHeader = 0;
constexpr double diffRowKindHunkHeader = 1;
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
  const git_error* error = git_error_last();
  if (error == nullptr || error->message == nullptr) {
    return fallback;
  }
  return fallback + ": " + error->message;
}

struct GitLibraryScope {
  GitLibraryScope() {
    git_libgit2_init();
  }

  ~GitLibraryScope() {
    git_libgit2_shutdown();
  }
};

struct GitRepositoryDeleter {
  void operator()(git_repository* repo) const {
    git_repository_free(repo);
  }
};

struct GitDiffDeleter {
  void operator()(git_diff* diff) const {
    git_diff_free(diff);
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
    case GIT_DELTA_TYPECHANGE:
      return "typechange";
    case GIT_DELTA_UNTRACKED:
      return "untracked";
    case GIT_DELTA_CONFLICTED:
      return "conflicted";
    default:
      return "unknown";
  }
}

std::string trimDiffLine(const char* content, int contentLength) {
  if (content == nullptr || contentLength <= 0) {
    return "";
  }

  size_t length = static_cast<size_t>(contentLength);
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

  void finishCurrentFile() {
    if (currentFileIndex >= 0 && static_cast<size_t>(currentFileIndex) < files.size()) {
      auto& file = files[static_cast<size_t>(currentFileIndex)];
      file.rowCount = static_cast<double>(rows.size()) - file.rowStart;
    }
  }
};

int onFile(const git_diff_delta* delta, float, void* payload) {
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
  file.isBinary = (delta->flags & GIT_DIFF_FLAG_BINARY) != 0;
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

int onBinary(const git_diff_delta*, const git_diff_binary*, void* payload) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex >= 0 && static_cast<size_t>(state->currentFileIndex) < state->files.size()) {
    state->files[static_cast<size_t>(state->currentFileIndex)].isBinary = true;
  }
  return 0;
}

int onHunk(const git_diff_delta*, const git_diff_hunk* hunk, void* payload) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex < 0) {
    return 0;
  }

  state->currentHunkIndex += 1;
  DiffRenderRow row;
  row.index = static_cast<double>(state->rows.size());
  row.kind = diffRowKindHunkHeader;
  row.fileIndex = static_cast<double>(state->currentFileIndex);
  row.hunkIndex = static_cast<double>(state->currentHunkIndex);
  row.oldLineNumber = static_cast<double>(hunk->old_start);
  row.newLineNumber = static_cast<double>(hunk->new_start);
  row.changeType = diffChangeTypeMeta;
  row.text = trimDiffLine(hunk->header, hunk->header_len);
  state->rows.push_back(std::move(row));
  return 0;
}

int onLine(const git_diff_delta*, const git_diff_hunk*, const git_diff_line* line, void* payload) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex < 0) {
    return 0;
  }

  double changeType = diffChangeTypeContext;
  if (line->origin == GIT_DIFF_LINE_ADDITION || line->origin == GIT_DIFF_LINE_ADD_EOFNL) {
    changeType = diffChangeTypeAdd;
    state->files[static_cast<size_t>(state->currentFileIndex)].additions += 1;
  } else if (line->origin == GIT_DIFF_LINE_DELETION || line->origin == GIT_DIFF_LINE_DEL_EOFNL) {
    changeType = diffChangeTypeRemove;
    state->files[static_cast<size_t>(state->currentFileIndex)].deletions += 1;
  }

  DiffRenderRow row;
  row.index = static_cast<double>(state->rows.size());
  row.kind = diffRowKindLine;
  row.fileIndex = static_cast<double>(state->currentFileIndex);
  row.hunkIndex = static_cast<double>(state->currentHunkIndex);
  row.oldLineNumber = line->old_lineno > 0 ? static_cast<double>(line->old_lineno) : -1;
  row.newLineNumber = line->new_lineno > 0 ? static_cast<double>(line->new_lineno) : -1;
  row.changeType = changeType;
  row.text = trimDiffLine(line->content, line->content_len);
  state->rows.push_back(std::move(row));
  return 0;
}

std::shared_ptr<HybridDiffDocument> loadGitDiffDocument(const std::string& folderPath) {
  GitLibraryScope gitScope;
  git_repository* rawRepo = nullptr;
  const std::string normalizedPath = normalizeFolderPath(folderPath);
  if (git_repository_open_ext(&rawRepo, normalizedPath.c_str(), 0, nullptr) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to open git repository"));
  }
  std::unique_ptr<git_repository, GitRepositoryDeleter> repo(rawRepo);

  git_diff_options options = GIT_DIFF_OPTIONS_INIT;
  options.flags = GIT_DIFF_INCLUDE_UNTRACKED | GIT_DIFF_RECURSE_UNTRACKED_DIRS;
  git_diff* rawDiff = nullptr;
  if (git_diff_index_to_workdir(&rawDiff, repo.get(), nullptr, &options) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to create git diff"));
  }
  std::unique_ptr<git_diff, GitDiffDeleter> diff(rawDiff);

  const auto startedAt = DiffClock::now();
  DiffBuildState state;
  if (git_diff_foreach(diff.get(), onFile, onBinary, onHunk, onLine, &state) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to read git diff"));
  }
  state.finishCurrentFile();
  const auto finishedAt = DiffClock::now();

  DiffLoadTiming timing;
  timing.diffMs = elapsedDiffMs(startedAt, finishedAt);
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
    auto document = loadGitDiffDocument(folderPath);
    DiffLoadResult result;
    result.document = document;
    result.files = document->getFiles();
    result.initialRows = document->getRows(0, initialRowCount);
    result.timing = document->getTiming();
    return result;
  });
}

} // namespace margelo::nitro::legenddesktop::diffparser

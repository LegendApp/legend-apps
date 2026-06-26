#include "HybridDiffParser.hpp"

#include "DiffParserCore.hpp"
#include "HybridDiffDocument.hpp"
#include "HybridDiffUrlLoader.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include "git2.h"
#include <memory>
#include <mutex>
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
  const git_error* error = git_error_last();
  if (error == nullptr || error->message == nullptr) {
    return fallback;
  }
  return fallback + ": " + error->message;
}

void ensureLibGit2Initialized() {
  static std::once_flag initOnce;
  std::call_once(initOnce, [] {
    if (git_libgit2_init() < 0) {
      throw std::runtime_error(gitErrorMessage("Failed to initialize git library"));
    }
    std::atexit([] {
      git_libgit2_shutdown();
    });
  });
}

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

struct GitReferenceDeleter {
  void operator()(git_reference* reference) const {
    git_reference_free(reference);
  }
};

struct GitCommitDeleter {
  void operator()(git_commit* commit) const {
    git_commit_free(commit);
  }
};

struct GitTreeDeleter {
  void operator()(git_tree* tree) const {
    git_tree_free(tree);
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

std::vector<DiffFileSources> createFileSources(const std::vector<DiffFileSummary>& files) {
  std::vector<DiffFileSources> fileSources;
  fileSources.reserve(files.size());
  for (const auto& file : files) {
    DiffFileSources sources;
    sources.fileIndex = file.index;
    sources.oldPath = file.oldPath;
    sources.newPath = file.path;
    sources.status = file.status;
    sources.isBinary = file.isBinary;
    fileSources.push_back(std::move(sources));
  }
  return fileSources;
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
  row.tokens = {};
  state->rows.push_back(std::move(row));
  return 0;
}

int onHunk(const git_diff_delta*, const git_diff_hunk* hunk, void* payload) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex < 0) {
    return 0;
  }

  state->currentHunkIndex += 1;
  state->currentOldLine = hunk->old_start;
  state->currentNewLine = hunk->new_start;
  return 0;
}

int onLine(
    const git_diff_delta*,
    const git_diff_hunk*,
    const git_diff_line* line,
    void* payload) {
  auto* state = static_cast<DiffBuildState*>(payload);
  if (state->currentFileIndex < 0) {
    return 0;
  }

  double changeType = diffChangeTypeContext;
  double oldLineNumber = line->old_lineno >= 0 ? static_cast<double>(line->old_lineno) : -1;
  double newLineNumber = line->new_lineno >= 0 ? static_cast<double>(line->new_lineno) : -1;
  if (line->origin == GIT_DIFF_LINE_ADDITION) {
    changeType = diffChangeTypeAdd;
    state->currentNewLine += 1;
    state->files[static_cast<size_t>(state->currentFileIndex)].additions += 1;
  } else if (line->origin == GIT_DIFF_LINE_DELETION) {
    changeType = diffChangeTypeRemove;
    state->currentOldLine += 1;
    state->files[static_cast<size_t>(state->currentFileIndex)].deletions += 1;
  } else if (line->origin == GIT_DIFF_LINE_ADD_EOFNL) {
    changeType = diffChangeTypeAdd;
  } else if (line->origin == GIT_DIFF_LINE_DEL_EOFNL) {
    changeType = diffChangeTypeRemove;
  } else {
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
  row.text = trimDiffLine(line->content, line->content_len);
  row.tokens = {};
  state->rows.push_back(std::move(row));
  return 0;
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
  const auto loadStartedAt = DiffClock::now();
  ensureLibGit2Initialized();
  git_repository* rawRepo = nullptr;
  const std::string normalizedPath = normalizeFolderPath(folderPath);
  if (git_repository_open_ext(&rawRepo, normalizedPath.c_str(), 0, nullptr) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to open git repository"));
  }
  const auto repoOpenedAt = DiffClock::now();
  std::unique_ptr<git_repository, GitRepositoryDeleter> repo(rawRepo);

  git_diff_options options = {};
  if (git_diff_options_init(&options, GIT_DIFF_OPTIONS_VERSION) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to initialize git diff options"));
  }
  options.flags = GIT_DIFF_INCLUDE_UNTRACKED | GIT_DIFF_RECURSE_UNTRACKED_DIRS | GIT_DIFF_SHOW_UNTRACKED_CONTENT;

  git_reference* rawHead = nullptr;
  if (git_repository_head(&rawHead, repo.get()) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to resolve repository HEAD"));
  }
  std::unique_ptr<git_reference, GitReferenceDeleter> head(rawHead);
  const git_oid* headTarget = git_reference_target(head.get());
  if (headTarget == nullptr) {
    throw std::runtime_error("Failed to read repository HEAD target");
  }

  git_commit* rawHeadCommit = nullptr;
  if (git_commit_lookup(&rawHeadCommit, repo.get(), headTarget) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to read repository HEAD commit"));
  }
  std::unique_ptr<git_commit, GitCommitDeleter> headCommit(rawHeadCommit);

  git_tree* rawHeadTree = nullptr;
  if (git_commit_tree(&rawHeadTree, headCommit.get()) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to read repository HEAD tree"));
  }
  std::unique_ptr<git_tree, GitTreeDeleter> headTree(rawHeadTree);
  const char* rawRepositoryPath = git_repository_path(repo.get());
  const char* rawWorkdirPath = git_repository_workdir(repo.get());
  std::string repositoryPath = rawRepositoryPath != nullptr ? std::string(rawRepositoryPath) : std::string();
  std::string workdirPath = rawWorkdirPath != nullptr ? std::string(rawWorkdirPath) : std::string();
  std::string headTreeOid = git_oid_tostr_s(git_tree_id(headTree.get()));

  git_diff* rawDiff = nullptr;
  if (git_diff_tree_to_workdir_with_index(&rawDiff, repo.get(), headTree.get(), &options) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to create git diff"));
  }
  const auto diffCreatedAt = DiffClock::now();
  std::unique_ptr<git_diff, GitDiffDeleter> diff(rawDiff);

  DiffBuildState state;
  if (git_diff_foreach(diff.get(), onFile, nullptr, onHunk, onLine, &state) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to read git diff"));
  }
  state.finishCurrentFile();
  const auto diffWalkedAt = DiffClock::now();
  auto fileSources = createFileSources(state.files);

  DiffLoadTiming timing;
  timing.openRepoMs = elapsedDiffMs(loadStartedAt, repoOpenedAt);
  timing.fetchMs = 0;
  timing.createDiffMs = elapsedDiffMs(repoOpenedAt, diffCreatedAt);
  timing.walkDiffMs = elapsedDiffMs(diffCreatedAt, diffWalkedAt);
  timing.diffMs = timing.walkDiffMs;
  timing.documentMs = 0;
  timing.copyFilesMs = 0;
  timing.copyInitialRowsMs = 0;
  timing.nativeTotalMs = elapsedDiffMs(loadStartedAt, diffWalkedAt);
  timing.rowCount = static_cast<double>(state.rows.size());
  timing.fileCount = static_cast<double>(state.files.size());

  return std::make_shared<HybridDiffDocument>(
      std::move(state.files),
      std::move(state.rows),
      std::move(fileSources),
      std::move(repositoryPath),
      std::move(workdirPath),
      std::move(headTreeOid),
      timing);
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
    result.initialRows = document->getPlainRows(0, initialRowCount);
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
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
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
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
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

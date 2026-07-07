#include "DiffParserCore.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <cstdint>
#include "git2.h"
#include <limits>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>

namespace margelo::nitro::legenddesktop::diffparser {

namespace {

constexpr double diffRowKindFileHeader = 0;
constexpr double diffRowKindLine = 2;

constexpr double diffChangeTypeContext = 0;
constexpr double diffChangeTypeAdd = 1;
constexpr double diffChangeTypeRemove = 2;
constexpr double diffChangeTypeMeta = 3;

constexpr double emptySideBySideRowIndex = -1;
constexpr double sideBySideKindFileHeader = 0;
constexpr double sideBySideKindContext = 1;
constexpr double sideBySideKindChange = 2;
constexpr uint32_t fullFileDiffContextLines = std::numeric_limits<uint32_t>::max();

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

struct GitObjectDeleter {
  void operator()(git_object* object) const {
    git_object_free(object);
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

std::string_view trimCarriageReturn(std::string_view line) {
  if (!line.empty() && line.back() == '\r') {
    line.remove_suffix(1);
  }
  return line;
}

std::string trimWhitespace(std::string_view value) {
  size_t start = 0;
  size_t end = value.size();
  while (start < end && std::isspace(static_cast<unsigned char>(value[start]))) {
    start += 1;
  }
  while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    end -= 1;
  }
  return std::string(value.substr(start, end - start));
}

std::string stripQuotedPath(std::string_view path) {
  auto normalizedPath = trimWhitespace(path);
  if (normalizedPath.size() >= 2 && normalizedPath.front() == '"' && normalizedPath.back() == '"') {
    normalizedPath = normalizedPath.substr(1, normalizedPath.size() - 2);
  }
  return normalizedPath;
}

std::string stripGitDiffPathPrefix(std::string_view path) {
  auto normalizedPath = stripQuotedPath(path);
  if (normalizedPath.starts_with("a/") || normalizedPath.starts_with("b/")) {
    return normalizedPath.substr(2);
  }
  return normalizedPath;
}

std::pair<std::string, std::string> parseDiffGitPaths(std::string_view line) {
  constexpr auto prefix = std::string_view("diff --git ");
  const auto paths = line.substr(prefix.size());
  const auto separator = paths.find(" b/");
  if (separator == std::string::npos) {
    return { "", "" };
  }
  return {
    stripGitDiffPathPrefix(paths.substr(0, separator)),
    stripGitDiffPathPrefix(paths.substr(separator + 1)),
  };
}

std::string parseHeaderPath(std::string_view line) {
  if (line.size() <= 4) {
    return "";
  }

  const auto tabIndex = line.find('\t', 4);
  const auto end = tabIndex == std::string::npos ? line.size() : tabIndex;
  return stripGitDiffPathPrefix(line.substr(4, end - 4));
}

int parsePositiveInt(std::string_view value, size_t start) {
  int result = 0;
  size_t index = start;
  while (index < value.size() && std::isdigit(static_cast<unsigned char>(value[index]))) {
    result = result * 10 + (value[index] - '0');
    index += 1;
  }
  return result;
}

bool parseHunkLineNumbers(std::string_view line, int& oldStart, int& newStart) {
  size_t index = 3;
  if (index >= line.size() || line[index] != '-') {
    return false;
  }
  index += 1;
  oldStart = std::max(0, parsePositiveInt(line, index));
  const auto plusIndex = line.find(" +", index);
  if (plusIndex == std::string::npos) {
    return false;
  }
  index = plusIndex + 2;
  newStart = std::max(0, parsePositiveInt(line, index));
  return true;
}

bool isFileHeaderRow(const DiffRenderRow& row) {
  return row.kind == diffRowKindFileHeader;
}

bool isAddRow(const DiffRenderRow& row) {
  return row.changeType == diffChangeTypeAdd;
}

bool isRemoveRow(const DiffRenderRow& row) {
  return row.changeType == diffChangeTypeRemove;
}

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
    case GIT_DELTA_CONFLICTED:
      return "conflicted";
    default:
      return "unknown";
  }
}

struct StatusPathSummary {
  std::string path;
  std::string oldPath;
  std::string status;
};

struct GitCompareBase {
  std::unique_ptr<git_commit, GitCommitDeleter> headCommit;
  std::unique_ptr<git_commit, GitCommitDeleter> refCommit;
  std::unique_ptr<git_commit, GitCommitDeleter> mergeBaseCommit;
  std::unique_ptr<git_tree, GitTreeDeleter> tree;
  std::string treeOid;
};

bool isHeadCompare(const DiffGitCompareOptions& compareOptions) {
  return compareOptions.baseKind != "ref" || compareOptions.baseRef.empty();
}

std::unique_ptr<git_commit, GitCommitDeleter> lookupCommit(
    git_repository* repo,
    const git_oid* oid,
    const std::string& errorMessage) {
  git_commit* rawCommit = nullptr;
  if (git_commit_lookup(&rawCommit, repo, oid) != 0) {
    throw std::runtime_error(gitErrorMessage(errorMessage));
  }
  return std::unique_ptr<git_commit, GitCommitDeleter>(rawCommit);
}

std::unique_ptr<git_commit, GitCommitDeleter> resolveHeadCommit(git_repository* repo) {
  git_reference* rawHead = nullptr;
  if (git_repository_head(&rawHead, repo) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to resolve repository HEAD"));
  }
  std::unique_ptr<git_reference, GitReferenceDeleter> head(rawHead);
  const git_oid* headTarget = git_reference_target(head.get());
  if (headTarget == nullptr) {
    throw std::runtime_error("Failed to read repository HEAD target");
  }
  return lookupCommit(repo, headTarget, "Failed to read repository HEAD commit");
}

std::unique_ptr<git_commit, GitCommitDeleter> resolveRefCommit(git_repository* repo, const std::string& ref) {
  git_object* rawObject = nullptr;
  if (git_revparse_single(&rawObject, repo, ref.c_str()) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to resolve git compare ref"));
  }
  std::unique_ptr<git_object, GitObjectDeleter> object(rawObject);

  git_object* rawCommitObject = nullptr;
  if (git_object_peel(&rawCommitObject, object.get(), GIT_OBJECT_COMMIT) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to peel git compare ref to a commit"));
  }
  std::unique_ptr<git_object, GitObjectDeleter> commitObject(rawCommitObject);
  const git_oid* commitOid = git_object_id(commitObject.get());
  if (commitOid == nullptr) {
    throw std::runtime_error("Failed to read git compare ref commit id");
  }
  return lookupCommit(repo, commitOid, "Failed to read git compare ref commit");
}

GitCompareBase resolveCompareBase(git_repository* repo, const DiffGitCompareOptions& compareOptions) {
  GitCompareBase result;
  result.headCommit = resolveHeadCommit(repo);
  git_commit* selectedCommit = result.headCommit.get();

  if (!isHeadCompare(compareOptions)) {
    result.refCommit = resolveRefCommit(repo, compareOptions.baseRef);
    selectedCommit = result.refCommit.get();

    if (compareOptions.useMergeBase) {
      git_oid mergeBaseOid;
      if (git_merge_base(
              &mergeBaseOid,
              repo,
              git_commit_id(result.headCommit.get()),
              git_commit_id(result.refCommit.get())) != 0) {
        throw std::runtime_error(gitErrorMessage("Failed to find merge base for git compare ref"));
      }
      result.mergeBaseCommit = lookupCommit(repo, &mergeBaseOid, "Failed to read git compare merge-base commit");
      selectedCommit = result.mergeBaseCommit.get();
    }
  }

  git_tree* rawTree = nullptr;
  if (git_commit_tree(&rawTree, selectedCommit) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to read git compare base tree"));
  }
  result.tree = std::unique_ptr<git_tree, GitTreeDeleter>(rawTree);
  result.treeOid = git_oid_tostr_s(git_tree_id(result.tree.get()));
  return result;
}

std::string statusFlagsStatus(unsigned int status) {
  if ((status & GIT_STATUS_CONFLICTED) != 0) {
    return "conflicted";
  }
  if ((status & (GIT_STATUS_WT_NEW | GIT_STATUS_INDEX_NEW)) != 0) {
    return "added";
  }
  if ((status & (GIT_STATUS_WT_DELETED | GIT_STATUS_INDEX_DELETED)) != 0) {
    return "deleted";
  }
  if ((status & (GIT_STATUS_WT_RENAMED | GIT_STATUS_INDEX_RENAMED)) != 0) {
    return "renamed";
  }
  if ((status & (GIT_STATUS_WT_TYPECHANGE | GIT_STATUS_INDEX_TYPECHANGE)) != 0) {
    return "modified";
  }
  if ((status & (GIT_STATUS_WT_MODIFIED | GIT_STATUS_INDEX_MODIFIED)) != 0) {
    return "modified";
  }
  return "unknown";
}

DiffFileSummary createStatusFileSummary(const StatusPathSummary& summary, double fileIndex) {
  DiffFileSummary file;
  file.index = fileIndex;
  file.path = summary.path;
  file.oldPath = summary.oldPath;
  file.status = summary.status;
  file.additions = 0;
  file.deletions = 0;
  file.rowStart = 0;
  file.rowCount = 0;
  file.isBinary = false;
  return file;
}

DiffFileSources createStatusFileSources(const DiffFileSummary& file) {
  DiffFileSources sources;
  sources.fileIndex = file.index;
  sources.oldPath = file.oldPath;
  sources.newPath = file.path;
  sources.status = file.status;
  sources.isBinary = file.isBinary;
  return sources;
}

struct StatusPathCollectState {
  const DiffProgressiveCallbacks& callbacks;
  std::vector<StatusPathSummary> paths;
  bool stopAfterFirst = false;
  bool stoppedAfterFirst = false;
  bool cancelled = false;
};

int onStatusPath(const char* rawPath, unsigned int status, void* payload) {
  auto* state = static_cast<StatusPathCollectState*>(payload);
  if (state->callbacks.shouldCancel && state->callbacks.shouldCancel()) {
    state->cancelled = true;
    return 1;
  }
  if (rawPath == nullptr || rawPath[0] == '\0' || status == GIT_STATUS_CURRENT) {
    return 0;
  }

  StatusPathSummary summary;
  summary.path = rawPath;
  summary.oldPath = rawPath;
  summary.status = statusFlagsStatus(status);
  state->paths.push_back(std::move(summary));

  if (state->stopAfterFirst) {
    state->stoppedAfterFirst = true;
    return 1;
  }
  return 0;
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

double getSideBySideSourceStart(double oldRowIndex, double newRowIndex, double fallbackIndex) {
  if (oldRowIndex >= 0 && newRowIndex >= 0) {
    return std::min(oldRowIndex, newRowIndex);
  }
  if (oldRowIndex >= 0) {
    return oldRowIndex;
  }
  if (newRowIndex >= 0) {
    return newRowIndex;
  }
  return fallbackIndex;
}

double getSideBySideSourceEnd(double oldRowIndex, double newRowIndex, double fallbackIndex) {
  if (oldRowIndex >= 0 && newRowIndex >= 0) {
    return std::max(oldRowIndex, newRowIndex) + 1;
  }
  if (oldRowIndex >= 0) {
    return oldRowIndex + 1;
  }
  if (newRowIndex >= 0) {
    return newRowIndex + 1;
  }
  return fallbackIndex + 1;
}

DiffSideBySideLine createSideBySideLine(
    double index,
    double kind,
    double fileIndex,
    double hunkIndex,
    double oldRowIndex,
    double newRowIndex) {
  return DiffSideBySideLine{
      .index = index,
      .kind = kind,
      .fileIndex = fileIndex,
      .hunkIndex = hunkIndex,
      .sourceStart = getSideBySideSourceStart(oldRowIndex, newRowIndex, index),
      .sourceEnd = getSideBySideSourceEnd(oldRowIndex, newRowIndex, index),
      .oldRowIndex = oldRowIndex,
      .newRowIndex = newRowIndex,
  };
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

struct ProgressiveDiffBuildState {
  const DiffProgressiveCallbacks& callbacks;
  DiffFileSummary currentFile;
  double rowCount = 0;
  double fileCount = 0;
  int currentFileIndex = -1;
  int currentHunkIndex = -1;
  int currentOldLine = -1;
  int currentNewLine = -1;
  double nextFileIndex = -1;
  std::string nextFileOldPath;
  std::string nextFilePath;
  std::string nextFileStatus;
  std::vector<StatusPathSummary> statusOverrides;
  bool cancelled = false;

  bool shouldCancel() {
    cancelled = callbacks.shouldCancel ? callbacks.shouldCancel() : false;
    return cancelled;
  }

  void finishCurrentFile() {
    if (currentFileIndex >= 0) {
      currentFile.rowCount = rowCount - currentFile.rowStart;
      if (callbacks.onFileFinished) {
        callbacks.onFileFinished(currentFile);
      }
    }
  }
};

const StatusPathSummary* findStatusOverride(
    const std::vector<StatusPathSummary>& overrides,
    const std::string& path,
    const std::string& oldPath) {
  for (const auto& override : overrides) {
    if (override.path == path || override.path == oldPath) {
      return &override;
    }
  }
  return nullptr;
}

struct UnifiedDiffBuildState {
  DiffBuildState diff;
  std::vector<DiffFileSources> fileSources;
  std::string currentOldPath;
  std::string currentNewPath;

  void finishCurrentFile() {
    diff.finishCurrentFile();
    if (diff.currentFileIndex >= 0 && static_cast<size_t>(diff.currentFileIndex) < fileSources.size()) {
      auto& file = diff.files[static_cast<size_t>(diff.currentFileIndex)];
      auto& sources = fileSources[static_cast<size_t>(diff.currentFileIndex)];
      if (file.oldPath.empty() && !currentOldPath.empty()) {
        file.oldPath = currentOldPath;
        sources.oldPath = currentOldPath;
      }
      if (file.path.empty() && !currentNewPath.empty()) {
        file.path = currentNewPath;
        sources.newPath = currentNewPath;
      }
      if (file.path == "/dev/null") {
        file.path = file.oldPath;
      }
      if (file.oldPath == "/dev/null") {
        file.oldPath = file.path;
      }
      file.status = currentOldPath == "/dev/null"
        ? "added"
        : currentNewPath == "/dev/null"
          ? "deleted"
          : file.oldPath != file.path
            ? "renamed"
            : "modified";
      sources.status = file.status;
      sources.isUnifiedDiff = true;
    }
    currentOldPath.clear();
    currentNewPath.clear();
  }

  void startFile(const std::string& oldPath, const std::string& newPath) {
    finishCurrentFile();

    const double fileIndex = static_cast<double>(diff.files.size());
    diff.currentFileIndex = static_cast<int>(diff.files.size());
    diff.currentHunkIndex = -1;
    diff.currentOldLine = -1;
    diff.currentNewLine = -1;
    currentOldPath = oldPath;
    currentNewPath = newPath;

    DiffFileSummary file;
    file.index = fileIndex;
    file.path = newPath;
    file.oldPath = oldPath;
    file.status = "modified";
    file.additions = 0;
    file.deletions = 0;
    file.rowStart = static_cast<double>(diff.rows.size());
    file.rowCount = 0;
    file.isBinary = false;
    diff.files.push_back(std::move(file));

    DiffFileSources sources;
    sources.fileIndex = fileIndex;
    sources.oldPath = oldPath;
    sources.newPath = newPath;
    sources.status = "modified";
    sources.isBinary = false;
    sources.isUnifiedDiff = true;
    fileSources.push_back(std::move(sources));

    DiffRenderRow row;
    row.index = static_cast<double>(diff.rows.size());
    row.kind = diffRowKindFileHeader;
    row.fileIndex = fileIndex;
    row.hunkIndex = -1;
    row.oldLineNumber = -1;
    row.newLineNumber = -1;
    row.changeType = diffChangeTypeMeta;
    row.text = newPath.empty() || newPath == "/dev/null" ? oldPath : newPath;
    row.tokens = {};
    diff.rows.push_back(std::move(row));
  }

  void startHunk(int oldStart, int newStart) {
    if (diff.currentFileIndex >= 0) {
      diff.currentHunkIndex += 1;
      diff.currentOldLine = oldStart;
      diff.currentNewLine = newStart;
    }
  }

  void appendLine(char origin, std::string_view text) {
    if (diff.currentFileIndex < 0 || diff.currentHunkIndex < 0) {
      return;
    }

    auto& file = diff.files[static_cast<size_t>(diff.currentFileIndex)];
    DiffRenderRow row;
    row.index = static_cast<double>(diff.rows.size());
    row.kind = diffRowKindLine;
    row.fileIndex = static_cast<double>(diff.currentFileIndex);
    row.hunkIndex = static_cast<double>(diff.currentHunkIndex);
    row.oldLineNumber = -1;
    row.newLineNumber = -1;
    row.changeType = diffChangeTypeContext;
    row.text = std::string(text);
    row.tokens = {};

    if (origin == '+') {
      row.newLineNumber = diff.currentNewLine;
      row.changeType = diffChangeTypeAdd;
      diff.currentNewLine += 1;
      file.additions += 1;
    } else if (origin == '-') {
      row.oldLineNumber = diff.currentOldLine;
      row.changeType = diffChangeTypeRemove;
      diff.currentOldLine += 1;
      file.deletions += 1;
    } else {
      row.oldLineNumber = diff.currentOldLine;
      row.newLineNumber = diff.currentNewLine;
      diff.currentOldLine += 1;
      diff.currentNewLine += 1;
    }

    diff.rows.push_back(std::move(row));
  }
};

struct UnifiedDiffProgressiveBuildState {
  const DiffProgressiveCallbacks& callbacks;
  DiffFileSummary currentFile;
  DiffFileSources currentSources;
  std::string currentOldPath;
  std::string currentNewPath;
  double rowCount = 0;
  double fileCount = 0;
  int currentFileIndex = -1;
  int currentHunkIndex = -1;
  int currentOldLine = -1;
  int currentNewLine = -1;
  bool cancelled = false;

  bool shouldCancel() {
    cancelled = callbacks.shouldCancel ? callbacks.shouldCancel() : false;
    return cancelled;
  }

  void applyHeaderPaths() {
    if (currentFileIndex >= 0) {
      if (currentFile.oldPath.empty() && !currentOldPath.empty()) {
        currentFile.oldPath = currentOldPath;
        currentSources.oldPath = currentOldPath;
      }
      if (currentFile.path.empty() && !currentNewPath.empty()) {
        currentFile.path = currentNewPath;
        currentSources.newPath = currentNewPath;
      }
      if (currentFile.path == "/dev/null") {
        currentFile.path = currentFile.oldPath;
      }
      if (currentFile.oldPath == "/dev/null") {
        currentFile.oldPath = currentFile.path;
      }
      currentFile.status = currentOldPath == "/dev/null"
        ? "added"
        : currentNewPath == "/dev/null"
          ? "deleted"
          : currentFile.oldPath != currentFile.path
            ? "renamed"
            : "modified";
      currentSources.oldPath = currentFile.oldPath;
      currentSources.newPath = currentFile.path;
      currentSources.status = currentFile.status;
      currentSources.isBinary = currentFile.isBinary;
      currentSources.isUnifiedDiff = true;
    }
  }

  void finishCurrentFile() {
    if (currentFileIndex >= 0) {
      applyHeaderPaths();
      currentFile.rowCount = rowCount - currentFile.rowStart;
      if (callbacks.onFileFinished) {
        callbacks.onFileFinished(currentFile);
      }
    }
    currentOldPath.clear();
    currentNewPath.clear();
  }

  void startFile(const std::string& oldPath, const std::string& newPath) {
    finishCurrentFile();

    const double fileIndex = fileCount;
    fileCount += 1;
    currentFileIndex = static_cast<int>(fileIndex);
    currentHunkIndex = -1;
    currentOldLine = -1;
    currentNewLine = -1;
    currentOldPath = oldPath;
    currentNewPath = newPath;

    DiffFileSummary file;
    file.index = fileIndex;
    file.path = newPath;
    file.oldPath = oldPath;
    file.status = "modified";
    file.additions = 0;
    file.deletions = 0;
    file.rowStart = rowCount;
    file.rowCount = 0;
    file.isBinary = false;

    DiffFileSources sources;
    sources.fileIndex = fileIndex;
    sources.oldPath = oldPath;
    sources.newPath = newPath;
    sources.status = "modified";
    sources.isBinary = false;
    sources.isUnifiedDiff = true;

    DiffRenderRow row;
    row.index = rowCount;
    row.kind = diffRowKindFileHeader;
    row.fileIndex = fileIndex;
    row.hunkIndex = -1;
    row.oldLineNumber = -1;
    row.newLineNumber = -1;
    row.changeType = diffChangeTypeMeta;
    row.text = newPath.empty() || newPath == "/dev/null" ? oldPath : newPath;
    row.tokens = {};
    rowCount += 1;

    currentFile = file;
    currentSources = sources;
    if (callbacks.onFile) {
      callbacks.onFile(currentFile, currentSources, row);
    }
  }

  void updateOldPath(const std::string& oldPath) {
    currentOldPath = oldPath;
  }

  void updateNewPath(const std::string& newPath) {
    currentNewPath = newPath;
    if (currentFileIndex >= 0) {
      currentFile.path = currentNewPath == "/dev/null" ? currentOldPath : currentNewPath;
      currentFile.oldPath = currentOldPath == "/dev/null" ? currentFile.path : currentOldPath;
      currentSources.oldPath = currentFile.oldPath;
      currentSources.newPath = currentFile.path;
    }
  }

  void startHunk(int oldStart, int newStart) {
    if (currentFileIndex >= 0) {
      currentHunkIndex += 1;
      currentOldLine = oldStart;
      currentNewLine = newStart;
    }
  }

  void appendLine(char origin, std::string_view text) {
    if (currentFileIndex < 0 || currentHunkIndex < 0) {
      return;
    }

    DiffRenderRow row;
    row.index = rowCount;
    row.kind = diffRowKindLine;
    row.fileIndex = static_cast<double>(currentFileIndex);
    row.hunkIndex = static_cast<double>(currentHunkIndex);
    row.oldLineNumber = -1;
    row.newLineNumber = -1;
    row.changeType = diffChangeTypeContext;
    row.text = std::string(text);
    row.tokens = {};

    if (origin == '+') {
      row.newLineNumber = currentNewLine;
      row.changeType = diffChangeTypeAdd;
      currentNewLine += 1;
      currentFile.additions += 1;
    } else if (origin == '-') {
      row.oldLineNumber = currentOldLine;
      row.changeType = diffChangeTypeRemove;
      currentOldLine += 1;
      currentFile.deletions += 1;
    } else {
      row.oldLineNumber = currentOldLine;
      row.newLineNumber = currentNewLine;
      currentOldLine += 1;
      currentNewLine += 1;
    }

    rowCount += 1;
    if (callbacks.onRow) {
      callbacks.onRow(row);
    }
  }

  void markBinary() {
    if (currentFileIndex >= 0) {
      currentFile.isBinary = true;
      currentSources.isBinary = true;
    }
  }
};

int onProgressiveGitFile(const git_diff_delta* delta, float, void* payload) {
  auto* state = static_cast<ProgressiveDiffBuildState*>(payload);
  if (state->shouldCancel()) {
    return 1;
  }

  state->finishCurrentFile();

  const double fileIndex = state->nextFileIndex >= 0 ? state->nextFileIndex : state->fileCount;
  state->nextFileIndex = -1;
  state->currentFileIndex = static_cast<int>(fileIndex);
  state->currentHunkIndex = -1;
  state->currentOldLine = -1;
  state->currentNewLine = -1;
  state->fileCount = std::max(state->fileCount, fileIndex + 1);

  DiffFileSummary file;
  file.index = fileIndex;
  file.path = deltaPath(delta);
  file.oldPath = oldDeltaPath(delta);
  file.status = deltaStatus(delta);
  if (const auto* override = findStatusOverride(state->statusOverrides, file.path, file.oldPath)) {
    file.path = override->path;
    file.oldPath = override->oldPath;
    file.status = override->status;
  }
  if (!state->nextFilePath.empty()) {
    file.path = state->nextFilePath;
  }
  if (!state->nextFileOldPath.empty()) {
    file.oldPath = state->nextFileOldPath;
  }
  if (!state->nextFileStatus.empty()) {
    file.status = state->nextFileStatus;
  }
  state->nextFilePath.clear();
  state->nextFileOldPath.clear();
  state->nextFileStatus.clear();
  file.additions = 0;
  file.deletions = 0;
  file.rowStart = state->rowCount;
  file.rowCount = 0;
  file.isBinary = (delta->flags & GIT_DIFF_FLAG_BINARY) != 0;

  DiffFileSources fileSources;
  fileSources.fileIndex = file.index;
  fileSources.oldPath = file.oldPath;
  fileSources.newPath = file.path;
  fileSources.status = file.status;
  fileSources.isBinary = file.isBinary;

  DiffRenderRow row;
  row.index = state->rowCount;
  row.kind = diffRowKindFileHeader;
  row.fileIndex = fileIndex;
  row.hunkIndex = -1;
  row.oldLineNumber = -1;
  row.newLineNumber = -1;
  row.changeType = diffChangeTypeMeta;
  row.text = file.path;
  row.tokens = {};
  state->rowCount += 1;

  state->currentFile = file;
  if (state->callbacks.onFile) {
    state->callbacks.onFile(file, fileSources, row);
  }
  return 0;
}

int onProgressiveGitHunk(const git_diff_delta*, const git_diff_hunk* hunk, void* payload) {
  auto* state = static_cast<ProgressiveDiffBuildState*>(payload);
  if (state->shouldCancel()) {
    return 1;
  }
  if (state->currentFileIndex < 0) {
    return 0;
  }

  state->currentHunkIndex += 1;
  state->currentOldLine = hunk->old_start;
  state->currentNewLine = hunk->new_start;
  return 0;
}

int onProgressiveGitLine(
    const git_diff_delta*,
    const git_diff_hunk*,
    const git_diff_line* line,
    void* payload) {
  auto* state = static_cast<ProgressiveDiffBuildState*>(payload);
  if (state->shouldCancel()) {
    return 1;
  }
  if (state->currentFileIndex < 0) {
    return 0;
  }

  double changeType = diffChangeTypeContext;
  double oldLineNumber = line->old_lineno >= 0 ? static_cast<double>(line->old_lineno) : -1;
  double newLineNumber = line->new_lineno >= 0 ? static_cast<double>(line->new_lineno) : -1;
  if (line->origin == GIT_DIFF_LINE_ADDITION) {
    changeType = diffChangeTypeAdd;
    state->currentNewLine += 1;
    state->currentFile.additions += 1;
  } else if (line->origin == GIT_DIFF_LINE_DELETION) {
    changeType = diffChangeTypeRemove;
    state->currentOldLine += 1;
    state->currentFile.deletions += 1;
  } else if (line->origin == GIT_DIFF_LINE_ADD_EOFNL) {
    changeType = diffChangeTypeAdd;
  } else if (line->origin == GIT_DIFF_LINE_DEL_EOFNL) {
    changeType = diffChangeTypeRemove;
  } else {
    state->currentOldLine += 1;
    state->currentNewLine += 1;
  }

  DiffRenderRow row;
  row.index = state->rowCount;
  row.kind = diffRowKindLine;
  row.fileIndex = static_cast<double>(state->currentFileIndex);
  row.hunkIndex = static_cast<double>(state->currentHunkIndex);
  row.oldLineNumber = oldLineNumber;
  row.newLineNumber = newLineNumber;
  row.changeType = changeType;
  row.text = trimDiffLine(line->content, line->content_len);
  row.tokens = {};
  state->rowCount += 1;

  if (state->callbacks.onRow) {
    state->callbacks.onRow(row);
  }
  return 0;
}

} // namespace

std::vector<DiffSideBySideLine> createDiffSideBySideLines(const std::vector<DiffRenderRow>& rows) {
  std::vector<DiffSideBySideLine> lines;
  std::vector<const DiffRenderRow*> contextRows;
  std::vector<const DiffRenderRow*> removedRows;
  std::vector<const DiffRenderRow*> addedRows;
  lines.reserve(rows.size());
  contextRows.reserve(128);
  removedRows.reserve(128);
  addedRows.reserve(128);
  double currentFileIndex = -1;
  double currentHunkIndex = -1;

  auto pushLine = [&](double kind, double fileIndex, double hunkIndex, double oldRowIndex, double newRowIndex) {
    lines.push_back(createSideBySideLine(
        static_cast<double>(lines.size()),
        kind,
        fileIndex,
        hunkIndex,
        oldRowIndex,
        newRowIndex));
  };

  auto flushContextRows = [&]() {
    if (!contextRows.empty()) {
      for (const auto* row : contextRows) {
        pushLine(sideBySideKindContext, row->fileIndex, row->hunkIndex, row->index, row->index);
      }
      contextRows.clear();
    }
  };

  auto flushChangedRows = [&]() {
    if (removedRows.empty() && addedRows.empty()) {
      return;
    }

    const size_t pairCount = std::max(removedRows.size(), addedRows.size());
    for (size_t pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
      const auto* removedRow = pairIndex < removedRows.size() ? removedRows[pairIndex] : nullptr;
      const auto* addedRow = pairIndex < addedRows.size() ? addedRows[pairIndex] : nullptr;
      pushLine(
          sideBySideKindChange,
          removedRow ? removedRow->fileIndex : addedRow->fileIndex,
          removedRow ? removedRow->hunkIndex : addedRow->hunkIndex,
          removedRow ? removedRow->index : emptySideBySideRowIndex,
          addedRow ? addedRow->index : emptySideBySideRowIndex);
    }

    removedRows.clear();
    addedRows.clear();
  };

  auto flushPending = [&]() {
    flushContextRows();
    flushChangedRows();
  };

  for (const auto& row : rows) {
    if (isFileHeaderRow(row)) {
      flushPending();
      currentFileIndex = row.fileIndex;
      currentHunkIndex = row.hunkIndex;
      pushLine(sideBySideKindFileHeader, row.fileIndex, row.hunkIndex, row.index, row.index);
    } else if (row.fileIndex != currentFileIndex || row.hunkIndex != currentHunkIndex) {
      flushPending();
      currentFileIndex = row.fileIndex;
      currentHunkIndex = row.hunkIndex;
    }

    if (!isFileHeaderRow(row)) {
      if (isRemoveRow(row)) {
        flushContextRows();
        removedRows.push_back(&row);
      } else if (isAddRow(row)) {
        flushContextRows();
        addedRows.push_back(&row);
      } else {
        flushChangedRows();
        contextRows.push_back(&row);
      }
    }
  }

  flushPending();
  return lines;
}

struct UnifiedDiffStreamParser::Impl {
  explicit Impl(const DiffProgressiveCallbacks& parserCallbacks)
      : callbacks(parserCallbacks),
        state{ .callbacks = this->callbacks },
        startedAt(DiffClock::now()) {}

  void append(std::string_view chunk) {
    if (finished || state.shouldCancel()) {
      return;
    }

    bufferedText.append(chunk.data(), chunk.size());
    size_t lineStart = 0;
    while (lineStart <= bufferedText.size()) {
      const auto lineEnd = bufferedText.find('\n', lineStart);
      if (lineEnd == std::string::npos) {
        break;
      }
      processLine(trimCarriageReturn(std::string_view(bufferedText.data() + lineStart, lineEnd - lineStart)));
      lineStart = lineEnd + 1;
      if (state.shouldCancel()) {
        break;
      }
    }

    if (lineStart > 0) {
      bufferedText.erase(0, lineStart);
    }
  }

  DiffLoadTiming finish() {
    if (!finished) {
      if (!bufferedText.empty() && !state.shouldCancel()) {
        processLine(trimCarriageReturn(std::string_view(bufferedText.data(), bufferedText.size())));
      }
      bufferedText.clear();
      state.finishCurrentFile();
      finished = true;
    }

    const auto finishedAt = DiffClock::now();
    DiffLoadTiming timing;
    timing.openRepoMs = 0;
    timing.fetchMs = 0;
    timing.createDiffMs = 0;
    timing.walkDiffMs = elapsedDiffMs(startedAt, finishedAt);
    timing.diffMs = timing.walkDiffMs;
    timing.documentMs = 0;
    timing.copyFilesMs = 0;
    timing.copyInitialRowsMs = 0;
    timing.nativeTotalMs = timing.walkDiffMs;
    timing.rowCount = state.rowCount;
    timing.fileCount = state.fileCount;
    return timing;
  }

private:
  void processLine(std::string_view line) {
    if (state.shouldCancel()) {
      return;
    }

    if (line.starts_with("diff --git ")) {
      const auto [oldPath, newPath] = parseDiffGitPaths(line);
      state.startFile(oldPath, newPath);
    } else if (line.starts_with("--- ") && state.currentHunkIndex < 0) {
      state.updateOldPath(parseHeaderPath(line));
    } else if (line.starts_with("+++ ") && state.currentHunkIndex < 0) {
      state.updateNewPath(parseHeaderPath(line));
    } else if (line.starts_with("@@ ")) {
      int oldStart = 0;
      int newStart = 0;
      if (parseHunkLineNumbers(line, oldStart, newStart)) {
        state.startHunk(oldStart, newStart);
      }
    } else if (!line.empty() && (line[0] == ' ' || line[0] == '+' || line[0] == '-')) {
      state.appendLine(line[0], line.substr(1));
    } else if (line.starts_with("Binary files ")) {
      state.markBinary();
    }
  }

  DiffProgressiveCallbacks callbacks;
  UnifiedDiffProgressiveBuildState state;
  DiffClock::time_point startedAt;
  std::string bufferedText;
  bool finished = false;
};

UnifiedDiffStreamParser::UnifiedDiffStreamParser(const DiffProgressiveCallbacks& callbacks)
    : impl_(std::make_unique<Impl>(callbacks)) {}

UnifiedDiffStreamParser::~UnifiedDiffStreamParser() = default;

void UnifiedDiffStreamParser::append(std::string_view chunk) {
  impl_->append(chunk);
}

DiffLoadTiming UnifiedDiffStreamParser::finish() {
  return impl_->finish();
}

DiffParsedDocument parseUnifiedDiffText(const std::string& diffText) {
  const auto loadStartedAt = DiffClock::now();
  UnifiedDiffBuildState state;
  size_t lineStart = 0;

  while (lineStart <= diffText.size()) {
    const auto lineEnd = diffText.find('\n', lineStart);
    const auto rawLineEnd = lineEnd == std::string::npos ? diffText.size() : lineEnd;
    const auto line = trimCarriageReturn(std::string_view(diffText.data() + lineStart, rawLineEnd - lineStart));

    if (line.starts_with("diff --git ")) {
      const auto [oldPath, newPath] = parseDiffGitPaths(line);
      state.startFile(oldPath, newPath);
    } else if (line.starts_with("--- ") && state.diff.currentHunkIndex < 0) {
      state.currentOldPath = parseHeaderPath(line);
    } else if (line.starts_with("+++ ") && state.diff.currentHunkIndex < 0) {
      state.currentNewPath = parseHeaderPath(line);
      if (state.diff.currentFileIndex >= 0) {
        auto& file = state.diff.files[static_cast<size_t>(state.diff.currentFileIndex)];
        file.path = state.currentNewPath == "/dev/null" ? state.currentOldPath : state.currentNewPath;
        file.oldPath = state.currentOldPath == "/dev/null" ? file.path : state.currentOldPath;
        state.diff.rows[static_cast<size_t>(file.rowStart)].text = file.path;
        auto& sources = state.fileSources[static_cast<size_t>(state.diff.currentFileIndex)];
        sources.oldPath = file.oldPath;
        sources.newPath = file.path;
      }
    } else if (line.starts_with("@@ ")) {
      int oldStart = 0;
      int newStart = 0;
      if (parseHunkLineNumbers(line, oldStart, newStart)) {
        state.startHunk(oldStart, newStart);
      }
    } else if (!line.empty() && (line[0] == ' ' || line[0] == '+' || line[0] == '-')) {
      state.appendLine(line[0], line.substr(1));
    } else if (line.starts_with("Binary files ") && state.diff.currentFileIndex >= 0) {
      state.diff.files[static_cast<size_t>(state.diff.currentFileIndex)].isBinary = true;
      state.fileSources[static_cast<size_t>(state.diff.currentFileIndex)].isBinary = true;
    }

    if (lineEnd == std::string::npos) {
      break;
    }
    lineStart = lineEnd + 1;
  }

  state.finishCurrentFile();
  const auto diffWalkedAt = DiffClock::now();

  DiffLoadTiming timing;
  timing.openRepoMs = 0;
  timing.fetchMs = 0;
  timing.createDiffMs = 0;
  timing.walkDiffMs = elapsedDiffMs(loadStartedAt, diffWalkedAt);
  timing.diffMs = timing.walkDiffMs;
  timing.documentMs = 0;
  timing.copyFilesMs = 0;
  timing.copyInitialRowsMs = 0;
  timing.nativeTotalMs = timing.walkDiffMs;
  timing.rowCount = static_cast<double>(state.diff.rows.size());
  timing.fileCount = static_cast<double>(state.diff.files.size());

  return {
    .files = std::move(state.diff.files),
    .rows = std::move(state.diff.rows),
    .fileSources = std::move(state.fileSources),
    .repositoryPath = "",
    .workdirPath = "",
    .headTreeOid = "",
    .timing = timing,
  };
}

DiffLoadTiming parseGitRepositoryDiffProgressive(
    const std::string& folderPath,
    const DiffProgressiveCallbacks& callbacks,
    bool showOnlyHunks,
    DiffGitCompareOptions compareOptions) {
  const auto loadStartedAt = DiffClock::now();
  if (callbacks.onPhase) {
    callbacks.onPhase("beforeLibGitInit");
  }
  ensureLibGit2Initialized();
  if (callbacks.onPhase) {
    callbacks.onPhase("afterLibGitInit");
  }
  git_repository* rawRepo = nullptr;
  const std::string normalizedPath = normalizeFolderPath(folderPath);
  if (git_repository_open_ext(&rawRepo, normalizedPath.c_str(), 0, nullptr) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to open git repository"));
  }
  const auto repoOpenedAt = DiffClock::now();
  if (callbacks.onPhase) {
    callbacks.onPhase("afterRepoOpen");
  }
  std::unique_ptr<git_repository, GitRepositoryDeleter> repo(rawRepo);

  git_diff_options options = {};
  if (git_diff_options_init(&options, GIT_DIFF_OPTIONS_VERSION) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to initialize git diff options"));
  }
  options.flags = GIT_DIFF_INCLUDE_UNTRACKED | GIT_DIFF_RECURSE_UNTRACKED_DIRS | GIT_DIFF_SHOW_UNTRACKED_CONTENT;
  if (!showOnlyHunks) {
    options.context_lines = fullFileDiffContextLines;
  }

  const auto compareBase = resolveCompareBase(repo.get(), compareOptions);
  if (callbacks.onPhase) {
    callbacks.onPhase("afterHeadTree");
  }
  const char* rawRepositoryPath = git_repository_path(repo.get());
  const char* rawWorkdirPath = git_repository_workdir(repo.get());
  std::string repositoryPath = rawRepositoryPath != nullptr ? std::string(rawRepositoryPath) : std::string();
  std::string workdirPath = rawWorkdirPath != nullptr ? std::string(rawWorkdirPath) : std::string();
  std::string headTreeOid = compareBase.treeOid;
  if (callbacks.onRepositoryMetadata) {
    callbacks.onRepositoryMetadata(DiffRepositoryMetadata{
        .repositoryPath = repositoryPath,
        .workdirPath = workdirPath,
        .headTreeOid = headTreeOid,
    });
  }

  git_status_options statusOptions = {};
  if (git_status_options_init(&statusOptions, GIT_STATUS_OPTIONS_VERSION) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to initialize git status options"));
  }
  statusOptions.show = GIT_STATUS_SHOW_INDEX_AND_WORKDIR;
  statusOptions.flags = GIT_STATUS_OPT_NO_REFRESH;

  StatusPathCollectState statusState{ .callbacks = callbacks };
  if (isHeadCompare(compareOptions)) {
    const auto statusResult = git_status_foreach_ext(repo.get(), &statusOptions, onStatusPath, &statusState);
    if (statusResult < 0 || (statusResult > 0 && !statusState.cancelled)) {
      throw std::runtime_error(gitErrorMessage("Failed to read git status"));
    }
  }

  git_diff* rawDiff = nullptr;
  if (git_diff_tree_to_workdir(&rawDiff, repo.get(), compareBase.tree.get(), &options) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to create git diff"));
  }
  const auto diffCreatedAt = DiffClock::now();
  std::unique_ptr<git_diff, GitDiffDeleter> diff(rawDiff);

  ProgressiveDiffBuildState state{ .callbacks = callbacks };
  state.statusOverrides = std::move(statusState.paths);
  if (git_diff_foreach(diff.get(), onProgressiveGitFile, nullptr, onProgressiveGitHunk, onProgressiveGitLine, &state) != 0 && !state.cancelled) {
    throw std::runtime_error(gitErrorMessage("Failed to read git diff"));
  }
  state.finishCurrentFile();
  const auto diffWalkedAt = DiffClock::now();

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
  timing.rowCount = state.rowCount;
  timing.fileCount = state.fileCount;

  return timing;
}

DiffLoadTiming parseGitRepositoryDiffProgressiveByFile(
    const std::string& folderPath,
    const DiffProgressiveCallbacks& callbacks,
    bool showOnlyHunks,
    DiffGitCompareOptions compareOptions) {
  if (!isHeadCompare(compareOptions)) {
    return parseGitRepositoryDiffProgressive(folderPath, callbacks, showOnlyHunks, std::move(compareOptions));
  }

  const auto loadStartedAt = DiffClock::now();
  if (callbacks.onPhase) {
    callbacks.onPhase("beforeLibGitInit");
  }
  ensureLibGit2Initialized();
  if (callbacks.onPhase) {
    callbacks.onPhase("afterLibGitInit");
  }
  git_repository* rawRepo = nullptr;
  const std::string normalizedPath = normalizeFolderPath(folderPath);
  if (git_repository_open_ext(&rawRepo, normalizedPath.c_str(), 0, nullptr) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to open git repository"));
  }
  const auto repoOpenedAt = DiffClock::now();
  if (callbacks.onPhase) {
    callbacks.onPhase("afterRepoOpen");
  }
  std::unique_ptr<git_repository, GitRepositoryDeleter> repo(rawRepo);

  const auto compareBase = resolveCompareBase(repo.get(), compareOptions);
  if (callbacks.onPhase) {
    callbacks.onPhase("afterHeadTree");
  }
  const char* rawRepositoryPath = git_repository_path(repo.get());
  const char* rawWorkdirPath = git_repository_workdir(repo.get());
  std::string repositoryPath = rawRepositoryPath != nullptr ? std::string(rawRepositoryPath) : std::string();
  std::string workdirPath = rawWorkdirPath != nullptr ? std::string(rawWorkdirPath) : std::string();
  std::string headTreeOid = compareBase.treeOid;
  if (callbacks.onRepositoryMetadata) {
    callbacks.onRepositoryMetadata(DiffRepositoryMetadata{
        .repositoryPath = repositoryPath,
        .workdirPath = workdirPath,
        .headTreeOid = headTreeOid,
    });
  }

  git_status_options statusOptions = {};
  if (git_status_options_init(&statusOptions, GIT_STATUS_OPTIONS_VERSION) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to initialize git status options"));
  }
  statusOptions.show = GIT_STATUS_SHOW_INDEX_AND_WORKDIR;
  statusOptions.flags = GIT_STATUS_OPT_NO_REFRESH;

  git_diff_options diffOptions = {};
  if (git_diff_options_init(&diffOptions, GIT_DIFF_OPTIONS_VERSION) != 0) {
    throw std::runtime_error(gitErrorMessage("Failed to initialize git diff options"));
  }
  diffOptions.flags = GIT_DIFF_INCLUDE_UNTRACKED | GIT_DIFF_RECURSE_UNTRACKED_DIRS | GIT_DIFF_SHOW_UNTRACKED_CONTENT;
  if (!showOnlyHunks) {
    diffOptions.context_lines = fullFileDiffContextLines;
  }

  std::vector<DiffFileSummary> files;
  std::vector<DiffFileSources> fileSources;
  ProgressiveDiffBuildState state{ .callbacks = callbacks };

  auto appendDiscoveredFile = [&](const StatusPathSummary& summary) {
    const auto fileIndex = static_cast<double>(files.size());
    auto file = createStatusFileSummary(summary, fileIndex);
    auto sources = createStatusFileSources(file);
    files.push_back(std::move(file));
    fileSources.push_back(std::move(sources));
  };

  auto publishDiscoveredFiles = [&] {
    if (callbacks.onFilesDiscovered) {
      callbacks.onFilesDiscovered(files, fileSources);
    }
  };

  auto generatePathDiff = [&](const DiffFileSummary& file) {
    auto path = file.status == "deleted" && !file.oldPath.empty() ? file.oldPath : file.path;
    char* pathspecString = path.data();
    diffOptions.pathspec.strings = &pathspecString;
    diffOptions.pathspec.count = 1;

    git_diff* rawDiff = nullptr;
    const auto diffResult = file.status == "conflicted"
      ? git_diff_tree_to_workdir(&rawDiff, repo.get(), compareBase.tree.get(), &diffOptions)
      : git_diff_tree_to_workdir_with_index(&rawDiff, repo.get(), compareBase.tree.get(), &diffOptions);
    if (diffResult != 0) {
      throw std::runtime_error(gitErrorMessage("Failed to create path diff"));
    }
    std::unique_ptr<git_diff, GitDiffDeleter> diff(rawDiff);

    state.nextFileIndex = file.index;
    state.nextFileOldPath = file.oldPath;
    state.nextFilePath = file.path;
    state.nextFileStatus = file.status;
    if (git_diff_foreach(diff.get(), onProgressiveGitFile, nullptr, onProgressiveGitHunk, onProgressiveGitLine, &state) != 0 && !state.cancelled) {
      throw std::runtime_error(gitErrorMessage("Failed to read path diff"));
    }
  };

  StatusPathCollectState firstStatusState{
      .callbacks = callbacks,
      .stopAfterFirst = true,
  };
  const auto firstStatusResult = git_status_foreach_ext(repo.get(), &statusOptions, onStatusPath, &firstStatusState);
  if (firstStatusResult < 0 || (firstStatusResult > 0 && !firstStatusState.stoppedAfterFirst && !firstStatusState.cancelled)) {
    throw std::runtime_error(gitErrorMessage("Failed to read first git status"));
  }

  if (!firstStatusState.paths.empty() && !firstStatusState.cancelled) {
    appendDiscoveredFile(firstStatusState.paths.front());
    publishDiscoveredFiles();
    generatePathDiff(files.front());
    state.finishCurrentFile();
    files.front() = state.currentFile;
    fileSources.front() = createStatusFileSources(files.front());
  }

  const auto firstDiffCreatedAt = DiffClock::now();

  statusOptions.flags = GIT_STATUS_OPT_INCLUDE_UNTRACKED | GIT_STATUS_OPT_RECURSE_UNTRACKED_DIRS | GIT_STATUS_OPT_NO_REFRESH;
  StatusPathCollectState statusState{ .callbacks = callbacks };
  const auto statusResult = git_status_foreach_ext(repo.get(), &statusOptions, onStatusPath, &statusState);
  if (statusResult < 0 || (statusResult > 0 && !statusState.cancelled)) {
    throw std::runtime_error(gitErrorMessage("Failed to read git status"));
  }
  const auto statusCreatedAt = DiffClock::now();

  const auto firstPath = !files.empty() ? files.front().path : std::string();
  for (const auto& statusPath : statusState.paths) {
    if (!firstPath.empty() && statusPath.path == firstPath) {
      continue;
    }
    appendDiscoveredFile(statusPath);
  }

  if (!files.empty()) {
    publishDiscoveredFiles();
    if (!firstPath.empty() && callbacks.onFileFinished) {
      callbacks.onFileFinished(files.front());
    }
  }

  state.fileCount = static_cast<double>(files.size());

  for (const auto& file : files) {
    if (state.shouldCancel()) {
      break;
    }
    if (!firstPath.empty() && file.path == firstPath) {
      continue;
    }
    generatePathDiff(file);
  }

  state.finishCurrentFile();
  const auto diffWalkedAt = DiffClock::now();

  DiffLoadTiming timing;
  timing.openRepoMs = elapsedDiffMs(loadStartedAt, repoOpenedAt);
  timing.fetchMs = 0;
  timing.createDiffMs = elapsedDiffMs(repoOpenedAt, firstDiffCreatedAt);
  timing.walkDiffMs = elapsedDiffMs(statusCreatedAt, diffWalkedAt);
  timing.diffMs = timing.walkDiffMs;
  timing.documentMs = 0;
  timing.copyFilesMs = 0;
  timing.copyInitialRowsMs = 0;
  timing.nativeTotalMs = elapsedDiffMs(loadStartedAt, diffWalkedAt);
  timing.rowCount = state.rowCount;
  timing.fileCount = static_cast<double>(files.size());

  return timing;
}

DiffParsedDocument parseGitRepositoryDiff(
    const std::string& folderPath,
    bool showOnlyHunks,
    DiffGitCompareOptions compareOptions) {
  std::vector<DiffFileSummary> files;
  std::vector<DiffRenderRow> rows;
  std::vector<DiffFileSources> fileSources;
  std::string repositoryPath;
  std::string workdirPath;
  std::string headTreeOid;

  const auto timing = parseGitRepositoryDiffProgressive(folderPath, DiffProgressiveCallbacks{
      .shouldCancel = [] {
        return false;
      },
      .onRepositoryMetadata = [&](DiffRepositoryMetadata metadata) {
        repositoryPath = std::move(metadata.repositoryPath);
        workdirPath = std::move(metadata.workdirPath);
        headTreeOid = std::move(metadata.headTreeOid);
      },
      .onFile = [&](const DiffFileSummary& file, const DiffFileSources& sources, const DiffRenderRow& headerRow) {
        files.push_back(file);
        fileSources.push_back(sources);
        rows.push_back(headerRow);
      },
      .onRow = [&](const DiffRenderRow& row) {
        rows.push_back(row);
      },
      .onFileFinished = [&](const DiffFileSummary& file) {
        const auto fileIndex = static_cast<size_t>(std::max(0.0, std::floor(file.index)));
        if (fileIndex < files.size()) {
          files[fileIndex] = file;
          if (fileIndex < fileSources.size()) {
            fileSources[fileIndex].oldPath = file.oldPath;
            fileSources[fileIndex].newPath = file.path;
            fileSources[fileIndex].status = file.status;
            fileSources[fileIndex].isBinary = file.isBinary;
          }
        }
      },
  }, showOnlyHunks, std::move(compareOptions));

  return {
    .files = std::move(files),
    .rows = std::move(rows),
    .fileSources = std::move(fileSources),
    .repositoryPath = std::move(repositoryPath),
    .workdirPath = std::move(workdirPath),
    .headTreeOid = std::move(headTreeOid),
    .timing = timing,
  };
}

} // namespace margelo::nitro::legenddesktop::diffparser

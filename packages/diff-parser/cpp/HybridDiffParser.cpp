#include "HybridDiffParser.hpp"

#include "HybridDiffDocument.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"

#include <algorithm>
#include <cctype>
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
    const std::string& sourceLabel,
    const std::string& theme) {
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
  timing.createDiffMs = 0;
  timing.walkDiffMs = elapsedDiffMs(loadStartedAt, diffWalkedAt);
  timing.diffMs = timing.walkDiffMs;
  timing.documentMs = 0;
  timing.copyFilesMs = 0;
  timing.copyInitialRowsMs = 0;
  timing.nativeTotalMs = timing.walkDiffMs;
  timing.rowCount = static_cast<double>(state.diff.rows.size());
  timing.fileCount = static_cast<double>(state.diff.files.size());

  return std::make_shared<HybridDiffDocument>(
      std::move(state.diff.files),
      std::move(state.diff.rows),
      std::move(state.fileSources),
      "",
      "",
      sourceLabel,
      theme,
      timing);
}

std::shared_ptr<HybridDiffDocument> loadGitDiffDocument(const std::string& folderPath, const std::string& theme) {
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
      theme,
      timing);
}

} // namespace

HybridDiffParser::HybridDiffParser() : HybridObject(TAG) {}

std::shared_ptr<Promise<DiffLoadResult>> HybridDiffParser::loadGitFolderDiff(
    const std::string& folderPath,
    const std::string& theme,
    double initialRowCount) {
  return Promise<DiffLoadResult>::async([folderPath, theme, initialRowCount]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadGitDiffDocument(folderPath, theme);
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
    const auto rowsFinishedAt = DiffClock::now();
    result.styles = document->getStyles();
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
    const std::string& theme,
    double initialRowCount) {
  return Promise<DiffLoadResult>::async([diffText, sourceLabel, theme, initialRowCount]() -> DiffLoadResult {
    const auto startedAt = DiffClock::now();
    auto document = loadUnifiedDiffDocument(diffText, sourceLabel, theme);
    const auto documentCreatedAt = DiffClock::now();
    DiffLoadResult result;
    result.document = document;
    const auto filesStartedAt = DiffClock::now();
    result.files = document->getFiles();
    const auto filesFinishedAt = DiffClock::now();
    const auto rowsStartedAt = DiffClock::now();
    result.initialRows = document->getPlainRows(0, initialRowCount);
    const auto rowsFinishedAt = DiffClock::now();
    result.styles = document->getStyles();
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

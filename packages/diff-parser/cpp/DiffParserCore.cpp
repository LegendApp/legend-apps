#include "DiffParserCore.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <string_view>

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

using DiffClock = std::chrono::steady_clock;

double elapsedDiffMs(DiffClock::time_point start, DiffClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
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

bool isFileHeaderRow(const DiffRenderRow& row) {
  return row.kind == diffRowKindFileHeader;
}

bool isAddRow(const DiffRenderRow& row) {
  return row.changeType == diffChangeTypeAdd;
}

bool isRemoveRow(const DiffRenderRow& row) {
  return row.changeType == diffChangeTypeRemove;
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
    .timing = timing,
  };
}

} // namespace margelo::nitro::legenddesktop::diffparser

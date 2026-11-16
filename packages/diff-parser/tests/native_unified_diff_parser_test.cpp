#include "../cpp/DiffParserCore.hpp"
#include "../cpp/DiffInlineChange.hpp"
#include "../cpp/DiffSideBySideProjection.hpp"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <functional>
#include <sstream>
#include <iterator>
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace diffparser = margelo::nitro::legendapps::diffparser;

namespace {

constexpr double diffRowKindFileHeader = 0;
constexpr double diffRowKindLine = 2;
constexpr double diffChangeTypeContext = 0;
constexpr double diffChangeTypeAdd = 1;
constexpr double diffChangeTypeRemove = 2;
constexpr double sideBySideKindFileHeader = 0;
constexpr double sideBySideKindContext = 1;
constexpr double sideBySideKindChange = 2;

void expect(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void expectEqual(double actual, double expected, const std::string& message) {
  if (std::fabs(actual - expected) > 0.001) {
    throw std::runtime_error(message + " expected " + std::to_string(expected) + " but got " + std::to_string(actual));
  }
}

void expectEqual(const std::string& actual, const std::string& expected, const std::string& message) {
  if (actual != expected) {
    throw std::runtime_error(message + " expected \"" + expected + "\" but got \"" + actual + "\"");
  }
}

void expectRange(
    const diffparser::DiffInlineChangeRange& actual,
    size_t expectedStart,
    size_t expectedLength,
    const std::string& message) {
  expectEqual(static_cast<double>(actual.start), static_cast<double>(expectedStart), message + " start");
  expectEqual(static_cast<double>(actual.length), static_cast<double>(expectedLength), message + " length");
}

void assertInlineChangeRanges() {
  const auto multipleChanges = diffparser::createDiffInlineChangeRanges(
      u"value = oldName + count;",
      u"value = newName + total;");
  expectEqual(static_cast<double>(multipleChanges.removedRanges.size()), 2, "inline removed range count");
  expectEqual(static_cast<double>(multipleChanges.addedRanges.size()), 2, "inline added range count");
  expectRange(multipleChanges.removedRanges[0], 8, 3, "inline first removed range");
  expectRange(multipleChanges.removedRanges[1], 18, 5, "inline second removed range");
  expectRange(multipleChanges.addedRanges[0], 8, 3, "inline first added range");
  expectRange(multipleChanges.addedRanges[1], 18, 5, "inline second added range");

  const auto withinWord = diffparser::createDiffInlineChangeRanges(u"searchTerm", u"searchText");
  expectEqual(static_cast<double>(withinWord.removedRanges.size()), 1, "within-word removed range count");
  expectEqual(static_cast<double>(withinWord.addedRanges.size()), 1, "within-word added range count");
  expectRange(withinWord.removedRanges[0], 8, 2, "within-word removed range");
  expectRange(withinWord.addedRanges[0], 8, 2, "within-word added range");

  const auto unicodePrefix = diffparser::createDiffInlineChangeRanges(
      u"const emoji = \U0001f600old;",
      u"const emoji = \U0001f600new;");
  expectRange(unicodePrefix.removedRanges[0], 16, 3, "unicode-prefix removed range");
  expectRange(unicodePrefix.addedRanges[0], 16, 3, "unicode-prefix added range");

  expect(
      diffparser::getDiffInlineLineSimilarity(u"const title = old", u"const title = new") >= 0.25,
      "similar changed lines should pass the unbalanced pairing threshold");
  expect(
      diffparser::getDiffInlineLineSimilarity(u"alpha beta", u"gamma delta") < 0.25,
      "unrelated changed lines should not pass the unbalanced pairing threshold");
}

void assertIgnoreWhitespaceChanges() {
  const std::string fixture =
      "diff --git a/whitespace.ts b/whitespace.ts\n"
      "--- a/whitespace.ts\n"
      "+++ b/whitespace.ts\n"
      "@@ -1 +1 @@\n"
      "-const value = 1;\n"
      "+const   value = 1;\n"
      "diff --git a/mixed.ts b/mixed.ts\n"
      "--- a/mixed.ts\n"
      "+++ b/mixed.ts\n"
      "@@ -1,2 +1,2 @@\n"
      "-const oldName = true;\n"
      "-  const keep = 1;\n"
      "+const newName = true;\n"
      "+const keep=1;\n";
  const auto parsed = diffparser::parseUnifiedDiffText(fixture, true);

  expectEqual(static_cast<double>(parsed.files.size()), 1, "ignore whitespace file count");
  expectEqual(parsed.files[0].path, "mixed.ts", "ignore whitespace retained file");
  expectEqual(parsed.files[0].additions, 1, "ignore whitespace additions");
  expectEqual(parsed.files[0].deletions, 1, "ignore whitespace deletions");
  expectEqual(parsed.timing.fileCount, 1, "ignore whitespace timing file count");
  expectEqual(parsed.timing.rowCount, static_cast<double>(parsed.rows.size()), "ignore whitespace timing row count");

  const diffparser::DiffRenderRow *contextRow = nullptr;
  for (const auto& row : parsed.rows) {
    if (row.text == "const keep=1;") {
      contextRow = &row;
      break;
    }
  }
  expect(contextRow != nullptr, "ignore whitespace matched row");
  expectEqual(contextRow->changeType, diffChangeTypeContext, "ignore whitespace matched row type");
  expectEqual(contextRow->oldLineNumber, 2, "ignore whitespace matched old line");
  expectEqual(contextRow->newLineNumber, 2, "ignore whitespace matched new line");
}

const diffparser::DiffFileSummary& fileAt(const diffparser::DiffParsedDocument& parsed, size_t index) {
  expect(index < parsed.files.size(), "expected file index " + std::to_string(index));
  return parsed.files[index];
}

const diffparser::DiffRenderRow& rowAt(const diffparser::DiffParsedDocument& parsed, size_t index) {
  expect(index < parsed.rows.size(), "expected row index " + std::to_string(index));
  return parsed.rows[index];
}

const diffparser::DiffFileSummary& findFile(const diffparser::DiffParsedDocument& parsed, std::string_view path) {
  for (const auto& file : parsed.files) {
    if (file.path == path) {
      return file;
    }
  }
  throw std::runtime_error("expected file path " + std::string(path));
}

const diffparser::DiffRenderRow& findRowTextForFile(
    const diffparser::DiffParsedDocument& parsed,
    const diffparser::DiffFileSummary& file,
    std::string_view text) {
  const auto start = static_cast<size_t>(file.rowStart);
  const auto end = start + static_cast<size_t>(file.rowCount);
  for (size_t index = start; index < end && index < parsed.rows.size(); index += 1) {
    if (parsed.rows[index].text == text) {
      return parsed.rows[index];
    }
  }
  throw std::runtime_error("expected row text \"" + std::string(text) + "\" in " + file.path);
}

bool rowTextExistsForFile(
    const diffparser::DiffParsedDocument& parsed,
    const diffparser::DiffFileSummary& file,
    std::string_view text) {
  const auto start = static_cast<size_t>(file.rowStart);
  const auto end = start + static_cast<size_t>(file.rowCount);
  for (size_t index = start; index < end && index < parsed.rows.size(); index += 1) {
    if (parsed.rows[index].text == text) {
      return true;
    }
  }
  return false;
}

diffparser::DiffParsedDocument parseUnifiedDiffStreamForTest(const std::string& diffText, size_t chunkSize) {
  std::vector<diffparser::DiffFileSummary> files;
  std::vector<diffparser::DiffRenderRow> rows;
  std::vector<diffparser::DiffFileSources> fileSources;

  diffparser::UnifiedDiffStreamParser parser(diffparser::DiffProgressiveCallbacks{
      .shouldCancel = [] {
        return false;
      },
      .onFile = [&](const diffparser::DiffFileSummary& file, const diffparser::DiffFileSources& sources, const diffparser::DiffRenderRow& headerRow) {
        files.push_back(file);
        fileSources.push_back(sources);
        rows.push_back(headerRow);
      },
      .onRow = [&](const diffparser::DiffRenderRow& row) {
        rows.push_back(row);
      },
      .onFileFinished = [&](const diffparser::DiffFileSummary& file) {
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
  });

  for (size_t offset = 0; offset < diffText.size(); offset += chunkSize) {
    parser.append(std::string_view(diffText.data() + offset, std::min(chunkSize, diffText.size() - offset)));
  }
  const auto timing = parser.finish();

  return {
    .files = std::move(files),
    .rows = std::move(rows),
    .fileSources = std::move(fileSources),
    .repositoryPath = "",
    .workdirPath = "",
    .headTreeOid = "",
    .timing = timing,
  };
}

void assertSameUnifiedParse(const diffparser::DiffParsedDocument& actual, const diffparser::DiffParsedDocument& expected) {
  expectEqual(static_cast<double>(actual.files.size()), static_cast<double>(expected.files.size()), "stream file count");
  expectEqual(static_cast<double>(actual.rows.size()), static_cast<double>(expected.rows.size()), "stream row count");
  expectEqual(static_cast<double>(actual.fileSources.size()), static_cast<double>(expected.fileSources.size()), "stream file source count");
  for (size_t index = 0; index < expected.files.size(); index += 1) {
    const auto& actualFile = actual.files[index];
    const auto& expectedFile = expected.files[index];
    expectEqual(actualFile.path, expectedFile.path, "stream file path");
    expectEqual(actualFile.oldPath, expectedFile.oldPath, "stream file old path");
    expectEqual(actualFile.status, expectedFile.status, "stream file status");
    expectEqual(actualFile.additions, expectedFile.additions, "stream file additions");
    expectEqual(actualFile.deletions, expectedFile.deletions, "stream file deletions");
    expectEqual(actualFile.rowStart, expectedFile.rowStart, "stream file row start");
    expectEqual(actualFile.rowCount, expectedFile.rowCount, "stream file row count");
    expect(actualFile.isBinary == expectedFile.isBinary, "stream file binary flag");
  }
  for (size_t index = 0; index < expected.rows.size(); index += 1) {
    const auto& actualRow = actual.rows[index];
    const auto& expectedRow = expected.rows[index];
    expectEqual(actualRow.index, expectedRow.index, "stream row index");
    expectEqual(actualRow.kind, expectedRow.kind, "stream row kind");
    expectEqual(actualRow.fileIndex, expectedRow.fileIndex, "stream row file index");
    expectEqual(actualRow.hunkIndex, expectedRow.hunkIndex, "stream row hunk index");
    expectEqual(actualRow.oldLineNumber, expectedRow.oldLineNumber, "stream row old line");
    expectEqual(actualRow.newLineNumber, expectedRow.newLineNumber, "stream row new line");
    expectEqual(actualRow.changeType, expectedRow.changeType, "stream row change type");
    expectEqual(actualRow.text, expectedRow.text, "stream row text");
  }
}

std::string makeUnifiedDiffFixture() {
  return R"(diff --git a/src/App.tsx b/src/App.tsx
index 0000000..1111111 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,5 +1,6 @@
 import React from "react";
-const title = "Old";
+const title = "New";
+const enabled = true;
 export function App() {
   return title;
 }
diff --git a/src/NewFile.ts b/src/NewFile.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/NewFile.ts
@@ -0,0 +1,2 @@
+export const value = 1;
+export const name = "new";
diff --git a/src/Deleted.ts b/src/Deleted.ts
deleted file mode 100644
index 3333333..0000000
--- a/src/Deleted.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-export const removed = true;
-export const stale = false;
diff --git a/src/OldName.ts b/src/NewName.ts
similarity index 80%
rename from src/OldName.ts
rename to src/NewName.ts
index 4444444..5555555 100644
--- a/src/OldName.ts
+++ b/src/NewName.ts
@@ -1 +1 @@
-export const label = "old";
+export const label = "new";
diff --git a/assets/logo.png b/assets/logo.png
index 6666666..7777777 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
)";
}

void assertFileSummaries(const diffparser::DiffParsedDocument& parsed) {
  expectEqual(static_cast<double>(parsed.files.size()), 5, "file count");
  expectEqual(parsed.timing.fileCount, 5, "timing file count");
  expectEqual(parsed.timing.rowCount, static_cast<double>(parsed.rows.size()), "timing row count");

  const auto& modified = fileAt(parsed, 0);
  expectEqual(modified.path, "src/App.tsx", "modified path");
  expectEqual(modified.oldPath, "src/App.tsx", "modified old path");
  expectEqual(modified.status, "modified", "modified status");
  expectEqual(modified.additions, 2, "modified additions");
  expectEqual(modified.deletions, 1, "modified deletions");
  expect(!modified.isBinary, "modified file should not be binary");

  const auto& added = fileAt(parsed, 1);
  expectEqual(added.path, "src/NewFile.ts", "added path");
  expectEqual(added.oldPath, "src/NewFile.ts", "added old path");
  expectEqual(added.status, "added", "added status");
  expectEqual(added.additions, 2, "added additions");
  expectEqual(added.deletions, 0, "added deletions");
  // Catches added/deleted files whose sidebar status and rendered rows drift apart.
  expectEqual(added.rowCount, 3, "added row count should include header and added rows");

  const auto& deleted = fileAt(parsed, 2);
  expectEqual(deleted.path, "src/Deleted.ts", "deleted path");
  expectEqual(deleted.oldPath, "src/Deleted.ts", "deleted old path");
  expectEqual(deleted.status, "deleted", "deleted status");
  expectEqual(deleted.additions, 0, "deleted additions");
  expectEqual(deleted.deletions, 2, "deleted deletions");
  expectEqual(deleted.rowCount, 3, "deleted row count should include header and removed rows");

  const auto& renamed = fileAt(parsed, 3);
  expectEqual(renamed.path, "src/NewName.ts", "renamed path");
  expectEqual(renamed.oldPath, "src/OldName.ts", "renamed old path");
  expectEqual(renamed.status, "renamed", "renamed status");
  expectEqual(renamed.additions, 1, "renamed additions");
  expectEqual(renamed.deletions, 1, "renamed deletions");

  const auto& binary = fileAt(parsed, 4);
  expectEqual(binary.path, "assets/logo.png", "binary path");
  expectEqual(binary.oldPath, "assets/logo.png", "binary old path");
  expectEqual(binary.status, "modified", "binary status");
  expect(binary.isBinary, "binary file should be marked binary");
  // Catches binary diffs leaking bogus text rows into the document body.
  expectEqual(binary.rowCount, 1, "binary row count should include only the file header");
}

void assertRenderRows(const diffparser::DiffParsedDocument& parsed) {
  const auto& fileHeader = rowAt(parsed, 0);
  expectEqual(fileHeader.kind, diffRowKindFileHeader, "first row kind");
  expectEqual(fileHeader.fileIndex, 0, "first row file index");
  expectEqual(fileHeader.hunkIndex, -1, "first row hunk index");
  expectEqual(fileHeader.text, "src/App.tsx", "first row text");

  const auto& context = rowAt(parsed, 1);
  expectEqual(context.kind, diffRowKindLine, "context row kind");
  expectEqual(context.changeType, diffChangeTypeContext, "context change type");
  expectEqual(context.oldLineNumber, 1, "context old line");
  expectEqual(context.newLineNumber, 1, "context new line");

  const auto& removed = rowAt(parsed, 2);
  expectEqual(removed.changeType, diffChangeTypeRemove, "removed change type");
  expectEqual(removed.oldLineNumber, 2, "removed old line");
  expectEqual(removed.newLineNumber, -1, "removed new line");
  expectEqual(removed.text, "const title = \"Old\";", "removed text");

  const auto& added = rowAt(parsed, 3);
  expectEqual(added.changeType, diffChangeTypeAdd, "added change type");
  expectEqual(added.oldLineNumber, -1, "added old line");
  expectEqual(added.newLineNumber, 2, "added new line");
  expectEqual(added.text, "const title = \"New\";", "added text");
}

void assertSideBySideRows(const diffparser::DiffParsedDocument& parsed) {
  const auto lines = diffparser::createDiffSideBySideLines(parsed.rows);
  expect(!lines.empty(), "side-by-side rows should be created");

  const auto& fileHeader = lines[0];
  expectEqual(fileHeader.kind, sideBySideKindFileHeader, "side-by-side first kind");
  expectEqual(fileHeader.oldRowIndex, 0, "side-by-side first old row");
  expectEqual(fileHeader.newRowIndex, 0, "side-by-side first new row");

  bool foundContextLine = false;
  bool foundChangedPair = false;
  bool foundAddedOnlyLine = false;
  for (const auto& line : lines) {
    if (line.kind == sideBySideKindContext && line.oldRowIndex == 1 && line.newRowIndex == 1) {
      foundContextLine = true;
    }
    if (line.kind == sideBySideKindChange && line.oldRowIndex == 2 && line.newRowIndex == 3) {
      foundChangedPair = true;
    }
    if (line.kind == sideBySideKindChange && line.oldRowIndex == -1 && line.newRowIndex == 4) {
      foundAddedOnlyLine = true;
    }
  }

  expect(foundContextLine, "side-by-side should preserve context rows");
  expect(foundChangedPair, "side-by-side should pair adjacent removed and added rows");
  expect(foundAddedOnlyLine, "side-by-side should keep unpaired added rows");
}

void assertSideBySideProjection(const diffparser::DiffParsedDocument& parsed) {
  const auto lines = diffparser::createDiffSideBySideLines(parsed.rows);
  diffparser::DiffSideBySideIndex index;
  index.rebuild(lines, 1, 0);
  diffparser::DiffSideBySideProjection projection(index);

  expectEqual(static_cast<double>(projection.length()), static_cast<double>(lines.size()), "projection initial length");
  expectEqual(static_cast<double>(projection.documentGeneration()), 1, "projection document generation");
  expect(!index.files().empty(), "projection file spans");

  const auto firstFile = index.files().front();
  expect(firstFile.baseCount > 1, "projection first file expanded rows");
  const auto secondFile = index.files().size() > 1 ? std::optional(index.files()[1]) : std::nullopt;
  const auto firstFileHeader = projection.visibleIndexForFile(firstFile.fileIndex);
  expect(firstFileHeader.has_value(), "projection first file header index");
  expectEqual(static_cast<double>(*firstFileHeader), 0, "projection first file header starts at zero");

  const auto collapse = projection.setFileCollapsed(firstFile.fileIndex, true);
  expect(collapse.changed, "projection collapse should change");
  expectEqual(static_cast<double>(collapse.splices.size()), 1, "projection collapse splice count");
  expectEqual(static_cast<double>(collapse.splices[0].index), 1, "projection collapse splice index");
  expectEqual(
      static_cast<double>(collapse.splices[0].deleteCount),
      static_cast<double>(firstFile.baseCount - 1),
      "projection collapse delete count");
  expectEqual(collapse.splices[0].insertCount, 0, "projection collapse insert count");
  expect(projection.isFileCollapsed(firstFile.fileIndex), "projection collapsed state");

  const auto hiddenLocation = projection.locateItem(firstFile.baseStart + 1);
  expect(hiddenLocation.has_value(), "projection hidden row location");
  expect(hiddenLocation->collapsed, "projection hidden row collapsed state");
  expect(!hiddenLocation->exact, "projection hidden row maps to header");
  expectEqual(static_cast<double>(hiddenLocation->itemId), static_cast<double>(firstFile.baseStart), "projection hidden row item");
  expectEqual(static_cast<double>(hiddenLocation->visibleIndex), 0, "projection hidden row visible index");

  if (secondFile.has_value()) {
    const auto secondHeader = projection.visibleIndexForFile(secondFile->fileIndex);
    expect(secondHeader.has_value(), "projection second header after collapse");
    expectEqual(static_cast<double>(*secondHeader), 1, "projection second header shifts by exact splice");
    const auto secondHeaderItem = projection.itemIdAt(*secondHeader);
    expect(secondHeaderItem.has_value(), "projection second header item");
    expectEqual(
        static_cast<double>(*secondHeaderItem),
        static_cast<double>(secondFile->baseStart),
        "projection retained item identity");
  }

  const auto noChange = projection.setFileCollapsed(firstFile.fileIndex, true);
  expect(!noChange.changed, "projection idempotent collapse");
  expectEqual(static_cast<double>(noChange.revision), static_cast<double>(collapse.revision), "projection idempotent revision");

  const auto expand = projection.setFileCollapsed(firstFile.fileIndex, false);
  expect(expand.changed, "projection expand should change");
  expectEqual(static_cast<double>(expand.splices.size()), 1, "projection expand splice count");
  expectEqual(static_cast<double>(expand.splices[0].index), 1, "projection expand splice index");
  expectEqual(expand.splices[0].deleteCount, 0, "projection expand delete count");
  expectEqual(
      static_cast<double>(expand.splices[0].insertCount),
      static_cast<double>(firstFile.baseCount - 1),
      "projection expand insert count");
  expectEqual(static_cast<double>(projection.length()), static_cast<double>(lines.size()), "projection restored length");

  size_t expectedHunkStarts = 0;
  int32_t previousFileIndex = -1;
  int32_t previousHunkIndex = -1;
  for (size_t itemId = 0; itemId < lines.size(); itemId += 1) {
    const auto& line = lines[itemId];
    const bool expectedHunkStart =
        line.kind != sideBySideKindFileHeader &&
        line.hunkIndex >= 0 &&
        (line.fileIndex != previousFileIndex || line.hunkIndex != previousHunkIndex);
    expect(index.isHunkStart(itemId) == expectedHunkStart, "projection hunk-start metadata");
    expectedHunkStarts += expectedHunkStart ? 1 : 0;
    previousFileIndex = line.fileIndex;
    previousHunkIndex = line.hunkIndex;
  }
  expect(expectedHunkStarts > 0, "projection fixture should contain hunks");
}

diffparser::DiffParsedDocument parseGitRepositoryDiffByFileForTest(
    const std::string& fixturePath,
    bool showOnlyHunks = true,
    diffparser::DiffGitCompareOptions compareOptions = {}) {
  std::vector<diffparser::DiffFileSummary> files;
  std::vector<diffparser::DiffRenderRow> rows;
  std::vector<diffparser::DiffFileSources> fileSources;
  std::string repositoryPath;
  std::string workdirPath;
  std::string headTreeOid;

  const auto timing = diffparser::parseGitRepositoryDiffProgressiveByFile(fixturePath, diffparser::DiffProgressiveCallbacks{
      .shouldCancel = [] {
        return false;
      },
      .onRepositoryMetadata = [&](diffparser::DiffRepositoryMetadata metadata) {
        repositoryPath = std::move(metadata.repositoryPath);
        workdirPath = std::move(metadata.workdirPath);
        headTreeOid = std::move(metadata.headTreeOid);
      },
      .onFilesDiscovered = [&](std::vector<diffparser::DiffFileSummary> discoveredFiles, std::vector<diffparser::DiffFileSources> discoveredSources) {
        files = std::move(discoveredFiles);
        fileSources = std::move(discoveredSources);
      },
      .onFile = [&](const diffparser::DiffFileSummary& file, const diffparser::DiffFileSources& sources, const diffparser::DiffRenderRow& headerRow) {
        const auto fileIndex = static_cast<size_t>(std::max(0.0, std::floor(file.index)));
        if (fileIndex < files.size()) {
          files[fileIndex] = file;
        } else {
          files.push_back(file);
        }
        if (fileIndex < fileSources.size()) {
          fileSources[fileIndex] = sources;
        } else {
          fileSources.push_back(sources);
        }
        rows.push_back(headerRow);
      },
      .onRow = [&](const diffparser::DiffRenderRow& row) {
        rows.push_back(row);
      },
      .onFileFinished = [&](const diffparser::DiffFileSummary& file) {
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

void assertGitRepositoryDiff(const std::string& fixturePath) {
  const auto parsed = diffparser::parseGitRepositoryDiff(fixturePath);
  expectEqual(static_cast<double>(parsed.files.size()), 6, "git file count");
  expectEqual(parsed.timing.fileCount, 6, "git timing file count");
  expectEqual(parsed.timing.rowCount, static_cast<double>(parsed.rows.size()), "git timing row count");
  expect(!parsed.repositoryPath.empty(), "git repository path should be set");
  expect(!parsed.workdirPath.empty(), "git workdir path should be set");
  expect(!parsed.headTreeOid.empty(), "git HEAD tree oid should be set");

  const auto& modified = findFile(parsed, "src/App.tsx");
  expectEqual(modified.oldPath, "src/App.tsx", "git modified old path");
  expectEqual(modified.status, "modified", "git modified status");
  expectEqual(modified.additions, 1, "git modified additions");
  expectEqual(modified.deletions, 1, "git modified deletions");
  expect(!modified.isBinary, "git modified file should not be binary");
  const auto& modifiedAddedRow = findRowTextForFile(parsed, modified, "  return \"changed\";");
  expectEqual(modifiedAddedRow.changeType, diffChangeTypeAdd, "git modified added row type");
  expectEqual(modifiedAddedRow.oldLineNumber, -1, "git modified added old line");
  expectEqual(modifiedAddedRow.newLineNumber, 2, "git modified added new line");

  const auto& added = findFile(parsed, "src/NewFile.ts");
  expectEqual(added.oldPath, "src/NewFile.ts", "git added old path");
  expectEqual(added.status, "untracked", "git added status");
  expectEqual(added.additions, 1, "git added additions");
  expectEqual(added.deletions, 0, "git added deletions");
  expect(!added.isBinary, "git added file should not be binary");
  // Catches added/deleted files whose sidebar status and rendered rows drift apart.
  expectEqual(added.rowCount, 2, "git added row count should include header and added row");

  const auto& deleted = findFile(parsed, "src/Deleted.ts");
  expectEqual(deleted.oldPath, "src/Deleted.ts", "git deleted old path");
  expectEqual(deleted.status, "deleted", "git deleted status");
  expectEqual(deleted.additions, 0, "git deleted additions");
  expectEqual(deleted.deletions, 1, "git deleted deletions");
  expectEqual(deleted.rowCount, 2, "git deleted row count should include header and removed row");

  const auto& binary = findFile(parsed, "assets/logo.bin");
  expectEqual(binary.oldPath, "assets/logo.bin", "git binary old path");
  expectEqual(binary.status, "modified", "git binary status");
  expect(binary.isBinary, "git binary file should be marked binary");
  // Catches binary diffs leaking bogus text rows into the document body.
  expectEqual(binary.rowCount, 1, "git binary row count should include only the file header");

  const auto& conflicted = findFile(parsed, "src/Conflict.ts");
  expectEqual(conflicted.oldPath, "src/Conflict.ts", "git conflicted old path");
  expectEqual(conflicted.status, "conflicted", "git conflicted status");
  expect(!conflicted.isBinary, "git conflicted file should not be binary");
  const auto& conflictMarkerRow = findRowTextForFile(parsed, conflicted, "<<<<<<< HEAD");
  expectEqual(conflictMarkerRow.changeType, diffChangeTypeAdd, "git conflicted marker row type");
  expectEqual(conflictMarkerRow.oldLineNumber, -1, "git conflicted marker old line");
  expectEqual(conflictMarkerRow.newLineNumber, 1, "git conflicted marker new line");
  const auto& conflictBranchRow = findRowTextForFile(parsed, conflicted, "export const side = \"branch\";");
  expectEqual(conflictBranchRow.changeType, diffChangeTypeAdd, "git conflicted branch row type");

  expectEqual(static_cast<double>(parsed.fileSources.size()), 6, "git file source count");
  for (const auto& sources : parsed.fileSources) {
    const auto& file = fileAt(parsed, static_cast<size_t>(sources.fileIndex));
    expectEqual(sources.oldPath, file.oldPath, "git file source old path");
    expectEqual(sources.newPath, file.path, "git file source new path");
    expectEqual(sources.status, file.status, "git file source status");
    expect(sources.isBinary == file.isBinary, "git file source binary flag");
    expect(!sources.isUnifiedDiff, "git file source should not be marked unified");
  }
}

void assertGitRepositoryDiffByFile(const std::string& fixturePath) {
  const auto parsed = parseGitRepositoryDiffByFileForTest(fixturePath);
  expectEqual(static_cast<double>(parsed.files.size()), 6, "git by-file file count");
  expectEqual(parsed.timing.fileCount, 6, "git by-file timing file count");
  expectEqual(parsed.timing.rowCount, static_cast<double>(parsed.rows.size()), "git by-file timing row count");

  const auto& modified = findFile(parsed, "src/App.tsx");
  expect(!rowTextExistsForFile(parsed, modified, "export const outsideFullFileContext = \"base\";"), "git by-file hunk mode should omit distant context");

  const auto& binary = findFile(parsed, "assets/logo.bin");
  // Catches progressive by-file parsing rendering binary payloads as text rows.
  expect(binary.isBinary, "git by-file binary file should be marked binary");
  expectEqual(binary.rowCount, 1, "git by-file binary row count should include only the file header");

  const auto& conflicted = findFile(parsed, "src/Conflict.ts");
  expectEqual(conflicted.oldPath, "src/Conflict.ts", "git by-file conflicted old path");
  expectEqual(conflicted.status, "conflicted", "git by-file conflicted status");
  expect(!conflicted.isBinary, "git by-file conflicted file should not be binary");
  const auto& conflictMarkerRow = findRowTextForFile(parsed, conflicted, "<<<<<<< HEAD");
  expectEqual(conflictMarkerRow.changeType, diffChangeTypeAdd, "git by-file conflicted marker row type");
  expectEqual(conflictMarkerRow.oldLineNumber, -1, "git by-file conflicted marker old line");
  expectEqual(conflictMarkerRow.newLineNumber, 1, "git by-file conflicted marker new line");
  const auto& conflictBranchRow = findRowTextForFile(parsed, conflicted, "export const side = \"branch\";");
  expectEqual(conflictBranchRow.changeType, diffChangeTypeAdd, "git by-file conflicted branch row type");

  const auto fullParsed = parseGitRepositoryDiffByFileForTest(fixturePath, false);
  const auto& fullModified = findFile(fullParsed, "src/App.tsx");
  expect(rowTextExistsForFile(fullParsed, fullModified, "export const outsideFullFileContext = \"base\";"), "git by-file full mode should include distant context");
}

void assertGitRepositoryDiffAgainstCompareBase(const std::string& fixturePath) {
  const auto parsed = diffparser::parseGitRepositoryDiff(fixturePath, true, diffparser::DiffGitCompareOptions{
      .baseKind = "ref",
      .baseRef = "compare-base",
      .useMergeBase = true,
  });

  expect(!parsed.headTreeOid.empty(), "git compare-base tree oid should be set");

  const auto& conflict = findFile(parsed, "src/Conflict.ts");
  expectEqual(conflict.status, "modified", "git compare-base conflict status");
  const auto& baseConflictRow = findRowTextForFile(parsed, conflict, "export const side = \"base\";");
  expectEqual(baseConflictRow.changeType, diffChangeTypeRemove, "git compare-base conflict removed row type");
  const auto& branchConflictRow = findRowTextForFile(parsed, conflict, "export const side = \"branch\";");
  expectEqual(branchConflictRow.changeType, diffChangeTypeAdd, "git compare-base conflict branch row type");

  const auto& modified = findFile(parsed, "src/App.tsx");
  const auto& changedReturnRow = findRowTextForFile(parsed, modified, "  return \"changed\";");
  expectEqual(changedReturnRow.changeType, diffChangeTypeAdd, "git compare-base modified added row type");

  const auto& added = findFile(parsed, "src/NewFile.ts");
  expectEqual(added.status, "untracked", "git compare-base untracked status");
}

void assertGitRepositoryDiffIgnoresWhitespace(const std::string& fixturePath) {
  const auto parsed = diffparser::parseGitRepositoryDiff(fixturePath, true, diffparser::DiffGitCompareOptions{
      .ignoreWhitespace = true,
  });
  expectEqual(static_cast<double>(parsed.files.size()), 5, "git ignore-whitespace file count");
  const bool hasWhitespaceFile = std::any_of(parsed.files.begin(), parsed.files.end(), [](const auto& file) {
    return file.path == "src/Whitespace.ts";
  });
  expect(!hasWhitespaceFile, "git ignore-whitespace should omit whitespace-only files");
}

constexpr double diffChangeTypeMeta = 3;
const std::string noNewlineMarker = "\\ No newline at end of file";

// "<sign><text>" for line rows, or the marker text for no-newline rows, matching how git prints the hunk body.
std::vector<std::string> hunkBodyForFile(const diffparser::DiffParsedDocument& parsed, const diffparser::DiffFileSummary& file) {
  std::vector<std::string> body;
  const auto start = static_cast<size_t>(file.rowStart);
  const auto end = start + static_cast<size_t>(file.rowCount);
  for (size_t index = start; index < end && index < parsed.rows.size(); index += 1) {
    const auto& row = parsed.rows[index];
    if (row.kind != diffRowKindLine) {
      continue;
    }
    if (row.changeType == diffChangeTypeMeta) {
      expectEqual(row.oldLineNumber, -1, file.path + " marker old line");
      expectEqual(row.newLineNumber, -1, file.path + " marker new line");
      body.push_back(row.text);
      continue;
    }
    const char sign = row.changeType == diffChangeTypeAdd ? '+' : row.changeType == diffChangeTypeRemove ? '-' : ' ';
    body.push_back(sign + row.text);
  }
  return body;
}

void expectHunkBody(
    const diffparser::DiffParsedDocument& parsed,
    std::string_view path,
    const std::vector<std::string>& expected,
    const std::string& label) {
  const auto& file = findFile(parsed, path);
  const auto actual = hunkBodyForFile(parsed, file);
  std::string actualText;
  std::string expectedText;
  for (const auto& line : actual) actualText += line + "|";
  for (const auto& line : expected) expectedText += line + "|";
  expectEqual(actualText, expectedText, label + " " + std::string(path) + " body");
}

// Both files lack a final newline on both sides; fixed.txt gains one; dropped.txt loses one.
const std::vector<std::string> noNewlineBothBody = { " first", "-last", noNewlineMarker, "+changed last", noNewlineMarker };
const std::vector<std::string> noNewlineFixedBody = { " a", "-b", noNewlineMarker, "+b" };
const std::vector<std::string> noNewlineDroppedBody = { " a", "-b", "+b", noNewlineMarker };

void assertNoNewlineSideBySide(const diffparser::DiffParsedDocument& parsed, const std::string& label) {
  const auto& file = findFile(parsed, "no-newline.txt");
  const auto lines = diffparser::createDiffSideBySideLines(parsed.rows);
  std::vector<std::pair<std::string, std::string>> pairs;
  const auto sideText = [&](int32_t rowIndex) {
    return rowIndex < 0 ? std::string() : parsed.rows[static_cast<size_t>(rowIndex)].text;
  };
  for (const auto& line : lines) {
    if (line.fileIndex == file.index && line.kind == sideBySideKindChange) {
      pairs.emplace_back(sideText(line.oldRowIndex), sideText(line.newRowIndex));
    }
  }
  expectEqual(static_cast<double>(pairs.size()), 2, label + " side-by-side no-newline change count");
  expectEqual(pairs[0].first + "|" + pairs[0].second, "last|changed last", label + " side-by-side changed line pair");
  expectEqual(pairs[1].first + "|" + pairs[1].second, noNewlineMarker + "|" + noNewlineMarker, label + " side-by-side marker pair");
}

void assertUnifiedNoNewlineAndQuotedPaths() {
  const std::string fixture =
    "diff --git a/no-newline.txt b/no-newline.txt\n"
    "index 1111111..2222222 100644\n"
    "--- a/no-newline.txt\n"
    "+++ b/no-newline.txt\n"
    "@@ -1,2 +1,2 @@\n"
    " first\n"
    "-last\n"
    "\\ No newline at end of file\n"
    "+changed last\n"
    "\\ No newline at end of file\n"
    "diff --git \"a/old \\\"name\\\".txt\" \"b/renamed \\\"quoted\\\" n\\303\\244me.txt\"\n"
    "similarity index 90%\n"
    "rename from \"old \\\"name\\\".txt\"\n"
    "rename to \"renamed \\\"quoted\\\" n\\303\\244me.txt\"\n"
    "index 3333333..4444444 100644\n"
    "--- \"a/old \\\"name\\\".txt\"\n"
    "+++ \"b/renamed \\\"quoted\\\" n\\303\\244me.txt\"\n"
    "@@ -1 +1 @@\n"
    "-one\n"
    "+two\n"
    "diff --git \"a/tab\\there\" \"b/back\\\\slash\\nline\"\n"
    "similarity index 100%\n"
    "rename from \"tab\\there\"\n"
    "rename to \"back\\\\slash\\nline\"\n"
    "diff --git a/plain.txt \"b/copy \\\"of\\\" plain.txt\"\n"
    "similarity index 100%\n"
    "copy from plain.txt\n"
    "copy to \"copy \\\"of\\\" plain.txt\"\n";

  const auto parsed = diffparser::parseUnifiedDiffText(fixture);
  expectHunkBody(parsed, "no-newline.txt", noNewlineBothBody, "unified");
  const auto& noNewline = findFile(parsed, "no-newline.txt");
  expectEqual(noNewline.additions, 1, "unified no-newline additions");
  expectEqual(noNewline.deletions, 1, "unified no-newline deletions");
  assertNoNewlineSideBySide(parsed, "unified");

  const auto& renamed = findFile(parsed, "renamed \"quoted\" n\xC3\xA4me.txt");
  expectEqual(renamed.oldPath, "old \"name\".txt", "unified quoted rename old path");
  expectEqual(renamed.status, "renamed", "unified quoted rename status");
  expectEqual(rowAt(parsed, static_cast<size_t>(renamed.rowStart)).text, renamed.path, "unified quoted rename header text");
  const auto& pureRename = findFile(parsed, "back\\slash\nline");
  expectEqual(pureRename.oldPath, "tab\there", "unified pure rename old path");
  expectEqual(pureRename.status, "renamed", "unified pure rename status");
  const auto& copied = findFile(parsed, "copy \"of\" plain.txt");
  expectEqual(copied.oldPath, "plain.txt", "unified copy old path");
  expectEqual(parsed.fileSources[static_cast<size_t>(copied.index)].newPath, copied.path, "unified copy source path");

  assertSameUnifiedParse(parseUnifiedDiffStreamForTest(fixture, 1), parsed);
  assertSameUnifiedParse(parseUnifiedDiffStreamForTest(fixture, 23), parsed);
}

void assertGitRepositoryNoNewline(const std::string& fixturePath) {
  const auto parsed = diffparser::parseGitRepositoryDiff(fixturePath);
  expectHunkBody(parsed, "no-newline.txt", noNewlineBothBody, "git");
  expectHunkBody(parsed, "fixed.txt", noNewlineFixedBody, "git");
  expectHunkBody(parsed, "dropped.txt", noNewlineDroppedBody, "git");
  const auto& noNewline = findFile(parsed, "no-newline.txt");
  expectEqual(noNewline.additions, 1, "git no-newline additions");
  expectEqual(noNewline.deletions, 1, "git no-newline deletions");
  assertNoNewlineSideBySide(parsed, "git");
}

void assertUnifiedGitDiffNoNewline(const std::string& diffPath) {
  std::ifstream input(diffPath, std::ios::binary);
  expect(input.good(), "expected git diff text at " + diffPath);
  const std::string diffText((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
  const auto parsed = diffparser::parseUnifiedDiffText(diffText);
  expectHunkBody(parsed, "no-newline.txt", noNewlineBothBody, "git diff text");
  expectHunkBody(parsed, "fixed.txt", noNewlineFixedBody, "git diff text");
  expectHunkBody(parsed, "dropped.txt", noNewlineDroppedBody, "git diff text");
  const auto& renamed = findFile(parsed, "renamed \"quoted\" n\xC3\xA4me.txt");
  expectEqual(renamed.oldPath, "old name.txt", "git diff text quoted rename old path");
  assertSameUnifiedParse(parseUnifiedDiffStreamForTest(diffText, 7), parsed);
}

std::vector<std::string> sortedFilePaths(const diffparser::DiffParsedDocument& parsed) {
  std::vector<std::string> paths;
  for (const auto& file : parsed.files) {
    paths.push_back(file.path);
  }
  std::sort(paths.begin(), paths.end());
  return paths;
}

void expectFilePaths(const diffparser::DiffParsedDocument& parsed, const std::vector<std::string>& expected, const std::string& label) {
  const auto actual = sortedFilePaths(parsed);
  std::string actualText;
  for (const auto& path : actual) {
    actualText += path + ", ";
  }
  expect(actual == expected, label + " file paths, got: " + actualText);
  expectEqual(parsed.timing.fileCount, static_cast<double>(expected.size()), label + " timing file count");
  expectEqual(static_cast<double>(parsed.fileSources.size()), static_cast<double>(expected.size()), label + " file source count");
}

void assertGitRepositoryExcludePaths(const std::string& fixturePath) {
  const std::vector<std::string> allPaths = {
      ".review/nested/deep/story.md",
      ".review/tracked.md",
      ".reviewer/keep.md",
      "docs/.review/keep.md",
      "docs/generated-notes.md",
      "docs/generated/tracked.md",
      "src/keep.ts",
  };
  // Root ".review" goes with its tracked and nested untracked files; ".reviewer", "docs/.review" and "docs/generated-notes.md" stay.
  const std::vector<std::string> keptPaths = {
      ".reviewer/keep.md",
      "docs/.review/keep.md",
      "docs/generated-notes.md",
      "src/keep.ts",
  };
  const diffparser::DiffGitCompareOptions excludeOptions{.excludePaths = {".review", "docs/generated/"}};
  const diffparser::DiffGitCompareOptions emptyOptions{.excludePaths = {}};
  const diffparser::DiffGitCompareOptions refExcludeOptions{
      .baseKind = "ref",
      .baseRef = "HEAD",
      .useMergeBase = false,
      .excludePaths = excludeOptions.excludePaths,
  };

  expectFilePaths(diffparser::parseGitRepositoryDiff(fixturePath), allPaths, "git exclude absent");
  expectFilePaths(diffparser::parseGitRepositoryDiff(fixturePath, true, emptyOptions), allPaths, "git exclude empty");
  expectFilePaths(diffparser::parseGitRepositoryDiff(fixturePath, true, excludeOptions), keptPaths, "git exclude");
  expectFilePaths(diffparser::parseGitRepositoryDiff(fixturePath, true, refExcludeOptions), keptPaths, "git exclude ref compare");
  expectFilePaths(parseGitRepositoryDiffByFileForTest(fixturePath), allPaths, "git by-file exclude absent");
  expectFilePaths(parseGitRepositoryDiffByFileForTest(fixturePath, true, emptyOptions), allPaths, "git by-file exclude empty");
  expectFilePaths(parseGitRepositoryDiffByFileForTest(fixturePath, true, excludeOptions), keptPaths, "git by-file exclude");

  const auto parsed = diffparser::parseGitRepositoryDiff(fixturePath, true, excludeOptions);
  for (const auto& row : parsed.rows) {
    expect(row.text.find("review changed") == std::string::npos, "git exclude should drop excluded tracked rows");
    expect(row.text.find("generated changed") == std::string::npos, "git exclude should drop excluded nested tracked rows");
  }
  const auto& keep = findFile(parsed, "src/keep.ts");
  expectEqual(keep.status, "modified", "git exclude kept tracked status");
  expectEqual(findFile(parsed, ".reviewer/keep.md").status, "untracked", "git exclude kept sibling status");
}

std::vector<std::string> readExpectedHistory(const std::string& path) {
  std::ifstream input(path);
  expect(static_cast<bool>(input), "history expected file opens");
  std::vector<std::string> lines;
  for (std::string line; std::getline(input, line);) {
    while (!line.empty() && line.back() == ' ') line.pop_back();
    lines.push_back(line);
  }
  return lines;
}

std::string historyLine(const diffparser::GitHistoryCommitRow& row) {
  std::string line = row.oid;
  for (const auto& parent : row.parents) line += " " + parent;
  return line;
}

std::vector<diffparser::GitHistoryCommitRow> readAllHistory(diffparser::GitHistoryWalker& walker, size_t pageSize) {
  std::vector<diffparser::GitHistoryCommitRow> rows;
  while (true) {
    auto page = walker.page(rows.size(), pageSize);
    const auto size = page.size();
    for (auto& row : page) rows.push_back(std::move(row));
    if (size < pageSize) return rows;
  }
}

void assertGitHistory(const std::string& repositoryPath, bool detached) {
  const auto expected = readExpectedHistory(repositoryPath + ".expected");
  diffparser::GitHistoryWalker walker(repositoryPath);
  expect(!walker.unborn(), "history head is born");
  expect(walker.detached() == detached, "history detached flag");
  expectEqual(walker.headOid(), expected.front().substr(0, expected.front().find(' ')), "history head oid");
  const auto rows = readAllHistory(walker, 500);
  expectEqual(static_cast<double>(rows.size()), static_cast<double>(expected.size()), "history commit count");
  for (size_t index = 0; index < rows.size(); ++index) {
    expectEqual(historyLine(rows[index]), expected[index], "history row " + std::to_string(index) + " matches git log --topo-order");
  }
  const auto& root = rows.back();
  expect(root.parents.empty(), "history root commit has no parents");
  expectEqual(root.summary, "Root commit", "history root summary");
  size_t merges = 0;
  for (const auto& row : rows) merges += row.parents.size() == 2 ? 1 : 0;
  expect(merges > 0, "history lists merge commits with both parents");
  if (!detached) {
    expectEqual(rows.front().summary, "\xC3\x9C" "n\xC3\xAF" "code \xE2\x9C\x93 summary line", "history summary is the first message line");
    expectEqual(rows.front().authorName, "H\xC3\xAFstory Author", "history author name");
    expectEqual(rows.front().authorEmail, "author@example.com", "history author email");
    expect(rows.front().time > 1700000000, "history author time");
    const auto repeated = walker.page(1000, 500);
    expectEqual(static_cast<double>(repeated.size()), 500, "history re-read page size");
    expectEqual(repeated.front().oid, rows[1000].oid, "history re-read from an earlier offset");
    expectEqual(walker.page(1500, 500).front().oid, rows[1500].oid, "history continues after a re-read");
    expect(walker.page(rows.size(), 500).empty(), "history page past the end is empty");
  }
  bool cancelledRead = false;
  try {
    walker.page(0, 500, [] { return true; });
  } catch (const std::runtime_error&) {
    cancelledRead = true;
  }
  expect(cancelledRead, "history read stops when cancelled");
}

void assertUnbornGitHistory(const std::string& repositoryPath) {
  diffparser::GitHistoryWalker walker(repositoryPath);
  expect(walker.unborn(), "unborn history is reported");
  expect(walker.headOid().empty(), "unborn history has no head oid");
  expect(walker.page(0, 500).empty(), "unborn history has no commits");
}

std::vector<diffparser::GitHistoryCommitRow> layoutFromLog(const std::string& path) {
  diffparser::GitGraphLayout layout;
  std::vector<diffparser::GitHistoryCommitRow> rows;
  for (const auto& line : readExpectedHistory(path)) {
    std::istringstream words(line);
    diffparser::GitHistoryCommitRow row;
    words >> row.oid;
    for (std::string parent; words >> parent;) row.parents.push_back(parent);
    layout.add(row);
    rows.push_back(std::move(row));
  }
  return rows;
}

std::string edgeText(const diffparser::GitHistoryCommitRow& row) {
  std::string text;
  for (size_t index = 0; index < row.edges.size(); index += 3) {
    text += (text.empty() ? "" : " ") + std::to_string(row.edges[index]) + ">" + std::to_string(row.edges[index + 1]);
  }
  return text;
}

/**
 * Follows every line from row to row: a column entering a row's top must be the column a line left the
 * row above at, it ends at the node exactly when it leads to this commit, each parent gets a line, and
 * no line is left open after the last row of a complete history.
 */
void validateGraph(const std::vector<diffparser::GitHistoryCommitRow>& rows, const std::string& name) {
  std::map<int, std::string> targets;
  std::map<int, int> colors;
  for (size_t index = 0; index < rows.size(); ++index) {
    const auto& row = rows[index];
    const std::string label = name + " row " + std::to_string(index) + " (" + edgeText(row) + ")";
    expect(row.edges.size() % 3 == 0, label + " edges are triples");
    std::map<int, std::string> next;
    std::map<int, int> nextColors;
    std::set<int> tops;
    bool reachesNode = false;
    std::vector<int> outs;
    for (size_t edge = 0; edge < row.edges.size(); edge += 3) {
      const int top = row.edges[edge], bottom = row.edges[edge + 1], color = row.edges[edge + 2];
      expect(top >= 0 || bottom >= 0, label + " no edge joins the node to itself");
      expect(top < diffparser::kGitGraphMaxLanes && bottom < diffparser::kGitGraphMaxLanes, label + " stays under the lane cap");
      if (top >= 0) {
        tops.insert(top);
        expect(targets.count(top) == 1, label + " enters at a column the row above left at");
        expectEqual(static_cast<double>(color), static_cast<double>(colors[top]), label + " keeps the line's color");
        if (bottom < 0) {
          expectEqual(targets[top], row.oid, label + " ends a line at the commit it leads to");
          if (!reachesNode) expectEqual(static_cast<double>(top), static_cast<double>(row.lane), label + " the commit sits in the first lane leading to it");
          reachesNode = true;
        } else {
          expectEqual(static_cast<double>(top), static_cast<double>(bottom), label + " passes straight through");
          expect(targets[top] != row.oid, label + " a line for this commit does not pass it by");
          next[bottom] = targets[top];
          nextColors[bottom] = color;
        }
      } else {
        outs.push_back(bottom);
        nextColors[bottom] = color;
      }
    }
    expectEqual(static_cast<double>(tops.size()), static_cast<double>(targets.size()), label + " continues every line from the row above");
    expectEqual(static_cast<double>(outs.size()), static_cast<double>(std::set<std::string>(row.parents.begin(), row.parents.end()).size()), label + " has one line per parent");
    std::vector<std::string> unassigned;
    std::set<std::string> carried;
    for (const auto& [column, oid] : next) carried.insert(oid);
    if (!row.parents.empty()) {
      expect(std::find(outs.begin(), outs.end(), row.lane) != outs.end(), label + " first parent continues the commit's lane");
      next[row.lane] = row.parents.front();
    }
    for (size_t parent = 1; parent < row.parents.size(); ++parent) {
      if (!carried.count(row.parents[parent]) && row.parents[parent] != row.parents.front()) unassigned.push_back(row.parents[parent]);
    }
    std::vector<int> opened;
    for (const int column : outs) if (column != row.lane && !next.count(column)) opened.push_back(column);
    std::sort(opened.begin(), opened.end());
    expectEqual(static_cast<double>(opened.size()), static_cast<double>(unassigned.size()), label + " opens a lane per new parent");
    for (size_t open = 0; open < opened.size(); ++open) next[opened[open]] = unassigned[open];
    targets = std::move(next);
    colors = std::move(nextColors);
  }
  expect(targets.empty(), name + " leaves no line open after the last commit");
}

void expectSameLanes(const std::vector<diffparser::GitHistoryCommitRow>& actual, const std::vector<diffparser::GitHistoryCommitRow>& expected, size_t offset, const std::string& name) {
  for (size_t index = 0; index < actual.size(); ++index) {
    const auto& row = actual[index];
    const auto& other = expected[offset + index];
    const std::string label = name + " row " + std::to_string(offset + index);
    expectEqual(row.oid, other.oid, label + " oid");
    expectEqual(static_cast<double>(row.lane), static_cast<double>(other.lane), label + " lane");
    expectEqual(static_cast<double>(row.color), static_cast<double>(other.color), label + " color");
    expectEqual(edgeText(row), edgeText(other), label + " edges");
  }
}

const diffparser::GitHistoryCommitRow& rowWithSummary(const std::vector<diffparser::GitHistoryCommitRow>& rows, const std::string& summary) {
  for (const auto& row : rows) if (row.summary == summary) return row;
  throw std::runtime_error("no history row " + summary);
}

void assertGraphLanes(const std::string& graphFixture, const std::string& historyFixture, const std::string& commitGraphFixture) {
  const auto linear = layoutFromLog(graphFixture + ".linear");
  validateGraph(linear, "linear");
  expectEqual(static_cast<double>(linear.size()), 3, "linear commit count");
  for (const auto& row : linear) expectEqual(static_cast<double>(row.lane), 0, "linear history stays in lane 0");
  expectEqual(edgeText(linear[0]), "-1>0", "linear tip starts its lane");
  expectEqual(edgeText(linear[1]), "0>-1 -1>0", "linear middle continues");
  expectEqual(edgeText(linear[2]), "0>-1", "linear root ends its lane");

  diffparser::GitHistoryWalker walker(graphFixture);
  const auto rows = readAllHistory(walker, 4);
  const auto expected = readExpectedHistory(graphFixture + ".expected");
  expectEqual(static_cast<double>(rows.size()), static_cast<double>(expected.size()), "graph commit count");
  for (size_t index = 0; index < rows.size(); ++index) expectEqual(historyLine(rows[index]), expected[index], "graph row matches git log --topo-order");
  validateGraph(rows, "graph");
  expectSameLanes(rows, layoutFromLog(graphFixture + ".expected"), 0, "graph walker matches the layout of git log");
  for (const auto* summary : {"Tip", "Merge unrelated", "Octopus", "B1", "Merge feature", "A2", "A1", "Root"}) {
    expectEqual(static_cast<double>(rowWithSummary(rows, summary).lane), 0, std::string("first-parent line stays in lane 0: ") + summary);
  }
  const auto& octopus = rowWithSummary(rows, "Octopus");
  expectEqual(edgeText(octopus), "0>-1 -1>0 -1>1 -1>2 -1>3", "octopus opens a lane per extra parent");
  const auto& merge = rowWithSummary(rows, "Merge feature");
  expectEqual(edgeText(merge), "0>-1 1>-1 2>-1 3>-1 -1>0 -1>1", "merge opens a lane for its second parent; the octopus arms end at it");
  const auto& unrelatedRoot = rowWithSummary(rows, "Unrelated root");
  expect(&unrelatedRoot != &rows.back(), "unrelated root sits in the middle of history");
  expectEqual(static_cast<double>(unrelatedRoot.lane), 1, "unrelated history runs in its own lane");
  expectEqual(edgeText(unrelatedRoot), "0>0 1>-1", "a root in the middle ends its lane");
  const auto& fork = rowWithSummary(rows, "F1");
  expectEqual(edgeText(fork), "0>0 1>-1 -1>1", "the feature lane runs down to its fork point");
  expectEqual(edgeText(rowWithSummary(rows, "A1")), "0>-1 1>-1 -1>0", "the feature lane ends at the commit it forked from");

  const auto all = layoutFromLog(graphFixture + ".all");
  validateGraph(all, "graph --all");
  std::vector<const diffparser::GitHistoryCommitRow*> tips;
  for (const auto& row : all) {
    bool entered = false;
    for (size_t edge = 0; edge < row.edges.size(); edge += 3) entered = entered || (row.edges[edge] >= 0 && row.edges[edge + 1] < 0);
    if (!entered) tips.push_back(&row);
  }
  expectEqual(static_cast<double>(tips.size()), 2, "graph --all starts lanes only at main and the never-merged branch");
  expect(tips[0]->lane == 0 && tips[1]->lane > 0, "the never-merged branch gets its own lane");
  const int staleLane = tips[1]->lane;
  bool staleJoins = false;
  for (const auto& row : all) {
    if (row.oid != rowWithSummary(rows, "A2").oid) continue;
    for (size_t edge = 0; edge < row.edges.size(); edge += 3) staleJoins = staleJoins || (row.edges[edge] == staleLane && row.edges[edge + 1] < 0);
  }
  expect(staleJoins, "the never-merged branch's lane ends at its fork point");

  diffparser::GitGraphLayout wide;
  diffparser::GitHistoryCommitRow fan{.oid = "fan"};
  for (int parent = 0; parent < 16; ++parent) fan.parents.push_back("p" + std::to_string(parent));
  wide.add(fan);
  for (const int edge : fan.edges) expect(edge <= diffparser::kGitGraphMaxLanes, "lanes past the cap fold into the overflow column");
  expectEqual(edgeText(fan).substr(edgeText(fan).size() - 5), "-1>12", "an overflow lane is drawn once");
  diffparser::GitHistoryCommitRow last{.oid = "p15"};
  wide.add(last);
  expectEqual(static_cast<double>(last.lane), diffparser::kGitGraphMaxLanes, "a commit past the cap sits in the overflow column");

  diffparser::GitHistoryWalker paged(historyFixture);
  const auto pagedRows = readAllHistory(paged, 500);
  validateGraph(pagedRows, "history");
  diffparser::GitHistoryWalker whole(historyFixture);
  const auto wholeRows = whole.page(0, 5000);
  expectSameLanes(pagedRows, wholeRows, 0, "lanes are continuous across the 500/501 page boundary");
  expectEqual(edgeText(pagedRows[500]), edgeText(wholeRows[500]), "row 501 lanes");
  expectSameLanes(paged.page(1000, 500), wholeRows, 1000, "lanes after a re-walk to an earlier offset");
  diffparser::GitHistoryWalker withCommitGraph(commitGraphFixture);
  expectSameLanes(readAllHistory(withCommitGraph, 500), wholeRows, 0, "lanes are identical with a commit-graph file");
  size_t lanes = 0;
  for (const auto& row : wholeRows) lanes = std::max(lanes, static_cast<size_t>(row.lane) + 1);
  expect(lanes >= 2, "history fixture draws its side branches in a second lane");
}

} // namespace

/** One "oid path origLine" per line, as blame-porcelain.py writes it ("-" when not committed yet). */
std::vector<std::string> blameLines(const std::vector<diffparser::GitBlameHunkRow>& hunks) {
  std::vector<std::string> lines;
  for (const auto& hunk : hunks) {
    for (size_t offset = 0; offset < hunk.lineCount; ++offset) {
      lines.push_back(hunk.oid.empty() ? "- " + hunk.path : hunk.oid + " " + hunk.path + " " + std::to_string(hunk.originalStartLine + offset));
    }
  }
  return lines;
}

std::vector<std::string> expectedBlame(const std::string& path) {
  std::vector<std::string> lines;
  for (const auto& line : readExpectedHistory(path)) lines.push_back(line.front() == '-' ? line.substr(0, line.rfind(' ')) : line);
  return lines;
}

void expectBlame(diffparser::GitBlameReader& reader, const std::string& expectedPath, const std::string& name) {
  const auto expected = expectedBlame(expectedPath);
  const auto whole = blameLines(reader.lines(1, 10'000));
  expectEqual(static_cast<double>(whole.size()), static_cast<double>(expected.size()), name + " line count");
  for (size_t index = 0; index < expected.size() && index < whole.size(); ++index) {
    expectEqual(whole[index], expected[index], name + " line " + std::to_string(index + 1));
  }
  // Pages of 7 and single lines blame the same as one read of the whole file.
  std::vector<std::string> paged;
  for (size_t start = 1; start <= expected.size(); start += 7) {
    const auto page = blameLines(reader.lines(start, 7));
    paged.insert(paged.end(), page.begin(), page.end());
  }
  expect(paged == whole, name + " pages of 7 equal one read");
  for (size_t line = 1; line <= expected.size(); line += 5) {
    const auto single = blameLines(reader.lines(line, 1));
    expect(single.size() == 1 && single[0] == whole[line - 1], name + " single line " + std::to_string(line));
  }
  expect(reader.lines(expected.size() + 1, 5).empty(), name + " past the end is empty");
}

void assertGitBlame(const std::string& fixture) {
  // HEAD: across the rename (lines from a.txt), main's change, and side's moved and changed lines brought in by the merge.
  diffparser::GitBlameReader head(fixture, "b.txt", "HEAD");
  expectBlame(head, fixture + ".head", "blame HEAD");
  std::ifstream sideOid(fixture + ".side-oid");
  std::string side;
  sideOid >> side;
  diffparser::GitBlameReader atSide(fixture, "b.txt", side);
  expectBlame(atSide, fixture + ".side", "blame side");
  // Staged and unstaged lines are not committed yet.
  diffparser::GitBlameReader workdir(fixture, "b.txt", "workdir");
  expectBlame(workdir, fixture + ".workdir", "blame workdir");
  diffparser::GitBlameReader index(fixture, "b.txt", "index");
  expectBlame(index, fixture + ".index", "blame index");
  diffparser::GitBlameReader crlf(fixture + "-crlf", "c.txt", "workdir");
  expectBlame(crlf, fixture + "-crlf.workdir", "blame CRLF workdir");

  bool cancelledRead = false;
  try { head.lines(1, 5, [] { return true; }); } catch (const std::runtime_error&) { cancelledRead = true; }
  expect(cancelledRead, "blame stops when cancelled");
  const auto threw = [](const std::function<void()>& run) { try { run(); } catch (const std::runtime_error&) { return true; } return false; };
  expect(threw([&] { diffparser::GitBlameReader(fixture, "missing.txt", "HEAD"); }), "blame of a file missing from the commit fails");
  expect(threw([&] { diffparser::GitBlameReader(fixture, "../b.txt", "workdir"); }), "blame rejects paths outside the repository");
}

void assertUnbornGitBlame(const std::string& repositoryPath) {
  std::ofstream(repositoryPath + "/new.txt") << "one\ntwo\nthree";
  diffparser::GitBlameReader reader(repositoryPath, "new.txt", "workdir");
  const auto lines = blameLines(reader.lines(1, 100));
  expect(lines == std::vector<std::string>{"- new.txt", "- new.txt", "- new.txt"}, "every line of an unborn HEAD's file is not committed yet");
}

int main(int argc, char** argv) {
  try {
    const auto fixture = makeUnifiedDiffFixture();
    const auto parsed = diffparser::parseUnifiedDiffText(fixture);
    assertFileSummaries(parsed);
    assertRenderRows(parsed);
    assertSideBySideRows(parsed);
    assertSideBySideProjection(parsed);
    assertInlineChangeRanges();
    assertIgnoreWhitespaceChanges();
    assertSameUnifiedParse(parseUnifiedDiffStreamForTest(fixture, 1), parsed);
    assertSameUnifiedParse(parseUnifiedDiffStreamForTest(fixture, 17), parsed);
    assertUnifiedNoNewlineAndQuotedPaths();
    if (argc > 1) {
      assertGitRepositoryDiff(argv[1]);
      assertGitRepositoryDiffByFile(argv[1]);
      assertGitRepositoryDiffAgainstCompareBase(argv[1]);
      assertGitRepositoryDiffIgnoresWhitespace(argv[1]);
    }
    if (argc > 3) {
      assertGitRepositoryNoNewline(argv[2]);
      assertUnifiedGitDiffNoNewline(argv[3]);
    }
    if (argc > 4) {
      assertGitRepositoryExcludePaths(argv[4]);
    }
    if (argc > 8) {
      assertGitHistory(argv[5], false);
      assertGitHistory(argv[6], false);
      assertGitHistory(argv[7], true);
      assertUnbornGitHistory(argv[8]);
    }
    if (argc > 9) {
      assertGraphLanes(argv[9], argv[5], argv[6]);
    }
    if (argc > 10) {
      assertGitBlame(argv[10]);
      assertUnbornGitBlame(argv[8]);
    }
    std::cout << "native diff parser fixtures passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "native diff parser fixtures failed: " << error.what() << "\n";
    return 1;
  }
}

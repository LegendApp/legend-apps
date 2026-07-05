#include "../cpp/DiffParserCore.hpp"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace diffparser = margelo::nitro::legenddesktop::diffparser;

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

diffparser::DiffParsedDocument parseGitRepositoryDiffByFileForTest(const std::string& fixturePath, bool showOnlyHunks = true) {
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
  }, showOnlyHunks);

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
  expectEqual(static_cast<double>(parsed.files.size()), 5, "git file count");
  expectEqual(parsed.timing.fileCount, 5, "git timing file count");
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

  expectEqual(static_cast<double>(parsed.fileSources.size()), 5, "git file source count");
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
  expectEqual(static_cast<double>(parsed.files.size()), 5, "git by-file file count");
  expectEqual(parsed.timing.fileCount, 5, "git by-file timing file count");
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

} // namespace

int main(int argc, char** argv) {
  try {
    const auto parsed = diffparser::parseUnifiedDiffText(makeUnifiedDiffFixture());
    assertFileSummaries(parsed);
    assertRenderRows(parsed);
    assertSideBySideRows(parsed);
    if (argc > 1) {
      assertGitRepositoryDiff(argv[1]);
      assertGitRepositoryDiffByFile(argv[1]);
    }
    std::cout << "native diff parser fixtures passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "native diff parser fixtures failed: " << error.what() << "\n";
    return 1;
  }
}

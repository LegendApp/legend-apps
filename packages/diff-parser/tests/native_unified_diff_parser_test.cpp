#include "../cpp/DiffParserCore.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>
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

  const auto& deleted = fileAt(parsed, 2);
  expectEqual(deleted.path, "src/Deleted.ts", "deleted path");
  expectEqual(deleted.oldPath, "src/Deleted.ts", "deleted old path");
  expectEqual(deleted.status, "deleted", "deleted status");
  expectEqual(deleted.additions, 0, "deleted additions");
  expectEqual(deleted.deletions, 2, "deleted deletions");

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

} // namespace

int main() {
  try {
    const auto parsed = diffparser::parseUnifiedDiffText(makeUnifiedDiffFixture());
    assertFileSummaries(parsed);
    assertRenderRows(parsed);
    assertSideBySideRows(parsed);
    std::cout << "native unified diff parser fixtures passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "native unified diff parser fixtures failed: " << error.what() << "\n";
    return 1;
  }
}

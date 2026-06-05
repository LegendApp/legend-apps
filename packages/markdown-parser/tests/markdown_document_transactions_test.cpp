#include "../cpp/HybridMarkdownParser.hpp"

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <unistd.h>

using namespace margelo::nitro::legenddesktop::markdownparser;

namespace {

struct TempFile {
  explicit TempFile(const std::string& contents = "") {
    char pathTemplate[] = "/tmp/legend-markdown-parser-test-XXXXXX";
    const int fd = mkstemp(pathTemplate);
    if (fd < 0) {
      throw std::runtime_error("mkstemp failed");
    }
    path = pathTemplate;
    if (!contents.empty()) {
      const ssize_t written = write(fd, contents.data(), contents.size());
      if (written < 0 || static_cast<size_t>(written) != contents.size()) {
        close(fd);
        throw std::runtime_error("failed to write temp markdown file");
      }
    }
    close(fd);
  }

  TempFile(const TempFile&) = delete;
  TempFile& operator=(const TempFile&) = delete;

  ~TempFile() {
    if (!path.empty()) {
      std::remove(path.c_str());
    }
  }

  std::string path;
};

struct LoadedDocument {
  TempFile file;
  std::shared_ptr<HybridMarkdownDocumentSpec> document;

  explicit LoadedDocument(const std::string& source) : file(source) {
    HybridMarkdownParser parser;
    const auto result = parser.loadMarkdownFile(file.path, 1000)->get();
    document = result.document;
  }
};

void expect(bool condition, const std::string& message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void expectEqual(const std::string& actual, const std::string& expected, const std::string& label) {
  if (actual != expected) {
    std::ostringstream output;
    output << label << "\nexpected: " << expected << "\nactual:   " << actual;
    throw std::runtime_error(output.str());
  }
}

void expectEqual(size_t actual, size_t expected, const std::string& label) {
  if (actual != expected) {
    std::ostringstream output;
    output << label << "\nexpected: " << expected << "\nactual:   " << actual;
    throw std::runtime_error(output.str());
  }
}

std::vector<MarkdownRenderBlock> blocksFor(const std::shared_ptr<HybridMarkdownDocumentSpec>& document) {
  return document->getRenderBlocks(0, document->getBlockCount());
}

std::string savedSourceFor(const std::shared_ptr<HybridMarkdownDocumentSpec>& document) {
  TempFile saved;
  document->saveAs(saved.path);
  std::ifstream input(saved.path, std::ios::binary);
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

void expectBlockSourceSlices(
    const std::shared_ptr<HybridMarkdownDocumentSpec>& document,
    const std::string& expectedSource) {
  const auto blocks = blocksFor(document);
  size_t previousEnd = 0;
  for (const auto& block : blocks) {
    expect(block.sourceStartByte <= block.sourceEndByte, "block source range is inverted");
    expect(block.sourceEndByte <= expectedSource.size(), "block source range exceeds source size");
    expect(block.sourceStartByte >= previousEnd, "block source ranges overlap or move backwards");
    expectEqual(
        expectedSource.substr(block.sourceStartByte, block.sourceEndByte - block.sourceStartByte),
        block.markdown,
        "block markdown must match its source slice");
    previousEnd = block.sourceEndByte;
  }
}

MarkdownTransaction updateBlock(std::string blockId, std::string markdown) {
  return MarkdownTransaction("updateBlockMarkdown", std::move(blockId), std::move(markdown), std::nullopt, std::nullopt);
}

MarkdownTransaction splitBlock(std::string blockId, std::string beforeMarkdown, std::string afterMarkdown) {
  return MarkdownTransaction(
      "splitBlock",
      std::move(blockId),
      std::nullopt,
      std::move(beforeMarkdown),
      std::move(afterMarkdown));
}

void testLoadsBaselineBlocks() {
  LoadedDocument loaded("# Title\n\nParagraph\n\n```js\nconst x = 1\n```\n");
  const auto blocks = blocksFor(loaded.document);

  expectEqual(blocks.size(), 3, "baseline block count");
  expectEqual(blocks[0].type, "heading", "heading type");
  expectEqual(blocks[1].type, "paragraph", "paragraph type");
  expectEqual(blocks[2].type, "codeBlock", "code block type");
  expectBlockSourceSlices(loaded.document, savedSourceFor(loaded.document));
}

void testUpdateParagraphPreservesId() {
  LoadedDocument loaded("First paragraph\n\nSecond paragraph\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(updateBlock(before[0].id, "Updated paragraph"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(after.size(), 2, "paragraph update block count");
  expectEqual(after[0].id, before[0].id, "paragraph update preserves id");
  expectEqual(after[0].markdown, "Updated paragraph", "paragraph update markdown");
  expectEqual(result.changedRange.deleteCount, 1, "paragraph update delete count");
  expectBlockSourceSlices(loaded.document, source);
}

void testUpdateParagraphToHeadingPreservesIdAndTypeChanges() {
  LoadedDocument loaded("Paragraph\n\nNext\n");
  const auto before = blocksFor(loaded.document);
  loaded.document->applyTransaction(updateBlock(before[0].id, "## Heading"));
  const auto after = blocksFor(loaded.document);

  expectEqual(after[0].id, before[0].id, "heading update preserves id");
  expectEqual(after[0].type, "heading", "heading update type");
  expectEqual(static_cast<size_t>(after[0].headingLevel), 2, "heading update level");
  expectBlockSourceSlices(loaded.document, savedSourceFor(loaded.document));
}

void testSplitBlockCreatesSecondBlock() {
  LoadedDocument loaded("Hello world\n\nNext\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(splitBlock(before[0].id, "Hello", "world"));
  const auto after = blocksFor(loaded.document);

  expectEqual(after.size(), 3, "split block count");
  expectEqual(after[0].id, before[0].id, "split preserves first id");
  expect(after[1].id != before[0].id, "split creates new second id");
  expectEqual(after[0].markdown, "Hello", "split first markdown");
  expectEqual(after[1].markdown, "world", "split second markdown");
  expectEqual(result.changedRange.deleteCount, 1, "split delete count");
  expectEqual(result.changedRange.blockIds.size(), 2, "split inserted block ids");
  expectBlockSourceSlices(loaded.document, savedSourceFor(loaded.document));
}

void testUpdateBlockCanBecomeMultipleParagraphs() {
  LoadedDocument loaded("First\n\nTail\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(updateBlock(before[0].id, "First\n\nInserted"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "First\n\nInserted\n\nTail\n", "multi-paragraph source");
  expectEqual(after.size(), 3, "multi-paragraph block count");
  expectEqual(after[0].id, before[0].id, "multi-paragraph preserves first id");
  expectEqual(after[0].markdown, "First", "multi-paragraph first block");
  expectEqual(after[1].markdown, "Inserted", "multi-paragraph inserted block");
  expectEqual(after[2].id, before[1].id, "multi-paragraph preserves suffix id");
  expectEqual(result.changedRange.deleteCount, 1, "multi-paragraph delete count");
  expectEqual(result.changedRange.blockIds.size(), 2, "multi-paragraph inserted range count");
  expectBlockSourceSlices(loaded.document, source);
}

void testUpdateBlockUsesParserForCodeBlockBoundaries() {
  LoadedDocument loaded("Intro\n\nTail\n");
  const auto before = blocksFor(loaded.document);
  loaded.document->applyTransaction(updateBlock(before[0].id, "```js\nconst x = 1\n```\n\nAfter code"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "```js\nconst x = 1\n```\n\nAfter code\n\nTail\n", "code block source");
  expectEqual(after.size(), 3, "code block structural edit count");
  expectEqual(after[0].id, before[0].id, "code block preserves edited id");
  expectEqual(after[0].type, "codeBlock", "code block type");
  expectEqual(after[0].markdown, "```js\nconst x = 1\n```", "code block markdown");
  expectEqual(after[1].markdown, "After code", "code block following paragraph");
  expectEqual(after[2].id, before[1].id, "code block preserves suffix id");
  expectBlockSourceSlices(loaded.document, source);
}

void testUpdateBlockUsesParserForTables() {
  LoadedDocument loaded("Intro\n\nTail\n");
  const auto before = blocksFor(loaded.document);
  loaded.document->applyTransaction(updateBlock(before[0].id, "| A | B |\n|---|---|\n| 1 | 2 |"));
  const auto after = blocksFor(loaded.document);

  expectEqual(after.size(), 2, "table edit block count");
  expectEqual(after[0].id, before[0].id, "table edit preserves id");
  expectEqual(after[0].type, "table", "table edit type");
  expectEqual(after[0].markdown, "| A | B |\n|---|---|\n| 1 | 2 |", "table markdown");
  expectEqual(after[1].id, before[1].id, "table edit preserves suffix id");
  expectBlockSourceSlices(loaded.document, savedSourceFor(loaded.document));
}

using TestFunction = void (*)();

struct TestCase {
  const char* name;
  TestFunction run;
};

} // namespace

int main() {
  const TestCase tests[] = {
      {"loads baseline blocks", testLoadsBaselineBlocks},
      {"update paragraph preserves id", testUpdateParagraphPreservesId},
      {"update paragraph to heading preserves id and changes type", testUpdateParagraphToHeadingPreservesIdAndTypeChanges},
      {"split block creates second block", testSplitBlockCreatesSecondBlock},
      {"update block can become multiple paragraphs", testUpdateBlockCanBecomeMultipleParagraphs},
      {"update block uses parser for code block boundaries", testUpdateBlockUsesParserForCodeBlockBoundaries},
      {"update block uses parser for tables", testUpdateBlockUsesParserForTables},
  };

  for (const auto& test : tests) {
    try {
      test.run();
      std::cout << "PASS " << test.name << "\n";
    } catch (const std::exception& error) {
      std::cerr << "FAIL " << test.name << "\n" << error.what() << "\n";
      return 1;
    }
  }

  std::cout << "Ran " << std::size(tests) << " markdown parser transaction tests.\n";
  return 0;
}

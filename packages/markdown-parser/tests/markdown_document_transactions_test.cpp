#include "../cpp/HybridMarkdownParser.hpp"
#include "../cpp/MarkdownDocumentRegistry.hpp"

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

#include <unistd.h>

using namespace margelo::nitro::legendapps::markdownparser;

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

std::vector<std::string> blockIdsFor(const std::vector<MarkdownRenderBlock>& blocks) {
  std::vector<std::string> blockIds;
  blockIds.reserve(blocks.size());
  for (const auto& block : blocks) {
    blockIds.push_back(block.id);
  }
  return blockIds;
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

bool containsBlockId(const std::vector<MarkdownRenderBlock>& blocks, const std::string& blockId) {
  for (const auto& block : blocks) {
    if (block.id == blockId) {
      return true;
    }
  }
  return false;
}

void expectUniqueBlockIds(const std::vector<MarkdownRenderBlock>& blocks) {
  std::unordered_set<std::string> seen;
  for (const auto& block : blocks) {
    expect(!block.id.empty(), "block id must not be empty");
    expect(seen.insert(block.id).second, "block id must be unique: " + block.id);
  }
}

void expectDocumentInvariants(const std::shared_ptr<HybridMarkdownDocumentSpec>& document) {
  const auto blocks = blocksFor(document);
  const auto source = savedSourceFor(document);
  expectEqual(blocks.size(), static_cast<size_t>(document->getBlockCount()), "render block count matches document count");
  expectUniqueBlockIds(blocks);
  for (size_t index = 0; index < blocks.size(); index += 1) {
    expectEqual(static_cast<size_t>(blocks[index].index), index, "block index matches storage position");
    expectEqual(document->getBlockKey(static_cast<double>(index)), blocks[index].id, "native block key matches storage position");
    expectEqual(
        static_cast<size_t>(document->getIndexForBlockId(blocks[index].id)),
        index,
        "native block id index matches storage position");
    expectEqual(document->getRenderBlockById(blocks[index].id).id, blocks[index].id, "native render block by id resolves live block");
  }
  expectEqual(document->getBlockKey(-1), "", "negative native block key is empty");
  expectEqual(document->getBlockKey(static_cast<double>(blocks.size())), "", "out of bounds native block key is empty");
  expect(document->getIndexForBlockId("missing:block") < 0, "missing native block id index is negative");
  expectEqual(static_cast<size_t>(document->getSourceSize()), source.size(), "source size matches saved source size");
  expectBlockSourceSlices(document, source);
}

void expectTransactionResultInvariants(
    const std::vector<MarkdownRenderBlock>& before,
    const std::vector<MarkdownRenderBlock>& after,
    const MarkdownTransactionResult& result,
    const std::string& savedSource) {
  const auto startBlockIndex = static_cast<size_t>(result.changedRange.startBlockIndex);
  const auto deleteCount = static_cast<size_t>(result.changedRange.deleteCount);
  expect(startBlockIndex <= before.size(), "changed range starts after previous block list");
  expect(startBlockIndex + deleteCount <= before.size(), "changed range deletes past previous block list");
  expectEqual(static_cast<size_t>(result.sourceLength), savedSource.size(), "transaction source length matches saved source");

  auto expectedBlockIds = blockIdsFor(before);
  expectedBlockIds.erase(
      expectedBlockIds.begin() + static_cast<long long>(startBlockIndex),
      expectedBlockIds.begin() + static_cast<long long>(startBlockIndex + deleteCount));
  expectedBlockIds.insert(
      expectedBlockIds.begin() + static_cast<long long>(startBlockIndex),
      result.changedRange.blockIds.begin(),
      result.changedRange.blockIds.end());

  const auto afterBlockIds = blockIdsFor(after);
  expectEqual(expectedBlockIds.size(), afterBlockIds.size(), "changed range splice result size");
  for (size_t index = 0; index < afterBlockIds.size(); index += 1) {
    expectEqual(afterBlockIds[index], expectedBlockIds[index], "changed range splice id");
  }

  std::unordered_set<std::string> changedBlockIds;
  for (const auto& block : result.changedBlocks) {
    changedBlockIds.insert(block.id);
  }
  for (const auto& blockId : result.changedRange.blockIds) {
    expect(containsBlockId(after, blockId), "changed range block id must be live: " + blockId);
    expect(changedBlockIds.contains(blockId), "changed range block id must have changed block payload: " + blockId);
  }
  for (const auto& retiredBlockId : result.retiredBlockIds) {
    expect(!containsBlockId(after, retiredBlockId), "retired block id must not remain live: " + retiredBlockId);
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

MarkdownTransaction replaceBlockRange(std::string startBlockId, std::string endBlockId, std::optional<std::string> markdown) {
  return MarkdownTransaction(
      "replaceBlockRange",
      std::move(startBlockId),
      std::move(markdown),
      std::move(endBlockId),
      std::nullopt);
}

MarkdownTransaction moveBlockRange(
    std::string startBlockId,
    std::string endBlockId,
    std::string targetBlockId,
    std::string placement) {
  return MarkdownTransaction(
      "moveBlockRange",
      std::move(startBlockId),
      std::move(targetBlockId),
      std::move(endBlockId),
      std::move(placement));
}

void testLoadsBaselineBlocks() {
  LoadedDocument loaded("# Title\n\nParagraph\n\n```js\nconst x = 1\n```\n");
  const auto blocks = blocksFor(loaded.document);

  expectEqual(blocks.size(), 3, "baseline block count");
  expectEqual(blocks[0].type, "heading", "heading type");
  expectEqual(blocks[1].type, "paragraph", "paragraph type");
  expectEqual(blocks[2].type, "codeBlock", "code block type");
  expectDocumentInvariants(loaded.document);
}

void testEmptyDocumentsRemainEditable() {
  for (const std::string source : {"", " \t\n\n"}) {
    LoadedDocument loaded(source);
    const auto blocks = blocksFor(loaded.document);
    expectEqual(blocks.size(), 1, "blank file has one editable block");
    expectEqual(savedSourceFor(loaded.document), source, "opening preserves blank source");
    loaded.document->applyTransaction(updateBlock(blocks[0].id, "First words"));
    expectEqual(savedSourceFor(loaded.document), "First words", "can type into blank file");
    expectEqual(blocksFor(loaded.document)[0].id, blocks[0].id, "typing retains blank block id");
  }
  HybridMarkdownParser parser;
  const auto created = parser.createMarkdownDocument("", 64)->get();
  expectEqual(created.initialBlocks.size(), 1, "untitled document exposes editable block");
  created.document->applyTransaction(splitBlock(created.initialBlocks[0].id, "First", "Second"));
  expect(blocksFor(created.document)[0].id != blocksFor(created.document)[1].id, "new block ids stay unique");
}

void testCreatesDocumentFromMarkdownString() {
  HybridMarkdownParser parser;
  const auto result = parser.createMarkdownDocument("# Untitled\n\nDraft paragraph\n", 1000)->get();
  const auto blocks = blocksFor(result.document);
  const std::string source = savedSourceFor(result.document);

  expectEqual(blocks.size(), 2, "string document block count");
  expectEqual(blocks[0].type, "heading", "string document heading type");
  expectEqual(blocks[1].type, "paragraph", "string document paragraph type");
  expectEqual(source, "# Untitled\n\nDraft paragraph\n", "string document save-as source");
  expectDocumentInvariants(result.document);
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
  expect(result.changedRange.retainsFirstChangedBlock, "paragraph update reports retained first block");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testUpdateParagraphToHeadingPreservesIdAndTypeChanges() {
  LoadedDocument loaded("Paragraph\n\nNext\n");
  const auto before = blocksFor(loaded.document);
  loaded.document->applyTransaction(updateBlock(before[0].id, "## Heading"));
  const auto after = blocksFor(loaded.document);

  expectEqual(after[0].id, before[0].id, "heading update preserves id");
  expectEqual(after[0].type, "heading", "heading update type");
  expectEqual(static_cast<size_t>(after[0].headingLevel), 2, "heading update level");
  expectDocumentInvariants(loaded.document);
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
  expect(result.changedRange.retainsFirstChangedBlock, "split reports retained first block");
  expectTransactionResultInvariants(before, after, result, savedSourceFor(loaded.document));
  expectDocumentInvariants(loaded.document);
}

void testTypingAfterSplitPreservesPreviousParagraph() {
  for (const std::string lineEnding : {"\n", "\r\n"}) {
    LoadedDocument loaded("First paragraph" + lineEnding + lineEnding + "Tail" + lineEnding);
    const auto firstId = loaded.document->getBlockKey(0);
    const auto split = loaded.document->applyTransaction(splitBlock(firstId, "First paragraph", ""));
    const auto nextId = split.changedRange.blockIds[1];
    const auto update = loaded.document->applyTransaction(updateBlock(nextId, "Added after Enter"));
    expectEqual(update.changedRange.startBlockIndex, 1, "typing changes only the new paragraph");
    expectEqual(update.changedRange.deleteCount, 1, "typing retains previous paragraph");
    expectEqual(loaded.document->getRenderBlockById(firstId).markdown, "First paragraph", "previous paragraph is unchanged");
    expectEqual(loaded.document->getRenderBlockById(nextId).markdown, "Added after Enter", "new paragraph contains typed text");
    loaded.document->applyTransaction(splitBlock(nextId, "Added after Enter", ""));
    expectEqual(savedSourceFor(loaded.document),
        "First paragraph" + lineEnding + lineEnding + "Added after Enter" + lineEnding + lineEnding + lineEnding + lineEnding + "Tail" + lineEnding,
        "repeated Enter saves both paragraphs");
    expectDocumentInvariants(loaded.document);
  }
}

void testRegisteredBlockReadsDuringStructuralEdits() {
  LoadedDocument loaded("Hello world\n\nTail\n");
  const auto blockId = loaded.document->getBlockKey(0);
  const auto tailId = loaded.document->getBlockKey(1);
  std::atomic<size_t> readCount = 0;
  std::atomic<bool> invalidRead = false;
  {
    // Native layout/keyboard callbacks read through the registry, concurrently
    // with JS transactions. Two readers also exercise lazy text-cache access.
    auto readBlocks = [&](std::stop_token stop) {
      while (!stop.stop_requested()) {
        const auto metadata = metadataForRegisteredBlockId(blockId);
        const auto markdown = markdownForRegisteredBlockId(blockId);
        if (metadata.id != blockId || metadata.type != "paragraph" ||
            (markdown != "Hello" && markdown != "Hello world") ||
            markdownForRegisteredBlockId(tailId) != "Tail") {
          invalidRead = true;
        }
        readCount.fetch_add(1);
      }
    };
    std::jthread firstReader(readBlocks);
    std::jthread secondReader(readBlocks);
    while (readCount.load() == 0) {
      std::this_thread::yield();
    }
    for (size_t index = 0; index < 500; index += 1) {
      const auto result = loaded.document->applyTransaction(splitBlock(blockId, "Hello", "world"));
      loaded.document->applyTransaction(replaceBlockRange(blockId, result.changedRange.blockIds[1], "Hello world"));
    }
  }
  expect(!invalidRead.load(), "registered reads return complete blocks during structural edits");
  expectEqual(loaded.document->getBlockCount(), 2, "concurrent editing preserves block count");
  expectDocumentInvariants(loaded.document);
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
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testMoveWithEmptyEditableBlocks() {
  LoadedDocument loaded("Alpha\n\nBeta\n\nGamma\n");
  auto blocks = blocksFor(loaded.document);
  const auto emptyId = blocks[1].id;
  const auto gammaId = blocks[2].id;
  loaded.document->applyTransaction(updateBlock(emptyId, ""));
  for (const auto& placement : {"after", "before"}) {
    const auto before = blocksFor(loaded.document);
    const auto result = loaded.document->applyTransaction(moveBlockRange(emptyId, emptyId, gammaId, placement));
    const auto after = blocksFor(loaded.document);
    expectEqual(after.size(), 3, "move retains empty row");
    expectEqual(loaded.document->getRenderBlockById(emptyId).markdown, "", "empty row identity remains editable");
    expectEqual(after[placement == std::string("after") ? 2 : 1].id, emptyId, "empty row moves to requested position");
    expectTransactionResultInvariants(before, after, result, savedSourceFor(loaded.document));
    expectDocumentInvariants(loaded.document);
  }
}

void testFenceLengthsAndUnclosedBlocks() {
  const std::vector<std::string> fencedBlocks = {
      "````md\n```\nnested example\n```\n````",
      "~~~~ts\n~~~\nstill code\n~~~~~",
      "```ts\n```not a closing fence\ncode\n```",
      "```ts\n    ```\ncode\n```",
  };
  for (const auto& fenced : fencedBlocks) {
    LoadedDocument loaded(fenced + "\n\nTail\n");
    const auto blocks = blocksFor(loaded.document);
    expectEqual(blocks.size(), 2, "fence boundaries preserve following paragraph");
    expectEqual(blocks[0].markdown, fenced, "short or invalid closing fences remain code");
    expectEqual(blocks[1].markdown, "Tail", "text after valid closing fence");
    expectDocumentInvariants(loaded.document);
  }
  LoadedDocument unclosed("```ts\ncode\n\n# still code\n\nlast line\n");
  const auto blocks = blocksFor(unclosed.document);
  expectEqual(blocks.size(), 1, "unclosed fence consumes the remaining document");
  expectEqual(blocks[0].markdown, "```ts\ncode\n\n# still code\n\nlast line", "unclosed fence content");
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
  expectDocumentInvariants(loaded.document);
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
  expectDocumentInvariants(loaded.document);
}

void testUpdateBlockToEmptyPreservesEditableBlock() {
  LoadedDocument loaded("First\n\nSecond\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(updateBlock(before[0].id, ""));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "\n\nSecond\n", "empty update source");
  expectEqual(after.size(), 2, "empty update block count");
  expectEqual(after[0].id, before[0].id, "empty update preserves edited id");
  expectEqual(after[0].markdown, "", "empty update markdown");
  expectEqual(after[0].type, "paragraph", "empty update type");
  expectEqual(after[1].id, before[1].id, "empty update preserves suffix id");
  expectEqual(result.changedRange.deleteCount, 1, "empty update delete count");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testUpdateBlockToWhitespaceOnlyPreservesEditableBlock() {
  LoadedDocument loaded("First\n\nSecond\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(updateBlock(before[0].id, "\n \n"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expect(source.find("Second\n") != std::string::npos, "whitespace update preserves suffix source");
  expectEqual(after.size(), 2, "whitespace update block count");
  expectEqual(after[0].id, before[0].id, "whitespace update preserves edited id");
  expectEqual(after[0].markdown, "", "whitespace update markdown");
  expectEqual(after[0].type, "paragraph", "whitespace update type");
  expectEqual(after[1].id, before[1].id, "whitespace update preserves suffix id");
  expectEqual(result.changedRange.deleteCount, 1, "whitespace update delete count");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testReplaceBlockRangeUsesParserForCodeBlockBoundaries() {
  LoadedDocument loaded("Intro\n\nMiddle\n\nTail\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(replaceBlockRange(
      before[0].id,
      before[1].id,
      "```js\nconst x = 1\n```\n\nAfter code"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "```js\nconst x = 1\n```\n\nAfter code\n\nTail\n", "range code block source");
  expectEqual(after.size(), 3, "range code block count");
  expectEqual(after[0].type, "codeBlock", "range code block type");
  expectEqual(after[0].markdown, "```js\nconst x = 1\n```", "range code block markdown");
  expectEqual(after[1].markdown, "After code", "range following paragraph");
  expectEqual(after[2].id, before[2].id, "range code block preserves suffix id");
  expectEqual(result.retiredBlockIds.size(), 1, "range code block retired count");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testReplaceBlockRangeUsesParserForTables() {
  LoadedDocument loaded("Intro\n\nMiddle\n\nTail\n");
  const auto before = blocksFor(loaded.document);
  loaded.document->applyTransaction(replaceBlockRange(before[0].id, before[1].id, "| A | B |\n|---|---|\n| 1 | 2 |"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "| A | B |\n|---|---|\n| 1 | 2 |\n\nTail\n", "range table source");
  expectEqual(after.size(), 2, "range table count");
  expectEqual(after[0].type, "table", "range table type");
  expectEqual(after[0].markdown, "| A | B |\n|---|---|\n| 1 | 2 |", "range table markdown");
  expectEqual(after[1].id, before[2].id, "range table preserves suffix id");
  expectDocumentInvariants(loaded.document);
}

void testReplaceBlockRangeWithWhitespaceOnlyPreservesEditableBlock() {
  LoadedDocument loaded("Intro\n\nMiddle\n\nTail\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(replaceBlockRange(before[0].id, before[1].id, "\n \n"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expect(source.find("Tail\n") != std::string::npos, "range whitespace preserves suffix source");
  expectEqual(after.size(), 2, "range whitespace block count");
  expectEqual(after[0].id, before[0].id, "range whitespace preserves first selected id");
  expectEqual(after[0].markdown, "", "range whitespace markdown");
  expectEqual(after[0].type, "paragraph", "range whitespace type");
  expectEqual(after[1].id, before[2].id, "range whitespace preserves suffix id");
  expectEqual(result.retiredBlockIds.size(), 1, "range whitespace retired count");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testMoveBlockRangeMovesSingleBlockUp() {
  LoadedDocument loaded("First\n\nSecond\n\nThird\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(moveBlockRange(before[1].id, before[1].id, before[0].id, "before"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "Second\n\nFirst\n\nThird\n", "move single block up source");
  expect(!result.changedRange.retainsFirstChangedBlock, "move reports changed range as a splice");
  expectEqual(after[0].id, before[1].id, "move up first id");
  expectEqual(after[1].id, before[0].id, "move up second id");
  expectEqual(after[2].id, before[2].id, "move up suffix id");
  expectEqual(result.retiredBlockIds.size(), 0, "move up retired ids");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testMoveBlockRangeMovesSingleBlockDown() {
  LoadedDocument loaded("First\n\nSecond\n\nThird\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(moveBlockRange(before[1].id, before[1].id, before[2].id, "after"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "First\n\nThird\n\nSecond\n", "move single block down source");
  expectEqual(after[1].id, before[2].id, "move down middle id");
  expectEqual(after[2].id, before[1].id, "move down last id");
  expectEqual(result.changedRange.deleteCount, 2, "move down changed range delete count");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testMoveBlockRangeMovesMultipleBlocksAcrossTarget() {
  LoadedDocument loaded("One\n\nTwo\n\nThree\n\nFour\n\nFive\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(moveBlockRange(before[1].id, before[2].id, before[4].id, "after"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(source, "One\n\nFour\n\nFive\n\nTwo\n\nThree\n", "move range after target source");
  expectEqual(after[1].id, before[3].id, "move range fills first changed slot");
  expectEqual(after[2].id, before[4].id, "move range fills second changed slot");
  expectEqual(after[3].id, before[1].id, "move range first moved id");
  expectEqual(after[4].id, before[2].id, "move range second moved id");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testMoveBlockRangePreservesMixedBlockTypes() {
  LoadedDocument loaded("# Heading\n\n- One\n- Two\n\n```ts\nconst value = 1;\n```\n\n> Quote\n");
  const auto before = blocksFor(loaded.document);
  const auto result = loaded.document->applyTransaction(moveBlockRange(before[2].id, before[2].id, before[0].id, "before"));
  const auto after = blocksFor(loaded.document);
  const std::string source = savedSourceFor(loaded.document);

  expectEqual(after[0].id, before[2].id, "mixed move code id");
  expectEqual(after[0].type, "codeBlock", "mixed move code type");
  expectEqual(after[1].type, "heading", "mixed move heading type");
  expectEqual(after[2].type, "unorderedList", "mixed move list type");
  expectEqual(after[3].type, "quote", "mixed move quote type");
  expect(source.find("```ts\nconst value = 1;\n```\n\n# Heading") == 0, "mixed move source starts with code then heading");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

std::string repeatedParagraphs(size_t count) {
  std::ostringstream source;
  for (size_t index = 0; index < count; index += 1) {
    if (index > 0) {
      source << "\n\n";
    }
    source << "Paragraph " << index;
  }
  source << "\n";
  return source.str();
}

void testLargeDocumentFarDownTransactions() {
  LoadedDocument loaded(repeatedParagraphs(180));
  expectDocumentInvariants(loaded.document);

  auto before = blocksFor(loaded.document);
  auto result = loaded.document->applyTransaction(updateBlock(before[140].id, "Far down\n\nInserted paragraph"));
  auto after = blocksFor(loaded.document);
  auto source = savedSourceFor(loaded.document);
  expectEqual(after[140].id, before[140].id, "far down edit preserves edited block id");
  expectEqual(after[142].id, before[141].id, "far down edit preserves following suffix id");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);

  before = blocksFor(loaded.document);
  result = loaded.document->applyTransaction(replaceBlockRange(before[135].id, before[145].id, "Replacement after scroll"));
  after = blocksFor(loaded.document);
  source = savedSourceFor(loaded.document);
  expectEqual(after[135].markdown, "Replacement after scroll", "far down range replacement markdown");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);

  before = blocksFor(loaded.document);
  result = loaded.document->applyTransaction(moveBlockRange(before[150].id, before[152].id, before[130].id, "before"));
  after = blocksFor(loaded.document);
  source = savedSourceFor(loaded.document);
  expectEqual(after[130].id, before[150].id, "far down move first moved id");
  expectEqual(after[131].id, before[151].id, "far down move second moved id");
  expectEqual(after[132].id, before[152].id, "far down move third moved id");
  expectTransactionResultInvariants(before, after, result, source);
  expectDocumentInvariants(loaded.document);
}

void testRepeatedLeadingSplitsKeepSuffixAddressable() {
  constexpr size_t initialBlockCount = 2048;
  constexpr size_t splitCount = 64;
  LoadedDocument loaded(repeatedParagraphs(initialBlockCount));
  const auto initialBlocks = blocksFor(loaded.document);
  const std::string tailBlockId = initialBlocks.back().id;

  for (size_t index = 0; index < splitCount; index += 1) {
    const std::string firstBlockId = loaded.document->getBlockKey(0);
    loaded.document->applyTransaction(splitBlock(firstBlockId, "Leading", "Inserted"));
  }

  expectEqual(
      static_cast<size_t>(loaded.document->getIndexForBlockId(tailBlockId)),
      initialBlockCount + splitCount - 1,
      "repeated leading splits keep suffix rank current");
  expectEqual(
      loaded.document->getBlockKey(initialBlockCount + splitCount - 1),
      tailBlockId,
      "repeated leading splits preserve suffix lookup");
  expectDocumentInvariants(loaded.document);
}

class DeterministicRandom {
public:
  explicit DeterministicRandom(uint32_t seed) : state_(seed) {}

  size_t nextIndex(size_t maxExclusive) {
    state_ = state_ * 1664525u + 1013904223u;
    return maxExclusive == 0 ? 0 : state_ % maxExclusive;
  }

private:
  uint32_t state_;
};

void testRandomizedTransactionSequence() {
  constexpr uint32_t seed = 0x7d3a49f1u;
  DeterministicRandom random(seed);
  LoadedDocument loaded(repeatedParagraphs(96));

  const std::vector<std::string> replacementMarkdown = {
      "Updated paragraph",
      "First paragraph\n\nSecond paragraph",
      "```ts\nconst value = 1;\n```",
      "| A | B |\n|---|---|\n| 1 | 2 |",
      "> Quote\n>\n> More quote",
      "- item one\n- item two",
      "1. ordered\n2. list",
      "## Heading",
  };

  for (size_t actionIndex = 0; actionIndex < 80; actionIndex += 1) {
    const auto before = blocksFor(loaded.document);
    expect(!before.empty(), "randomized document should keep at least one block");
    const auto action = random.nextIndex(4);
    const auto blockIndex = random.nextIndex(before.size());

    try {
      MarkdownTransactionResult result;
      if (action == 0 || before.size() < 3) {
        const auto& markdown = replacementMarkdown[random.nextIndex(replacementMarkdown.size())];
        result = loaded.document->applyTransaction(updateBlock(before[blockIndex].id, markdown));
      } else if (action == 1) {
        result = loaded.document->applyTransaction(splitBlock(before[blockIndex].id, "Split before", "Split after"));
      } else if (action == 2) {
        const auto secondOffset = random.nextIndex(5);
        const auto secondIndex = std::min(before.size() - 1, blockIndex + secondOffset);
        const auto rangeStart = std::min(blockIndex, secondIndex);
        const auto rangeEnd = std::max(blockIndex, secondIndex);
        result = loaded.document->applyTransaction(replaceBlockRange(before[rangeStart].id, before[rangeEnd].id, "Range replacement"));
      } else {
        const size_t rangeStart = std::min(blockIndex, before.size() - 2);
        const size_t maxRangeLength = std::min(static_cast<size_t>(3), before.size() - rangeStart - 1);
        const size_t rangeEnd = rangeStart + random.nextIndex(maxRangeLength);
        size_t targetIndex = random.nextIndex(before.size() - (rangeEnd - rangeStart + 1));
        if (targetIndex >= rangeStart) {
          targetIndex += rangeEnd - rangeStart + 1;
        }
        const std::string placement = random.nextIndex(2) == 0 ? "before" : "after";
        result = loaded.document->applyTransaction(moveBlockRange(before[rangeStart].id, before[rangeEnd].id, before[targetIndex].id, placement));
      }

      const auto after = blocksFor(loaded.document);
      const auto source = savedSourceFor(loaded.document);
      expectTransactionResultInvariants(before, after, result, source);
      expectDocumentInvariants(loaded.document);
    } catch (const std::exception& error) {
      std::ostringstream output;
      output << "random transaction sequence failed"
             << "\nseed: " << seed
             << "\naction index: " << actionIndex
             << "\nblock index: " << blockIndex
             << "\nerror: " << error.what()
             << "\nsource:\n" << savedSourceFor(loaded.document);
      throw std::runtime_error(output.str());
    }
  }
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
      {"empty documents remain editable", testEmptyDocumentsRemainEditable},
      {"fence lengths and unclosed blocks", testFenceLengthsAndUnclosedBlocks},
      {"move with empty editable blocks", testMoveWithEmptyEditableBlocks},
      {"creates document from markdown string", testCreatesDocumentFromMarkdownString},
      {"update paragraph preserves id", testUpdateParagraphPreservesId},
      {"update paragraph to heading preserves id and changes type", testUpdateParagraphToHeadingPreservesIdAndTypeChanges},
      {"split block creates second block", testSplitBlockCreatesSecondBlock},
      {"typing after split preserves previous paragraph", testTypingAfterSplitPreservesPreviousParagraph},
      {"registered block reads during structural edits", testRegisteredBlockReadsDuringStructuralEdits},
      {"update block can become multiple paragraphs", testUpdateBlockCanBecomeMultipleParagraphs},
      {"update block uses parser for code block boundaries", testUpdateBlockUsesParserForCodeBlockBoundaries},
      {"update block uses parser for tables", testUpdateBlockUsesParserForTables},
      {"update block to empty preserves editable block", testUpdateBlockToEmptyPreservesEditableBlock},
      {"update block to whitespace only preserves editable block", testUpdateBlockToWhitespaceOnlyPreservesEditableBlock},
      {"replace block range uses parser for code block boundaries", testReplaceBlockRangeUsesParserForCodeBlockBoundaries},
      {"replace block range uses parser for tables", testReplaceBlockRangeUsesParserForTables},
      {"replace block range with whitespace only preserves editable block", testReplaceBlockRangeWithWhitespaceOnlyPreservesEditableBlock},
      {"move block range moves single block up", testMoveBlockRangeMovesSingleBlockUp},
      {"move block range moves single block down", testMoveBlockRangeMovesSingleBlockDown},
      {"move block range moves multiple blocks across target", testMoveBlockRangeMovesMultipleBlocksAcrossTarget},
      {"move block range preserves mixed block types", testMoveBlockRangePreservesMixedBlockTypes},
      {"large document far down transactions", testLargeDocumentFarDownTransactions},
      {"repeated leading splits keep suffix addressable", testRepeatedLeadingSplitsKeepSuffixAddressable},
      {"randomized transaction sequence", testRandomizedTransactionSequence},
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

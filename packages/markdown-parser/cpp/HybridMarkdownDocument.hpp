#pragma once

#include "NativeTextSource.hpp"

#include "../nitrogen/generated/shared/c++/HybridMarkdownDocumentSpec.hpp"
#include "../nitrogen/generated/shared/c++/MarkdownBlockMetadata.hpp"
#include "../nitrogen/generated/shared/c++/MarkdownRenderBlock.hpp"

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::legendapps::markdownparser {

class HybridMarkdownDocument;
class MarkdownBlockSequence;

void registerMarkdownDocument(std::shared_ptr<HybridMarkdownDocument> document);

using MarkdownSource = ::legendapps::nativetextsource::NativeTextSource;

enum class MarkdownBlockType {
  Document,
  Quote,
  UnorderedList,
  OrderedList,
  ListItem,
  ThematicBreak,
  Heading,
  CodeBlock,
  HtmlBlock,
  Paragraph,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
};

struct MarkdownBlockRange {
  std::string id;
  size_t index = 0;
  size_t depth = 0;
  size_t headingLevel = 0;
  size_t markdownStart = 0;
  size_t markdownEnd = 0;
  size_t contentStart = 0;
  size_t contentEnd = 0;
  size_t textRevision = 0;
  MarkdownBlockType type = MarkdownBlockType::Paragraph;
};

class HybridMarkdownDocument final : public HybridMarkdownDocumentSpec {
public:
  HybridMarkdownDocument(
      std::string filePath,
      std::shared_ptr<const MarkdownSource> source,
      std::vector<MarkdownBlockRange> blocks,
      MarkdownDocumentTiming timing);
  ~HybridMarkdownDocument() override;

  void setDocumentDurationMs(double durationMs);

  double getBlockCount() override;
  double getSourceSize() override;
  std::vector<std::string> getBlockIds(double start, double count) override;
  std::string getBlockKey(double index) override;
  double getIndexForBlockId(const std::string& blockId) override;
  MarkdownBlockMetadata getBlockMetadataById(const std::string& blockId) override;
  std::vector<MarkdownBlockMetadata> getBlockMetadata(double start, double count) override;
  MarkdownRenderBlock getRenderBlockById(const std::string& blockId) override;
  std::vector<MarkdownRenderBlock> getRenderBlocks(double start, double count) override;
  MarkdownDocumentTiming getTiming() override;
  MarkdownTransactionResult applyTransaction(const MarkdownTransaction& transaction) override;
  void save() override;
  void saveAs(const std::string& filePath) override;
  const std::string& documentId() const noexcept;
  std::string markdownForBlockId(const std::string& blockId) const;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  MarkdownBlockMetadata metadataForBlock(size_t index) const;
  MarkdownRenderBlock renderBlockForBlock(size_t index) const;
  size_t findBlockIndex(const std::string& blockId) const;
  MarkdownTransactionResult updateBlockMarkdown(const MarkdownTransaction& transaction);
  MarkdownTransactionResult splitBlock(const MarkdownTransaction& transaction);
  MarkdownTransactionResult replaceBlockRange(const MarkdownTransaction& transaction);
  MarkdownTransactionResult replaceBlockRangeIncrementally(
      size_t rangeStartIndex,
      size_t rangeEndIndex,
      const std::optional<std::string>& replacementMarkdown,
      bool preservesEmptyReplacementBlock);
  MarkdownTransactionResult moveBlockRange(const MarkdownTransaction& transaction);
  MarkdownTransactionResult makeTransactionResult(
      size_t startBlockIndex,
      size_t deleteCount,
      const std::vector<size_t>& changedBlockIndices,
      std::vector<std::string> retiredBlockIds = {},
      bool retainsFirstChangedBlock = false) const;
  void writeToFilePath(const std::string& filePath) const;
  void resetDocument(std::string source, std::vector<MarkdownBlockRange> blocks);
  std::string nextBlockId();

  std::string filePath_;
  std::string lineEnding_;
  std::unique_ptr<MarkdownBlockSequence> blockSequence_;
  MarkdownDocumentTiming timing_;
  std::string documentId_;
  size_t nextBlockNumber_ = 0;
  size_t revision_ = 0;
};

} // namespace margelo::nitro::legendapps::markdownparser

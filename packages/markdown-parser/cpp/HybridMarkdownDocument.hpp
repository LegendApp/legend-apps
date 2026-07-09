#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownDocumentSpec.hpp"
#include "../nitrogen/generated/shared/c++/MarkdownBlockMetadata.hpp"
#include "../nitrogen/generated/shared/c++/MarkdownRenderBlock.hpp"

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace margelo::nitro::legendapps::markdownparser {

class HybridMarkdownDocument;

void registerMarkdownDocument(std::shared_ptr<HybridMarkdownDocument> document);

class MarkdownSource {
public:
  virtual ~MarkdownSource() = default;
  virtual const char* data() const noexcept = 0;
  virtual size_t size() const noexcept = 0;
  virtual size_t externalMemorySize() const noexcept = 0;
};

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
  MarkdownBlockMetadata metadataForBlock(const MarkdownBlockRange& block) const;
  MarkdownRenderBlock renderBlockForBlock(size_t storageIndex, const MarkdownBlockRange& block) const;
  const std::string& markdownForBlock(size_t storageIndex, const MarkdownBlockRange& block) const;
  std::string sourceString(size_t start, size_t end) const;
  size_t findBlockIndex(const std::string& blockId) const;
  MarkdownTransactionResult updateBlockMarkdown(const MarkdownTransaction& transaction);
  MarkdownTransactionResult splitBlock(const MarkdownTransaction& transaction);
  MarkdownTransactionResult replaceBlockRange(const MarkdownTransaction& transaction);
  MarkdownTransactionResult moveBlockRange(const MarkdownTransaction& transaction);
  MarkdownTransactionResult makeTransactionResult(
      size_t startBlockIndex,
      size_t deleteCount,
      const std::vector<size_t>& changedBlockIndices,
      std::vector<std::string> retiredBlockIds = {}) const;
  void replaceSourceRange(size_t start, size_t end, const std::string& markdown);
  void writeToFilePath(const std::string& filePath) const;
  void shiftBlocksAfter(size_t startIndex, long long delta);
  void renumberBlocks(size_t startIndex);
  void rebuildBlockIndex();
  std::string nextBlockId();

  std::string filePath_;
  std::string sourceText_;
  std::string lineEnding_;
  std::vector<MarkdownBlockRange> blocks_;
  mutable std::vector<std::optional<std::string>> markdownCache_;
  MarkdownDocumentTiming timing_;
  std::string documentId_;
  std::unordered_map<std::string, size_t> blockIndexById_;
  size_t nextBlockNumber_ = 0;
  size_t revision_ = 0;
};

} // namespace margelo::nitro::legendapps::markdownparser

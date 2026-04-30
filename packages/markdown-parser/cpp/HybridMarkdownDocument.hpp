#pragma once

#include "../nitrogen/generated/shared/c++/HybridMarkdownDocumentSpec.hpp"
#include "../nitrogen/generated/shared/c++/MarkdownRenderBlock.hpp"

#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::legenddesktop::markdownparser {

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
  size_t index = 0;
  size_t depth = 0;
  size_t markdownStart = 0;
  size_t markdownEnd = 0;
  MarkdownBlockType type = MarkdownBlockType::Paragraph;
};

class HybridMarkdownDocument final : public HybridMarkdownDocumentSpec {
public:
  HybridMarkdownDocument(
      std::shared_ptr<const MarkdownSource> source,
      std::vector<MarkdownBlockRange> blocks,
      MarkdownDocumentTiming timing);

  void setDocumentDurationMs(double durationMs);

  double getBlockCount() override;
  double getSourceSize() override;
  std::vector<MarkdownRenderBlock> getRenderBlocks(double start, double count) override;
  MarkdownDocumentTiming getTiming() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  MarkdownRenderBlock renderBlockForBlock(size_t storageIndex, const MarkdownBlockRange& block) const;
  const std::string& markdownForBlock(size_t storageIndex, const MarkdownBlockRange& block) const;
  std::string sourceString(size_t start, size_t end) const;

  std::shared_ptr<const MarkdownSource> source_;
  std::vector<MarkdownBlockRange> blocks_;
  mutable std::vector<std::optional<std::string>> markdownCache_;
  MarkdownDocumentTiming timing_;
};

} // namespace margelo::nitro::legenddesktop::markdownparser

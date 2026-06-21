#pragma once

#include "SyntaxHighlighter.hpp"

#include "../nitrogen/generated/shared/c++/HybridSyntaxDocumentSpec.hpp"

#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::legenddesktop::syntaxparser {

class SyntaxSource {
public:
  virtual ~SyntaxSource() = default;
  virtual const char* data() const noexcept = 0;
  virtual size_t size() const noexcept = 0;
  virtual size_t externalMemorySize() const noexcept = 0;
};

struct SyntaxLineRange {
  size_t start = 0;
  size_t end = 0;
};

struct CachedSyntaxLine {
  std::vector<SyntaxTokenRun> tokens;
};

class HybridSyntaxDocument final : public HybridSyntaxDocumentSpec {
public:
  HybridSyntaxDocument(
      std::string filePath,
      std::shared_ptr<const SyntaxSource> source,
      std::shared_ptr<TextMateHighlighterContext> context,
      std::vector<SyntaxLineRange> lines);

  static std::shared_ptr<HybridSyntaxDocument> loadFile(
      const std::string& filePath,
      const std::string& language,
      const std::string& theme);

  double getLineCount() override;
  double getSourceSize() override;
  std::vector<SyntaxRenderLine> getRenderLines(double start, double count) override;
  std::vector<SyntaxStyle> getStyles() override;
  SyntaxHighlightTiming getTiming() override;

protected:
  size_t getExternalMemorySize() noexcept override;

private:
  void ensureTokenized(size_t endExclusive);
  std::string lineText(size_t index) const;

  std::string filePath_;
  std::shared_ptr<const SyntaxSource> source_;
  std::shared_ptr<TextMateHighlighterContext> context_;
  std::vector<SyntaxLineRange> lines_;
  std::vector<std::optional<CachedSyntaxLine>> tokenCache_;
  SyntaxStyleState styleState_;
  TextMateStateStack nextState_;
  size_t tokenizedLineCount_ = 0;
  double tokenCount_ = 0;
  double tokenizeMs_ = 0;
  mutable std::mutex mutex_;
};

} // namespace margelo::nitro::legenddesktop::syntaxparser

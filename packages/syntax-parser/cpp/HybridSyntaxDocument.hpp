#pragma once

#include "SyntaxHighlighter.hpp"

#include "../nitrogen/generated/shared/c++/HybridSyntaxDocumentSpec.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace margelo::nitro::legendapps::syntaxparser {

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
      std::vector<SyntaxLineRange> lines,
      double mapFileMs,
      double indexLinesMs,
      double contextMs);
  ~HybridSyntaxDocument() override;

  static std::shared_ptr<HybridSyntaxDocument> loadFile(
      const std::string& filePath,
      const std::string& language,
      const std::string& theme);
  static std::shared_ptr<HybridSyntaxDocument> loadPlainFile(const std::string& filePath);

  double getLineCount() override;
  double getSourceSize() override;
  std::vector<SyntaxRenderLine> getPlainLines(double start, double count) override;
  std::vector<SyntaxRenderLine> getRenderLines(double start, double count) override;
  double getTokenizedLineCount() override;
  std::vector<SyntaxStyle> getStyles() override;
  SyntaxHighlightTiming getTiming() override;
  double startBackgroundTokenization(double chunkLineCount) override;
  double stopBackgroundTokenization() override;
  void setInitialLoadTiming(double initialLinesMs, double totalMs);

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
  double mapFileMs_ = 0;
  double indexLinesMs_ = 0;
  double contextMs_ = 0;
  double initialLinesMs_ = 0;
  double tokenizeMs_ = 0;
  double totalMs_ = 0;
  std::atomic<uint64_t> backgroundGeneration_{0};
  std::atomic<bool> backgroundTokenizationRunning_{false};
  std::thread backgroundThread_;
  mutable std::mutex mutex_;
};

} // namespace margelo::nitro::legendapps::syntaxparser

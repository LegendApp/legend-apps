#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <vector>
#include <utility>
#include "../../../grammars/PackABI.h"

namespace margelo::nitro::legendapps::syntaxparser {

// All coordinates are UTF-16 code units, matching the native editor. Rows count
// LF characters (CR in CRLF contributes to the preceding column).
struct TreeSitterPoint { uint32_t row, column; };
struct TreeSitterEdit {
  uint32_t start, oldEnd, newEnd;
  TreeSitterPoint startPoint, oldEndPoint, newEndPoint;
};
struct TreeSitterSpan {
  uint32_t start, length;
  std::string capture;
  uint32_t captureId = 0;
};
struct TreeSitterInput {
  uint32_t length;
  // Return a nonempty chunk at offset, or an empty view only at EOF. The view
  // stays valid until the next read. The reader and its backing snapshot must
  // remain valid through highlighting (predicates read captured identifiers).
  // Called synchronously on the parser worker;
  // the owner supplies an immutable document snapshot, never a live UI buffer.
  std::function<std::u16string_view(uint32_t)> read;
};

// Opt-in native backend, serial-worker owned. No JS bridge or editor policy
// changes. Capture names are theme-independent; theme mapping remains a caller
// responsibility. Grammars/aliases/queries come from the pinned shared registry;
// these are syntax captures, not language-server semantic tokens.
class TreeSitterHighlighter {
public:
  explicit TreeSitterHighlighter(const std::string& language);
  ~TreeSitterHighlighter();
  TreeSitterHighlighter(const TreeSitterHighlighter&) = delete;
  TreeSitterHighlighter& operator=(const TreeSitterHighlighter&) = delete;
  static bool supports(const std::string& language);
  static std::string languageForPath(std::string path);
  // Call only after platform signature/integrity validation. Libraries must stay
  // loaded for the process lifetime; active trees retain their language pointer.
  static void registerPack(const LegendGrammarPackV1& pack);
#ifdef LEGEND_SYNTAX_TEST_GRAMMARS
  static size_t queryCompilationCount();
  size_t codeInjectionParseCount() const;
#endif
  std::vector<std::string> missingLanguages() const;
  static std::string themeScope(const std::string& capture);
  void reset();
  void edit(const TreeSitterEdit& edit);
  // False on cancellation; never publishes partial/stale highlighting. A retry
  // starts a fresh parse against the last edited tree, not abandoned parser state.
  bool parse(const TreeSitterInput& input, const std::atomic_bool* cancelled = nullptr);
  // Cooperative budget; false means suspended or cancelled. Resume only with
  // the identical worker-owned snapshot. edit/reset abandon a suspended job.
  bool parseSlice(const TreeSitterInput& input, double milliseconds, const std::atomic_bool* cancelled = nullptr);
  std::vector<TreeSitterSpan> highlight(uint32_t start, uint32_t end, const std::atomic_bool* cancelled = nullptr) const;
  std::vector<std::string> captures() const;
  static size_t captureCount();
  static std::string rootScopeForCapture(uint32_t capture);
  std::string rootScope() const;
  // Last successful parse: edited text plus changed syntax, expanded to the
  // containing top-level construct for query/lexical-scope dependencies.
  std::pair<uint32_t, uint32_t> invalidatedRange() const;
private:
  std::vector<TreeSitterSpan> highlightBase(uint32_t start, uint32_t end) const;
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
}

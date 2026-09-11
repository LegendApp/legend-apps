#include "../cpp/TreeSitterHighlighter.hpp"
#include "../cpp/IncrementalSyntaxHighlighter.hpp"
#include <algorithm>
#include <cassert>
#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
#include <sys/resource.h>
using namespace margelo::nitro::legendapps::syntaxparser;
using Clock = std::chrono::steady_clock;
template<class F> double timed(F f) { auto start = Clock::now(); f(); return std::chrono::duration<double, std::milli>(Clock::now() - start).count(); }
static auto context(const std::string& root, bool tsx) {
  auto onig = textmate_oniglib_create(); auto registry = textmate_registry_create(onig);
  for (const std::string name : {"typescript", "tsx"})
    assert(textmate_registry_add_grammar_from_file(registry, (root + "/tm-grammars/grammars/" + name + ".json").c_str()));
  std::ifstream file(root + "/tm-themes/themes/dark-plus.json"); std::ostringstream json; json << file.rdbuf();
  assert(textmate_registry_set_theme(registry, json.str().c_str()));
  auto grammar = textmate_registry_load_grammar(registry, tsx ? "source.tsx" : "source.ts"); assert(grammar);
  return std::make_shared<TextMateHighlighterContext>(onig, registry, grammar, textmate_registry_get_color_map(registry));
}
int main(int argc, char** argv) {
  assert(argc == 6);
  const std::string backend = argv[1], language = argv[2], fixture = argv[3];
  const size_t count = std::stoul(argv[4]);
  std::vector<IncrementalSyntaxLine> lines; std::vector<uint32_t> starts;
  std::u16string source;
  for (size_t i = 0; i < count; ++i) {
    auto number = fixture == "repeated" ? "42" : std::to_string(i);
    auto line = language == "tsx" ? "export const View" + number + " = () => <View title=\"hello\">{" + number + "}</View>;"
      : "export const value" + number + ": number = " + number + "; // unique identifier";
    starts.push_back(source.size()); lines.push_back({i + 1, line});
    source.append(line.begin(), line.end()); source += u'\n';
  }
  TreeSitterInput input{static_cast<uint32_t>(source.size()), [&](uint32_t offset) { return std::u16string_view(source).substr(offset, 4096); }};
  const uint32_t firstEnd = starts[std::min<size_t>(128, count - 1)];
  const uint32_t endStart = starts[count - 80];
  std::unique_ptr<TreeSitterHighlighter> tree;
  std::unique_ptr<IncrementalSyntaxHighlighter> textmate;
  std::vector<TreeSitterSpan> spans;
  double setup = 0, parse = 0, first = 0, rest = 0, jump = 0;
  size_t tokenCount = 0;
  if (backend == "tree-sitter") {
    setup = timed([&] { tree = std::make_unique<TreeSitterHighlighter>(language); });
    parse = timed([&] { assert(tree->parse(input)); });
    first = timed([&] { spans = tree->highlight(0, firstEnd); });
    rest = timed([&] {
      spans.clear();
      // Match the editor's bounded highlighting batches; retain the finished
      // tokens to compare prehighlighted-document memory with TextMate's cache.
      for (size_t i = 0; i < count; i += 2048) {
        auto batch = tree->highlight(starts[i], i + 2048 < count ? starts[i + 2048] : source.size());
        spans.insert(spans.end(), std::make_move_iterator(batch.begin()), std::make_move_iterator(batch.end()));
      }
      tokenCount = spans.size();
    });
    jump = timed([&] { for (int i = 0; i < 20; ++i) { auto visible = tree->highlight(endStart, source.size()); assert(!visible.empty()); } }) / 20;
  } else {
    setup = timed([&] { textmate = std::make_unique<IncrementalSyntaxHighlighter>(context(argv[5], language == "tsx")); });
    first = timed([&] { auto result = textmate->highlight({lines.begin(), lines.begin() + 128}); for (auto& line : result.lines) tokenCount += line->tokens.size(); });
    rest = timed([&] {
      for (size_t i = 128; i < count; i += 2048) {
        auto result = textmate->highlight({lines.begin() + i, lines.begin() + std::min(i + 2048, count)}, lines[i - 1].id);
        for (auto& line : result.lines) tokenCount += line->tokens.size();
      }
    });
    jump = timed([&] { for (int i = 0; i < 20; ++i) { auto visible = textmate->highlight({lines.end() - 80, lines.end()}, lines[count - 81].id); assert(!visible.lines.empty()); } }) / 20;
  }
  // Type into the middle of a fully parsed file. Coordinate lookup/fixture
  // mutation excluded for both engines; incremental parse + visible tokens included.
  const uint32_t row = count / 2;
  const uint32_t column = lines[row].text.find(language == "tsx" ? "hello" : "unique");
  const uint32_t offset = starts[row] + column;
  std::vector<double> edits;
  for (int i = 0; i < 20; ++i) {
    const char ch = i % 2 ? 'h' : 'x'; source[offset] = ch; lines[row].text[column] = ch;
    edits.push_back(timed([&] {
      if (tree) {
        tree->edit({offset, offset + 1, offset + 1, {row, column}, {row, column + 1}, {row, column + 1}});
        assert(tree->parse(input)); auto visible = tree->highlight(starts[row], starts[row + 80]); assert(!visible.empty());
      } else {
        auto changed = textmate->highlight({lines.begin() + row, lines.begin() + row + 80}, lines[row - 1].id); assert(!changed.lines.empty());
      }
    }));
  }
  std::sort(edits.begin(), edits.end());
  rusage usage{}; getrusage(RUSAGE_SELF, &usage);
  std::cout << "{\"backend\":\"" << backend << "\",\"language\":\"" << language << "\",\"fixture\":\"" << fixture
    << "\",\"lines\":" << count << ",\"setup_ms\":" << setup << ",\"parse_ms\":" << parse
    << ",\"first_highlight_ms\":" << parse + first << ",\"full_highlight_ms\":" << parse + first + rest
    << ",\"warm_end_query_ms\":" << jump << ",\"edit_p50_ms\":" << edits[10] << ",\"edit_p95_ms\":" << edits[18]
    << ",\"peak_rss_mib\":" << usage.ru_maxrss / (1024.0 * 1024.0) << ",\"tokens\":" << tokenCount << "}\n";
}

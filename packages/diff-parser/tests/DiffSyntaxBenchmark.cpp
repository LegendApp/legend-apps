#include "../../syntax-parser/cpp/TreeSitterLineHighlighter.hpp"
#include "../../syntax-parser/cpp/SyntaxHighlighter.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <sstream>
#include <sys/resource.h>
using namespace margelo::nitro::legendapps::syntaxparser;
using Clock = std::chrono::steady_clock;
template<class F> double timed(F f) { const auto start = Clock::now(); f(); return std::chrono::duration<double, std::milli>(Clock::now() - start).count(); }

int main(int argc, char** argv) {
  assert(argc == 6);
  const std::string backend = argv[1], language = argv[2], path = argv[3], root = argv[4], position = argv[5];
  std::ifstream file(path); std::ostringstream stream; stream << file.rdbuf();
  const auto source = stream.str(); assert(!source.empty());
  const auto lines = splitSyntaxLines(source);
  const size_t start = position == "tail" && lines.size() > 80 ? lines.size() - 80 : 0;
  const size_t end = std::min(lines.size(), start + 80);
  double setup = 0, first = 0, previewMs = 0, warm = 0, maxSlice = 0;
  size_t tokens = 0, queriedLines = 0;
  std::unique_ptr<TreeSitterLineHighlighter> tree;
  std::shared_ptr<TextMateHighlighterContext> context;
  SyntaxScopeState scopes;
  std::vector<std::vector<SyntaxScopeTokenRun>> cache(lines.size());
  auto publish = [&](const std::vector<TreeLine>& rows) {
    const auto captures = tree->captures();
    std::vector<double> ids;
    for (size_t id = 0; id < captures.size(); ++id) {
      const std::vector<std::string> names{TreeSitterHighlighter::rootScopeForCapture(id), TreeSitterHighlighter::themeScope(captures[id])};
      auto [entry, added] = scopes.scopeIds.emplace(names, scopes.scopes.size());
      if (added) scopes.scopes.push_back(names);
      ids.push_back(entry->second);
    }
    for (const auto& row : rows) {
      cache[row.index].clear();
      for (const auto& token : row.tokens) cache[row.index].push_back({static_cast<double>(token.start), static_cast<double>(token.length), ids.at(token.capture)});
    }
  };
  if (backend == "tree-sitter") {
    setup = timed([&] { tree = std::make_unique<TreeSitterLineHighlighter>(language); });
    if (position == "first") previewMs = timed([&] {
      const auto preview = TreeSitterLineHighlighter::preview(language, lines, start);
      if (preview) publish(*preview);
    });
    first = timed([&] {
      bool ready = false;
      while (!ready) maxSlice = std::max(maxSlice, timed([&] { ready = tree->prepare(lines, 256); }));
      const auto rows = tree->highlight(start, end - start);
      publish(rows);
      queriedLines += rows.size();
      for (const auto& row : rows) tokens += row.tokens.size();
    });
    warm = timed([&] { auto copy = std::vector(cache.begin() + start, cache.begin() + end); assert(copy.size() == end - start); });
  } else {
    setup = timed([&] {
      const auto onig = textmate_oniglib_create(); const auto registry = textmate_registry_create(onig);
      for (const std::string name : {"javascript", "typescript", "tsx"})
        assert(textmate_registry_add_grammar_from_file(registry, (root + "/tm-grammars/grammars/" + name + ".json").c_str()));
      std::ifstream theme(root + "/tm-themes/themes/dark-plus.json"); std::ostringstream json; json << theme.rdbuf();
      assert(textmate_registry_set_theme(registry, json.str().c_str()));
      const auto scope = language == "javascript" ? "source.js" : language == "tsx" ? "source.tsx" : "source.ts";
      const auto grammar = textmate_registry_load_grammar(registry, scope); assert(grammar);
      context = std::make_shared<TextMateHighlighterContext>(onig, registry, grammar, textmate_registry_get_color_map(registry));
    });
    auto state = textmate_get_initial_state();
    first = timed([&] {
      // Exact old Diff algorithm: tokenize every preceding source line and
      // retain its scope tokens, even when only the final hunk is requested.
      for (size_t index = 0; index < end;) {
        maxSlice = std::max(maxSlice, timed([&] {
          const auto stop = std::min(end, index + 256);
          for (; index < stop; ++index) {
            cache[index] = tokenizeSyntaxScopeLine(*context, lines[index], state, scopes).tokens;
            tokens += cache[index].size(); ++queriedLines;
          }
        }));
      }
    });
    warm = timed([&] { auto copy = std::vector(cache.begin() + start, cache.begin() + end); assert(copy.size() == end - start); });
  }
  rusage usage{}; getrusage(RUSAGE_SELF, &usage);
  std::cout << "{\"backend\":\"" << backend << "\",\"file\":\"" << path << "\",\"position\":\"" << position
    << "\",\"lines\":" << lines.size() << ",\"bytes\":" << source.size()
    << ",\"setup_ms\":" << setup << ",\"preview_ms\":" << previewMs + setup << ",\"first_ms\":" << first + previewMs + setup << ",\"max_slice_ms\":" << maxSlice
    << ",\"warm_ms\":" << warm << ",\"queried_lines\":" << queriedLines << ",\"tokens\":" << tokens
    << ",\"rss_mib\":" << usage.ru_maxrss / (1024.0 * 1024.0) << "}\n";
}

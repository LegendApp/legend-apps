#include "../cpp/SourceTreeSyntax.hpp"
#include <cassert>
#include <iostream>
#include <random>
#include <chrono>
#include <sys/resource.h>
using legend::source::SourceTreeSyntax;

static void compare(SourceTreeSyntax& worker, const std::u16string& source, const char* language = "tsx") {
  SourceTreeSyntax fresh(language);
  fresh.replace(0, 0, source);
  assert(worker.parse() && fresh.parse());
  auto actual = worker.highlight(0, worker.lineCount());
  auto expected = fresh.highlight(0, fresh.lineCount());
  assert(actual.size() == expected.size());
  for (size_t i = 0; i < actual.size(); ++i) assert(actual[i].tokens == expected[i].tokens);
}
static void measure() {
    SourceTreeSyntax large("typescript");
    std::u16string chunk;
    for (int line = 0; line < 128; ++line) chunk += u"export const sample = { title: \"Startup benchmark\", value: 42 };\n";
    const auto now = [] { return std::chrono::steady_clock::now(); };
    const auto ms = [&](auto start) { return std::chrono::duration<double, std::milli>(now() - start).count(); };
    const auto peakBytes = [] { rusage usage{}; getrusage(RUSAGE_SELF, &usage); return usage.ru_maxrss; };
    auto start = now();
    for (int batch = 0; batch < 800; ++batch) large.replace(large.length(), 0, chunk);
    const auto appendMs = ms(start); const auto mirrorPeak = peakBytes(); start = now();
    assert(large.parse());
    const auto parseMs = ms(start); const auto parsePeak = peakBytes(); start = now();
    size_t tokens = 0;
    for (size_t line = 0; line < large.lineCount(); line += 512)
      for (const auto& row : large.highlight(line, 512)) tokens += row.tokens.size();
    std::cout << "chunked-worker lines=" << large.lineCount() << " append_ms=" << appendMs
      << " parse_ms=" << parseMs << " query_ms=" << ms(start) << " tokens=" << tokens
      << " mirror_peak_bytes=" << mirrorPeak << " parsed_peak_bytes=" << parsePeak << " query_peak_bytes=" << peakBytes() << "\n";
}
int main(int argc, char**) {
  SourceTreeSyntax worker("tsx");
  std::u16string source = u"const x = <View title=\"😀\" />;\r\n";
  worker.replace(0, 0, source.substr(0, 12));
  assert(worker.parse()); // provisional truncated prefix
  worker.replace(12, 0, source.substr(12));
  compare(worker, source);
  const std::vector<std::u16string> inserts = {u"/*", u"*/", u"\r", u"\n", u"x", u"\r\n", u"`${hello}`", u"😀"};
  std::mt19937 random(17);
  for (int i = 0; i < 300; ++i) {
    size_t at = random() % (source.size() + 1), count = random() % (source.size() - at + 1);
    auto before = source.substr(at, count);
    const auto& inserted = inserts[random() % inserts.size()];
    worker.replace(at, count, inserted); source.replace(at, count, inserted);
    compare(worker, source);
    worker.replace(at, inserted.size(), before); source.replace(at, inserted.size(), before);
    compare(worker, source);
  }
  // Several ordered edits can accumulate before the one coalesced parse.
  worker.replace(0, 0, u"/*"); worker.replace(0, 2, u"");
  compare(worker, source);
  worker.cancelled = true;
  assert(!worker.parse());
  for (const char* language : {"markdown", "mdx"}) {
    SourceTreeSyntax deck(language);
    std::u16string source = u"---\r\ntitle: Example\r\n---\r\n\r\n# Heading 👋\r\n\r\n**bold** and `code`\r\n\r\n```tsx\r\nconst view = <View />;\r\n```\r\n";
    deck.replace(0, 0, source.substr(0, 80)); assert(deck.parse());
    deck.highlight(0, deck.lineCount()); // cache an incomplete prefix's inline region
    deck.replace(80, 0, source.substr(80)); compare(deck, source, language);
    for (int i = 0; i < 100; ++i) {
      const auto at = random() % (source.size() + 1);
      const auto& inserted = inserts[random() % inserts.size()];
      deck.replace(at, 0, inserted); source.insert(at, inserted);
      compare(deck, source, language);
      deck.replace(at, inserted.size(), u""); source.erase(at, inserted.size());
      compare(deck, source, language);
    }
  }
  std::cout << "SourceTreeSyntax: prefix/append, UTF-16/CR/LF edits, undo, queued edits and cancellation passed\n";
  if (argc > 1) measure();
}

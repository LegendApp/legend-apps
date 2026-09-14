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
  {
    SourceTreeSyntax sliced("typescript");
    std::u16string text;
    for (size_t i = 0; i < 10000; ++i) text += u"const sample = 42;\n";
    sliced.replace(0, 0, text);
    assert(!sliced.parseSlice(0.01));
    // An edit between slices must abandon suspended state even before a first
    // tree exists, including same-length edits (length isn't a revision ID).
    sliced.replace(6, 6, u"edited"); text.replace(6, 6, u"edited");
    compare(sliced, text, "typescript");
    sliced.replace(0, 0, u"/*"); text.insert(0, u"/*");
    assert(!sliced.parseSlice(0.0001));
    sliced.replace(0, 2, u""); text.erase(0, 2);
    compare(sliced, text, "typescript");
    std::atomic_bool stop{true};
    assert(!sliced.parseSlice(4, &stop));
    bool threw = false;
    try { sliced.highlight(0, 80, &stop); } catch (const std::runtime_error&) { threw = true; }
    assert(threw);
    stop = false;
    compare(sliced, text, "typescript");
  }
  // Model the editor's partial cache refresh, not just a full re-query. Local
  // binding edits must update sibling references but leave outer scopes valid.
  for (const char* language : {"javascript", "typescript", "tsx"}) {
    const std::u16string initial = u"const outside = console.log;\n(function bundle() {\nfunction example() {\nconsole.log(42);\nif (true) { var local = 1; }\nconsole.log(local);\n}\nfunction sibling() { console.log(42); }\n})();\nconsole.log(42);\n";
    for (const auto& edit : std::vector<std::pair<std::u16string, std::u16string>>{
        {u"42", u"1234"}, {u"var local", u"var console"}, {u"var local = 1;", u""},
        {u"console.log(local)", u"console.log(`hello\n${local}`)"},
        {u"var local = 1;", u"var console = 1;\nvar local = 2;"},
        {u"if (true)", u"if (false)"}, {u"function example", u"function console"},
        {u"console.log(42);", u"/*"}}) {
      SourceTreeSyntax edited(language);
      auto text = initial;
      edited.replace(0, 0, text); assert(edited.parse());
      auto cached = edited.highlight(0, edited.lineCount());
      const auto at = text.find(edit.first);
      assert(at != std::u16string::npos);
      edited.replace(at, edit.first.size(), edit.second); text.replace(at, edit.first.size(), edit.second);
      assert(edited.parse());
      const auto invalidated = edited.takeInvalidatedLines();
      auto full = edited.highlight(0, edited.lineCount());
      // Account for rows shifted by the edit before checking retained colors.
      const auto delta = static_cast<ptrdiff_t>(full.size()) - static_cast<ptrdiff_t>(cached.size());
      for (size_t row = 0; row < full.size(); ++row) {
        if (row >= invalidated.first && row < invalidated.second) continue;
        const auto old = row < invalidated.first ? row : row - delta;
        assert(full[row].tokens == cached.at(old).tokens);
      }
      if (edit.first == u"42") assert(invalidated.second - invalidated.first <= 6);
      compare(edited, text, language);
      edited.replace(at, edit.second.size(), edit.first); text.replace(at, edit.second.size(), edit.first);
      compare(edited, text, language);
    }
  }
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

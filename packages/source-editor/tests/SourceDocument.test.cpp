#include "../cpp/SourceDocument.hpp"
#include <cassert>
#include <chrono>
#include <iostream>
#include <random>
#include <set>

using legend::source::SourceDocument;

static void verify(const SourceDocument &document, const std::u16string &expected) {
  assert(document.text() == expected);
  assert(document.length() == expected.size());
  std::set<uint64_t> ids;
  size_t offset = 0;
  for (size_t i = 0; i < document.lineCount(); ++i) {
    const auto &line = document.line(i);
    assert(ids.insert(line.id).second);
    assert(document.lineOffset(i) == offset);
    assert(document.position(offset).line == i);
    assert(line.text.find_first_of(u"\r\n") == std::u16string::npos);
    assert(i + 1 == document.lineCount() ? line.ending.empty() : !line.ending.empty());
    offset += line.size();
  }
  assert(offset == expected.size());
  for (const auto start : {size_t(0), document.lineCount() / 2, document.lineCount()}) {
    for (const auto count : {size_t(0), size_t(1), size_t(7), SIZE_MAX}) {
      size_t visited = 0;
      document.forEachLine(start, count, [&](size_t index, size_t at, const legend::source::Line& line) {
        assert(index == start + visited++);
        assert(at == document.lineOffset(index));
        assert(&line == &document.line(index));
      });
      assert(visited == std::min(count, document.lineCount() - start));
    }
  }
  SourceDocument rebuilt(expected);
  assert(document.lineCount() == rebuilt.lineCount());
  for (size_t i = 0; i < document.lineCount(); ++i) {
    assert(document.line(i).text == rebuilt.line(i).text);
    assert(document.line(i).ending == rebuilt.line(i).ending);
  }
  size_t row = 0, column = 0;
  for (size_t i = 0; i <= expected.size(); ++i) {
    const auto position = document.position(i);
    assert(document.lineOffset(position.line) + position.column == i);
    const auto syntax = document.syntaxPosition(i);
    assert(syntax.line == row && syntax.column == column);
    if (i < expected.size()) {
      if (expected[i] == u'\n') { ++row; column = 0; } else ++column;
    }
  }
}

int main() {
  {
    SourceDocument empty;
    bool threw = false;
    try { empty.forEachLine(2, 1, [](auto, auto, const auto&) {}); }
    catch (const std::out_of_range&) { threw = true; }
    assert(threw);
  }
  for (const auto &text : {u"", u"one", u"one\n", u"\n\n", u"a\r\nb\rc\n", u"\U0001f600\n中文\ne\u0301"}) {
    SourceDocument document(text);
    verify(document, text);
  }
  {
    SourceDocument document(u"first\nsecond\nthird\nfourth");
    const auto secondId = document.line(1).id;
    const auto fourthId = document.line(3).id;
    document.replace(1, 0, u"oo");
    assert(document.line(1).id == secondId);
    document.replace(0, 0, u"new\n");
    assert(document.line(2).id == secondId);
    assert(document.line(4).id == fourthId);
    verify(document, u"new\nfooirst\nsecond\nthird\nfourth");
  }
  {
    SourceDocument document(u"a\r\nb");
    document.replace(2, 0, u"x");
    verify(document, u"a\rx\nb");
    document.replace(2, 1, u"");
    verify(document, u"a\r\nb");
    document.replace(1, 1, u"");
    verify(document, u"a\nb");
  }
  // Random range transactions include code-unit edits inside CRLF and emoji.
  // The native input host is responsible for grapheme-aware user commands;
  // the buffer must still preserve exact external UTF-16 range operations.
  std::mt19937 random(42);
  const std::vector<std::u16string> inserts = {u"", u"x", u"\n", u"\r", u"\r\n", u"ab\ncd", u"\U0001f600", u"中文", u"e\u0301"};
  SourceDocument document;
  std::u16string reference;
  for (int i = 0; i < 10000; ++i) {
    const auto offset = random() % (reference.size() + 1);
    const auto length = random() % (reference.size() - offset + 1);
    const auto &text = inserts[random() % inserts.size()];
    auto change = document.replace(offset, length, text);
    assert(change.removedText == reference.substr(offset, length));
    reference.replace(offset, length, text);
    verify(document, reference);
    if (i % 5 == 0) {
      document.replace(offset, text.size(), change.removedText);
      reference.replace(offset, text.size(), change.removedText);
      verify(document, reference);
    }
  }
  for (size_t lineCount : {10000, 100000}) {
    std::u16string source;
    for (size_t i = 0; i < lineCount; i++) source += u"const value = <Component title=\"hello\" />;\n";
    auto start = std::chrono::steady_clock::now();
    SourceDocument large(source);
    auto loaded = std::chrono::steady_clock::now();
    const auto finalId = large.line(lineCount).id;
    for (int i = 0; i < 1000; i++) {
      large.replace(1, 0, u"x\n");
      large.replace(1, 2, u"");
    }
    auto edited = std::chrono::steady_clock::now();
    assert(large.text() == source);
    assert(large.line(lineCount).id == finalId);
    std::cout << lineCount << " lines: load " << std::chrono::duration<double, std::milli>(loaded - start).count()
      << "ms, 2000 top-of-file edits " << std::chrono::duration<double, std::milli>(edited - loaded).count() << "ms\n";
  }
  std::cout << "SourceDocument: all assertions passed\n";
}

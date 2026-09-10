#include "../cpp/SourceDocument.hpp"
#include <cassert>
#include <iostream>
#include <random>
#include <unordered_set>
using legend::source::SourceDocument;
int main() {
  // Loading and user edits share one document. Exercise arbitrary chunk
  // boundaries (including CRLF/surrogates), then undo the edit after loading.
  for (unsigned seed = 1; seed <= 20; ++seed) {
    std::mt19937 random(seed);
    SourceDocument document(u"initial\n"); document.useEditIdRange();
    std::u16string expected = u"initial\n";
    uint64_t nextId = 100;
    const std::u16string tails[] = {u"", u"\r", u"\n", u"\r\n", u"tail", u"😀中文\n", u"é\t"};
    for (size_t step = 0; step < 200; ++step) {
      const size_t offset = random() % (expected.size() + 1);
      const size_t length = random() % (expected.size() - offset + 1);
      const auto removed = expected.substr(offset, length);
      const auto &inserted = tails[random() % 7];
      document.replace(offset, length, inserted);
      expected.replace(offset, length, inserted);
      const auto &tail = tails[random() % 7];
      SourceDocument chunk(tail, nextId);
      nextId += chunk.lineCount();
      document.appendLoaded(std::move(chunk));
      expected += tail;
      document.replace(offset, inserted.size(), removed);
      expected.replace(offset, inserted.size(), removed);
      assert(document.text() == expected);
      SourceDocument reference(expected);
      assert(document.lineCount() == reference.lineCount());
      std::unordered_set<uint64_t> ids;
      for (size_t i = 0; i < reference.lineCount(); ++i) {
        assert(ids.insert(document.line(i).id).second);
        assert(document.line(i).text == reference.line(i).text);
        assert(document.line(i).ending == reference.line(i).ending);
        assert(document.lineOffset(i) == reference.lineOffset(i));
      }
    }
  }
  for (const auto &prefix : {u"", u"a", u"a\n", u"a\r", u"a\r\n", u"x\r\ny\n"}) {
    for (const auto &tail : {u"", u"tail", u"\nnext", u"\r\nnext", u"tail\n", u"\U0001f600\n中文\n"}) {
      SourceDocument document(prefix); document.useEditIdRange();
      const auto initialLength = document.lineCount();
      SourceDocument chunk(tail, 100);
      const auto result = document.appendLoaded(std::move(chunk));
      assert(result.revision == 1);
      std::u16string expected = std::u16string(prefix) + tail;
      assert(document.text() == expected);
      SourceDocument reference(expected);
      assert(document.lineCount() == reference.lineCount());
      for (size_t i = 0; i < reference.lineCount(); ++i) {
        assert(document.line(i).text == reference.line(i).text);
        assert(document.line(i).ending == reference.line(i).ending);
        assert(document.lineOffset(i) == reference.lineOffset(i));
      }
      if (!result.fallback) assert(document.lineCount() == initialLength + result.count);
    }
  }
  SourceDocument doc(u"first\n"); doc.useEditIdRange();
  doc.replace(0, 0, u"edited\n");
  const auto editId = doc.line(0).id;
  SourceDocument chunk(u"tail\n", 2);
  doc.appendLoaded(std::move(chunk));
  assert(doc.text() == u"edited\nfirst\ntail\n" && doc.line(0).id == editId);
  doc.replace(0, 7, u"");
  assert(doc.text() == u"first\ntail\n");
  std::cout << "Append: prefix/tail boundaries and edits interleaved with loading passed\n";
}

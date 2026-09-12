#include "../cpp/SourceEditing.hpp"
#include <cassert>
#include <iostream>
using namespace legend::source;
void expect(std::u16string source, EditingPlan plan, std::u16string expected) {
  SourceDocument doc(source);
  const auto removed = doc.slice(plan.offset, plan.removed);
  doc.replace(plan.offset, plan.removed, plan.text);
  assert(doc.text() == expected);
  assert(plan.anchor <= doc.length() && plan.head <= doc.length());
  doc.replace(plan.offset, plan.text.size(), removed);
  assert(doc.text() == source);
}
int main() {
  SourceDocument doc(u"one\r\n  two\r\nthree");
  expect(doc.text(), indentLines(doc, 0, 5, u"  ", false), u"  one\r\n  two\r\nthree");
  expect(doc.text(), indentLines(doc, 5, 10, u"  ", true), u"one\r\ntwo\r\nthree");
  expect(doc.text(), duplicateLines(doc, 0, 3), u"one\r\none\r\n  two\r\nthree");
  expect(doc.text(), moveLines(doc, 0, 3, true), u"  two\r\none\r\nthree");
  expect(doc.text(), moveLines(doc, 5, 10, false), u"  two\r\none\r\nthree");
  expect(doc.text(), toggleComments(doc, 0, 5, u"//"), u"// one\r\n  two\r\nthree");
  SourceDocument comment(u"  // one\n  // two");
  expect(comment.text(), toggleComments(comment, 0, comment.length(), u"//"), u"  one\n  two");
  SourceDocument brace(u"  {}\r\n");
  expect(brace.text(), newline(brace, 3, 3, u"  "), u"  {\r\n    \r\n  }\r\n");
  for (const auto ending : {u"\n", u"\r\n", u"\r"}) {
    SourceDocument last(std::u16string(u"one") + ending + u"two");
    auto at = last.lineOffset(1);
    expect(last.text(), duplicateLines(last, at, last.length()), last.text() + ending + u"two");
    expect(last.text(), moveLines(last, at, last.length(), false), std::u16string(u"two") + ending + u"one");
    auto indented = indentLines(last, last.length(), 0, u"\t", false);
    assert(indented.anchor > indented.head);
  }
  SourceDocument empty(u"");
  SourceDocument mixed(u"a\r\nb\nc");
  auto moved = moveLines(mixed, 0, 3, true);
  expect(mixed.text(), moved, u"b\r\na\nc");
  assert(moved.anchor == 3 && moved.head == 5);
  SourceDocument caret(u"  value\n");
  auto commented = toggleComments(caret, 5, 5, u"//");
  expect(caret.text(), commented, u"  // value\n");
  assert(commented.anchor == 8 && commented.head == 8);
  auto reversed = toggleComments(caret, 7, 2, u"//");
  assert(reversed.anchor == 10 && reversed.head == 5);
  expect(empty.text(), newline(empty, 0, 0, u"  "), u"\n");
  expect(empty.text(), moveLines(empty, 0, 0, true), u"");
  std::cout << "Editing plans: indentation, boundaries, comments, newlines, moves, duplicates and undo passed\n";
}

#include "../cpp/TreeSitterHighlighter.hpp"
#include "../../source-editor/cpp/SourceDocument.hpp"
#include <cassert>
#include <iostream>
#include <stdexcept>
using namespace margelo::nitro::legendapps::syntaxparser;

TreeSitterInput input(const std::u16string& source, uint32_t chunk = 4096) {
  return {static_cast<uint32_t>(source.size()), [&source, chunk](uint32_t offset) {
    return std::u16string_view(source).substr(offset, chunk);
  }};
}
TreeSitterPoint point(const std::u16string& s, uint32_t offset) {
  TreeSitterPoint p{};
  for (uint32_t i = 0; i < offset; ++i) { if (s[i] == '\n') { ++p.row; p.column = 0; } else ++p.column; }
  return p;
}
void equal(const std::vector<TreeSitterSpan>& a, const std::vector<TreeSitterSpan>& b) {
  assert(a.size() == b.size());
  for (size_t i = 0; i < a.size(); ++i) assert(a[i].start == b[i].start && a[i].length == b[i].length && a[i].capture == b[i].capture);
}
void replace(TreeSitterHighlighter& h, std::u16string& source, uint32_t start, uint32_t count, const std::u16string& text) {
  auto before = point(source, start), oldEnd = point(source, start + count);
  source.replace(start, count, text);
  h.edit({start, start + count, start + static_cast<uint32_t>(text.size()), before, oldEnd, point(source, start + text.size())});
  assert(h.parse(input(source)));
}
int main() {
  for (const char* language : {"javascript", "typescript", "tsx", "json", "python", "css", "markdown", "mdx"}) {
    std::u16string source = u"const sample = console.log(42);\n";
    TreeSitterHighlighter h(language);
    assert(h.parse(input(source)));
    std::atomic_bool stop{true};
    bool threw = false;
    try { h.highlight(0, source.size(), &stop); } catch (const std::runtime_error&) { threw = true; }
    assert(threw);
    stop = false;
    equal(h.highlight(0, source.size(), &stop), h.highlight(0, source.size()));
  }
  {
    std::u16string source = u"console.log(Math.floor(42));\n";
    TreeSitterHighlighter h("javascript");
    std::atomic_bool stop{false};
    bool querying = false;
    assert(h.parse({static_cast<uint32_t>(source.size()), [&](uint32_t offset) {
      if (querying) stop = true; // Cancellation while evaluating a predicate.
      return std::u16string_view(source).substr(offset);
    }}));
    querying = true;
    bool threw = false;
    try { h.highlight(0, source.size(), &stop); } catch (const std::runtime_error&) { threw = true; }
    assert(threw);
    querying = false; stop = false;
    TreeSitterHighlighter fresh("javascript"); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size(), &stop), fresh.highlight(0, source.size()));
  }
  struct Fixture { const char* language; const char* scope; std::u16string source, needle, insertion; const char* capture; };
  const std::vector<Fixture> fixtures{
    {"javascript", "source.js", u"const item = <View title='hello'>Hi</View>;\n", u"View", u"/* 👋\r\n multiline */\n", "tag"},
    {"jsx", "source.js", u"export const Example = () => <View />;\n", u"View", u"// inserted\n", "tag"},
    {"js", "source.js", u"function greeting() { return 'hi'; }\n", u"return", u"/* new */\n", "keyword"},
    {"JSONC", "source.json", u"{\n// comment\n\"value\": 42, \"enabled\": true\n}\n", u"comment", u"// 👋\r\n", "comment"},
    {"jsonl", "source.json", u"{\"one\": 1}\n{\"two\": 2}\n", u"2", u"\n", "number"},
    {"css", "source.css", u".item { color: #fff; width: 12px; }\n", u"12", u"/* 👋\r\n new */\n", "number"},
    {"python", "source.python", u"def greeting(name):\n    return f'hello {name}'\n", u"return", u"# 👋\r\n", "keyword"},
    {"py", "source.python", u"class Example:\n    value = 42\n", u"42", u"# new\n", "number"},
    {"ts", "source.ts", u"const count: number = 42;\n", u"42", u"// new\n", "number"},
    {"TypeScriptReact", "source.tsx", u"const view = <View />;\n", u"View", u"// new\n", "tag"},
  };
  for (const auto& fixture : fixtures) {
    assert(TreeSitterHighlighter::supports(fixture.language));
    TreeSitterHighlighter h(fixture.language);
    auto source = fixture.source;
    assert(h.rootScope() == fixture.scope && h.parse(input(source, 3)));
    const auto original = h.highlight(0, source.size());
    bool found = false;
    for (const auto& span : original) if (span.start <= source.find(fixture.needle) && span.start + span.length > source.find(fixture.needle))
      found = span.capture == fixture.capture;
    if (!found) std::cerr << "Missing " << fixture.capture << " capture in " << fixture.language << '\n';
    assert(found);
    for (const auto offset : {size_t(0), source.size() / 2, source.size()}) {
      replace(h, source, offset, 0, fixture.insertion);
      TreeSitterHighlighter fresh(fixture.language); assert(fresh.parse(input(source, 5)));
      equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
      // A viewport query must agree with clipping the complete result.
      const uint32_t from = source.size() / 3, to = source.size() * 2 / 3;
      std::vector<TreeSitterSpan> clipped;
      for (auto span : h.highlight(0, source.size())) {
        const auto end = std::min(to, span.start + span.length);
        span.start = std::max(from, span.start);
        if (span.start < end) { span.length = end - span.start; clipped.push_back(span); }
      }
      equal(clipped, h.highlight(from, to));
      replace(h, source, offset, fixture.insertion.size(), u"");
      equal(original, h.highlight(0, source.size()));
    }
  }
  assert(!TreeSitterHighlighter::supports("json5")); // Not an alias for the JSON grammar.
  assert(TreeSitterHighlighter::themeScope("keyword.repeat") == "keyword.control");
  assert(TreeSitterHighlighter::themeScope("escape") == "constant.character.escape");
  assert(TreeSitterHighlighter::themeScope("property") == "variable.other.property");
  assert(TreeSitterHighlighter::themeScope("function.builtin") == "support.function");
  assert(TreeSitterHighlighter::themeScope("markup.heading.1") == "markup.heading");
  assert(TreeSitterHighlighter::themeScope("diff.plus") == "markup.inserted");
  assert(TreeSitterHighlighter::themeScope("diff.minus") == "markup.deleted");
  assert(TreeSitterHighlighter::themeScope("conditional") == "keyword.control");
  assert(TreeSitterHighlighter::themeScope("method") == "entity.name.function");
  assert(TreeSitterHighlighter::themeScope("variable.member") == "variable.other.property");
  assert(TreeSitterHighlighter::themeScope("embedded").empty());
  assert(TreeSitterHighlighter::themeScope("keywordish").empty());
  struct BindingFixture { std::u16string source; bool builtin; };
  for (const auto& language : {"javascript", "typescript", "tsx"}) {
    const std::vector<BindingFixture> bindings{
      {u"const f = console => console.log('x');", false},
      {u"try {} catch (console) { console.log('x'); }", false},
      {u"import { console as other } from 'x'; console.log('x');", true},
      {u"import { other as console } from 'x'; console.log('x');", false},
      {u"import * as console from 'x'; console.log('x');", false},
      {u"const { console: other } = value; console.log('x');", true},
      {u"const { other: console } = value; console.log('x');", false},
      {u"const { console = fallback } = value; console.log('x');", false},
      {u"const other = console; console.log('x');", true},
      {u"function f(other = console) { console.log('x'); }", true},
      {u"function f() { if (true) { var console = {}; } console.log('x'); }", false},
      {u"function f() { if (true) { let console = {}; } console.log('x'); }", true},
      {u"function f() { function nested() { var console; } console.log('x'); }", true},
      {u"const f = function console() { console.log('x'); };", false},
      {u"class console {} console.log('x');", false},
      {u"for (const console of items) { console.log('x'); }", false},
      {u"for (const console of items) {} console.log('x');", true},
      {u"for (var console of items) {} console.log('x');", false},
    };
    for (const auto& fixture : bindings) {
      TreeSitterHighlighter h(language); assert(h.parse(input(fixture.source)));
      const auto offset = fixture.source.rfind(u"console.log");
      bool builtin = false;
      for (const auto& span : h.highlight(offset, fixture.source.size())) if (span.start == offset) builtin = span.capture == "variable.builtin";
      if (builtin != fixture.builtin) std::cerr << "Binding mismatch in " << language << ": " << std::string(fixture.source.begin(), fixture.source.end()) << '\n';
      assert(builtin == fixture.builtin);
    }
  }
  for (const auto& declaration : {u"const console = 1;", u"export const console = 1;", u"function console() {}", u"class console {}", u"for (var console of []) {}"}) {
    std::u16string source = std::u16string(declaration) + u"\nconsole.log('later');\n";
    TreeSitterHighlighter h("typescript"); assert(h.parse(input(source)));
    replace(h, source, source.find(u"console"), 7, u"another");
    const auto invalidated = h.invalidatedRange();
    assert(invalidated.first == 0 && invalidated.second == source.size());
    const auto spans = h.highlight(0, source.size());
    bool builtin = false;
    for (const auto& span : spans) if (span.start == source.find(u"console")) builtin = span.capture == "variable.builtin";
    assert(builtin);
  }
  {
    std::u16string source = u"const console = 42;\nconsole.log('x');";
    TreeSitterHighlighter h("javascript"); assert(h.parse(input(source)));
    replace(h, source, 0, source.find(u'\n') + 1, u"");
    assert(h.invalidatedRange().first == 0 && h.invalidatedRange().second == source.size());
    TreeSitterHighlighter fresh("javascript"); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
  }
  {
    const std::u16string source = u"const lower = 1; const Upper = 2; const ALL_CAPS = 3; console.log(lower); require('x');\nfunction demo(console: any, require: any) { console.log(lower); require('x'); }\n";
    TreeSitterHighlighter h("typescript"); assert(h.parse(input(source)));
    const auto spans = h.highlight(0, source.size());
    const auto captureAt = [&](size_t offset) -> std::string {
      for (const auto& span : spans) if (span.start <= offset && offset < span.start + span.length) return span.capture;
      return "";
    };
    assert(captureAt(source.find(u"lower")) == "variable");
    assert(captureAt(source.find(u"Upper")) == "type");
    assert(captureAt(source.find(u"console.log")) == "variable.builtin");
    assert(captureAt(source.find(u"require('x')")) == "function.builtin");
    assert(captureAt(source.rfind(u"console.log")) != "variable.builtin");
    assert(captureAt(source.rfind(u"require('x')")) != "function.builtin");
  }
  for (const std::string language : {"typescript", "tsx"}) {
    TreeSitterHighlighter h(language);
    std::u16string source = u"const emoji = '👩🏽‍💻';\r\n/* multi\nline */\nfunction greet(name: string) { return `hi ${name}`; }\n";
    if (language == "tsx") source += u"const view = <View title={emoji}>Hello</View>;\n";
    assert(h.parse(input(source, 7))); // force chunks across surrogate pairs/CRLF
    const auto original = h.highlight(0, source.size());
    bool keyword = false, parameter = false, tag = false;
    for (const auto& s : original) {
      keyword |= s.capture == "keyword" && source.substr(s.start, s.length) == u"const";
      parameter |= s.capture == "variable.parameter" && source.substr(s.start, s.length) == u"name";
      tag |= s.capture == "tag" && source.substr(s.start, s.length) == u"View";
      assert(s.start + s.length <= source.size());
    }
    assert(keyword && parameter && (language != "tsx" || tag));
    const auto start = static_cast<uint32_t>(source.find(u"function"));
    for (const auto& span : h.highlight(start, start + 8)) assert(span.start >= start && span.start + span.length <= start + 8);
    const std::u16string prefix = u"// new 👋\r\n";
    replace(h, source, 0, 0, prefix);
    TreeSitterHighlighter fresh(language); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
    replace(h, source, 0, prefix.size(), u""); // undo, multiline + UTF-16 offsets
    equal(original, h.highlight(0, source.size()));
    replace(h, source, 0, 0, u"/*"); // incomplete syntax while typing
    fresh.reset(); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
    std::atomic_bool cancel{true};
    assert(!h.parse(input(source), &cancel));
    bool staleRejected = false;
    try { h.highlight(0, source.size()); } catch (const std::logic_error&) { staleRejected = true; }
    assert(staleRejected);
    cancel = false; assert(h.parse(input(source), &cancel));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
    h.reset(); source.clear(); assert(h.parse(input(source))); assert(h.highlight(0, 0).empty());
    source = u"const x = 1;"; h.reset();
    bool threw = false;
    try { h.parse({12, [](uint32_t) -> std::u16string_view { throw std::runtime_error("read error"); }}); }
    catch (const std::runtime_error&) { threw = true; }
    assert(threw && h.parse(input(source)));
  }
  assert(TreeSitterHighlighter::supports("mdx"));
  {
    std::u16string source;
    for (int i = 0; i < 10000; ++i) source += u"const value = 42;\n";
    TreeSitterHighlighter sliced("typescript"), fresh("typescript");
    const auto snapshot = input(source);
    size_t slices = 0;
    while (!sliced.parseSlice(snapshot, 0.01)) { assert(++slices < 100000); }
    assert(slices > 0 && fresh.parse(snapshot));
    equal(sliced.highlight(0, 1000), fresh.highlight(0, 1000));
    sliced.reset();
    assert(!sliced.parseSlice(snapshot, 0.01));
    std::atomic_bool cancel{true};
    assert(!sliced.parseSlice(snapshot, 0.01, &cancel));
    source = u"const next = true;"; sliced.reset();
    assert(sliced.parse(input(source)));
  }
  // The existing native treap can supply bounded chunks without flattening the
  // document. This fixture is worker-owned; live UI mutation is not permitted.
  legend::source::SourceDocument document(u"const emoji = '👋';\r\nconst value: number = 42;\n");
  TreeSitterHighlighter fromDocument("typescript");
  std::u16string chunk;
  assert(fromDocument.parse({static_cast<uint32_t>(document.length()), [&](uint32_t offset) {
    chunk = document.slice(offset, std::min<size_t>(7, document.length() - offset));
    return std::u16string_view(chunk);
  }}));
  assert(!fromDocument.highlight(0, document.length()).empty());
  // Cancellation during input (not only before parsing) must not expose a
  // partially built tree or poison the next document.
  TreeSitterHighlighter cancelled("typescript");
  std::u16string large;
  for (int i = 0; i < 10000; ++i) large += u"const x = 42;\n";
  std::atomic_bool stop{false};
  TreeSitterInput interrupted{static_cast<uint32_t>(large.size()), [&](uint32_t offset) {
    if (offset > 4096) stop = true;
    return std::u16string_view(large).substr(offset, 128);
  }};
  assert(!cancelled.parse(interrupted, &stop));
  stop = false; assert(cancelled.parse(input(large), &stop));
  assert(!cancelled.highlight(large.size() - 14, large.size()).empty());
  // Random edits must match a fresh parse, not merely have plausible colors.
  std::u16string source = u"const value = 42;\nconst other = `hi ${value}`;\n";
  TreeSitterHighlighter incremental("typescript"); assert(incremental.parse(input(source)));
  uint32_t random = 12345;
  for (int i = 0; i < 100; ++i) {
    random = random * 1664525u + 1013904223u;
    const uint32_t start = random % (source.size() + 1);
    const uint32_t count = std::min<uint32_t>(random % 4, source.size() - start);
    const std::u16string insertion = i % 3 == 0 ? u"\n/*" : i % 3 == 1 ? u"x" : u"";
    replace(incremental, source, start, count, insertion);
    TreeSitterHighlighter fresh("typescript"); assert(fresh.parse(input(source)));
    equal(incremental.highlight(0, source.size()), fresh.highlight(0, source.size()));
  }
  std::cout << "Tree-sitter: six grammars, aliases, theme scopes, lexical bindings, UTF-16/CRLF, edits/undo, viewport consistency, cancellation and input errors passed\n";
}

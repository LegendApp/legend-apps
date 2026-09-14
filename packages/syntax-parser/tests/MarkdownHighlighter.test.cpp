#include "../cpp/TreeSitterHighlighter.hpp"
#include "../../source-editor/cpp/SourceFileReader.hpp"
#include <cassert>
#include <iostream>
#include <chrono>

using namespace margelo::nitro::legendapps::syntaxparser;
static TreeSitterInput input(const std::u16string& source) {
  return {static_cast<uint32_t>(source.size()), [&source](uint32_t offset) { return std::u16string_view(source).substr(offset, 7); }};
}
static TreeSitterPoint point(const std::u16string& source, uint32_t offset) {
  TreeSitterPoint p{};
  for (uint32_t i = 0; i < offset; ++i) { if (source[i] == '\n') { ++p.row; p.column = 0; } else ++p.column; }
  return p;
}
static void replace(TreeSitterHighlighter& h, std::u16string& source, uint32_t at, uint32_t removed, const std::u16string& inserted) {
  const auto before = point(source, at), oldEnd = point(source, at + removed);
  source.replace(at, removed, inserted);
  h.edit({at, at + removed, at + static_cast<uint32_t>(inserted.size()), before, oldEnd, point(source, at + inserted.size())});
  assert(h.parse(input(source)));
}
static void equal(const std::vector<TreeSitterSpan>& a, const std::vector<TreeSitterSpan>& b) {
  assert(a.size() == b.size());
  for (size_t i = 0; i < a.size(); ++i) assert(a[i].start == b[i].start && a[i].length == b[i].length && a[i].captureId == b[i].captureId);
}
static void expect(TreeSitterHighlighter& h, const std::u16string& source, const std::u16string& text, const char* capture, const char* scope = nullptr) {
  const auto at = source.find(text); assert(at != std::u16string::npos);
  const auto spans = h.highlight(at, at + text.size());
  for (const auto& span : spans) if (span.start == at && span.capture == capture) {
    assert(h.captures()[span.captureId] == capture);
    if (scope) assert(TreeSitterHighlighter::rootScopeForCapture(span.captureId) == scope);
    return;
  }
  std::cerr << "Missing " << capture << " for " << std::string(text.begin(), text.end()) << ":";
  for (const auto& span : spans) std::cerr << " " << span.capture;
  std::cerr << '\n'; assert(false);
}
int main(int argc, char** argv) {
  for (const auto* language : {"markdown", "mdx"}) for (const std::u16string prefix : {u"", u"> "}) {
    // A single embedded construct can span hundreds of included ranges. Query
    // it once, but never color the excluded quote/list continuation markers.
    std::u16string source = prefix + u"```typescript\r\n" + prefix + u"/* a long comment\r\n";
    for (int i = 0; i < 330; ++i) source += prefix + u"continued 😀\r\n";
    source += prefix + u"end */\r\n" + prefix + u"const value = 42;\r\n" + prefix + u"```\r\n\r\n"
      + prefix + u"**strong\r\n" + prefix + u"across lines**\r\n";
    TreeSitterHighlighter h(language); assert(h.parse(input(source)));
    auto original = h.highlight(0, source.size());
    for (uint32_t from = 0; from < source.size(); from += 101) {
      const auto to = std::min<uint32_t>(source.size(), from + 211);
      std::vector<TreeSitterSpan> clipped;
      for (auto span : original) {
        const auto end = std::min(to, span.start + span.length);
        span.start = std::max(from, span.start);
        if (span.start < end) { span.length = end - span.start; clipped.push_back(span); }
      }
      equal(clipped, h.highlight(from, to));
    }
    for (const auto& span : original) if (span.capture == "comment" || span.capture == "text.strong")
      assert(source.substr(span.start, span.length).find(u"> ") == std::u16string::npos);
    const auto at = source.find(u"continued");
    replace(h, source, at, 9, u"*/ const changed = 2; /*");
    TreeSitterHighlighter fresh(language); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
  }
  for (const char* language : {"markdown", "md", "mdx"}) {
    TreeSitterHighlighter h(language);
    std::u16string source = u"---\r\ntitle: Demo\r\nactive: true\r\n---\r\n\r\n# Heading 👋\r\n\r\nPlain **bold** and *italic* and `inlineCode`.\r\n\r\n[docs](https://example.com)\r\n\r\n> Quoted **strong** text.\r\n\r\n```tsx title=demo\r\nconst demo = <View opacity={0.5} />;\r\n```\r\n\r\n~~~python\r\ndef greeting():\r\n    return 42\r\n~~~\r\n\r\n```unknown\r\nconst notCode = 1;\r\n```\r\n";
    assert(h.parse(input(source)));
    expect(h, source, u"Heading", "text.title");
    expect(h, source, u"bold", "text.strong");
    expect(h, source, u"italic", "text.emphasis");
    expect(h, source, u"inlineCode", "text.literal");
    expect(h, source, u"https://example.com", "text.uri");
    expect(h, source, u"title", "property", "source.yaml");
    expect(h, source, u"true", "boolean", "source.yaml");
    expect(h, source, u"const demo", "keyword", "source.tsx");
    expect(h, source, u"View", "tag", "source.tsx");
    expect(h, source, u"return", "keyword", "source.python");
    expect(h, source, u"notCode", "none");
    const auto original = h.highlight(0, source.size());
    // Warm caches, then shift ranges and change language/content/boundaries.
    for (const auto& text : {u"\n👋\n", u"\n```\n", u"/*", u"**"}) {
      const auto at = source.find(u"const demo");
      replace(h, source, at, 0, text);
      TreeSitterHighlighter fresh(language); assert(fresh.parse(input(source)));
      equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
      replace(h, source, at, std::u16string_view(text).size(), u"");
      equal(original, h.highlight(0, source.size()));
    }
    replace(h, source, 0, 0, u"\n");
    TreeSitterHighlighter fresh(language); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
    replace(h, source, 0, 1, u"");
    equal(original, h.highlight(0, source.size()));
    // Windowed and complete results agree at every offset, including gaps.
    for (uint32_t from = 0; from < source.size(); from += 17) {
      const auto to = std::min<uint32_t>(from + 43, source.size());
      std::vector<TreeSitterSpan> clipped;
      for (auto span : original) {
        const auto end = std::min(to, span.start + span.length); span.start = std::max(from, span.start);
        if (span.start < end) { span.length = end - span.start; clipped.push_back(span); }
      }
      equal(clipped, h.highlight(from, to));
    }
    source += u"\n<!-- Notes with {braces} and <View />\nmultiline 👋 -->\n\nText <!-- inline notes --> suffix.\n\n| Name | Value |\n| --- | --- |\n| **tableBold** | `tableCode` |\n";
    h.reset(); assert(h.parse(input(source)));
    expect(h, source, u"Notes with", "comment");
    expect(h, source, u"inline notes", "comment");
    expect(h, source, u"tableBold", "text.strong");
    expect(h, source, u"tableCode", "text.literal");
    const auto fence = source.find(u"tsx title");
    replace(h, source, fence, 3, u"json");
    TreeSitterHighlighter different(language); assert(different.parse(input(source)));
    equal(h.highlight(0, source.size()), different.highlight(0, source.size()));
  }
  {
    TreeSitterHighlighter h("markdown");
    std::u16string source = u"# First\n\n**visible** text.\n\n";
    for (int i = 0; i < 5000; ++i) source += u"A paragraph with `code`.\n\n";
    const auto fence = source.size();
    source += u"```tsx\nconst hidden = <View />;\n```\n";
    size_t furthest = 0;
    const TreeSitterInput reader{static_cast<uint32_t>(source.size()), [&](uint32_t offset) {
      furthest = std::max<size_t>(furthest, offset);
      return std::u16string_view(source).substr(offset, 32);
    }};
    assert(h.parse(reader)); furthest = 0;
    h.highlight(0, 26);
    assert(furthest < 100); // No eager tail/embedded parsing for a first-window query.
    h.highlight(fence, source.size());
    assert(furthest >= fence);
    // Exercise cache eviction and bounded edit history, not only tiny fixtures.
    h.highlight(0, source.size());
    for (int i = 0; i < 270; ++i) replace(h, source, 0, 0, u" ");
    TreeSitterHighlighter fresh("markdown"); assert(fresh.parse(input(source)));
    equal(h.highlight(0, 500), fresh.highlight(0, 500));
    std::atomic_bool cancel{true};
    bool stopped = false;
    try { h.highlight(0, 500, &cancel); } catch (const std::runtime_error&) { stopped = true; }
    assert(stopped);
    cancel = false;
    equal(h.highlight(0, 500, &cancel), fresh.highlight(0, 500));
  }
  {
    TreeSitterHighlighter h("mdx");
    std::u16string source = u"import { Card } from './Card';\n\nexport const count = 2;\n\n# Demo\n\nValue {count + 1} and **bold**.\n\n<Card color=\"red\" style={{ opacity: 0.5 }} />\n\n{/* speaker notes */}\n\n{[1, 2].map(value => <Text key={value}>{value}</Text>)}\n";
    assert(h.parse(input(source)));
    expect(h, source, u"import", "keyword");
    expect(h, source, u"'./Card'", "string");
    expect(h, source, u"count +", "variable");
    expect(h, source, u"bold", "text.strong");
    expect(h, source, u"Card color", "tag");
    expect(h, source, u"color=", "attribute");
    expect(h, source, u"0.5", "number");
    expect(h, source, u"speaker notes", "comment");
    expect(h, source, u"Text key", "tag");
    auto original = h.highlight(0, source.size());
    const auto at = source.find(u"count +");
    replace(h, source, at, 5, u"{nested: `👋 ${count}`} ");
    TreeSitterHighlighter fresh("mdx"); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
  }
  {
    std::u16string source = u"export const console = {};\n\n# Later\n\n{console.log('x')}\n";
    TreeSitterHighlighter h("mdx"); assert(h.parse(input(source)));
    expect(h, source, u"console.log", "variable");
    replace(h, source, source.find(u"console"), 7, u"renamed");
    assert(h.invalidatedRange().first == 0 && h.invalidatedRange().second == source.size());
    expect(h, source, u"console.log", "variable.builtin");
  }
  {
    std::u16string source = u"# First\n\n```tsx\n";
    for (int i = 0; i < 3000; ++i) source += u"const view = <View />;\n";
    source += u"```\n";
    std::atomic_bool cancel{false}; bool interrupt = false;
    TreeSitterInput reader{static_cast<uint32_t>(source.size()), [&](uint32_t offset) {
      if (interrupt && offset > 1000) cancel = true;
      return std::u16string_view(source).substr(offset, 128);
    }};
    TreeSitterHighlighter h("mdx"); assert(h.parse(reader));
    interrupt = true; bool stopped = false;
    try { h.highlight(10, source.size(), &cancel); } catch (const std::runtime_error&) { stopped = true; }
    assert(stopped && cancel);
    interrupt = false; cancel = false;
    TreeSitterHighlighter fresh("mdx"); assert(fresh.parse(input(source)));
    equal(h.highlight(10, source.size(), &cancel), fresh.highlight(10, source.size()));
  }
  {
    // Hundreds of cheap inline regions must not evict the preceding code tree.
    std::u16string source = u"```typescript\nconst preserved = 42;\n```\n\n";
    for (int i = 0; i < 400; ++i) source += u"Paragraph with **bold**.\n\n";
    TreeSitterHighlighter h("markdown"); assert(h.parse(input(source)));
    const auto original = h.highlight(0, source.size());
    assert(h.codeInjectionParseCount() == 1);
    equal(original, h.highlight(0, source.size()));
    equal(original, h.highlight(0, source.size()));
    assert(h.codeInjectionParseCount() == 1);
    replace(h, source, source.find(u"42"), 2, u"'changed'");
    TreeSitterHighlighter fresh("markdown"); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
    assert(h.codeInjectionParseCount() > 1);
    h.reset(); assert(h.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
  }
  {
    // Every region is unique. Recycled parsers must discard their previous
    // trees/ranges while preserving the output of independently parsed text.
    std::u16string source;
    std::vector<TreeSitterSpan> expected;
    for (int i = 0; i < 600; ++i) {
      const auto number = std::to_string(i);
      const std::u16string id(number.begin(), number.end());
      const auto paragraph = i % 3 == 0 ? u"**Entry " + id + u"** and *emphasis*."
        : i % 3 == 1 ? u"Code `value" + id + u"` with 👋."
        : u"[Link " + id + u"](https://example.com/" + id + u")";
      TreeSitterHighlighter independent("markdown-inline"); assert(independent.parse(input(paragraph)));
      for (auto span : independent.highlight(0, paragraph.size())) {
        span.start += source.size(); expected.push_back(std::move(span));
      }
      source += paragraph + u"\n\n";
    }
    TreeSitterHighlighter h("markdown"); assert(h.parse(input(source)));
    equal(expected, h.highlight(0, source.size()));
    equal(expected, h.highlight(0, source.size()));
    replace(h, source, source.size() / 2, 0, u"\nChanged `unique` paragraph.\n\n");
    TreeSitterHighlighter fresh("markdown"); assert(fresh.parse(input(source)));
    equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
  }
  for (int i = 1; i < argc; ++i) {
    legend::source::SourceFileReader file(argv[i]);
    std::u16string source;
    while (!file.done()) source += file.next();
    const char* language = std::string_view(argv[i]).ends_with(".mdx") ? "mdx" : "markdown";
    const auto began = std::chrono::steady_clock::now();
    TreeSitterHighlighter h(language); assert(h.parse(input(source)));
    const auto original = h.highlight(0, source.size());
    const auto elapsed = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - began).count();
    assert(!original.empty());
    for (const auto at : {size_t(0), source.size() / 2, source.size()}) {
      replace(h, source, at, 0, u"\n<!-- inserted 👋 -->\n");
      TreeSitterHighlighter fresh(language); assert(fresh.parse(input(source)));
      equal(h.highlight(0, source.size()), fresh.highlight(0, source.size()));
      replace(h, source, at, std::u16string_view(u"\n<!-- inserted 👋 -->\n").size(), u"");
      equal(original, h.highlight(0, source.size()));
    }
    std::cout << "Real file: " << argv[i] << " UTF16=" << source.size() << " spans=" << original.size() << " native_parse_and_highlight_ms=" << elapsed << '\n';
  }
  assert(TreeSitterHighlighter::themeScope("text.strong") == "markup.bold");
  assert(TreeSitterHighlighter::themeScope("text.emphasis") == "markup.italic");
  std::cout << "Markdown/MDX: inline syntax, frontmatter, fences, JSX/JS, scoped captures, edits/undo and viewport consistency passed\n";
}

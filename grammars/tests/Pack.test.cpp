#include "../../packages/syntax-parser/cpp/TreeSitterHighlighter.hpp"
#include <dlfcn.h>
#include <cassert>
#include <iostream>
#include <stdexcept>
#include <map>
using namespace margelo::nitro::legendapps::syntaxparser;
int main(int argc, char** argv) {
  assert(argc == 2);
  void* library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (!library) throw std::runtime_error(dlerror());
  auto factory = reinterpret_cast<LegendGrammarPackFactory>(dlsym(library, "legend_grammar_pack_v1"));
  if (!factory) throw std::runtime_error("Missing pack export");
  auto pack = *factory();
  const std::string language = pack.name;
  // A unique ID ensures this uses the downloaded parser, never a bundled one.
  const std::string name = std::string("pack-test-") + pack.name;
  pack.name = name.c_str();
  TreeSitterHighlighter::registerPack(pack);
  TreeSitterHighlighter highlighter(name);
  const std::map<std::string, std::u16string> samples = {
    {"javascript", u"const view = <View value={42} />;\n"}, {"typescript", u"const value: number = 42;\n"},
    {"tsx", u"const view = <View value={42} />;\n"}, {"json", u"{\"value\": 42, \"ok\": true}\n"},
    {"css", u".item { color: red; margin: 12px; }\n"}, {"python", u"def greet():\n    return 42\n"},
    {"markdown", u"# Heading\n\n**bold** and `code`\n"}, {"markdown-inline", u"**bold** and `code`"},
    {"yaml", u"name: example\ncount: 42\n"}, {"mdx", u"import View from './View';\n\n# Heading\n\n<View value={42} />\n"},
    {"bash", u"#!/bin/bash\necho \"hello\"\n"}, {"c", u"int main(void) { return 42; }\n"},
    {"cpp", u"class Example { public: int value = 42; };\n"}, {"go", u"package main\nfunc main() { println(42) }\n"},
    {"rust", u"fn main() { let value = 42; }\n"}, {"java", u"class Example { int value = 42; }\n"},
    {"ruby", u"def greet\n  puts 'hello'\nend\n"}, {"html", u"<div class=\"example\">Hello</div>\n"},
    {"toml", u"[example]\nvalue = 42\n"}, {"lua", u"print('hello')\ncustomFunction()\n"},
    {"csharp", u"class Example { public int Value = 42; }\n"}, {"swift", u"struct Example { let value: Int = 42 }\n"},
    {"kotlin", u"fun main() { println(42) }\n"}, {"objc", u"@interface Example : NSObject\n@property int value;\n@end\n"},
    {"xml", u"<?xml version=\"1.0\"?><example value=\"42\" />\n"}, {"dockerfile", u"FROM ubuntu:24.04\nRUN echo hello\n"},
    {"json5", u"{ unquoted: 'hello', trailing: 42, }\n"}, {"scss", u"$color: red; .item { color: $color; }\n"},
  };
  std::u16string text = samples.at(language);
  TreeSitterInput input{static_cast<uint32_t>(text.size()), [&](uint32_t start) { return std::u16string_view(text).substr(start); }};
  assert(highlighter.parse(input));
  auto spans = highlighter.highlight(0, input.length);
  assert(!spans.empty());
  for (const auto& span : spans) {
    assert(span.start + span.length <= text.size());
    assert(TreeSitterHighlighter::rootScopeForCapture(span.captureId) == pack.scope);
  }
  assert(!highlighter.captures().empty());
  if (language == "lua") {
    bool builtin = false;
    for (const auto& span : spans) if (span.start == 0 && span.capture == "function.builtin") builtin = true;
    assert(builtin); // Exercises the newly supported #any-of? predicate.
  }
  highlighter.edit({0, 0, 1, {0, 0}, {0, 0}, {1, 0}});
  text.insert(0, u"\n"); input.length++;
  assert(highlighter.parse(input));
  highlighter.edit({0, 1, 0, {0, 0}, {1, 0}, {0, 0}});
  text.erase(0, 1); input.length--;
  assert(highlighter.parse(input));
  const auto restored = highlighter.highlight(0, input.length);
  assert(restored.size() == spans.size());
  for (size_t i = 0; i < spans.size(); ++i) assert(restored[i].start == spans[i].start && restored[i].length == spans[i].length && restored[i].capture == spans[i].capture);
  pack.abi = 999;
  bool rejected = false;
  try { TreeSitterHighlighter::registerPack(pack); } catch (...) { rejected = true; }
  assert(rejected);
  std::cout << name << ": dynamic query, representative source, edit/undo, capture scopes and ABI rejection passed\n";
  // Handles intentionally live until exit, just like production registry entries.
}

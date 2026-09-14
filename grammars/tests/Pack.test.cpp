#include "../../packages/syntax-parser/cpp/TreeSitterHighlighter.hpp"
#include <dlfcn.h>
#include <cassert>
#include <iostream>
#include <stdexcept>
#include <map>
#include <fstream>
#include <iterator>
#include "../../packages/syntax-parser/vendor/tree-sitter/Symbols.h"
#include "../../packages/syntax-parser/vendor/tree-sitter/runtime/include/tree_sitter/api.h"
using namespace margelo::nitro::legendapps::syntaxparser;
int main(int argc, char** argv) {
  assert(argc == 2 || argc >= 5);
  assert(TreeSitterHighlighter::captureCount() == 0);
  for (const auto* name : {"javascript", "typescript", "tsx", "json", "css", "python", "markdown", "markdown-inline", "yaml", "mdx"})
    assert(!TreeSitterHighlighter::supports(name));
  void* library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
  if (!library) throw std::runtime_error(dlerror());
  auto factory = reinterpret_cast<LegendGrammarPackFactory>(dlsym(library, "legend_grammar_pack_v1"));
  if (!factory) throw std::runtime_error("Missing pack export");
  auto pack = *factory();
  const std::string language = pack.name;
  const std::string name = pack.name;
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
  std::u16string text;
  if (argc >= 5) {
    std::ifstream file(argv[2]);
    assert(file.good());
    const std::string source((std::istreambuf_iterator<char>(file)), {});
    text.assign(source.begin(), source.end()); // Fixtures deliberately use ASCII.
    auto* parser = ts_parser_new();
    assert(ts_parser_set_language(parser, pack.language()));
    auto* tree = ts_parser_parse_string_encoding(parser, nullptr, reinterpret_cast<const char*>(text.data()), text.size() * 2, TSInputEncodingUTF16LE);
    if (ts_node_has_error(ts_tree_root_node(tree))) throw std::runtime_error("Fixture has syntax errors: " + language);
    ts_tree_delete(tree); ts_parser_delete(parser);
  } else text = samples.at(language);
  TreeSitterInput input{static_cast<uint32_t>(text.size()), [&](uint32_t start) { return std::u16string_view(text).substr(start); }};
  assert(highlighter.parse(input));
  auto spans = highlighter.highlight(0, input.length);
  assert(!spans.empty());
  for (const auto& span : spans) {
    assert(span.start + span.length <= text.size());
    assert(TreeSitterHighlighter::rootScopeForCapture(span.captureId) == pack.scope);
  }
  assert(!highlighter.captures().empty());
  if (argc >= 5) {
    const std::string token(argv[3]), capture(argv[4]);
    const auto position = text.find(std::u16string(token.begin(), token.end()));
    assert(position != std::u16string::npos);
    bool highlighted = false;
    for (const auto& span : spans) if (span.start <= position && span.start + span.length > position
      && span.capture.starts_with(capture)) highlighted = true;
    if (!highlighted) {
      for (const auto& span : spans) std::cerr << span.start << " " << span.capture << "\n";
      throw std::runtime_error(language + ": expected " + token + " to be " + capture);
    }
  }
  if (language == "lua") {
    bool builtin = false;
    for (const auto& span : spans) if (span.start == 0 && span.capture == "function.builtin") builtin = true;
    assert(builtin); // Exercises the newly supported #any-of? predicate.
  }
  if (language == "wgsl") {
    for (const auto& token : {u"// Animated waves", u"/* Constant-speed motion */"}) {
      const auto at = text.find(token);
      bool found = false;
      for (const auto& span : spans) if (span.start == at && span.capture == "comment") found = true;
      assert(found);
    }
  }
  if (language == "vue" || language == "svelte" || language == "astro") {
    assert(!highlighter.missingLanguages().empty());
    for (int i = 5; i < argc; ++i) {
      auto* dependency = dlopen(argv[i], RTLD_NOW | RTLD_LOCAL);
      if (!dependency) throw std::runtime_error(dlerror());
      auto dependencyFactory = reinterpret_cast<LegendGrammarPackFactory>(dlsym(dependency, "legend_grammar_pack_v1"));
      assert(dependencyFactory);
      TreeSitterHighlighter::registerPack(*dependencyFactory());
    }
    spans = highlighter.highlight(0, input.length);
    assert(highlighter.missingLanguages().empty());
    for (const auto& [token, scope] : std::map<std::u16string, std::string>{
      {u"string", "source.ts"}, {u"color", "source.css"}, {u"toUpperCase", "source.ts"},
    }) {
      const auto at = text.find(token);
      assert(at != std::u16string::npos);
      bool found = false;
      for (const auto& span : spans) if (span.start <= at && span.start + span.length > at
        && TreeSitterHighlighter::rootScopeForCapture(span.captureId) == scope) found = true;
      if (!found) throw std::runtime_error(language + ": missing embedded " + scope);
    }
    // A viewport inside the final style block must not require a whole-file query.
    const auto at = static_cast<uint32_t>(text.find(u"color"));
    const auto viewport = highlighter.highlight(at, at + 5);
    assert(!viewport.empty());
    for (const auto& span : viewport) assert(span.start >= at && span.start + span.length <= at + 5);
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

// Include the implementation to exercise its private JSON/rule matcher without
// adding a test-only API or depending on an installed application bundle.
#include "../cpp/SyntaxTheme.mm"
#include <cassert>
#include <iostream>
using namespace margelo::nitro::legendapps::syntaxparser;
int main(int argc, char **argv) {
  assert(argc == 2);
  @autoreleasepool {
    NSString *directory = [NSString stringWithUTF8String:argv[1]];
    for (NSString *name in @[@"dark-plus", @"github-light"]) {
      NSData *data = [NSData dataWithContentsOfFile:[directory stringByAppendingPathComponent:[name stringByAppendingString:@".json"]]];
      auto theme = parseTheme(data);
      auto styles = resolveTheme(theme, {{}, {"source.ts", "keyword.control"}, {"source.ts", "string.quoted"}, {"text.html.markdown", "markup.bold"}}, 0);
      assert(styles.size() == 4 && styles[0].foreground == theme.foreground);
      assert(styles[1].foreground != theme.foreground);
      assert(styles[2].foreground != theme.foreground);
      assert(styles[3].fontStyle == 2);
      auto tail = resolveTheme(theme, {{}, {"source.ts", "keyword.control"}}, 1);
      assert(tail.size() == 1 && tail[0].id == 1 && tail[0].foreground == styles[1].foreground);
    }
    NSString *json = @"{\"colors\":{\"editor.foreground\":\"#111111\"},\"tokenColors\":["
      "{\"scope\":\"keyword\",\"settings\":{\"foreground\":\"#222222\",\"fontStyle\":\"italic\"}},"
      "{\"scope\":[\"keyword.control\"],\"settings\":{\"foreground\":\"#333333\"}},"
      "{\"scope\":\"source.ts > keyword.control\",\"settings\":{\"foreground\":\"#444444\",\"fontStyle\":\"\"}}]}";
    const auto theme = parseTheme([json dataUsingEncoding:NSUTF8StringEncoding]);
    auto styles = resolveTheme(theme, {{"source.js", "keyword.control"}, {"source.ts", "keyword.control"}, {"source.ts", "meta.inner", "keyword.control"}, {"source.ts", "keywords"}}, 0);
    assert(styles[0].foreground == "#333333" && styles[0].fontStyle == 1);
    assert(styles[1].foreground == "#444444" && styles[1].fontStyle == 0);
    assert(styles[2].foreground == "#333333" && styles[2].fontStyle == 1);
    assert(styles[3].foreground == "#111111");
    assert(resolveTheme(theme, {{}}, 99).empty());
    bool rejected = false;
    try { parseTheme([@"[]" dataUsingEncoding:NSUTF8StringEncoding]); } catch (...) { rejected = true; }
    assert(rejected);
  }
  std::cout << "Syntax themes: bundled colors, font styles, scope specificity, parents, plain gaps and invalid JSON passed\n";
}

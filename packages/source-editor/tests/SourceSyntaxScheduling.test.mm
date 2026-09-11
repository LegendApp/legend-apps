#import "../macos/SourceInputView.h"
#include "../cpp/SourceDocument.hpp"
#include "../../syntax-parser/cpp/IncrementalSyntaxHighlighter.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
#include <sstream>
#include <algorithm>

namespace syntax = margelo::nitro::legendapps::syntaxparser;
static std::shared_ptr<syntax::TextMateHighlighterContext> grammar;
static NSUInteger textMateCreations = 0;

// Use the real native scheduler with explicit test grammar assets, independent
// of the user's installed themes or whether this executable is an app bundle.
@interface LESourceInputView (SchedulingTests)
- (void)recordStartupDraw;
- (std::vector<syntax::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme;
@end
@interface SchedulingInput : LESourceInputView
@end
@implementation SchedulingInput
- (std::vector<syntax::SyntaxStyle>)resolveTreeStyles:(const std::vector<std::vector<std::string>>&)scopes theme:(NSString *)theme {
  std::vector<syntax::SyntaxStyle> styles;
  for (size_t i = 0; i < scopes.size(); ++i) styles.emplace_back(i,
    (scopes[i].back() == "keyword.control" || scopes[i].back() == "markup.heading") ? ([theme isEqualToString:@"light"] ? "#ff0000" : "#0000ff")
      : scopes[i].back() == "constant.numeric" ? "#00ff00" : "#eeeeee", 0);
  return styles;
}
- (std::shared_ptr<syntax::IncrementalSyntaxHighlighter>)createSyntaxHighlighter {
  ++textMateCreations;
  return std::make_shared<syntax::IncrementalSyntaxHighlighter>(grammar);
}
@end

static NSUInteger highlighted(SchedulingInput *input) {
  return [[input valueForKey:@"syntaxNextLine"] unsignedIntegerValue];
}
static void drainFor(NSTimeInterval seconds) {
  [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:seconds]];
}
static void waitFor(bool (^condition)(void)) {
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
  while (!condition() && deadline.timeIntervalSinceNow > 0) drainFor(0.005);
  assert(condition());
}

int main(int argc, char **argv) {
  assert(argc == 2 || argc == 3);
  const std::string root = argv[1];
  auto onig = textmate_oniglib_create();
  auto registry = textmate_registry_create(onig);
  assert(textmate_registry_add_grammar_from_file(registry, (root + "/tm-grammars/grammars/typescript.json").c_str()));
  std::ifstream file(root + "/tm-themes/themes/dark-plus.json");
  std::ostringstream json; json << file.rdbuf();
  assert(textmate_registry_set_theme(registry, json.str().c_str()));
  auto loaded = textmate_registry_load_grammar(registry, "source.ts");
  assert(loaded);
  grammar = std::make_shared<syntax::TextMateHighlighterContext>(onig, registry, loaded, textmate_registry_get_color_map(registry));

  @autoreleasepool {
    [NSApplication sharedApplication];
    {
      SchedulingInput *tree = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      tree.syntaxBackend = @"tree-sitter";
      tree.syntaxHighlightingInBackground = YES;
      tree.onSyntaxError = ^(NSString *error) { if (error.length) std::cerr << error.UTF8String << "\n"; assert(!error.length); };
      NSMutableString *source = [NSMutableString new];
      for (NSUInteger i = 0; i < 10000; ++i) [source appendFormat:@"const sample%lu = %lu;\n", i, i];
      [tree loadSource:source];
      [tree configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
      waitFor(^bool { return [[tree valueForKey:@"treePrefixDone"] boolValue]; });
      assert([[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] <= 128);
      [tree recordStartupDraw];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 600, 24)];
      row.lineIndex = 9000; row.lineId = 9001; row.input = tree;
      [row layout];
      NSAttributedString *text = [row.textLayout valueForKey:@"text"];
      NSColor *keyword = [text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil];
      assert([keyword isEqual:[NSColor colorWithSRGBRed:0 green:0 blue:1 alpha:1]]);
      // Far rows retain colors immediately while a leading structural edit runs.
      tree.undoManager.groupsByEvent = NO;
      [tree.undoManager beginUndoGrouping];
      [tree insertText:@"/*" replacementRange:NSMakeRange(0, 0)];
      [tree.undoManager endUndoGrouping];
      [row layout];
      text = [row.textLayout valueForKey:@"text"];
      assert([[text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil] isEqual:keyword]);
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      [tree.undoManager undo];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert([tree.source isEqualToString:source]);
      [tree configureSyntaxLanguage:@"typescript" theme:@"light" enabled:YES];
      waitFor(^bool {
        [row layout]; NSAttributedString *current = [row.textLayout valueForKey:@"text"];
        return [[current attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil] isEqual:[NSColor colorWithSRGBRed:1 green:0 blue:0 alpha:1]];
      });
      row.input = nil;
      if (argc == 3 && std::string(argv[2]) == "--measure") {
        const auto percentile = [](std::vector<double> values, double p) {
          std::sort(values.begin(), values.end()); return values[std::min(values.size() - 1, static_cast<size_t>(p * values.size()))];
        };
        for (NSUInteger line : {NSUInteger{0}, NSUInteger{5000}, NSUInteger{9999}}) {
          row.lineIndex = line; row.lineId = line + 1; row.input = tree;
          const auto offset = [tree offsetForRow:row] + 6;
          std::vector<double> inputTimes, colorTimes;
          for (int i = 0; i < 50; ++i) {
            [tree.undoManager beginUndoGrouping];
            const auto began = NSProcessInfo.processInfo.systemUptime;
            [tree insertText:@"x" replacementRange:NSMakeRange(offset, 0)];
            inputTimes.push_back((NSProcessInfo.processInfo.systemUptime - began) * 1000);
            [tree.undoManager endUndoGrouping];
            NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10];
            while (![[tree valueForKey:@"treeVisibleRevision"] isEqual:[tree valueForKey:@"treeRevision"]] && deadline.timeIntervalSinceNow > 0) drainFor(0.0001);
            assert(deadline.timeIntervalSinceNow > 0);
            [row layout];
            colorTimes.push_back((NSProcessInfo.processInfo.systemUptime - began) * 1000);
            [tree.undoManager undo];
            waitFor(^bool { return [[tree valueForKey:@"treeVisibleRevision"] isEqual:[tree valueForKey:@"treeRevision"]]; });
          }
          std::cout << "Tree native 10k line=" << line << " input p50/p95/p99=" << percentile(inputTimes, .5) << "/" << percentile(inputTimes, .95) << "/" << percentile(inputTimes, .99)
            << "ms; edit-to-layout=" << percentile(colorTimes, .5) << "/" << percentile(colorTimes, .95) << "/" << percentile(colorTimes, .99) << "ms\n";
          assert([tree.source isEqualToString:source]); row.input = nil;
        }
      }
      // Edits during partial mirroring, CRLF joins, loading completion and reset.
      tree.sourceLoading = YES;
      [tree loadSource:@"const first = 1;\r"];
      [tree recordStartupDraw];
      [tree.undoManager beginUndoGrouping];
      [tree insertText:@"x" replacementRange:NSMakeRange(6, 0)];
      [tree.undoManager endUndoGrouping];
      legend::source::SourceDocument tail(u"\nconst second = 2;", 2);
      [tree appendDocument:std::move(tail)];
      tree.sourceLoading = NO;
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert([tree.source isEqualToString:@"const xfirst = 1;\r\nconst second = 2;"]);
      for (int i = 0; i < 5; ++i) {
        [tree loadSource:source]; [tree recordStartupDraw];
        [tree loadSource:@"const fresh = 1;\n"]; [tree recordStartupDraw];
        waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      }
      [tree.undoManager beginUndoGrouping];
      [tree setMarkedText:@"n" selectedRange:NSMakeRange(1, 0) replacementRange:NSMakeRange(6, 5)];
      [tree setMarkedText:@"ni" selectedRange:NSMakeRange(2, 0) replacementRange:NSMakeRange(NSNotFound, 0)];
      [tree insertText:@"你" replacementRange:NSMakeRange(NSNotFound, 0)];
      [tree.undoManager endUndoGrouping];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert(!tree.hasMarkedText && [tree.source isEqualToString:@"const 你 = 1;\n"]);
      [tree.undoManager undo];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert([tree.source isEqualToString:@"const fresh = 1;\n"]);
      // Each additional grammar must actually travel through the native worker,
      // resolve its own root scope, and replace tokens on a language switch.
      const auto beforeLanguageSwitches = textMateCreations;
      for (NSDictionary *fixture in @[
        @{@"language": @"javascript", @"source": @"const view = <View />;\n"},
        @{@"language": @"json", @"source": @"42\n"},
        @{@"language": @"css", @"source": @"@media screen { .item { color: red; } }\n"},
        @{@"language": @"python", @"source": @"def greet():\n    return 42\n"},
        @{@"language": @"markdown", @"source": @"# Heading\n\n**bold**\n\n```tsx\nconst view = <View />;\n```\n", @"offset": @2},
        @{@"language": @"mdx", @"source": @"import { View } from 'react-native';\n\n# Heading\n\n<View opacity={0.5} />\n"},
      ]) {
        [tree configureSyntaxLanguage:fixture[@"language"] theme:@"dark-plus" enabled:YES];
        [tree loadSource:fixture[@"source"]]; [tree recordStartupDraw];
        waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
        assert(textMateCreations == beforeLanguageSwitches);
        row.lineIndex = 0; row.lineId = 1; row.input = tree;
        waitFor(^bool {
          [row invalidateText]; [row layout];
          NSAttributedString *current = [row.textLayout valueForKey:@"text"];
          const BOOL number = [fixture[@"language"] isEqualToString:@"json"];
          const auto offset = [fixture[@"offset"] unsignedIntegerValue];
          NSColor *expected = [NSColor colorWithSRGBRed:0 green:number ? 1 : 0 blue:number ? 0 : 1 alpha:1];
          return current.length > offset && [[current attribute:NSForegroundColorAttributeName atIndex:offset effectiveRange:nil] isEqual:expected];
        });
        row.input = nil;
      }
      const auto fallbackCreations = textMateCreations;
      __block NSUInteger grammarRequests = 0;
      tree.onGrammarRequired = ^(NSString *language) {
        assert([language isEqualToString:@"rust"]); ++grammarRequests;
      };
      [tree configureSyntaxLanguage:@"markdown" theme:@"dark-plus" enabled:YES];
      NSString *fence = @"# Download test\n\n```rust\nfn main() {}\n```\n";
      [tree loadSource:fence]; [tree recordStartupDraw];
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert(grammarRequests == 1);
      const auto copiedBefore = [[tree valueForKey:@"treeCopiedUnits"] unsignedIntegerValue];
      ++tree.grammarRevision;
      assert([[tree valueForKey:@"treeCopiedUnits"] unsignedIntegerValue] == copiedBefore);
      waitFor(^bool { return [[tree valueForKey:@"treeNextLine"] unsignedIntegerValue] == tree.lineCount; });
      assert(grammarRequests == 1 && [tree.source isEqualToString:fence]);
      tree.onGrammarRequired = nil;
      [tree configureSyntaxLanguage:@"unsupported-language" theme:@"dark-plus" enabled:YES];
      assert(textMateCreations == fallbackCreations + 1); // interim policy for remaining unsupported languages
      waitFor(^bool { return highlighted(tree) == tree.lineCount; });
      [tree configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:NO];
      assert([[tree valueForKey:@"treeBusy"] boolValue] == NO);
      std::cout << "Tree-sitter native scheduling: prefix, background, retained colors, undo/IME, themes, Markdown/MDX, loading edits, replacement and unsupported fallback passed\n";
    }
    for (bool unique : {false, true}) {
      SchedulingInput *jump = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      NSString *sample = @"const sample = 42;\n";
      NSMutableString *source = [NSMutableString new];
      if (unique) {
        for (NSUInteger index = 0; index < 100000; ++index) [source appendFormat:@"const sample%lu = %lu;\n", index, index];
      } else [source appendString:[sample stringByPaddingToLength:sample.length * 100000 withString:sample startingAtIndex:0]];
      [jump loadSource:source];
      [jump configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
      waitFor(^bool { return highlighted(jump) == 128; });
      const auto started = [NSDate timeIntervalSinceReferenceDate];
      LESourceRowView *last = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 600, 24)];
      last.lineIndex = 99999; last.lineId = 100000; last.input = jump;
      waitFor(^bool { return highlighted(jump) >= 100000; });
      std::cout << "Exact highlighting after 100k-line jump (" << (unique ? "unique" : "repeated") << "): " << ([NSDate timeIntervalSinceReferenceDate] - started) * 1000 << "ms\n";
      last.input = nil;
    }
    SchedulingInput *input = [[SchedulingInput alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
    __block NSUInteger progressEvents = 0, completedLines = 0, totalLines = 0;
    __block BOOL progressActive = NO;
    input.onSyntaxProgress = ^(NSUInteger completed, NSUInteger total, BOOL active) {
      ++progressEvents; completedLines = completed; totalLines = total; progressActive = active;
      assert(completed <= total);
    };
    input.onSyntaxError = ^(NSString *error) { assert(!error.length); };
    NSString *line = @"const value = 42;\n";
    NSString *source = [line stringByPaddingToLength:line.length * 20000 withString:line startingAtIndex:0];
    [input loadSource:source];
    [input configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
    assert(!input.syntaxHighlightingInBackground);
    waitFor(^bool { return highlighted(input) == 128; });
    drainFor(0.05);
    assert(highlighted(input) == 128); // viewport mode does not visit the tail

    input.syntaxHighlightingInBackground = YES;
    drainFor(0.05);
    assert(highlighted(input) == 128); // first paint has priority in both modes
    [input recordStartupDraw];
    input.syntaxHighlightingInBackground = NO;
    waitFor(^bool { return ![[input valueForKey:@"syntaxBusy"] boolValue]; });
    drainFor(0.05);
    const auto paused = highlighted(input);
    assert(paused >= 128 && paused <= 128 + 2048); // at most one bounded catch-up batch finishes
    input.syntaxHighlightingInBackground = YES;
    waitFor(^bool { return highlighted(input) == input.lineCount; });
    assert([input.source isEqualToString:source]);
    drainFor(0.01);
    assert(!progressActive && completedLines == input.lineCount && totalLines == input.lineCount);
    assert(progressEvents >= 2 && progressEvents < 100); // not a render update per line

    // A far-away row is colored immediately on mount, without another job.
    const auto complete = highlighted(input);
    LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 600, 24)];
    row.lineIndex = 15000; row.lineId = 15001; row.input = input;
    [row layout];
    NSAttributedString *text = [row.textLayout valueForKey:@"text"];
    assert(text.length > 0);
    NSColor *color = [text attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil];
    assert(color && ![color isEqual:row.foreground]);
    assert(highlighted(input) == complete);
    row.input = nil;

    // Streaming appends resume background work but not viewport-only work.
    input.syntaxHighlightingInBackground = NO;
    legend::source::SourceDocument tail(u"\nconst appended = true;\n", input.lineCount);
    [input appendDocument:std::move(tail)];
    drainFor(0.05);
    assert(highlighted(input) <= complete);
    input.syntaxHighlightingInBackground = YES;
    waitFor(^bool { return highlighted(input) == input.lineCount; });

    // An edit and undo revalidate cached downstream parser states in background.
    input.undoManager.groupsByEvent = NO;
    NSString *before = input.source;
    [input.undoManager beginUndoGrouping];
    [input insertText:@"/*\n" replacementRange:NSMakeRange(0, 0)];
    [input.undoManager endUndoGrouping];
    waitFor(^bool { return highlighted(input) == input.lineCount; });
    [input.undoManager undo];
    waitFor(^bool { return highlighted(input) == input.lineCount; });
    assert([input.source isEqualToString:before]);

    // Disabling highlighting cancels scheduling, including queued continuations.
    [input loadSource:source];
    [input recordStartupDraw];
    [input configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:NO];
    drainFor(0.05);
    assert(highlighted(input) == 0);

    // Replace documents while batches are in flight. A stale completion must
    // not color a new document with an old multiline-comment parser state.
    for (NSUInteger attempt = 0; attempt < 12; ++attempt) {
      [input configureSyntaxLanguage:@"typescript" theme:@"dark-plus" enabled:YES];
      [input loadSource:[@"/*\n" stringByAppendingString:source]];
      [input recordStartupDraw];
      [input loadSource:@"const fresh = 42;\nconst next = true;\n"];
      [input recordStartupDraw];
      waitFor(^bool { return highlighted(input) == input.lineCount && ![[input valueForKey:@"syntaxBusy"] boolValue]; });
      drainFor(0.01);
      assert([input.source isEqualToString:@"const fresh = 42;\nconst next = true;\n"]);
      row.lineIndex = 0; row.lineId = 1; row.input = input;
      [row layout];
      NSAttributedString *actual = [row.textLayout valueForKey:@"text"];
      assert([actual.string isEqualToString:@"const fresh = 42;"]);
      NSColor *keyword = [actual attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nil];
      assert([keyword isEqual:color]); // same TS keyword as the clean document
      row.input = nil;
    }
  }
  std::cout << "Source syntax scheduling: viewport/default, first-paint priority, background EOF, cached offscreen rows, mode switching, append, edit/undo and disable passed\n";
}
